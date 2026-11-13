import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Signal } from './Vehicles';
import { NOISE_GLSL } from './glsl';
import { SUN_DIRECTION, approachLive } from './approachLive';

// The launch, seen from the ground: a coastal pad, the sky, the sea, a cloud deck, then the climb
// until the sky turns black and the horizon curves. Everything outside the pad models is drawn by
// one shader that traces each view ray against a curved ground, a cloud layer and the sky.
// It is a visual model: the coast, pad and rocket are a fictional stand-in, not a real site.
// Scale: 1 scene unit is about 5.5 m, so the rocket is about 60 m tall.

const PLANET_R = 120000; // a smaller planet than Earth, so the curve shows by the end of the climb
const CLOUD_BASE = 420; // about 2.3 km
const ROCKET_Y = 0.5;
const STORY_SECONDS = 9.5; // the timeline below is written in these seconds and scaled to the real duration

function smooth(value: number, edge0: number, edge1: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Altitude, downrange distance, pitch and throttle at story second s.
export function launchProfile(s: number) {
  const lift = 1.3;
  const flight = Math.max(0, s - lift);
  const alt = 46 * Math.pow(flight, 2.6);
  const pitch = smooth(s, 3.0, STORY_SECONDS) * 0.95;
  const downrange = alt * 0.55 * smooth(s, 3.2, STORY_SECONDS);
  const throttle = s < 0.25 ? 0 : s < lift ? 0.3 + 0.5 * ((s - 0.25) / (lift - 0.25)) : 0.85 + 0.15 * smooth(s, lift, lift + 1.2);
  return { alt, downrange, pitch, throttle };
}

// ---------- exhaust ----------

const flameVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying float vWorldY;
  void main() {
    vUv = uv;
    vNormalV = normalize(normalMatrix * normal);
    vWorldY = (modelMatrix * vec4(position, 1.0)).y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uThrottle;
  uniform float uSeed;
  uniform float uClipY;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying float vWorldY;
  ${NOISE_GLSL}
  void main() {
    if (vWorldY < uClipY) discard; // the pad deck hides the plume below it
    float t = 1.0 - vUv.y;
    float core = pow(abs(vNormalV.z), 1.4);
    float flick = vnoise(vec3(vUv.x * 7.0, t * 9.0 - uTime * 16.0, uTime * 3.0 + uSeed));
    float body = (1.0 - t) * core * (0.7 + 0.6 * flick);
    float diamonds = (0.5 + 0.5 * cos(t * 30.0 - 0.6)) * (1.0 - smoothstep(0.0, 0.55, t)) * 0.45;
    vec3 hot = vec3(1.0, 0.97, 0.9);
    vec3 mid = vec3(1.0, 0.66, 0.26);
    vec3 tail = vec3(0.95, 0.32, 0.08);
    vec3 colour = mix(hot, mid, smoothstep(0.0, 0.3, t));
    colour = mix(colour, tail, smoothstep(0.3, 0.85, t));
    float alpha = clamp(body * (1.0 + diamonds) * uThrottle * 1.7, 0.0, 1.0) * (1.0 - smoothstep(0.7, 1.0, t));
    gl_FragColor = vec4(colour * alpha * 1.6, alpha);
  }
`;

// ---------- smoke ----------

// Camera-facing quads rather than GL points, so puff size is not capped by the GPU's point size limit.
const smokeVertex = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aHeat;
  varying float vAlpha;
  varying float vHeat;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vSeed = float(gl_InstanceID) * 0.618;
    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
    mv.xy += position.xy * aSize;
    gl_Position = projectionMatrix * mv;
    vAlpha = aAlpha;
    vHeat = aHeat;
    vUv = uv;
  }
`;
const smokeFragment = /* glsl */ `
  uniform float uLight;
  varying float vAlpha;
  varying float vHeat;
  varying vec2 vUv;
  varying float vSeed;
  ${NOISE_GLSL}
  void main() {
    vec2 c = vUv - 0.5;
    c.y = -c.y;
    float r = length(c);
    if (r > 0.5) discard;
    float lump = fbm(vec3(c * 5.0, vSeed), 3);
    float soft = smoothstep(0.5, 0.08, r + (lump - 0.5) * 0.35) * (0.55 + 0.7 * lump);
    // Lit from above-right, a little darker underneath.
    float shade = (0.62 + 0.38 * clamp(0.5 - c.y + c.x * 0.4, 0.0, 1.0)) * (0.8 + 0.35 * lump);
    vec3 colour = vec3(0.86, 0.85, 0.83) * shade * uLight;
    colour = mix(colour, vec3(1.0, 0.62, 0.28) * 1.8, vHeat);
    gl_FragColor = vec4(colour, soft * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;


// Painted hull: panel seams, stringers, a roll-pattern band and the mission name.
function createHullTexture() {
  const width = 512;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#efebe3';
  ctx.fillRect(0, 0, width, height);
  let seed = 913;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 2600; i += 1) {
    const shade = 225 + Math.floor(rand() * 22);
    ctx.fillStyle = `rgba(${shade},${shade - 3},${shade - 9},0.35)`;
    ctx.fillRect(rand() * width, rand() * height, 2 + rand() * 6, 1 + rand() * 3);
  }
  ctx.strokeStyle = 'rgba(120,116,108,0.45)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= height; y += 96) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(140,136,128,0.18)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  // Roll pattern near the top of the stage.
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#1d2227' : 'rgba(0,0,0,0)';
    ctx.fillRect((i * width) / 4, 40, width / 4, 72);
  }
  // Mission name, written up the side.
  ctx.save();
  ctx.translate(width * 0.25, height * 0.62);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#1d2227';
  ctx.font = '600 54px "Space Grotesk", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MARS 2100', 0, 0);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,244,220,1)');
  g.addColorStop(0.18, 'rgba(255,190,110,0.75)');
  g.addColorStop(0.5, 'rgba(255,120,40,0.18)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


// ---------- materials ----------

const metal = new THREE.MeshStandardMaterial({ color: '#b9c0c8', roughness: 0.3, metalness: 0.85 });
const soot = new THREE.MeshStandardMaterial({ color: '#23282e', roughness: 0.55, metalness: 0.4 });
const bellMat = new THREE.MeshStandardMaterial({ color: '#3a3430', roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide, emissive: '#ff6a1a', emissiveIntensity: 0 });
const concrete = new THREE.MeshStandardMaterial({ color: '#9a968f', roughness: 0.95, metalness: 0.0 });
const trench = new THREE.MeshStandardMaterial({ color: '#3b3a38', roughness: 0.9, metalness: 0.05 });
const towerMat = new THREE.MeshStandardMaterial({ color: '#b8392a', roughness: 0.6, metalness: 0.35 });
const towerGrey = new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.5, metalness: 0.6 });

// Lathe profiles (radius, height). Smooth ogive noses instead of plain cones.
function ogive(base: number, y0: number, length: number, steps = 18) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    pts.push(new THREE.Vector2(Math.max(0.0001, base * Math.sqrt(1 - t * t * 0.985) * (1 - Math.pow(t, 6) * 0.9)), y0 + t * length));
  }
  return pts;
}

function useRocketGeometry() {
  return useMemo(() => {
    const coreR = 0.8;
    const core = new THREE.LatheGeometry([
      new THREE.Vector2(coreR * 0.92, 0.42), new THREE.Vector2(coreR, 0.55), new THREE.Vector2(coreR, 7.0),
    ], 48);
    const upper = new THREE.LatheGeometry([
      new THREE.Vector2(coreR, 7.32), new THREE.Vector2(coreR, 8.5), ...ogive(coreR, 8.5, 2.7),
    ], 48);
    const boosterR = 0.42;
    const booster = new THREE.LatheGeometry([
      new THREE.Vector2(boosterR * 0.9, 0.45), new THREE.Vector2(boosterR, 0.58), new THREE.Vector2(boosterR, 5.25), ...ogive(boosterR, 5.25, 1.25, 14),
    ], 32);
    const bell = (r: number, len: number) => new THREE.LatheGeometry([
      new THREE.Vector2(r * 0.42, 0), new THREE.Vector2(r * 0.5, -len * 0.18), new THREE.Vector2(r * 0.72, -len * 0.55), new THREE.Vector2(r, -len),
    ], 32);
    return { core, upper, booster, coreBell: bell(0.46, 0.62), boosterBell: bell(0.27, 0.42) };
  }, []);
}

function RocketBody({ hull }: { hull: THREE.Texture | null }) {
  const geo = useRocketGeometry();
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', map: hull ?? undefined, roughness: 0.42, metalness: 0.12 }), [hull]);
  const plain = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.4, metalness: 0.1 }), []);
  useEffect(() => () => { white.dispose(); plain.dispose(); }, [white, plain]);
  return (
    <group>
      <mesh geometry={geo.core} material={white} castShadow />
      <mesh position={[0, 7.16, 0]} material={soot}>
        <cylinderGeometry args={[0.815, 0.815, 0.34, 48]} />
      </mesh>
      <mesh geometry={geo.upper} material={plain} castShadow />
      {[1, -1].map((side) => (
        <group key={side} position={[side * 1.25, 0, 0]}>
          <mesh geometry={geo.booster} material={white} castShadow />
          <mesh position={[-side * 0.36, 4.7, 0]} rotation={[0, 0, Math.PI / 2]} material={metal}>
            <cylinderGeometry args={[0.05, 0.05, 0.42, 8]} />
          </mesh>
          <mesh position={[-side * 0.36, 1.1, 0]} rotation={[0, 0, Math.PI / 2]} material={metal}>
            <cylinderGeometry args={[0.05, 0.05, 0.42, 8]} />
          </mesh>
          <mesh position={[0, 0.47, 0]} geometry={geo.boosterBell} material={bellMat} />
        </group>
      ))}
      <mesh position={[0, 0.44, 0]} geometry={geo.coreBell} material={bellMat} />
      <mesh position={[0, 0.48, 0]} material={soot}>
        <cylinderGeometry args={[0.74, 0.74, 0.1, 40]} />
      </mesh>
    </group>
  );
}


function Flames({ throttle, hot, clipY, spread }: { throttle: Signal; hot: boolean; clipY: Signal; spread: Signal }) {
  const light = useRef<THREE.PointLight>(null);
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Sprite>(null);
  const core = useRef<THREE.Mesh>(null);
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const plume = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1.9, 1, 32, 1, true);
    g.translate(0, -0.5, 0);
    return g;
  }, []);
  const materials = useMemo(() => [0, 1, 2].map((seed) => new THREE.ShaderMaterial({
    vertexShader: flameVertex,
    fragmentShader: flameFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uThrottle: { value: 0 }, uSeed: { value: seed * 4.3 }, uClipY: { value: -1e9 } },
  })), []);
  useEffect(() => () => { glowTexture?.dispose(); plume.dispose(); materials.forEach((m) => m.dispose()); }, [glowTexture, plume, materials]);
  useFrame(({ clock }) => {
    const k = throttle.current;
    const time = clock.getElapsedTime();
    const flicker = 0.9 + Math.sin(time * 37) * 0.05 + Math.sin(time * 19) * 0.05;
    materials.forEach((m) => { m.uniforms.uTime.value = time; m.uniforms.uThrottle.value = k; m.uniforms.uClipY.value = clipY.current; });
    // Thinner air: each plume gets wider, without moving the booster plumes apart.
    const w = spread.current;
    core.current?.scale.set(0.22 * w, 2.6, 0.22 * w);
    left.current?.scale.set(0.13 * w, 1.9, 0.13 * w);
    right.current?.scale.set(0.13 * w, 1.9, 0.13 * w);
    if (group.current) {
      group.current.visible = k > 0.03;
      const stretch = (0.9 + k * 4.6) * flicker;
      group.current.scale.set(1, stretch, 1);
    }
    if (glow.current) {
      const s = (2.2 + k * 4.8) * flicker;
      glow.current.scale.set(s, s, 1);
      (glow.current.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 1.3);
    }
    bellMat.emissiveIntensity = hot ? k * 0.55 : 0;
    if (light.current) light.current.intensity = k * 26 * flicker;
  });
  return (
    <group>
      <group ref={group} position={[0, -0.16, 0]}>
        <mesh ref={core} geometry={plume} material={materials[0]} scale={[0.22, 2.6, 0.22]} />
        <mesh ref={right} geometry={plume} material={materials[1]} position={[1.25, 0.05, 0]} scale={[0.13, 1.9, 0.13]} />
        <mesh ref={left} geometry={plume} material={materials[2]} position={[-1.25, 0.05, 0]} scale={[0.13, 1.9, 0.13]} />
      </group>
      <sprite ref={glow} position={[0, -0.45, 0]}>
        <spriteMaterial map={glowTexture ?? undefined} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <pointLight ref={light} position={[0, -1.4, 0]} color="#ffb265" intensity={0} distance={60} decay={1.6} />
    </group>
  );
}


// ---------- sky, ground, sea and clouds ----------

const worldVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_Position.z = gl_Position.w * 0.99999; // always at the back
  }
`;

const worldFragment = /* glsl */ `
  uniform float uAlt;
  uniform vec2 uCam;
  uniform vec3 uSun;
  uniform float uTime;
  uniform float uR;
  uniform int uOct;
  varying vec3 vDir;
  ${NOISE_GLSL}

  const float SCALE_H = 1500.0;

  vec3 skyColour(vec3 d, float h) {
    float rho = exp(-h / SCALE_H);
    float dip = acos(clamp(uR / (uR + h), -1.0, 1.0));
    float rel = asin(clamp(d.y, -1.0, 1.0)) + dip;
    vec3 L = normalize(uSun);
    float mu = dot(d, L);
    vec3 zenith = vec3(0.09, 0.24, 0.72);
    vec3 horizon = vec3(0.58, 0.70, 0.90);
    vec3 day = mix(horizon, zenith, pow(clamp(rel / 1.3, 0.0, 1.0), 0.5));
    day += vec3(1.0, 0.86, 0.66) * (pow(max(mu, 0.0), 6.0) * 0.32 + pow(max(mu, 0.0), 90.0) * 1.1);
    vec3 col = day * clamp(rho * 1.15, 0.0, 1.0);
    // High up: black sky with a thin blue band just above the horizon.
    vec2 flatD = normalize(d.xz + 1e-5);
    float sunSide = 0.55 + 0.45 * dot(flatD, normalize(L.xz));
    float band = exp(-max(rel, 0.0) * mix(5.0, 55.0, 1.0 - rho));
    col += vec3(0.22, 0.48, 1.0) * band * (1.0 - rho) * 0.95 * sunSide;
    return col * 1.45;
  }

  // Ground albedo at a point of the site map (x east, z south), plus a water mask.
  vec4 groundAt(vec2 p, float dist) {
    float coast = 420.0 + 440.0 * (fbm(vec3(p.y * 0.0011, 0.0, 3.7), 4) - 0.5);
    float toSea = p.x - coast;
    float lagoonEdge = -2300.0 + 800.0 * (fbm(vec3(p.y * 0.0007, 5.0, 1.0), 3) - 0.5);
    float n1 = fbm(vec3(p * 0.004, 0.0), uOct);
    float n2 = fbm(vec3(p * 0.03, 2.0), 3);
    vec3 scrub = vec3(0.05, 0.08, 0.032);
    vec3 marsh = vec3(0.095, 0.115, 0.055);
    vec3 dry = vec3(0.16, 0.14, 0.095);
    vec3 col = mix(scrub, marsh, smoothstep(0.35, 0.65, n1));
    col = mix(col, dry, smoothstep(0.55, 0.8, n2) * 0.6);
    float fine = 1.0 - smoothstep(40.0, 420.0, dist);
    if (fine > 0.0) col *= mix(1.0, 0.74 + 0.3 * vnoise(vec3(p * 0.7, 0.0)) + 0.22 * vnoise(vec3(p * 3.1, 2.0)), fine);
    float r = length(p);
    // Pad apron, ring road, crawlerway to the west, coast road.
    if (r < 46.0) col = vec3(0.31, 0.30, 0.285) * (0.9 + 0.16 * vnoise(vec3(p * 0.9, 1.0))) * mix(0.55, 1.0, smoothstep(4.0, 14.0, length(p - vec2(0.0, 9.0))));
    if (abs(r - 64.0) < 1.6) col = vec3(0.055, 0.055, 0.06);
    if (p.x < -40.0 && p.x > -1420.0 && abs(p.y) < 5.0) col = abs(p.y) < 0.9 ? vec3(0.07, 0.1, 0.04) : vec3(0.34, 0.31, 0.27);
    if (abs(toSea + 170.0) < 1.8) col = vec3(0.06, 0.06, 0.065);
    float sand = smoothstep(-26.0, -8.0, toSea);
    col = mix(col, vec3(0.42, 0.38, 0.3), sand);
    float water = step(0.0, toSea);
    float pond = step(fbm(vec3(p * 0.0032, 7.0), 3), 0.27) * step(320.0, r) * step(toSea, -60.0);
    float lagoon = step(p.x, lagoonEdge);
    if (lagoon + pond > 0.0) { water = 2.0; }
    return vec4(col, water);
  }

  vec3 shadeGround(vec3 d, float t, vec2 p, float h) {
    vec3 L = normalize(uSun);
    vec4 g = groundAt(p, t);
    vec3 sun = vec3(1.0, 0.95, 0.86) * 2.5;
    vec3 ambient = vec3(0.32, 0.42, 0.6) * 0.55;
    vec3 col;
    if (g.w > 0.5) {
      // Water: wave normal, sky reflection, sun glint (sharper close up, broader far away).
      float k = 0.22 * (1.0 - smoothstep(80.0, 2500.0, t));
      vec3 q = vec3(p * 0.045 + vec2(uTime * 0.18, uTime * 0.07), uTime * 0.15);
      vec3 q2 = vec3(p * 0.21 + vec2(-uTime * 0.3, uTime * 0.22), uTime * 0.4);
      float n0 = vnoise(q) + 0.45 * vnoise(q2);
      float gx = vnoise(q + vec3(0.3, 0.0, 0.0)) + 0.45 * vnoise(q2 + vec3(0.3, 0.0, 0.0)) - n0;
      float gz = vnoise(q + vec3(0.0, 0.3, 0.0)) + 0.45 * vnoise(q2 + vec3(0.0, 0.3, 0.0)) - n0;
      vec3 n = normalize(vec3(gx * k * 5.0, 1.0, gz * k * 5.0));
      vec3 R = reflect(d, n);
      R.y = abs(R.y);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, -d), 0.0), 5.0);
      vec3 deep = g.w > 1.5 ? vec3(0.02, 0.05, 0.045) : vec3(0.01, 0.04, 0.07);
      vec3 refl = skyColour(R, 0.0);
      col = mix(deep * (ambient + sun * 0.12), refl, fres);
      float power = mix(900.0, 70.0, smoothstep(100.0, 6000.0, t));
      col += sun * pow(max(dot(R, L), 0.0), power) * power * 0.012;
    } else {
      col = g.rgb * (sun * max(L.y, 0.0) + ambient);
    }
    float dens = h < 1.0 ? 1.0 : (SCALE_H / h) * (1.0 - exp(-h / SCALE_H));
    float haze = 1.0 - exp(-t * dens / 9000.0);
    vec3 hazeCol = skyColour(normalize(vec3(d.x, 0.03, d.z)), 0.0) * 0.62;
    return mix(col, hazeCol, haze);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = max(uAlt, 0.5);
    // Curved ground: a sphere of radius uR whose top is at the pad. Written so it stays precise.
    float b = (h + uR) * d.y;
    float c = h * (2.0 * uR + h);
    float disc = b * b - c;
    float tg = -1.0;
    if (disc > 0.0 && b < 0.0) tg = c / (-b + sqrt(disc));
    vec3 col;
    if (tg > 0.0) {
      vec3 hit = d * tg;
      col = shadeGround(d, tg, uCam + hit.xz, h);
    } else {
      col = skyColour(d, h);
      vec3 L = normalize(uSun);
      float mu = dot(d, L);
      col += vec3(1.0, 0.96, 0.9) * smoothstep(0.99985, 0.99994, mu) * 28.0;
      float rho = exp(-h / SCALE_H);
      if (rho < 0.35) {
        vec3 cell = d * 1100.0;
        float s = hash3(floor(cell));
        float bright = hash3(floor(cell) + 7.1);
        float dotShape = 1.0 - smoothstep(0.15, 0.5, length(fract(cell) - 0.5));
        col += vec3(0.9, 0.93, 1.0) * step(0.9986, s) * dotShape * (0.5 + 1.6 * bright) * (1.0 - rho / 0.35);
      }
    }
    // Cloud deck.
    // The cloud deck is a shell that curves with the ground, so it ends at the horizon.
    float hc = h - ${CLOUD_BASE.toFixed(1)};
    float rc = uR + ${CLOUD_BASE.toFixed(1)};
    float bc = (hc + rc) * d.y;
    float cc = hc * (2.0 * rc + hc);
    float dc = bc * bc - cc;
    float tc = -1.0;
    if (hc > 0.0) { if (dc > 0.0 && bc < 0.0) tc = cc / (-bc + sqrt(dc)); }
    else tc = -bc + sqrt(max(dc, 0.0));
    if (tc > 0.0 && (tg < 0.0 || tc < tg)) {
      vec2 cp = uCam + (d * tc).xz;
      vec3 q = vec3(cp * 0.0021, uTime * 0.008);
      float n = fbm(q + fbm(q * 2.0, 3) * 0.6, uOct) + (vnoise(vec3(cp * 0.02, 4.0)) - 0.5) * 0.12;
      // Soften only where cloud cells shrink below a few pixels: far away and at grazing angles.
      float far = smoothstep(6000.0, 40000.0, tc / max(abs(d.y) * 2.0, 0.25));
      float soft = mix(0.07, 0.3, far);
      float cover = smoothstep(0.63 - soft, 0.63 + soft, n);
      cover = mix(cover, 0.22, far * far) * smoothstep(380.0, 900.0, length(cp));
      if (cover > 0.0) {
        vec3 L = normalize(uSun);
        float below = step(h, ${CLOUD_BASE.toFixed(1)});
        vec3 cloud = vec3(1.0) * (0.7 + 0.9 * L.y) * mix(1.25, 0.8, below * smoothstep(0.6, 0.85, n)) * 1.35;
        float dens = (SCALE_H / max(abs(h - ${CLOUD_BASE.toFixed(1)}), 1.0)) * abs(exp(-min(h, ${CLOUD_BASE.toFixed(1)}) / SCALE_H) - exp(-max(h, ${CLOUD_BASE.toFixed(1)}) / SCALE_H));
        float haze = 1.0 - exp(-tc * clamp(dens, 0.0, 1.0) / 9000.0);
        cloud = mix(cloud, skyColour(normalize(vec3(d.x, 0.03, d.z)), 0.0) * 0.62, haze);
        col = mix(col, cloud, cover * 0.93);
      }
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------- pad and site models ----------

const paint = new THREE.MeshStandardMaterial({ color: '#e8e6e1', roughness: 0.6, metalness: 0.1 });
const building = new THREE.MeshStandardMaterial({ color: '#c9c7c0', roughness: 0.85, metalness: 0.05 });
const darkGlass = new THREE.MeshStandardMaterial({ color: '#2b3138', roughness: 0.4, metalness: 0.3 });

function Tower({ position }: { position: [number, number, number] }) {
  const levels = useMemo(() => Array.from({ length: 14 }, (_, i) => 0.6 + i * 0.95), []);
  return (
    <group position={position}>
      {[[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 7, z]} material={towerMat}>
          <boxGeometry args={[0.1, 14, 0.1]} />
        </mesh>
      ))}
      {levels.map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh position={[0, 0, -0.36]} material={towerMat}><boxGeometry args={[0.78, 0.05, 0.05]} /></mesh>
          <mesh position={[0, 0, 0.36]} material={towerMat}><boxGeometry args={[0.78, 0.05, 0.05]} /></mesh>
          <mesh position={[-0.36, 0, 0]} material={towerMat}><boxGeometry args={[0.05, 0.05, 0.78]} /></mesh>
          <mesh position={[0.36, 0, 0]} material={towerMat}><boxGeometry args={[0.05, 0.05, 0.78]} /></mesh>
          <mesh position={[0, 0.47, -0.36]} rotation={[0, 0, Math.atan2(0.95, 0.72)]} material={towerMat}><boxGeometry args={[1.2, 0.035, 0.035]} /></mesh>
          <mesh position={[0, 0.47, 0.36]} rotation={[0, 0, -Math.atan2(0.95, 0.72)]} material={towerMat}><boxGeometry args={[1.2, 0.035, 0.035]} /></mesh>
        </group>
      ))}
      {/* Crew access arm reaching toward the upper stage. */}
      <mesh position={[-1.35, 9.3, 1.1]} rotation={[0, Math.PI / 4, 0]} material={towerGrey}>
        <boxGeometry args={[2.4, 0.22, 0.35]} />
      </mesh>
      <mesh position={[0, 14.4, 0]} material={towerGrey}><boxGeometry args={[0.2, 0.9, 0.2]} /></mesh>
    </group>
  );
}

function SiteModels() {
  return (
    <group>
      {/* Hardstand and flame trench. */}
      <mesh position={[0, 0.15, 0]} material={concrete} receiveShadow>
        <cylinderGeometry args={[6.5, 7.2, 0.3, 48]} />
      </mesh>
      <mesh position={[0, 0.31, 3.6]} material={trench}>
        <boxGeometry args={[2.2, 0.04, 4.6]} />
      </mesh>
      <Tower position={[2.9, 0.3, -2.6]} />
      {/* Lightning masts. */}
      {[[26, -14], [-24, -18], [2, 28]].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position={[0, 12, 0]} material={towerGrey}><cylinderGeometry args={[0.12, 0.32, 24, 8]} /></mesh>
          <mesh position={[0, 24.6, 0]} material={towerGrey}><cylinderGeometry args={[0.03, 0.03, 1.2, 4]} /></mesh>
        </group>
      ))}
      {/* Water tower and propellant spheres. */}
      <group position={[30, 0, -34]}>
        {[[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 6, z]} material={towerGrey}><cylinderGeometry args={[0.12, 0.12, 12, 6]} /></mesh>
        ))}
        <mesh position={[0, 13.6, 0]} material={paint}><cylinderGeometry args={[2.2, 2.2, 3.4, 24]} /></mesh>
      </group>
      {[[24, 16], [-26, -16]].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh position={[0, 3.6, 0]} material={paint}><sphereGeometry args={[3, 24, 16]} /></mesh>
          <mesh position={[0, 1, 0]} material={towerGrey}><cylinderGeometry args={[1.6, 2, 2, 12]} /></mesh>
        </group>
      ))}
      {/* Assembly building at the end of the crawlerway, and a few low support buildings. */}
      <mesh position={[-1450, 20, 0]} material={building}><boxGeometry args={[32, 40, 38]} /></mesh>
      <mesh position={[-1433.9, 18, 0]} material={darkGlass}><boxGeometry args={[0.3, 32, 9]} /></mesh>
      <mesh position={[-1480, 7, 40]} material={building}><boxGeometry args={[40, 14, 24]} /></mesh>
      {[[-420, 34, 16, 5, 10], [-610, -30, 22, 6, 14], [-260, 70, 12, 4, 8]].map(([x, z, w, hgt, dd]) => (
        <mesh key={`${x}${z}`} position={[x, hgt / 2, z]} material={building}><boxGeometry args={[w, hgt, dd]} /></mesh>
      ))}
    </group>
  );
}

// ---------- smoke: ground cloud and trail, in the site's frame ----------

function LaunchSmoke({ nozzle, down, throttle, altitude, small }: {
  nozzle: THREE.Vector3; down: THREE.Vector3; throttle: Signal; altitude: Signal; small: boolean;
}) {
  const max = small ? 700 : 1500;
  const state = useMemo(() => ({
    pos: new Float32Array(max * 3),
    vel: new Float32Array(max * 3),
    age: new Float32Array(max).fill(1),
    life: new Float32Array(max).fill(1),
    grow: new Float32Array(max),
    scale: new Float32Array(max),
    kind: new Uint8Array(max),
    next: 0,
    carry: 0,
    groundCarry: 0,
    last: new THREE.Vector3(),
    hasLast: false,
  }), [max]);
  const geometry = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(state.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aHeat', new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = max;
    return g;
  }, [state, max]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: smokeVertex,
    fragmentShader: smokeFragment,
    transparent: true,
    depthWrite: false,
    uniforms: { uLight: { value: 1.7 } },
  }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const k = throttle.current;
    const s = state;
    const alt = altitude.current;
    const spawn = (kind: number, px: number, py: number, pz: number, vx: number, vy: number, vz: number, life: number, grow: number, scale: number) => {
      const i = s.next;
      s.next = (s.next + 1) % max;
      s.pos[i * 3] = px; s.pos[i * 3 + 1] = py; s.pos[i * 3 + 2] = pz;
      s.vel[i * 3] = vx; s.vel[i * 3 + 1] = vy; s.vel[i * 3 + 2] = vz;
      s.age[i] = 0; s.life[i] = life; s.grow[i] = grow; s.scale[i] = scale; s.kind[i] = kind;
    };
    if (k < 0.02) {
      s.age.fill(1); s.hasLast = false; s.carry = 0;
    } else {
      // Exhaust deflected by the trench billows out across the pad.
      if (alt < 40) {
        s.groundCarry += (small ? 160 : 320) * k * delta * (1 - alt / 40);
        const count = Math.min(60, Math.floor(s.groundCarry));
        s.groundCarry -= count;
        for (let n = 0; n < count; n += 1) {
          const a = Math.random() * Math.PI * 2;
          const toTrench = Math.random() < 0.45;
          const speed = toTrench ? 12 + Math.random() * 16 : 4 + Math.random() * 9;
          const vx = toTrench ? (Math.random() - 0.5) * 6 : Math.cos(a) * speed;
          const vz = toTrench ? speed : Math.sin(a) * speed;
          spawn(0, (Math.random() - 0.5) * 2, 0.8, toTrench ? 4 : (Math.random() - 0.5) * 2,
            vx, 1.2 + Math.random() * 3.5, vz, 4.5 + Math.random() * 3.5, 2.4 + Math.random() * 1.8, 1);
        }
      }
      // Trail: spaced along the path; puffs get wider and fade higher up.
      if (s.hasLast && alt < 9000) {
        const step = 0.6 + alt * 0.012;
        const gap = s.last.distanceTo(nozzle) + s.carry;
        let n = Math.floor(gap / step);
        s.carry = gap - n * step;
        n = Math.min(n, 30);
        const spread = 0.3 + alt * 0.004;
        for (let j = 0; j < n; j += 1) {
          const t = (j + 1) / (n + 1);
          spawn(1,
            THREE.MathUtils.lerp(s.last.x, nozzle.x, t) + (Math.random() - 0.5) * spread,
            THREE.MathUtils.lerp(s.last.y, nozzle.y, t) + (Math.random() - 0.5) * spread,
            THREE.MathUtils.lerp(s.last.z, nozzle.z, t) + (Math.random() - 0.5) * spread,
            down.x * 1.5 + (Math.random() - 0.5) * 0.8, down.y * 1.5 + (Math.random() - 0.5) * 0.8, down.z * 1.5 + (Math.random() - 0.5) * 0.8,
            5 + Math.random() * 2.5, 1.2 + Math.random() * 0.6, (1 + alt * 0.011) * Math.exp(-alt / 4500));
        }
      }
      s.last.copy(nozzle);
      s.hasLast = true;
    }
    const sizeArr = (geometry.getAttribute('aSize') as THREE.BufferAttribute).array as Float32Array;
    const alphaArr = (geometry.getAttribute('aAlpha') as THREE.BufferAttribute).array as Float32Array;
    const heatArr = (geometry.getAttribute('aHeat') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < max; i += 1) {
      if (s.age[i] >= 1) { alphaArr[i] = 0; continue; }
      s.age[i] = Math.min(1, s.age[i] + delta / s.life[i]);
      const drag = Math.exp(-delta * (s.kind[i] === 0 ? 0.9 : 0.5));
      s.vel[i * 3] *= drag; s.vel[i * 3 + 1] *= drag; s.vel[i * 3 + 2] *= drag;
      if (s.kind[i] === 0) s.vel[i * 3 + 1] += delta * 0.6; // warm cloud rises slowly
      s.pos[i * 3] += s.vel[i * 3] * delta;
      s.pos[i * 3 + 1] = Math.max(0.6, s.pos[i * 3 + 1] + s.vel[i * 3 + 1] * delta);
      s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * delta;
      const a = s.age[i];
      const base = s.kind[i] === 0 ? 3.2 : 1.4 * s.scale[i];
      sizeArr[i] = base * (0.8 + a * s.grow[i] * 2.4);
      const fade = s.kind[i] === 0 ? 0.55 : 0.42 * Math.min(1, s.scale[i] * 3);
      alphaArr[i] = fade * Math.min(1, a * 7) * (1 - a) * (1 - a * 0.3);
      heatArr[i] = Math.max(0, 1 - a * 10) * (s.kind[i] === 0 ? 0.9 : 0.6);
    }
    (geometry.getAttribute('aOffset') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('aHeat') as THREE.BufferAttribute).needsUpdate = true;
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}

// ---------- the launch ----------

const CAM_GROUND = new THREE.Vector3(-58, 3.2, 66);
const LAUNCH_FOV = 26;

export function LaunchSite({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const root = useRef<THREE.Group>(null);
  const site = useRef<THREE.Group>(null);
  const rocket = useRef<THREE.Group>(null);
  const plume = useRef<THREE.Group>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const dome = useRef<THREE.Mesh>(null);
  const gl = useThree((state) => state.gl);
  const small = useMemo(() => gl.capabilities.maxTextureSize < 2048 || window.matchMedia('(max-width: 800px), (max-height: 500px)').matches, [gl]);
  const hull = useMemo(() => createHullTexture(), []);
  const throttle = useMemo<Signal>(() => ({ current: 0 }), []);
  const altitude = useMemo<Signal>(() => ({ current: 0 }), []);
  const clipY = useMemo<Signal>(() => ({ current: -1e9 }), []);
  const spread = useMemo<Signal>(() => ({ current: 1 }), []);
  const nozzle = useMemo(() => new THREE.Vector3(), []);
  const down = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const shot = useRef('');
  const fovSet = useRef(false);
  const worldMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: worldVertex,
    fragmentShader: worldFragment,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uAlt: { value: 3 },
      uCam: { value: new THREE.Vector2() },
      uSun: { value: SUN_DIRECTION.clone() },
      uTime: { value: 0 },
      uR: { value: PLANET_R },
      uOct: { value: small ? 4 : 5 },
    },
  }), [small]);
  useEffect(() => () => { worldMaterial.dispose(); hull?.dispose(); }, [worldMaterial, hull]);

  useFrame(({ camera, clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const cam = camera as THREE.PerspectiveCamera;
    const on = active && approachLive.segment === 'earth';
    if (root.current) root.current.visible = on;
    if (!on) {
      throttle.current = 0;
      if (fovSet.current) { cam.fov = 42; cam.updateProjectionMatrix(); fovSet.current = false; }
      shot.current = '';
      return;
    }
    const s = Math.min(1, approachLive.launchProgress) * STORY_SECONDS;
    const pose = launchProfile(s);
    altitude.current = pose.alt;
    throttle.current = reducedMotion ? Math.min(pose.throttle, 0.6) : pose.throttle;

    // The rocket stays near the origin; the ground moves away under it.
    site.current?.position.set(-pose.downrange, -pose.alt, 0);
    site.current?.updateMatrixWorld();
    if (rocket.current) {
      rocket.current.position.set(0, ROCKET_Y, 0);
      rocket.current.rotation.set(0, 0, -pose.pitch);
      rocket.current.updateMatrixWorld();
    }
    // Exhaust widens as the air thins.
    spread.current = 1 + Math.min(2.5, pose.alt / 2500);
    plume.current?.scale.set(1, 1 + Math.min(1.5, pose.alt / 5000), 1);
    clipY.current = 0.31 - pose.alt;

    // Smoke works in the site's frame: where the nozzle is relative to the ground.
    if (rocket.current && site.current) {
      nozzle.set(0, -0.6, 0);
      rocket.current.localToWorld(nozzle);
      site.current.worldToLocal(nozzle);
      down.set(-Math.sin(pose.pitch), -Math.cos(pose.pitch), 0);
    }

    // Camera: a long lens from the ground, then a chase camera beside the climbing rocket.
    const chase = s >= 3.0;
    const name = chase ? 'chase' : 'ground';
    const cut = shot.current !== name;
    shot.current = name;
    const fov = chase ? 42 : LAUNCH_FOV;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    fovSet.current = true;
    if (!chase) {
      tmp.set(CAM_GROUND.x - pose.downrange, CAM_GROUND.y - pose.alt, CAM_GROUND.z);
      if (!reducedMotion && pose.throttle > 0.5 && pose.alt < 250) {
        const shake = 0.06 * (1 - pose.alt / 250);
        tmp.x += Math.sin(s * 47) * shake;
        tmp.y += Math.sin(s * 31) * shake;
      }
      cam.position.copy(tmp);
      look.set(0, ROCKET_Y + 5.5, 0);
      cam.lookAt(look);
    } else {
      const k = 1 + pose.alt / 2600;
      tmp.set(-24 * k, 6 * k, 9 * k);
      look.set(3 * k, -2.2 * k + 2.5, 0);
      if (cut) cam.position.copy(tmp);
      else cam.position.lerp(tmp, 1 - Math.exp(-delta * 3));
      cam.lookAt(look);
    }

    // The sky dome follows the camera; the shader knows the camera's height and map position.
    if (dome.current) dome.current.position.copy(cam.position);
    const camAlt = cam.position.y + pose.alt;
    worldMaterial.uniforms.uAlt.value = camAlt;
    (worldMaterial.uniforms.uCam.value as THREE.Vector2).set(cam.position.x + pose.downrange, cam.position.z);
    worldMaterial.uniforms.uTime.value = clock.getElapsedTime();
    // Sky light on the models fades as the air thins.
    if (hemi.current) hemi.current.intensity = 1.1 * Math.exp(-camAlt / 1500) + 0.08;
  });

  return (
    <group ref={root} visible={false}>
      <mesh ref={dome} material={worldMaterial} frustumCulled={false} renderOrder={-100}>
        <sphereGeometry args={[50, 48, 24]} />
      </mesh>
      <hemisphereLight ref={hemi} args={['#a9c6ff', '#3d4a2c', 1.1]} />
      <group ref={site}>
        <SiteModels />
        <LaunchSmoke nozzle={nozzle} down={down} throttle={throttle} altitude={altitude} small={small} />
      </group>
      <group ref={rocket}>
        <RocketBody hull={hull} />
        <group ref={plume}>
          <Flames throttle={throttle} hot={!small} clipY={clipY} spread={spread} />
        </group>
      </group>
    </group>
  );
}
