import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { SITES, type SiteId } from '../mission/sites';
import { edlLive, entrySample } from '../mission/edl';
import { STAGE_SECONDS, type LandingStage } from '../mission/landingMachine';
import { Aeroshell } from './Vehicles';
import { patchAround } from './sitePatches';
import { SUN_DIRECTION, approachDurations, approachLive } from './approachLive';
import { EarthLaunch, alignEarth } from './EarthLaunch';
import { LaunchSite } from './LaunchSite';
import { voyageTune } from '../tune';

export const PLANET_RADIUS = 100;
const SPACE_SUN = SUN_DIRECTION;

// Painted stand-in, shown only until the NASA map textures below have loaded (or if they
// cannot load). Major albedo regions sit at approximately the right latitude/longitude.
function createPlanetTexture() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const toX = (lon: number) => ((lon + 180) / 360) * width;
  const toY = (lat: number) => ((90 - lat) / 180) * height;
  ctx.fillStyle = '#b06c4c';
  ctx.fillRect(0, 0, width, height);
  let seed = 2100;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const blob = (lon: number, lat: number, rx: number, ry: number, rgb: string, alpha: number) => {
    for (const offset of [-360, 0, 360]) {
      const x = toX(lon + offset);
      const y = toY(lat);
      const sx = (rx / 360) * width;
      const sy = (ry / 180) * height;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, sy / sx);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, sx);
      gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
      gradient.addColorStop(0.6, `rgba(${rgb},${alpha * 0.55})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, sx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
  // Southern highlands are generally darker and more cratered than the northern plains.
  const south = ctx.createLinearGradient(0, toY(10), 0, toY(-60));
  south.addColorStop(0, 'rgba(70,38,28,0)');
  south.addColorStop(1, 'rgba(70,38,28,0.22)');
  ctx.fillStyle = south;
  ctx.fillRect(0, toY(10), width, toY(-60) - toY(10));
  for (let i = 0; i < 1800; i += 1) {
    blob(rand() * 360 - 180, rand() * 160 - 80, 1 + rand() * 9, 1 + rand() * 6, rand() > 0.5 ? '72,38,28' : '214,148,104', 0.12);
  }
  const dark = '62,34,26';
  const bright = '222,160,118';
  [
    [70, 10, 11, 15, 0.62], [5, -4, 26, 6, 0.48], [28, -7, 22, 6, 0.42], [-40, -24, 26, 10, 0.42], [-28, 46, 17, 12, 0.5],
    [112, 44, 26, 8, 0.24], [110, -18, 22, 8, 0.48], [146, -22, 22, 8, 0.46], [-150, -30, 22, 7, 0.44], [-88, -26, 15, 8, 0.28],
    [-60, -8, 10, 6, 0.24], [178, -25, 10, 9, 0.3],
  ].forEach(([lon, lat, rx, ry, a]) => blob(lon, lat, rx, ry, dark, a));
  [
    [70, -42, 15, 11, 0.5], [-43, -50, 9, 7, 0.36], [22, 20, 26, 15, 0.3], [-120, 6, 36, 24, 0.34], [150, 12, 20, 10, 0.18], [-160, 14, 18, 10, 0.24],
  ].forEach(([lon, lat, rx, ry, a]) => blob(lon, lat, rx, ry, bright, a));
  // Valles Marineris and the Tharsis volcanoes.
  for (let i = 0; i < 70; i += 1) {
    const f = i / 69;
    const lon = -96 + f * 54 + (rand() - 0.5) * 2;
    const lat = -6 - f * 8 + Math.sin(f * 9) * 1.2;
    blob(lon, lat, 1.1 + rand() * 1.6, 0.6 + rand() * 0.9, '66,34,24', 0.2);
  }
  for (const [lon, lat, r] of [[-134, 18, 16], [-113, -1, 7], [-112, 12, 7], [-104, -9, 7], [-101, 40, 9]] as const) {
    ctx.strokeStyle = 'rgba(90,50,36,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(lon), toY(lat), r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 160; i += 1) {
    // Soft crater: shadowed floor and a faint bright rim, no hard outline.
    const lat = -75 + rand() * 100;
    const r = 2 + Math.pow(rand(), 2) * 16;
    const x = toX(rand() * 360 - 180);
    const y = toY(lat);
    const floor = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r);
    floor.addColorStop(0, 'rgba(62,32,24,0.16)');
    floor.addColorStop(0.75, 'rgba(62,32,24,0.08)');
    floor.addColorStop(0.9, 'rgba(226,168,128,0.1)');
    floor.addColorStop(1, 'rgba(226,168,128,0)');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Polar caps.
  const capN = ctx.createLinearGradient(0, 0, 0, toY(76));
  capN.addColorStop(0, 'rgba(246,238,228,0.95)');
  capN.addColorStop(0.7, 'rgba(236,222,206,0.6)');
  capN.addColorStop(1, 'rgba(236,222,206,0)');
  ctx.fillStyle = capN;
  ctx.fillRect(0, 0, width, toY(76));
  const capS = ctx.createLinearGradient(0, height, 0, toY(-80));
  capS.addColorStop(0, 'rgba(240,232,222,0.9)');
  capS.addColorStop(1, 'rgba(240,232,222,0)');
  ctx.fillStyle = capS;
  ctx.fillRect(0, toY(-80), width, height - toY(-80));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Same convention as THREE.SphereGeometry: u = (lon + 180) / 360, v = (90 − lat) / 180.
export function latLonToVector(lat: number, lon: number, radius: number) {
  const u = (lon + 180) / 360;
  const v = (90 - lat) / 180;
  const phi = u * Math.PI * 2;
  const theta = v * Math.PI;
  return new THREE.Vector3(-radius * Math.cos(phi) * Math.sin(theta), radius * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta));
}

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const atmosphereFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uHaze;
  uniform float uStrength;
  uniform float uMax;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // Rendered on the back faces of a slightly larger shell: brightest just above the
    // limb, fading to nothing at the shell's edge, so the haze has no hard outline.
    float d = clamp(-dot(vNormal, vView) / uMax, 0.0, 1.0);
    float lit = smoothstep(-0.3, 0.45, dot(vNormal, uSun));
    float glow = pow(d, 2.2) * lit * uStrength;
    // Mars' limb is a thin, pale, dusty haze rather than Earth's thick blue band.
    gl_FragColor = vec4(uHaze * glow, glow);
    #include <colorspace_fragment>
  }
`;

const ATMOSPHERE_SCALE = 1.022;

// The globe's surface from real data (public domain), built by scripts/build-mars-textures.mjs:
// - colour: USGS/NASA Ames Viking MDIM 2.1 colourised global mosaic (1 km/pixel source);
// - relief: normal map from MGS MOLA MEGDR topography (16 px/degree), slopes exaggerated ×4.
// Both are simple cylindrical with 180°W at the left edge, matching latLonToVector.
// Phones and small GPUs get 2048 × 1024 maps; larger screens 4096 × 2048.
const MAP_BASE = `${import.meta.env?.BASE_URL ?? '/'}textures/mars/`;

function useMarsMaps() {
  const gl = useThree((state) => state.gl);
  const [maps, setMaps] = useState<{ color: THREE.Texture; relief: THREE.Texture } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const small = gl.capabilities.maxTextureSize < 4096 || window.matchMedia('(max-width: 800px), (max-height: 500px)').matches;
    const size = small ? '2k' : '4k';
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const loader = new THREE.TextureLoader();
    if (!voyageTune.useMarsMaps) return undefined;
    Promise.all([loader.loadAsync(`${MAP_BASE}mars-color-${size}.jpg`), loader.loadAsync(`${MAP_BASE}mars-normal-${size}.jpg`)])
      .then(([color, relief]) => {
        if (cancelled) { color.dispose(); relief.dispose(); return; }
        color.colorSpace = THREE.SRGBColorSpace;
        relief.colorSpace = THREE.NoColorSpace; // directions, not colours
        color.anisotropy = relief.anisotropy = anisotropy;
        setMaps({ color, relief });
      })
      .catch(() => { /* keep the painted stand-in */ });
    return () => { cancelled = true; };
  }, [gl]);
  useEffect(() => () => { maps?.color.dispose(); maps?.relief.dispose(); }, [maps]);
  return maps;
}

