import { Component, Suspense, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODELS } from './models';
import type { ModelSpec } from './models';

// Conceptual vehicles. The entry–descent–landing architecture is heat shield →
// supersonic parachute → backshell separation → powered descent → touchdown on legs,
// the sequence flown by NASA's Phoenix (2008) and InSight (2018) landers. The crewed
// cargo lander itself is invented for this simulator.
//
// Every vehicle has a procedural version (always works) and can be swapped for a real
// glTF/GLB model by adding an entry in models.ts. If the file is missing or fails to load,
// the procedural vehicle is shown instead.

export type Signal = { current: number };

// ───────────────────────── model loading ─────────────────────────

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('[models] falling back to the procedural vehicle:', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// Loads a glTF, scales it to spec.size, centres it on x/z and sits its base on y = 0.
function GltfModel({ spec }: { spec: ModelSpec }) {
  const gltf = useLoader(GLTFLoader, spec.url);
  const { object, scale, position } = useMemo(() => {
    const object = gltf.scene.clone(true);
    if (spec.rotation) object.rotation.set(...spec.rotation);
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = spec.size / Math.max(size.x, size.y, size.z, 1e-6);
    const position = new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale);
    if (spec.offset) position.add(new THREE.Vector3(...spec.offset));
    return { object, scale, position };
  }, [gltf, spec]);
  return (
    <group position={position} scale={scale}>
      <primitive object={object} />
    </group>
  );
}

// Call once at app start so models are fetched before the landing sequence needs them.
export function preloadVehicleModels() {
  (Object.values(MODELS) as (ModelSpec | undefined)[]).forEach((spec) => { if (spec) useLoader.preload(GLTFLoader, spec.url); });
}

// ───────────────────────── shared materials ─────────────────────────

const shellWhite = new THREE.MeshStandardMaterial({ color: '#e7e3dc', roughness: 0.55, metalness: 0.15 });
const shieldMaterialBase = { color: '#5a3a28', roughness: 0.9, metalness: 0.05 };

// ───────────────────────── aeroshell ─────────────────────────

function HeatShieldMesh({ heat }: { heat?: Signal }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ ...shieldMaterialBase, emissive: new THREE.Color('#ff6a2a'), emissiveIntensity: 0 }), []);
  const char = useMemo(() => new THREE.Color(shieldMaterialBase.color), []);
  const charred = useMemo(() => new THREE.Color('#1c1511'), []);
  useFrame(() => {
    if (!heat) return;
    material.emissiveIntensity = heat.current * 1.5;
    // The ablator darkens as it takes heat.
    material.color.copy(char).lerp(charred, Math.min(1, heat.current * 0.8));
  });
  return (
    <mesh position={[0, 0, 0.6]} rotation={[Math.PI / 2, 0, 0]} material={material} castShadow>
      <coneGeometry args={[3.3, 1.2, 48]} />
    </mesh>
  );
}

function Backshell() {
  return (
    <group>
      <mesh position={[0, 0, -1.3]} rotation={[-Math.PI / 2, 0, 0]} material={shellWhite} castShadow>
        <cylinderGeometry args={[1.5, 3.2, 2.6, 40, 1, true]} />
      </mesh>
      <mesh position={[0, 0, -2.62]} rotation={[-Math.PI / 2, 0, 0]} material={shellWhite}>
        <cylinderGeometry args={[1.5, 1.5, 0.08, 32]} />
      </mesh>
      <mesh position={[0, 0, -2.85]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.55, 0.75, 0.45, 20]} />
        <meshStandardMaterial color="#9a958c" roughness={0.6} metalness={0.3} />
      </mesh>
    </group>
  );
}

function ProceduralShell({ heat }: { heat: Signal }) {
  return (
    <group>
      <HeatShieldMesh heat={heat} />
      <Backshell />
    </group>
  );
}

