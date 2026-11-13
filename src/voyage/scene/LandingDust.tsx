import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Signal } from './Vehicles';

const COUNT = 900;

function softSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Plume–surface interaction: exhaust hits the ground and throws regolith outward.
// `strength` is 0–1 (engine throttle × proximity to the ground). Particles keep
// flying and settle after engine cutoff, so the cloud clears gradually.
export function LandingDust({ origin, groundY, strength, active }: { origin: THREE.Vector3; groundY: number; strength: Signal; active: boolean }) {
  const points = useRef<THREE.Points>(null);
  const sprite = useMemo(softSprite, []);
  const state = useMemo(() => ({
    position: new Float32Array(COUNT * 3), velocity: new Float32Array(COUNT * 3), color: new Float32Array(COUNT * 4),
    life: new Float32Array(COUNT), maxLife: new Float32Array(COUNT), cursor: 0,
  }), []);
  const geometry = useMemo(() => {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.BufferAttribute(state.position, 3));
    result.setAttribute('color', new THREE.BufferAttribute(state.color, 4));
    return result;
  }, [state]);
  const base = useMemo(() => new THREE.Color('#b78f73'), []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const k = active ? strength.current : 0;
    const spawn = Math.floor(k * 520 * delta + (Math.random() < (k * 520 * delta) % 1 ? 1 : 0));
    for (let n = 0; n < spawn; n += 1) {
      const i = state.cursor;
      state.cursor = (state.cursor + 1) % COUNT;
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 2.4;
      const speed = (4 + Math.random() * 9) * (0.4 + k);
      state.position[i * 3] = origin.x + Math.cos(a) * r;
      state.position[i * 3 + 1] = groundY + 0.15 + Math.random() * 0.4;
      state.position[i * 3 + 2] = origin.z + Math.sin(a) * r;
      state.velocity[i * 3] = Math.cos(a) * speed;
      state.velocity[i * 3 + 1] = 0.6 + Math.random() * 2.4 * k;
      state.velocity[i * 3 + 2] = Math.sin(a) * speed;
      state.maxLife[i] = 2.5 + Math.random() * 3.5;
      state.life[i] = state.maxLife[i];
    }
    const drag = Math.exp(-1.15 * delta);
    for (let i = 0; i < COUNT; i += 1) {
      if (state.life[i] <= 0) { state.color[i * 4 + 3] = 0; continue; }
      state.life[i] -= delta;
      state.velocity[i * 3] *= drag;
      state.velocity[i * 3 + 1] = state.velocity[i * 3 + 1] * drag - 0.55 * delta; // low gravity, fine dust lingers
      state.velocity[i * 3 + 2] *= drag;
      state.position[i * 3] += state.velocity[i * 3] * delta;
      state.position[i * 3 + 1] = Math.max(groundY + 0.05, state.position[i * 3 + 1] + state.velocity[i * 3 + 1] * delta);
      state.position[i * 3 + 2] += state.velocity[i * 3 + 2] * delta;
      const f = state.life[i] / state.maxLife[i];
      const shade = 0.85 + (i % 7) * 0.03;
      state.color[i * 4] = base.r * shade;
      state.color[i * 4 + 1] = base.g * shade;
      state.color[i * 4 + 2] = base.b * shade;
      state.color[i * 4 + 3] = Math.min(1, f * 1.6) * 0.42;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;

  });

  return (
    <group>
      <points ref={points} geometry={geometry} frustumCulled={false}>
        <pointsMaterial map={sprite} vertexColors size={1.5} sizeAttenuation transparent depthWrite={false} alphaTest={0.002} />
      </points>
      {/* The same particles drawn large and faint read as a billowing cloud. */}
      <points geometry={geometry} frustumCulled={false}>
        <pointsMaterial map={sprite} vertexColors size={7.5} sizeAttenuation transparent opacity={0.32} depthWrite={false} alphaTest={0.002} />
      </points>
    </group>
  );
}