// During entry the camera flies 35–125 km above the chosen site, where the global map is soft.
// A sharper patch (same Viking colour mosaic at ≈0.7 km/pixel, 1.4 km on phones; MOLA 64 px/degree relief; built by
// scripts/build-site-patches.mjs) is laid just above the globe there; its edges fade into the globe.
function createEdgeFade() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = Math.min(x + 0.5, size - x - 0.5, y + 0.5, size - y - 0.5) / size;
    const t = Math.min(1, edge / 0.14);
    data.fill(Math.round(t * t * (3 - 2 * t) * 255), (y * size + x) * 4, (y * size + x) * 4 + 4); // alphaMap reads green
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function SitePatch({ siteId }: { siteId: SiteId }) {
  const gl = useThree((state) => state.gl);
  const site = SITES.find((item) => item.id === siteId) ?? SITES[0];
  const [maps, setMaps] = useState<{ id: SiteId; color: THREE.Texture; relief: THREE.Texture } | null>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const fade = useMemo(() => createEdgeFade(), []);
  useEffect(() => () => fade.dispose(), [fade]);
  useEffect(() => {
    let cancelled = false;
    const small = gl.capabilities.maxTextureSize < 4096 || window.matchMedia('(max-width: 800px), (max-height: 500px)').matches;
    const size = small ? '1k' : '2k';
    const loader = new THREE.TextureLoader();
    Promise.all([loader.loadAsync(`${MAP_BASE}site-${siteId}-color-${size}.jpg`), loader.loadAsync(`${MAP_BASE}site-${siteId}-normal-${size}.jpg`)])
      .then(([color, relief]) => {
        if (cancelled) { color.dispose(); relief.dispose(); return; }
        color.colorSpace = THREE.SRGBColorSpace;
        relief.colorSpace = THREE.NoColorSpace;
        color.anisotropy = relief.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        setMaps({ id: siteId, color, relief });
      })
      .catch(() => { /* the globe alone is still correct, just softer */ });
    return () => { cancelled = true; };
  }, [gl, siteId]);
  useEffect(() => () => { maps?.color.dispose(); maps?.relief.dispose(); }, [maps]);
  useFrame((_, delta) => {
    if (material.current && material.current.opacity < 1) material.current.opacity = Math.min(1, material.current.opacity + delta / 0.8);
  });
  if (!maps || maps.id !== siteId) return null;
  const patch = patchAround(site.lat, site.lon);
  const deg = Math.PI / 180;
  return (
    <mesh key={siteId}>
      {/* Same angles as THREE.SphereGeometry / latLonToVector: phi from 180°W, theta from the north pole. */}
      <sphereGeometry args={[PLANET_RADIUS * 1.0003, 160, 160, (patch.west + 180) * deg, (patch.east - patch.west) * deg, (90 - patch.north) * deg, (patch.north - patch.south) * deg]} />
      <meshStandardMaterial ref={material} map={maps.color} normalMap={maps.relief} alphaMap={fade} transparent opacity={0} depthWrite={false} roughness={1} metalness={0} />
    </mesh>
  );
}