// Aeroshell in a "+z is forward" frame (use lookAt to aim it along the flight path).
export function Aeroshell({ heat, cruiseOffset, showCruise }: { heat: Signal; cruiseOffset: Signal; showCruise: boolean }) {
  const cruise = useRef<THREE.Group>(null);
  const sheath = useRef<THREE.Mesh>(null);
  const wake = useRef<THREE.Mesh>(null);
  const spec = MODELS.aeroshell;
  useFrame(({ clock }) => {
    if (cruise.current) {
      cruise.current.position.z = -3.2 - cruiseOffset.current * 26;
      cruise.current.rotation.z = cruiseOffset.current * 0.8;
      cruise.current.visible = showCruise && cruiseOffset.current < 0.99;
    }
    const t = clock.getElapsedTime();
    const flicker = 0.92 + Math.sin(t * 37) * 0.05 + Math.sin(t * 13) * 0.03;
    if (sheath.current) (sheath.current.material as THREE.MeshBasicMaterial).opacity = heat.current * 0.3 * flicker;
    if (wake.current) {
      (wake.current.material as THREE.MeshBasicMaterial).opacity = heat.current * 0.22 * flicker;
      wake.current.scale.set(1, 0.8 + heat.current * 0.5, 1);
      wake.current.visible = heat.current > 0.02;
    }
  });
  const shell = <ProceduralShell heat={heat} />;
  return (
    <group>
      {spec ? (
        <ModelBoundary fallback={shell}>
          <Suspense fallback={shell}><GltfModel spec={spec} /></Suspense>
        </ModelBoundary>
      ) : shell}
      <group ref={cruise} position={[0, 0, -3.2]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[2.5, 2.5, 0.45, 32]} />
          <meshStandardMaterial color="#c9c4bb" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0, -0.24]}>
          <ringGeometry args={[1.0, 2.45, 32]} />
          <meshStandardMaterial color="#1d2c3c" roughness={0.3} metalness={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Plasma sheath: thin and faint — Mars' atmosphere is ~1% as dense as Earth's at the surface. */}
      <mesh ref={sheath} position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[3.9, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.3]} />
        <meshBasicMaterial color="#ffb37a" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Ionised wake streaming behind the capsule during peak heating. */}
      <mesh ref={wake} position={[0, 0, -7.5]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <coneGeometry args={[3.2, 14, 24, 1, true]} />
        <meshBasicMaterial color="#ff8a4a" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ───────────────────────── parachute ─────────────────────────

// Parachute + backshell in a y-up frame. The lander hangs inside until backshell separation.
export function ParachutePackage({ inflate }: { inflate: Signal }) {
  const canopy = useRef<THREE.Group>(null);
  const canopyGeometry = useMemo(() => {
    const geometry = new THREE.SphereGeometry(15, 40, 12, 0, Math.PI * 2, 0, 1.05);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const white = new THREE.Color('#f1ece4');
    const orange = new THREE.Color('#d0683a');
    for (let i = 0; i < geometry.attributes.position.count; i += 1) {
      const x = geometry.attributes.position.getX(i);
      const z = geometry.attributes.position.getZ(i);
      const gore = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 20);
      const c = gore % 2 === 0 ? white : orange;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }, []);
  const lines = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      points.push(Math.cos(a) * 11.5, 30, Math.sin(a) * 11.5, 0, 9, 0);
    }
    points.push(0, 9, 0, 0, 3.4, 0);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, []);
  useFrame(({ clock }) => {
    if (!canopy.current) return;
    const k = inflate.current;
    const t = clock.getElapsedTime();
    // Supersonic canopies "breathe": the mouth partially collapses and re-inflates a few times a second.
    const breathe = 1 + Math.sin(t * 5.2) * 0.025 * k;
    canopy.current.scale.set((0.15 + k * 0.85) * breathe, (0.4 + k * 0.6) / breathe, (0.15 + k * 0.85) * breathe);
    canopy.current.rotation.z = Math.sin(t * 0.9) * 0.025;
    canopy.current.rotation.x = Math.sin(t * 0.7) * 0.02;
  });
  return (
    <group>
      <group rotation={[Math.PI / 2, 0, 0]}><Backshell /></group>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#d8d2c8" transparent opacity={0.55} />
      </lineSegments>
      <group ref={canopy} position={[0, 24, 0]}>
        <mesh geometry={canopyGeometry} castShadow>
          <meshStandardMaterial vertexColors roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        {/* Disk-gap-band: a separate band below the disk, with a gap between. */}
        <mesh position={[0, 5.2, 0]}>
          <cylinderGeometry args={[12.6, 12.0, 2.6, 40, 1, true]} />
          <meshStandardMaterial color="#e9e2d8" roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

export function FallingHeatShield() {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh position={[0, 0, 0.6]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[3.3, 1.2, 48]} />
        <meshStandardMaterial {...shieldMaterialBase} color="#1c1511" />
      </mesh>
    </group>
  );
}

