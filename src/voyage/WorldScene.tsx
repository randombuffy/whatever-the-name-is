import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { DECISION_POINT, STAGE_SECONDS, isSpaceStage, type LandingStage, type LandingState } from './mission/landingMachine';
import { siteById, type SiteId } from './mission/sites';
import { descentSample, edlLive, touchdownSample } from './mission/edl';
import { FLARE_SOL, LANDING_SPOTS, capacityOf, type HabitatPad, type SettlementState } from './mission/settlement';
import { createTerrain, smoothstep, type Terrain } from './scene/terrain';
import { Haze, HabitatPads, MarsSky, ResourceMarker, RockField, SunLight, TerrainMeshes } from './scene/SurfaceWorld';
import { SpaceScene } from './scene/SpaceScene';
import { FallingHeatShield, ParachutePackage, type Signal } from './scene/Vehicles';
import { LandingDust } from './scene/LandingDust';
import { StormDust } from './scene/StormDust';
import { Astronauts, Building, PowerCables } from './scene/Outpost';
import type { Translator } from './i18n';
import { voyageTune } from './tune';
import type { SpacecraftConfig } from '../domain/types';
import { attachOrbiter } from '../render/launchStack';
import { disposeCraft } from '../render/craft';
import { setFlame } from '../render/exhaust';

export type { ModuleKind, OutpostModule } from './mission/settlement';

export interface WorldSceneProps {
  landing: LandingState;
  focusSite: SiteId | null;
  onFocusSite?: (id: SiteId) => void;
  // Translator from the app; 3D labels render in their own React roots, so text is passed in.
  tr: Translator;
  settlement: SettlementState | null;
  storm: boolean;
  selectedId: string | null;
  reducedMotion: boolean;
  overview: boolean;
  onSelect: (id: string | null) => void;
  onPadSelect: (pad: HabitatPad) => void;
  onStageComplete: (stage: LandingStage, run: number) => void;
  focus: CameraFocus | null;
  // −1..1 lateral nudge during the touchdown steering check. Visual only.
  steer: number;
  craft?: SpacecraftConfig | null;
  missionId?: string;
}

export interface CameraFocus { key: string; x: number; z: number; distance: number }

function MissionCraft({ throttle, compress, craft, missionId }: {
  throttle: Signal;
  compress: Signal;
  craft?: SpacecraftConfig | null;
  missionId: string;
}) {
  const body = useRef<THREE.Group>(null);
  const host = useRef<THREE.Group>(null);
  const flames = useRef<THREE.Mesh[]>([]);
  useLayoutEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const rig = attachOrbiter(parent, 8.4, true, undefined, craft ?? undefined, missionId);
    flames.current = rig.flames.filter((item): item is THREE.Mesh => item instanceof THREE.Mesh);
    return () => {
      disposeCraft(rig.root);
      parent.remove(rig.root);
      flames.current = [];
    };
  }, [craft, missionId]);
  useFrame(({ clock }) => {
    const drop = compress.current * 0.32;
    if (body.current) body.current.position.y = -drop;
    const power = throttle.current;
    const time = clock.getElapsedTime();
    const flicker = 0.85 + Math.sin(time * 41) * 0.08 + Math.sin(time * 17.3) * 0.07;
    for (const flame of flames.current) setFlame(flame, power * flicker, time);
  });
  return (
    <group ref={body}>
      <group ref={host} />
    </group>
  );
}

const SETTLEMENT_CENTER = new THREE.Vector3(3, 2.2, -4);
const ease = (x: number) => x * x * (3 - 2 * x);
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 2.2);

interface LandingSignals {
  throttle: Signal;
  compress: Signal;
  inflate: Signal;
  dust: Signal;
  haze: Signal;
  sky: Signal;
}