function Planet({ stage, focusSite, onFocusSite }: { stage: LandingStage; focusSite: SiteId | null; onFocusSite?: (id: SiteId) => void }) {
  const painted = useMemo(createPlanetTexture, []);
  const maps = useMarsMaps();
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const atmosphere = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex, fragmentShader: atmosphereFragment, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.BackSide, uniforms: { uSun: { value: SPACE_SUN }, uHaze: { value: new THREE.Color(0.95, 0.8, 0.68) }, uStrength: { value: 0.9 }, uMax: { value: Math.sqrt(1 - 1 / (ATMOSPHERE_SCALE * ATMOSPHERE_SCALE)) } },
  }), []);
  const markers = useMemo(() => SITES.map((site) => ({ site, position: latLonToVector(site.lat, site.lon, PLANET_RADIUS * 1.003) })), []);

  useFrame((_, delta) => {
    if (!outer.current || !inner.current) return;
    atmosphere.uniforms.uStrength.value = voyageTune.airless ? 0.1 : 0.9;
    (atmosphere.uniforms.uHaze.value as THREE.Color).setRGB(voyageTune.haze[0], voyageTune.haze[1], voyageTune.haze[2]);
    const site = SITES.find((item) => item.id === focusSite) ?? SITES[0];
    const p = latLonToVector(site.lat, site.lon, 1);
    const yaw = -Math.atan2(p.x, p.z);
    const lat = (site.lat * Math.PI) / 180;
    if (stage === 'ENTRY') {
      // Put the chosen site at the top of the globe, just ahead of the descending vehicle.
      inner.current.rotation.y = yaw;
      outer.current.rotation.x = lat - Math.PI / 2 - 0.035;
    } else if (stage === 'SITE_SELECT') {
      inner.current.rotation.y = dampAngle(inner.current.rotation.y, yaw, 2.2, delta);
      outer.current.rotation.x = THREE.MathUtils.damp(outer.current.rotation.x, lat * 0.85, 2.2, delta);
    } else {
      inner.current.rotation.y += delta * 0.012;
      outer.current.rotation.x = THREE.MathUtils.damp(outer.current.rotation.x, 0.18, 1, delta);
    }
  });

  return (
    <group ref={outer}>
      <group ref={inner}>
        <mesh>
          <sphereGeometry args={[PLANET_RADIUS, 256, 192]} />
          <meshStandardMaterial key={maps ? 'nasa' : 'painted'} color={voyageTune.useMarsMaps ? '#ffffff' : voyageTune.ground} map={voyageTune.useMarsMaps ? (maps?.color ?? painted ?? undefined) : undefined} normalMap={voyageTune.useMarsMaps ? (maps?.relief ?? undefined) : undefined} roughness={1} metalness={0} />
        </mesh>
        {stage === 'ENTRY' && focusSite && maps && <SitePatch siteId={focusSite} />}
        {stage === 'SITE_SELECT' && markers.map(({ site, position }) => (
          <group key={site.id} position={position.toArray()}>
            <mesh lookAt={[0, 0, 0]}>
              <ringGeometry args={[1.6, 2.05, 40]} />
              <meshBasicMaterial color={site.id === focusSite ? '#ffd8a6' : '#f0e3d2'} transparent opacity={site.id === focusSite ? 0.95 : 0.55} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <Html center distanceFactor={140} zIndexRange={[5, 0]}>
              <button className={'globe-marker' + (site.id === focusSite ? ' is-focus' : '')} onClick={() => onFocusSite?.(site.id)} aria-pressed={site.id === focusSite}>
                <i>{SITE_LETTERS[site.id]}</i>{site.name}
              </button>
            </Html>
          </group>
        ))}
      </group>
      <mesh scale={ATMOSPHERE_SCALE} material={atmosphere}>
        <sphereGeometry args={[PLANET_RADIUS, 96, 64]} />
      </mesh>
    </group>
  );
}