// ───────────────────────── lander ─────────────────────────

const LEG_ANGLES = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
const FOOT_RADIUS = 3.7;
const up = new THREE.Vector3(0, 1, 0);

function placeStrut(mesh: THREE.Mesh | null, a: THREE.Vector3, b: THREE.Vector3) {
  if (!mesh) return;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const length = dir.length();
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(up, dir.normalize());
  mesh.scale.set(1, length, 1);
}

type LanderProps = { throttle: Signal; compress: Signal; lightsOn: boolean };

// Engine exhaust and glow. Shared by the procedural lander and any glTF lander.
function LanderEffects({ throttle, compress, engineY = 1.55, engineRadius = 1.05 }: { throttle: Signal; compress: Signal; engineY?: number; engineRadius?: number }) {
  const root = useRef<THREE.Group>(null);
  const plumes = useRef<(THREE.Mesh | null)[]>([]);
  const glow = useRef<THREE.PointLight>(null);
  const plumeMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#cfdcff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  const coreMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff1dc', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  useFrame(({ clock }) => {
    if (root.current) root.current.position.y = -compress.current * 0.32;
    const k = throttle.current;
    const t = clock.getElapsedTime();
    const flicker = 0.85 + Math.sin(t * 41) * 0.08 + Math.sin(t * 17.3) * 0.07;
    plumeMaterial.opacity = k * 0.28 * flicker;
    coreMaterial.opacity = k * 0.55 * flicker;
    plumes.current.forEach((plume) => { if (plume) { plume.visible = k > 0.01; plume.scale.set(1, 0.6 + k * 0.6 * flicker, 1); } });
    if (glow.current) glow.current.intensity = k * 9 * flicker;
  });
  return (
    <group ref={root}>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * engineRadius, engineY, Math.sin(a) * engineRadius]}>
            <mesh ref={(node) => { plumes.current[i * 2] = node; }} position={[0, -1.9, 0]} material={plumeMaterial}>
              <coneGeometry args={[0.62, 3.1, 16, 1, true]} />
            </mesh>
            <mesh ref={(node) => { plumes.current[i * 2 + 1] = node; }} position={[0, -0.95, 0]} rotation={[Math.PI, 0, 0]} material={coreMaterial}>
              <coneGeometry args={[0.32, 1.2, 12, 1, true]} />
            </mesh>
          </group>
        );
      })}
      <pointLight ref={glow} position={[0, 0.2, 0]} color="#ffd7aa" intensity={0} distance={14} decay={2} />
    </group>
  );
}