// Drives the vehicles and camera through DESCENT → TOUCHDOWN → POST_LANDING → SETTLEMENT.
function SurfaceDirector({ landing, terrain, signals, reducedMotion, overview, onStageComplete, controls, groups, focus, steer }: {
  focus: CameraFocus | null;
  landing: LandingState;
  terrain: Terrain;
  signals: LandingSignals;
  reducedMotion: boolean;
  overview: boolean;
  onStageComplete: (stage: LandingStage, run: number) => void;
  controls: React.RefObject<any>;
  groups: { lander: React.RefObject<THREE.Group | null>; pkg: React.RefObject<THREE.Group | null>; shield: React.RefObject<THREE.Group | null>; dustOrigin: THREE.Vector3 };
  steer: number;
}) {
  const time = useRef(0);
  const key = useRef('');
  const done = useRef('');
  const timeScale = useRef(1);
  const look = useMemo(() => new THREE.Vector3(), []);
  const camGoal = useMemo(() => new THREE.Vector3(), []);
  const pkgAtSeparation = useMemo(() => new THREE.Vector3(), []);
  const transitionStart = useRef(0);
  const fastForwarded = useRef('');
  const landerFocus = useMemo(() => new THREE.Vector3(), []);
  const focusKey = useRef('');
  const focusStart = useRef(-10);
  const focusTarget = useMemo(() => new THREE.Vector3(), []);
  const focusOffset = useMemo(() => new THREE.Vector3(), []);
  const tilt = landing.trajectory === 'direct' && siteById(landing.siteId).hazard === 3 ? 0.055 : 0;

  useFrame(({ camera, clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const stage = landing.stage;
    if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) camera.position.set(40, 30, 40);
    const stageKey = stage + ':' + landing.run;
    if (key.current !== stageKey) {
      key.current = stageKey;
      time.current = 0;
      fastForwarded.current = '';
      timeScale.current = 1;
      transitionStart.current = clock.getElapsedTime();
    }
    const trajectory = landing.trajectory;
    const aim = LANDING_SPOTS.direct;
    const final = LANDING_SPOTS[trajectory ?? 'divert'];
    const finalY = terrain.height(final[0], final[1]);
    const lander = groups.lander.current;
    const pkg = groups.pkg.current;
    const shield = groups.shield.current;
    const shake = (amount: number) => (reducedMotion ? 0 : (Math.random() - 0.5) * amount);

    if (stage === 'DESCENT') {
      if (landing.fastForwardRun === landing.run && fastForwarded.current !== stageKey) {
        fastForwarded.current = stageKey;
        time.current = Math.max(time.current, (DECISION_POINT - 0.035) * STAGE_SECONDS.DESCENT);
      }
      // Hold for the trajectory decision at backshell separation.
      const holding = !trajectory && time.current / STAGE_SECONDS.DESCENT >= DECISION_POINT - 0.03;
      timeScale.current = THREE.MathUtils.damp(timeScale.current, holding ? 0 : 1, holding ? 3 : 2, delta);
      time.current += delta * timeScale.current;
      let p = Math.min(1, time.current / STAGE_SECONDS.DESCENT);
      if (!trajectory) p = Math.min(p, DECISION_POINT);
      edlLive.awaitingDecision = holding;

      const chuteP = Math.min(1, p / DECISION_POINT);
      const pkgY = THREE.MathUtils.lerp(640, 232, easeOut(chuteP));
      const sway = Math.sin(clock.getElapsedTime() * 0.6) * 1.5;
      const ballistic = voyageTune.airless || voyageTune.noChute;
      signals.inflate.current = ballistic ? 0 : p < 0.07 ? Math.min(1.08, (p / 0.07) * 1.08) : THREE.MathUtils.damp(signals.inflate.current, 1, 4, delta);
      if (pkg) {
        if (p < DECISION_POINT) {
          pkg.position.set(aim[0] + sway, pkgY, aim[1]);
          pkgAtSeparation.copy(pkg.position);
        } else {
          const after = (p - DECISION_POINT) * STAGE_SECONDS.DESCENT;
          pkg.position.set(pkgAtSeparation.x + after * 7, pkgAtSeparation.y - after * 9 + after * after * 0.4, pkgAtSeparation.z - after * 3);
        }
        pkg.visible = !ballistic;
      }
      if (shield) {
        const sepP = 0.1;
        if (p < sepP) {
          shield.position.set(aim[0] + sway, pkgY - 0.4, aim[1]);
          shield.rotation.set(0, 0, 0);
        } else {
          const fall = (p - sepP) * STAGE_SECONDS.DESCENT;
          shield.position.set(aim[0] + fall * 0.8, pkgY - 0.4 - fall * fall * 16, aim[1] + fall * 0.5);
          shield.rotation.set(fall * 0.35, 0, fall * 0.2);
        }
        shield.visible = !voyageTune.noShield && shield.position.y > finalY - 5;
      }
      let landerY = pkgY - 1.6;
      let lx = aim[0] + sway;
      let lz = aim[1];
      if (p >= DECISION_POINT) {
        const q = (p - DECISION_POINT) / (1 - DECISION_POINT);
        landerY = THREE.MathUtils.lerp(pkgAtSeparation.y - 1.6, finalY + 16, easeOut(q));
        const lateral = ease(smoothstep(q, 0.1, 0.72));
        lx = THREE.MathUtils.lerp(pkgAtSeparation.x, final[0], lateral);
        lz = THREE.MathUtils.lerp(pkgAtSeparation.z, final[1], lateral);
        signals.throttle.current = q < 0.04 ? 0 : 0.85 - q * 0.25;
      } else {
        signals.throttle.current = 0;
      }
      if (lander) {
        lander.position.set(lx, landerY, lz);
        lander.visible = p >= DECISION_POINT - 0.002;
        lander.rotation.set(0, 0, 0);
      }
      const altitude = landerY - finalY;
      signals.dust.current = signals.throttle.current * (1 - smoothstep(altitude, 8, 34));
      groups.dustOrigin.set(lx, finalY, lz);
      signals.compress.current = 0;
      // Thin, clear air while descending: ground 1 km away is still easy to see. The far terrain ring
      // (±4.5 km) stays hidden in the haze even at the top of the parachute phase.
      signals.haze.current = THREE.MathUtils.lerp(0.00034, 0.0008, smoothstep(-altitude, -420, -40));
      signals.sky.current = THREE.MathUtils.lerp(0.22, 0, smoothstep(-altitude, -640, -150));

      const subject = p < DECISION_POINT ? new THREE.Vector3(aim[0] + sway, pkgY, aim[1]) : new THREE.Vector3(lx, landerY, lz);
      if (p < DECISION_POINT) {
        camGoal.copy(subject).add(new THREE.Vector3(44, 2 - chuteP * 6, 56));
        look.copy(subject).add(new THREE.Vector3(0, 15 - chuteP * 30, 0));
      } else {
        const low = smoothstep(-altitude, -200, -16);
        camGoal.copy(subject).add(new THREE.Vector3(22 - low * 3, 5 + (1 - low) * 6, 30 - low * 4));
        look.copy(subject).add(new THREE.Vector3(0, -1.5 - (1 - low) * 7, 0));
      }
      if (camera.position.distanceTo(camGoal) > 160) camera.position.copy(camGoal);
      camGoal.x += shake(0.12 * signals.throttle.current);
      camGoal.y += shake(0.12 * signals.throttle.current);
      camera.position.lerp(camGoal, 1 - Math.exp(-delta * (time.current < 0.1 ? 60 : 4)));
      camera.lookAt(look);
      Object.assign(edlLive, descentSample(p), { progress: p });
      if (p >= 1 && trajectory && done.current !== stageKey) { done.current = stageKey; onStageComplete('DESCENT', landing.run); }
      return;
    }

    if (pkg) pkg.visible = stage === 'TOUCHDOWN' && pkg.position.y > finalY;
    if (shield) shield.visible = false;
    signals.inflate.current = 1;
    signals.haze.current = 0.0042;
    signals.sky.current = 0;

    if (stage === 'TOUCHDOWN') {
      time.current += delta;
      const p = Math.min(1, time.current / STAGE_SECONDS.TOUCHDOWN);
      // From the clearer descent air to the ground-level haze of the settlement view, without a jump.
      signals.haze.current = THREE.MathUtils.lerp(0.0008, 0.0042, smoothstep(p, 0, 0.6));
      if (pkg) pkg.position.add(new THREE.Vector3(7 * delta, -9 * delta, -3 * delta));
      const contact = 0.45;
      const y = p < contact ? finalY + 16 * Math.pow(1 - p / contact, 1.7) : finalY;
      signals.throttle.current = p < 0.47 ? 0.6 - p * 0.3 : THREE.MathUtils.damp(signals.throttle.current, 0, 18, delta);
      const settle = p < contact ? 0 : Math.min(1, (p - contact) / 0.08);
      signals.compress.current = p < contact ? 0 : 0.6 + Math.sin(settle * Math.PI) * 0.5 * (1 - settle);
      if (lander) {
        lander.visible = true;
        lander.position.set(final[0] + Math.max(-1, Math.min(1, steer)) * 1.8, y, final[1]);
        lander.rotation.z = tilt * smoothstep(p, contact, contact + 0.1);
      }
      const altitude = y - finalY;
      signals.dust.current = signals.throttle.current * (1 - smoothstep(altitude, 4, 22)) * 1.2;
      groups.dustOrigin.set(final[0], finalY, final[1]);
      const orbit = p * 0.55;
      camGoal.set(final[0] + Math.cos(0.75 + orbit) * 21, finalY + 4.2 + (1 - p) * 4, final[1] + Math.sin(0.75 + orbit) * 21);
      camGoal.x += shake(0.08 * signals.throttle.current);
      camGoal.y += shake(0.08 * signals.throttle.current);
      camera.position.lerp(camGoal, 1 - Math.exp(-delta * (time.current < 0.1 ? 60 : 3)));
      look.set(final[0], y + 3.4, final[1]);
      camera.lookAt(look);
      Object.assign(edlLive, touchdownSample(p), { progress: p, awaitingDecision: false });
      if (p >= 1 && done.current !== stageKey) { done.current = stageKey; onStageComplete('TOUCHDOWN', landing.run); }
      return;
    }

    // POST_LANDING and SETTLEMENT: the lander rests on its legs and never moves again.
    signals.throttle.current = 0;
    signals.dust.current = 0;
    signals.compress.current = 0.6;
    if (lander) {
      lander.visible = true;
      lander.position.set(final[0], finalY, final[1]);
      lander.rotation.z = tilt;
    }
    const ctrl = controls.current;
    const elapsed = clock.getElapsedTime() - transitionStart.current;
    if (stage === 'POST_LANDING' || (stage === 'SETTLEMENT' && overview)) {
      const wide = overview ? new THREE.Vector3(30, 26, 34) : new THREE.Vector3(final[0] + 15, 0, final[1] + 19);
      wide.y = overview ? wide.y : Math.max(finalY + 7.5, terrain.height(wide.x, wide.z) + 4);
      if (camera.position.distanceTo(wide) > 600) camera.position.copy(wide);
      if (elapsed < 3.2 || overview) {
        if (ctrl) ctrl.enabled = false;
        camera.position.lerp(wide, 1 - Math.exp(-delta * (reducedMotion ? 3 : 1.15)));
        // After touchdown the lander is the subject; the report overview frames the whole outpost.
        look.lerp(overview ? SETTLEMENT_CENTER : landerFocus.set(final[0], finalY + 3.2, final[1]), 1 - Math.exp(-delta * 1.6));
        camera.lookAt(look);
        if (ctrl) ctrl.target.copy(look);
        return;
      }
    }
    // Never let the orbiting camera sink into a hillside.
    const floor = terrain.height(camera.position.x, camera.position.z) + 1.6;
    if (camera.position.y < floor) camera.position.y = floor;
    if (ctrl && !ctrl.enabled) {
      ctrl.target.copy(look.lengthSq() > 0 ? look : SETTLEMENT_CENTER);
      ctrl.enabled = true;
      ctrl.update();
    }
    // Re-frame the camera on whatever the current phase is about, keeping the player's viewing angle.
    if (ctrl && stage === 'SETTLEMENT' && focus) {
      if (focusKey.current !== focus.key) {
        focusKey.current = focus.key;
        focusStart.current = clock.getElapsedTime();
        focusTarget.set(focus.x, terrain.height(focus.x, focus.z) + 1.5, focus.z);
        focusOffset.copy(camera.position).sub(ctrl.target).normalize();
        const horizontal = Math.hypot(focusOffset.x, focusOffset.z) || 1;
        focusOffset.set(focusOffset.x / horizontal, 0, focusOffset.z / horizontal).multiplyScalar(Math.cos(0.36));
        focusOffset.y = Math.sin(0.36);
        focusOffset.multiplyScalar(focus.distance);
      }
      if (clock.getElapsedTime() - focusStart.current < 1.8) {
        const k = 1 - Math.exp(-delta * (reducedMotion ? 6 : 2.6));
        ctrl.target.lerp(focusTarget, k);
        camera.position.lerp(focusTarget.clone().add(focusOffset), k);
        ctrl.update();
      }
    }
  });
  return null;
}