const SITE_LETTERS: Record<SiteId, string> = { jezero: 'A', utopia: 'B', elysium: 'C' };

const dampAngle = (current: number, target: number, lambda: number, delta: number) => {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * delta));
};

interface SpaceProps {
  stage: LandingStage;
  focusSite: SiteId | null;
  onFocusSite?: (id: SiteId) => void;
  run: number;
  reducedMotion: boolean;
  onComplete: (stage: LandingStage, run: number) => void;
}

// APPROACH is three pictures in one stage: Earth departure, a compressed transit, then the cruise closing on Mars.
// SITE_SELECT frames the Mars globe. ENTRY rides behind the capsule into the upper atmosphere.
// ENTRY: the camera rides behind the capsule as it skims into the upper atmosphere.
export function SpaceScene({ stage, focusSite, onFocusSite, run, reducedMotion, onComplete }: SpaceProps) {
  const craft = useRef<THREE.Group>(null);
  const earthGroup = useRef<THREE.Group>(null);
  const marsFrame = useRef<THREE.Group>(null);
  const stars = useRef<THREE.Group>(null);
  const time = useRef(0);
  const stageKey = useRef('');
  const done = useRef('');
  const look = useMemo(() => new THREE.Vector3(), []);
  const heat = useRef(0);
  const cruiseOffset = useRef(0);
  const earthAligned = useRef(false);
  const picture = useRef('');
  const fill = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => {
    const departing = stage === 'APPROACH';
    if (earthGroup.current) {
      alignEarth(earthGroup.current);
      earthAligned.current = true;
      earthGroup.current.visible = departing;
    }
    if (marsFrame.current) marsFrame.current.visible = !departing;
    if (craft.current) craft.current.visible = !departing;
    if (departing) approachLive.launchProgress = 0;
  }, [stage]);

  useFrame(({ camera, size }, delta) => {
    const key = stage + ':' + run;
    if (stageKey.current !== key) {
      stageKey.current = key;
      time.current = stage === 'APPROACH' && voyageTune.departed ? approachDurations(reducedMotion).earth : 0;
      if (stage === 'APPROACH') approachLive.segment = voyageTune.departed ? 'transit' : 'earth';
    }
    time.current += Math.min(delta, 0.05);
    const t = time.current;
    const ease = (x: number) => x * x * (3 - 2 * x);

    if (stage !== 'APPROACH') {
      if (marsFrame.current) {
        marsFrame.current.visible = true;
        marsFrame.current.position.set(0, 0, 0);
        marsFrame.current.scale.setScalar(1);
      }
      if (earthGroup.current) earthGroup.current.visible = false;
      if (stars.current) stars.current.visible = true;
      if (fill.current) fill.current.intensity = 0;
    }

    if (stage === 'APPROACH') {
      const durations = approachDurations(reducedMotion);
      const prelude = durations.earth + durations.transit;
      const segment = t < durations.earth ? 'earth' : t < prelude ? 'transit' : 'mars';
      const pictureChanged = picture.current !== segment;
      picture.current = segment;
      approachLive.segment = segment;
      if (fill.current) {
        fill.current.intensity = segment === 'earth' ? 0.55 : 0;
        if (segment === 'earth') fill.current.position.copy(camera.position);
      }
      if (earthGroup.current && !earthAligned.current) {
        alignEarth(earthGroup.current);
        earthAligned.current = true;
      }
      if (segment === 'earth' || segment === 'transit') {
        const local = segment === 'earth' ? t / durations.earth : (t - durations.earth) / durations.transit;
        const earth = earthGroup.current;
        const mars = marsFrame.current;
        const ship = craft.current;
        if (stars.current) stars.current.visible = segment !== 'earth';
        if (segment === 'earth') {
          // The launch from the pad is its own scene (LaunchSite); it drives the camera.
          if (earth) earth.visible = false;
          if (mars) mars.visible = false;
          if (ship) ship.visible = false;
          approachLive.launchProgress = Math.min(1, local);
        } else {
          const u = ease(Math.min(1, local));
          if (earth) {
            earth.visible = true;
            earth.position.lerpVectors(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-230, 28, -40), u);
            earth.scale.setScalar(THREE.MathUtils.lerp(1, 0.11, u));
          }
          if (mars) {
            mars.visible = true;
            mars.position.lerpVectors(new THREE.Vector3(220, 36, -30), new THREE.Vector3(0, 0, 0), u);
            mars.scale.setScalar(THREE.MathUtils.lerp(0.24, 1, u));
          }
          if (ship) {
            ship.visible = true;
            ship.scale.setScalar(2.4);
            const end = new THREE.Vector3(24, 18, 620).add(mars?.position ?? new THREE.Vector3());
            ship.position.lerpVectors(new THREE.Vector3(150, 78, 110), end, u);
            ship.lookAt(mars?.position ?? new THREE.Vector3());
          }
          const camEnd = (ship?.position ?? new THREE.Vector3(24, 18, 620)).clone().add(new THREE.Vector3(-15, 5, 24));
          const cam = new THREE.Vector3(-40, 70, 360).lerp(camEnd, u * u);
          if (pictureChanged || local < 0.04 || u > 0.97) camera.position.copy(cam);
          else camera.position.lerp(cam, 1 - Math.exp(-delta * 2.2));
          const between = (earth?.position ?? new THREE.Vector3()).clone().lerp(mars?.position ?? new THREE.Vector3(220, 36, -30), 0.42);
          const closingLook = (ship?.position ?? new THREE.Vector3()).clone().lerp(new THREE.Vector3(), 0.16);
          look.copy(between).lerp(closingLook, u * u);
          camera.lookAt(look);
        }
        return;
      }
      if (marsFrame.current) {
        marsFrame.current.visible = true;
        marsFrame.current.position.set(0, 0, 0);
        marsFrame.current.scale.setScalar(1);
      }
      if (earthGroup.current) earthGroup.current.visible = false;
      if (stars.current) stars.current.visible = true;
      if (craft.current) {
        craft.current.visible = true;
        craft.current.scale.setScalar(0.7);
      }
      const p = ease(Math.min(1, (t - prelude) / STAGE_SECONDS.APPROACH));
      const craftPos = new THREE.Vector3().lerpVectors(new THREE.Vector3(24, 18, 620), new THREE.Vector3(10, 22, 250), p);
      craft.current?.position.copy(craftPos);
      craft.current?.lookAt(0, 0, 0);
      cruiseOffset.current = 0;
      heat.current = 0;
      const camPos = craftPos.clone().add(new THREE.Vector3(-15 + p * 3, 5 + p * 2, 24 - p * 4));
      if (pictureChanged || p < 0.02) camera.position.copy(camPos);
      else camera.position.lerp(camPos, 1 - Math.exp(-delta * 3));
      look.lerpVectors(craftPos, new THREE.Vector3(0, 0, 0), 0.16 + p * 0.14);
      camera.lookAt(look);
      if (p >= 1 && done.current !== key) { done.current = key; onComplete('APPROACH', run); }
    } else if (stage === 'SITE_SELECT') {
      // Frame the globe beside the site panel (desktop) or above it (portrait screens).
      const portrait = size.width / size.height < 1;
      const frame = portrait ? new THREE.Vector3(0, -62, 0) : new THREE.Vector3(48, 4, 0);
      craft.current?.position.lerp(new THREE.Vector3(-120, 60, 210), 1 - Math.exp(-delta * 1.5));
      craft.current?.lookAt(0, 0, 0);
      camera.position.lerp(frame.clone().setZ(portrait ? 390 : 335), 1 - Math.exp(-delta * 1.6));
      look.lerp(frame, 1 - Math.exp(-delta * 2));
      camera.lookAt(look);
    } else if (stage === 'ENTRY') {
      const p = Math.min(1, t / STAGE_SECONDS.ENTRY);
      // 1 planet unit ≈ 34 km. The vehicle descends from ~125 km to ~35 km before the
      // view cuts to the parachute phase over the landing site.
      const altitude = THREE.MathUtils.lerp(3.7, 1.05, ease(p));
      const pos = new THREE.Vector3(0, PLANET_RADIUS + altitude, 7 - p * 7);
      if (craft.current) {
        craft.current.position.copy(pos);
        craft.current.lookAt(pos.clone().add(new THREE.Vector3(0, -0.3, -1)));
      }
      cruiseOffset.current = Math.min(1, t / 2.2);
      heat.current = voyageTune.airless || voyageTune.noShield ? 0 : Math.sin(Math.min(1, Math.max(0, (p - 0.04) / 0.86)) * Math.PI) * 0.95;
      const shake = reducedMotion ? 0 : heat.current * 0.012;
      const camPos = pos.clone().add(new THREE.Vector3(2.5 - p * 0.5, 0.55, 3.3 - p * 0.5));
      camPos.x += (Math.random() - 0.5) * shake;
      camPos.y += (Math.random() - 0.5) * shake;
      if (t < 0.1) camera.position.copy(camPos);
      else camera.position.lerp(camPos, 1 - Math.exp(-delta * 6));
      look.copy(pos).add(new THREE.Vector3(-0.9, -0.6, -2.4));
      camera.lookAt(look);
      const sample = entrySample(p);
      Object.assign(edlLive, sample, { progress: p, awaitingDecision: false });
      if (p >= 1 && done.current !== key) { done.current = key; onComplete('ENTRY', run); }
    }
  });

  return (
    <group>
      <color attach="background" args={['#030304']} />
      <group ref={stars}>
        <Stars radius={900} depth={300} count={2600} factor={14} saturation={0.05} fade speed={0.15} />
      </group>
      <ambientLight intensity={0.035} />
      <directionalLight position={SPACE_SUN.clone().multiplyScalar(500).toArray()} intensity={3.1} color="#fff6ea" />
      <directionalLight ref={fill} intensity={0} color="#f3f7ff" />
      <group ref={marsFrame}>
        <Planet stage={stage} focusSite={focusSite} onFocusSite={onFocusSite} />
      </group>
      <group ref={earthGroup}>
        <EarthLaunch />
      </group>
      {!voyageTune.departed && <LaunchSite active={stage === 'APPROACH'} reducedMotion={reducedMotion} />}
      <group ref={craft} position={[24, 18, 620]} scale={stage === 'ENTRY' ? 0.09 : 0.7}>
        <Aeroshell heat={heat} cruiseOffset={cruiseOffset} showCruise />
      </group>
    </group>
  );
}