function ProceduralLander({ compress, lightsOn }: Pick<LanderProps, 'compress' | 'lightsOn'>) {
  const body = useRef<THREE.Group>(null);
  const struts = useRef<(THREE.Mesh | null)[]>([]);
  const strutGeometry = useMemo(() => new THREE.CylinderGeometry(0.09, 0.09, 1, 8), []);
  const strutMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b7b4ad', roughness: 0.45, metalness: 0.65 }), []);
  const foil = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b48a46', roughness: 0.32, metalness: 0.85 }), []);

  useFrame(() => {
    const drop = compress.current * 0.32;
    if (body.current) body.current.position.y = -drop;
    LEG_ANGLES.forEach((angle, i) => {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const foot = new THREE.Vector3(c * FOOT_RADIUS, 0.16, s * FOOT_RADIUS);
      placeStrut(struts.current[i * 2], new THREE.Vector3(c * 1.85, 2.75 - drop, s * 1.85), foot);
      placeStrut(struts.current[i * 2 + 1], new THREE.Vector3(c * 2.0, 1.95 - drop, s * 2.0), foot.clone().add(new THREE.Vector3(0, 0.08, 0)));
    });
  });

  return (
    <group>
      <group ref={body}>
        <mesh position={[0, 2.1, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[2.25, 2.25, 0.34, 8]} />
          <meshStandardMaterial color="#7d7a74" roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh position={[0, 3.45, 0]} material={foil} castShadow>
          <cylinderGeometry args={[1.95, 2.05, 2.4, 8]} />
        </mesh>
        <mesh position={[0, 5.75, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.55, 1.85, 2.2, 24]} />
          <meshStandardMaterial color="#e6e2da" roughness={0.6} metalness={0.15} />
        </mesh>
        <mesh position={[0, 7.15, 0]} castShadow>
          <cylinderGeometry args={[0.7, 1.55, 0.6, 24]} />
          <meshStandardMaterial color="#d8d3ca" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[0, 5.95, 1.74]} rotation={[-0.136, 0, 0]}>
          <boxGeometry args={[0.62, 0.34, 0.06]} />
          <meshStandardMaterial color="#1f2d36" roughness={0.2} metalness={0.6} emissive={lightsOn ? '#3d5560' : '#000000'} emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0.9, 7.6, 0]} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.02, 0.02, 0.9, 6]} />
          <meshStandardMaterial color="#aaa49a" metalness={0.5} />
        </mesh>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <group key={i} position={[Math.cos(a) * 1.05, 1.55, Math.sin(a) * 1.05]}>
              <mesh>
                <cylinderGeometry args={[0.22, 0.46, 0.75, 16, 1, true]} />
                <meshStandardMaterial color="#3a3836" roughness={0.5} metalness={0.7} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        })}
        <mesh position={[0, 7.5, 0]}>
          <sphereGeometry args={[0.07, 8, 6]} />
          <meshBasicMaterial color={lightsOn ? '#9ff0b8' : '#5a4a40'} />
        </mesh>
      </group>
      {LEG_ANGLES.map((angle, i) => (
        <group key={i}>
          <mesh ref={(node) => { struts.current[i * 2] = node; }} geometry={strutGeometry} material={strutMaterial} castShadow />
          <mesh ref={(node) => { struts.current[i * 2 + 1] = node; }} geometry={strutGeometry} material={strutMaterial} castShadow />
          <mesh position={[Math.cos(angle) * FOOT_RADIUS, 0.08, Math.sin(angle) * FOOT_RADIUS]} castShadow receiveShadow>
            <cylinderGeometry args={[0.38, 0.46, 0.16, 16]} />
            <meshStandardMaterial color="#8f8b84" roughness={0.6} metalness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// A glTF lander is a single rigid model: it drops with leg compression but its legs do not flex.
function ModelLander({ spec, compress }: { spec: ModelSpec; compress: Signal }) {
  const hull = useRef<THREE.Group>(null);
  useFrame(() => { if (hull.current) hull.current.position.y = -compress.current * 0.32; });
  return (
    <group ref={hull}>
      <GltfModel spec={spec} />
    </group>
  );
}

// Conceptual crewed cargo lander, y-up, footpads at y = 0.
export function Lander({ throttle, compress, lightsOn }: LanderProps) {
  const spec = MODELS.lander;
  const procedural = <ProceduralLander compress={compress} lightsOn={lightsOn} />;
  return (
    <group>
      {spec ? (
        <ModelBoundary fallback={procedural}>
          <Suspense fallback={procedural}><ModelLander spec={spec} compress={compress} /></Suspense>
        </ModelBoundary>
      ) : procedural}
      <LanderEffects throttle={throttle} compress={compress} engineY={spec?.engines?.y} engineRadius={spec?.engines?.radius} />
    </group>
  );
}

// ───────────────────────── landing dust ─────────────────────────

// Regolith blown outward by the descent engines. Place at the touchdown point (ground level).
// `proximity` is 0 when the exhaust is far above the ground and 1 when the lander is on it
// (landingProfile.sampleDescent provides it).
export function LandingDust({ throttle, proximity }: { throttle: Signal; proximity: Signal }) {
  const COUNT = 260;
  const state = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i += 1) pos[i * 3 + 1] = -1000;
    return { pos, vel: new Float32Array(COUNT * 3), life: new Float32Array(COUNT), cursor: 0, carry: 0 };
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(state.pos, 3));
    return g;
  }, [state]);
  const material = useMemo(() => new THREE.PointsMaterial({ color: '#b98a66', size: 1.7, transparent: true, opacity: 0.32, depthWrite: false, sizeAttenuation: true }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    state.carry += throttle.current * proximity.current * 150 * dt;
    while (state.carry >= 1) {
      const i = state.cursor;
      state.cursor = (state.cursor + 1) % COUNT;
      const angle = Math.random() * Math.PI * 2;
      const radius = 1 + Math.random() * 2.2;
      const speed = 6 + Math.random() * 11;
      state.pos[i * 3] = Math.cos(angle) * radius;
      state.pos[i * 3 + 1] = 0.2;
      state.pos[i * 3 + 2] = Math.sin(angle) * radius;
      state.vel[i * 3] = Math.cos(angle) * speed;
      state.vel[i * 3 + 1] = 0.6 + Math.random() * 1.8;
      state.vel[i * 3 + 2] = Math.sin(angle) * speed;
      state.life[i] = 1.8 + Math.random() * 1.6;
      state.carry -= 1;
    }
    for (let i = 0; i < COUNT; i += 1) {
      if (state.life[i] <= 0) continue;
      state.life[i] -= dt;
      if (state.life[i] <= 0) { state.pos[i * 3 + 1] = -1000; continue; }
      const drag = 1 - 1.1 * dt; // thin air: dust drifts a long way
      state.vel[i * 3] *= drag;
      state.vel[i * 3 + 2] *= drag;
      state.vel[i * 3 + 1] = Math.max(0, state.vel[i * 3 + 1] - 1.2 * dt);
      state.pos[i * 3] += state.vel[i * 3] * dt;
      state.pos[i * 3 + 1] += state.vel[i * 3 + 1] * dt;
      state.pos[i * 3 + 2] += state.vel[i * 3 + 2] * dt;
    }
    geometry.attributes.position.needsUpdate = true;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

// ───────────────────────── rover ─────────────────────────

function ProceduralRover() {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9d4ca', roughness: 0.5, metalness: 0.35 }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2b2a28', roughness: 0.8, metalness: 0.2 }), []);
  const wheels: [number, number][] = [[-0.95, 0.8], [0, 0.85], [0.95, 0.8], [-0.95, -0.8], [0, -0.85], [0.95, -0.8]];
  return (
    <group>
      <mesh position={[0, 0.72, 0]} material={metal} castShadow receiveShadow><boxGeometry args={[2.0, 0.5, 1.1]} /></mesh>
      <mesh position={[-0.2, 1.05, 0]} material={dark} castShadow><boxGeometry args={[1.5, 0.12, 0.9]} /></mesh>
      <mesh position={[-1.15, 0.75, 0]} rotation={[0, 0, Math.PI / 2]} material={dark} castShadow><cylinderGeometry args={[0.2, 0.2, 0.3, 16]} /></mesh>
      {wheels.map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, 0.46, z * 0.82]} rotation={[0, 0, 0]} material={metal}><boxGeometry args={[0.1, 0.1, Math.abs(z) * 0.4]} /></mesh>
          <mesh position={[x, 0.27, z]} rotation={[Math.PI / 2, 0, 0]} material={dark} castShadow><cylinderGeometry args={[0.27, 0.27, 0.22, 20]} /></mesh>
        </group>
      ))}
      <mesh position={[0.55, 1.5, 0.3]} material={metal}><cylinderGeometry args={[0.03, 0.03, 0.9, 8]} /></mesh>
      <mesh position={[0.55, 2.0, 0.3]} material={dark} castShadow><boxGeometry args={[0.34, 0.16, 0.34]} /></mesh>
      <mesh position={[0.2, 1.3, -0.3]} rotation={[0, 0.5, 0]} material={metal}><cylinderGeometry args={[0.05, 0.05, 0.6, 8]} /></mesh>
    </group>
  );
}

// Surface rover, y-up, wheels at y = 0, driving toward +x. Swap in a glTF via MODELS.rover.
export function Rover() {
  const spec = MODELS.rover;
  const procedural = <ProceduralRover />;
  if (!spec) return procedural;
  return (
    <ModelBoundary fallback={procedural}>
      <Suspense fallback={procedural}><GltfModel spec={spec} /></Suspense>
    </ModelBoundary>
  );
}