function SurfaceStage({ props, terrain, active }: { props: WorldSceneProps; terrain: Terrain; active: boolean }) {
  const { landing, settlement, storm, selectedId, onSelect, onPadSelect } = props;
  const signals = useMemo<LandingSignals>(() => ({
    throttle: { current: 0 }, compress: { current: 0 }, inflate: { current: 0 }, dust: { current: 0 }, haze: { current: 0.0042 }, sky: { current: 0 },
  }), []);
  const lander = useRef<THREE.Group>(null);
  const pkg = useRef<THREE.Group>(null);
  const shield = useRef<THREE.Group>(null);
  const controls = useRef<any>(null);
  const dustOrigin = useMemo(() => new THREE.Vector3(...[LANDING_SPOTS.direct[0], 0, LANDING_SPOTS.direct[1]] as [number, number, number]), []);
  const groups = useMemo(() => ({ lander, pkg, shield, dustOrigin }), [dustOrigin]);
  const stage = landing.stage;
  const inSettlement = stage === 'SETTLEMENT';
  const showModules = settlement && !landing.replay && (stage === 'SETTLEMENT' || stage === 'POST_LANDING');
  const habitat = settlement?.modules.find((module) => module.kind === 'habitat');
  const critical = Boolean(settlement && (settlement.blackout || settlement.lastShed.includes('life-support') || settlement.resources.oxygen < 20 || settlement.resources.water < 15 || settlement.resources.habitat < 35));
  const stormLevel = storm ? 1 : 0;

  if (!active) {
    // Pre-build the terrain while the entry plays, so the cut to the descent is seamless.
    return <group visible={false}><TerrainMeshes terrain={terrain} /><RockField terrain={terrain} /></group>;
  }

  return (
    <group>
      <MarsSky storm={stormLevel} space={signals.sky} flare={settlement && settlement.phase === 'CRISIS' && settlement.sol >= FLARE_SOL - 1 && settlement.sol <= FLARE_SOL ? 1 : 0} />
      <Haze density={signals.haze} storm={stormLevel} />
      <SunLight storm={stormLevel} shadows />
      <TerrainMeshes terrain={terrain} />
      <RockField terrain={terrain} />
      <StormDust active={storm} reduced={props.reducedMotion} />
      <ResourceMarker tr={props.tr} terrain={terrain} visible={stage === 'DESCENT' || inSettlement || stage === 'POST_LANDING'} />
      <group ref={pkg}><ParachutePackage inflate={signals.inflate} /></group>
      <group ref={shield}><FallingHeatShield /></group>
      <group ref={lander} visible={false}>
        <MissionCraft throttle={signals.throttle} compress={signals.compress} craft={props.craft} missionId={props.missionId ?? 'mars'} />
      </group>
      <LandingDust origin={dustOrigin} groundY={terrain.height(dustOrigin.x, dustOrigin.z)} strength={signals.dust} active={stage === 'DESCENT' || stage === 'TOUCHDOWN'} />
      <SurfaceDirector landing={landing} terrain={terrain} signals={signals} reducedMotion={props.reducedMotion} overview={props.overview} onStageComplete={props.onStageComplete} controls={controls} groups={groups} focus={props.focus} steer={props.steer} />
      {showModules && settlement && (
        <group>
          {settlement.phase === 'HABITAT' && <HabitatPads tr={props.tr} terrain={terrain} onSelect={onPadSelect} chosen={settlement.habitatPad} />}
          <PowerCables modules={settlement.modules} terrain={terrain} />
          {settlement.modules.map((module) => {
            const shed = settlement.lastShed.includes(module.kind);
            const powered = module.kind === 'habitat' ? !settlement.blackout : module.kind === 'shield' || module.kind === 'battery' ? true : module.active && !shed;
            const solars = settlement.modules.filter((item) => item.kind === 'solar');
            const anchor: [number, number] = solars.length
              ? [solars.reduce((sum, item) => sum + item.position[0], 0) / solars.length, solars.reduce((sum, item) => sum + item.position[1], 0) / solars.length]
              : [20, 1.5];
            const shelter = settlement.flareResponse === 'shelter' && settlement.sol >= FLARE_SOL - 1 && settlement.sol <= FLARE_SOL;
            return (
              <Building
                key={module.id}
                tr={props.tr}
                module={module}
                terrain={terrain}
                selected={module.id === selectedId}
                onSelect={() => onSelect(module.id)}
                visual={{
                  powered, storm, panelDust: settlement.panelDust,
                  charge: settlement.resources.energy / capacityOf(settlement),
                  warning: (module.kind === 'habitat' || module.kind === 'life-support') && critical,
                  shelter, cleaning: settlement.stormResponse === 'clean-panels', anchor,
                }}
              />
            );
          })}
          {habitat && <Astronauts center={habitat.position} visible={!settlement.blackout && !(settlement.flareResponse === 'shelter' && settlement.sol >= FLARE_SOL - 1 && settlement.sol <= FLARE_SOL)} />}
        </group>
      )}
      {(stage === 'POST_LANDING' || inSettlement) && (
        <OrbitControls
          ref={controls}
          makeDefault
          enabled={false}
          minDistance={9}
          maxDistance={95}
          maxPolarAngle={Math.PI * 0.47}
          minPolarAngle={0.2}
          enableDamping
          dampingFactor={0.07}
          rotateSpeed={0.6}
          zoomSpeed={0.8}
          panSpeed={0.7}
        />
      )}
    </group>
  );
}

// The mission panel covers part of the view (left side on wide screens, bottom on
// portrait screens), so the projection centre is shifted to keep the subject clear of it.
function PanelViewOffset({ active }: { active: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    if (active && size.width / size.height < 0.9) perspective.setViewOffset(size.width, size.height, 0, size.height * 0.2, size.width, size.height);
    else if (active && size.width > 900) perspective.setViewOffset(size.width, size.height, -170, 0, size.width, size.height);
    else perspective.clearViewOffset();
    perspective.updateProjectionMatrix();
  }, [active, camera, size.width, size.height]);
  return null;
}

function SceneContents(props: WorldSceneProps) {
  const { landing, focusSite } = props;
  const site = siteById(landing.siteId ?? focusSite);
  const terrain = useMemo(() => (landing.siteId ? createTerrain(siteById(landing.siteId)) : null), [landing.siteId]);
  const space = isSpaceStage(landing.stage);
  return (
    <>
      {space && (
        <SpaceScene stage={landing.stage} focusSite={landing.siteId ?? focusSite ?? site.id} onFocusSite={props.onFocusSite} run={landing.run} reducedMotion={props.reducedMotion} onComplete={props.onStageComplete} />
      )}
      {terrain && (landing.stage === 'ENTRY' || !space) && <SurfaceStage props={props} terrain={terrain} active={!space} />}
      <PanelViewOffset active={landing.stage === 'POST_LANDING' || landing.stage === 'SETTLEMENT'} />
    </>
  );
}

export function WorldScene(props: WorldSceneProps) {
  useEffect(() => {
    const prevent = (event: Event) => event.preventDefault();
    document.addEventListener('contextmenu', prevent);
    return () => document.removeEventListener('contextmenu', prevent);
  }, []);
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [24, 18, 640], fov: 42, near: 0.3, far: 9000 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      fallback={<div className="scene-startup">{props.tr.t('app.sceneUnavailable')}</div>}
      onPointerMissed={() => props.selectedId && props.onSelect(null)}
    >
      <Suspense fallback={<Html center><div className="scene-loading u">{props.tr.t('app.sceneRendering')}</div></Html>}>
        <SceneContents {...props} />
      </Suspense>
    </Canvas>
  );
}
