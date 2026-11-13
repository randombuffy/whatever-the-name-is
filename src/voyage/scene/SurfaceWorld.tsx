import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Signal } from './Vehicles';
import { buildTerrainGeometry, createDetailTextures, createRockGeometry, type Terrain } from './terrain';
import { HAB_PADS, LANDING_SPOTS, RESOURCE_TARGET, RIDGE, type HabitatPad } from '../mission/settlement';
import type { Translator } from '../i18n';

export const SUN_DIRECTION = new THREE.Vector3(0.62, 0.52, 0.36).normalize();

export function TerrainMeshes({ terrain }: { terrain: Terrain }) {
  const textures = useMemo(createDetailTextures, []);
  const near = useMemo(() => buildTerrainGeometry(terrain, 336, 256, false), [terrain]);
  // 9 km wide, so the thinner haze during descent can still hide its edge (Mars' air is clear on a calm day).
  const far = useMemo(() => buildTerrainGeometry(terrain, 9000, 340, true), [terrain]);
  const nearMaterial = useMemo(() => {
    const map = textures.colorMap.clone();
    map.repeat.set(44, 44);
    map.needsUpdate = true;
    const normalMap = textures.normalMap.clone();
    normalMap.repeat.set(44, 44);
    normalMap.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.97, metalness: 0 });
  }, [textures]);
  const farMaterial = useMemo(() => {
    const map = textures.colorMap.clone();
    map.repeat.set(380, 380); // same grain size as before on the larger far ring
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 1, metalness: 0 });
  }, [textures]);
  useEffect(() => () => { near.dispose(); far.dispose(); }, [near, far]);
  return (
    <group>
      <mesh geometry={near} material={nearMaterial} receiveShadow />
      <mesh geometry={far} material={farMaterial} receiveShadow={false} />
    </group>
  );
}

interface RockInstance { x: number; y: number; z: number; s: number; sy: number; ry: number; rx: number; shade: number }

function scatterRocks(terrain: Terrain): RockInstance[][] {
  const { rockDensity, seed } = terrain.site.terrain;
  let s = seed * 7919 + 17;
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const variants: RockInstance[][] = [[], [], [], [], []];
  const keepClear = (x: number, z: number, scale: number) => {
    const zones: [number, number, number][] = [
      [...LANDING_SPOTS.divert, 5.5], [...HAB_PADS.plain, 11], [...HAB_PADS.outcrop, 10.5], [23, 1.5, 9.5],
      [...RESOURCE_TARGET, 3.5], [-34, -28, 4], [-8, -6, 4],
    ];
    return zones.some(([zx, zz, r]) => Math.hypot(x - zx, z - zz) < r + scale);
  };
  const place = (x: number, z: number, scale: number, flat = 0.75) => {
    if (keepClear(x, z, scale)) return;
    // The chosen construction area is a smooth patch: only small stones inside it.
    if (scale > 0.45 && Math.hypot(x - 3, z + 3) < 24 && x > RIDGE.x + 4) return;
    const slope = terrain.slope(x, z);
    variants[Math.floor(rand() * variants.length)].push({
      x, z, y: terrain.height(x, z) - scale * (0.18 + slope * 0.2), s: scale, sy: scale * (flat + rand() * 0.45),
      ry: rand() * Math.PI * 2, rx: (rand() - 0.5) * 0.4, shade: 0.72 + rand() * 0.38,
    });
  };
  // Pebbles and cobbles: dense near the camera, power-law sizes.
  for (let i = 0; i < 1500 * rockDensity; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 4 + Math.sqrt(rand()) * 85;
    place(Math.cos(a) * r, Math.sin(a) * r, 0.06 + Math.pow(rand(), 3) * 0.32, 0.55);
  }
  // Rocks and boulders, clustered around crater rims.
  for (const crater of terrain.craters) {
    if (Math.hypot(crater.x, crater.z) > 260) continue;
    const count = Math.round(crater.r * 2.2 * rockDensity);
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = crater.r * (0.9 + rand() * 0.9);
      place(crater.x + Math.cos(a) * r, crater.z + Math.sin(a) * r, 0.2 + Math.pow(rand(), 2) * crater.r * 0.09);
    }
  }
  for (let i = 0; i < 260 * rockDensity; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 14 + rand() * 150;
    place(Math.cos(a) * r, Math.sin(a) * r, 0.25 + Math.pow(rand(), 3.2) * 1.6);
  }
  // Ridge outcrop blocks.
  for (let i = 0; i < 46; i += 1) {
    const z = RIDGE.z0 + rand() * (RIDGE.z1 - RIDGE.z0);
    const x = RIDGE.x + (rand() - 0.5) * 6;
    place(x, z, 0.5 + Math.pow(rand(), 1.5) * 1.8, 0.9);
  }
  // Boulder field near the resource target: the hazard a "direct" landing accepts.
  const hazardRocks = 10 + terrain.site.hazard * 9;
  for (let i = 0; i < hazardRocks; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 2.6 + rand() * 9;
    const [hx, hz] = LANDING_SPOTS.direct;
    const scale = 0.3 + Math.pow(rand(), 2) * 1.1;
    const x = hx + Math.cos(a) * r;
    const z = hz + Math.sin(a) * r;
    if (Math.hypot(x - RESOURCE_TARGET[0], z - RESOURCE_TARGET[1]) < 3) continue;
    variants[i % variants.length].push({ x, z, y: terrain.height(x, z) - scale * 0.2, s: scale, sy: scale * (0.7 + rand() * 0.4), ry: rand() * 6.28, rx: (rand() - 0.5) * 0.3, shade: 0.7 + rand() * 0.3 });
  }
  return variants;
}

export function RockField({ terrain }: { terrain: Terrain }) {
  const geometries = useMemo(() => [3, 7, 11, 19, 23].map((seed, i) => createRockGeometry(seed, i < 2 ? 2 : 1)), []);
  const instances = useMemo(() => scatterRocks(terrain), [terrain]);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a6e5c', roughness: 0.94, metalness: 0 }), []);
  useEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const color = new THREE.Color();
    const base = new THREE.Color('#7c6352');
    const dark = new THREE.Color('#4d3d34');
    instances.forEach((list, variant) => {
      const mesh = refs.current[variant];
      if (!mesh) return;
      list.forEach((rock, i) => {
        euler.set(rock.rx, rock.ry, rock.rx * 0.6);
        quaternion.setFromEuler(euler);
        matrix.compose(new THREE.Vector3(rock.x, rock.y, rock.z), quaternion, new THREE.Vector3(rock.s, rock.sy, rock.s * (0.8 + (i % 5) * 0.08)));
        mesh.setMatrixAt(i, matrix);
        color.copy(dark).lerp(base, rock.shade - 0.45).multiplyScalar(rock.shade + 0.25);
        mesh.setColorAt(i, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [instances]);
  return (
    <group>
      {instances.map((list, variant) => (
        <instancedMesh key={variant + '-' + list.length} ref={(node) => { refs.current[variant] = node; }} args={[geometries[variant], material, Math.max(1, list.length)]} castShadow receiveShadow count={list.length} />
      ))}
    </group>
  );
}

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 pos = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
    gl_Position = pos.xyww;
  }
`;
const skyFragment = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uGround;
  uniform vec3 uSun;
  uniform float uSpace;
  uniform float uStorm;
  uniform float uFlare;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.62, h));
    col = mix(uGround, col, smoothstep(-0.12, 0.0, h));
    float sunAmount = max(dot(dir, normalize(uSun)), 0.0);
    // Forward-scattering by dust brightens the sky around the Sun; the small bluish
    // halo is the effect seen in rover images near the Sun.
    col += vec3(0.32, 0.26, 0.2) * pow(sunAmount, 6.0) * (1.0 - uStorm * 0.6);
    col += vec3(0.55, 0.62, 0.7) * pow(sunAmount, 90.0) * 0.55 * (1.0 - uStorm);
    col += vec3(1.0, 0.97, 0.9) * smoothstep(0.9993, 0.9997, sunAmount) * (1.0 - uStorm * 0.85);
    col = mix(col, vec3(0.95, 0.78, 0.55), uFlare * 0.22 * smoothstep(-0.02, 0.45, h));
    col = mix(col, vec3(0.0), uSpace);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export const SKY = {
  horizon: new THREE.Color('#c9a68b'), zenith: new THREE.Color('#8a6a58'), ground: new THREE.Color('#9c7a64'),
  stormHorizon: new THREE.Color('#a8806a'), stormZenith: new THREE.Color('#7a5848'),
};

export function MarsSky({ storm, space, flare }: { storm: number; space: Signal; flare: number }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uHorizon: { value: SKY.horizon.clone() }, uZenith: { value: SKY.zenith.clone() }, uGround: { value: SKY.ground.clone() },
      uSun: { value: SUN_DIRECTION.clone() }, uSpace: { value: 0 }, uStorm: { value: 0 }, uFlare: { value: 0 },
    },
  }), []);
  const stormAmount = useRef(0);
  const flareAmount = useRef(0);
  const flareTint = useMemo(() => new THREE.Color('#f0d2a4'), []);
  useFrame(({ camera }, delta) => {
    stormAmount.current = THREE.MathUtils.damp(stormAmount.current, storm, 0.6, delta);
    flareAmount.current = THREE.MathUtils.damp(flareAmount.current, flare, 0.8, delta);
    material.uniforms.uStorm.value = stormAmount.current;
    material.uniforms.uFlare.value = flareAmount.current;
    material.uniforms.uSpace.value = space.current;
    material.uniforms.uHorizon.value.copy(SKY.horizon).lerp(SKY.stormHorizon, stormAmount.current).lerp(flareTint, flareAmount.current * 0.35);
    material.uniforms.uZenith.value.copy(SKY.zenith).lerp(SKY.stormZenith, stormAmount.current).lerp(flareTint, flareAmount.current * 0.2);
    meshRef.current?.position.copy(camera.position);
  });
  const meshRef = useRef<THREE.Mesh>(null);
  return (
    <mesh ref={meshRef} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[100, 32, 16]} />
    </mesh>
  );
}

// Exponential haze. Density is driven by the landing stage (altitude) and storm state.
export function Haze({ density, storm }: { density: Signal; storm: number }) {
  const { scene } = useThree();
  const stormRef = useRef(storm);
  const clear = useMemo(() => new THREE.Color('#b8957c'), []);
  const dusty = useMemo(() => new THREE.Color('#9f7660'), []);
  useEffect(() => {
    scene.fog = new THREE.FogExp2(clear.getHex(), density.current);
    return () => { scene.fog = null; };
  }, [scene, clear, density]);
  useFrame((_, delta) => {
    stormRef.current = THREE.MathUtils.damp(stormRef.current, storm, 0.55, delta);
    const fog = scene.fog;
    if (fog instanceof THREE.FogExp2) {
      fog.density = density.current + stormRef.current * 0.0095;
      fog.color.copy(clear).lerp(dusty, stormRef.current);
    }
  });
  return null;
}

export function SunLight({ storm, shadows }: { storm: number; shadows: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const stormRef = useRef(storm);
  useFrame((_, delta) => {
    stormRef.current = THREE.MathUtils.damp(stormRef.current, storm, 0.55, delta);
    if (light.current) light.current.intensity = 2.7 - stormRef.current * 1.75;
  });
  return (
    <>
      <hemisphereLight args={['#cfb39b', '#4f3a2e', 0.5]} />
      <ambientLight intensity={0.12} color="#f0d5bd" />
      <directionalLight
        ref={light}
        position={SUN_DIRECTION.clone().multiplyScalar(70).toArray()}
        intensity={2.7}
        color="#fff0dd"
        castShadow={shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={180}
        shadow-camera-left={-48}
        shadow-camera-right={48}
        shadow-camera-top={48}
        shadow-camera-bottom={-48}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  );
}

export function ResourceMarker({ terrain, visible, tr }: { terrain: Terrain; visible: boolean; tr: Translator }) {
  const [x, z] = RESOURCE_TARGET;
  const y = terrain.height(x, z);
  if (!visible) return null;
  return (
    <group position={[x, y + 0.05, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.1, 2.3, 48]} />
        <meshBasicMaterial color="#e8c48f" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <Html position={[0, 1.2, 0]} center distanceFactor={22} style={{ pointerEvents: 'none' }}>
        <div className="scene-label scene-label-target u"><span className="scene-label-dot" />{tr.t('scene.resourceTarget')}</div>
      </Html>
    </group>
  );
}

export function HabitatPads({ terrain, onSelect, chosen, tr }: { terrain: Terrain; onSelect: (pad: HabitatPad) => void; chosen: HabitatPad | null; tr: Translator }) {
  const ring = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ring.current) ring.current.children.forEach((child, i) => { child.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 2 + i) * 0.03); });
  });
  return (
    <group ref={ring}>
      {(Object.keys(HAB_PADS) as HabitatPad[]).map((pad) => {
        const [x, z] = HAB_PADS[pad];
        return (
          <group key={pad} position={[x, terrain.height(x, z) + 0.06, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={(event) => { event.stopPropagation(); onSelect(pad); }}
              onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
              <circleGeometry args={[4.4, 48]} />
              <meshBasicMaterial color={chosen === pad ? '#f3c48c' : '#e9dccb'} transparent opacity={chosen === pad ? 0.3 : 0.12} depthWrite={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[4.3, 4.5, 64]} />
              <meshBasicMaterial color={chosen === pad ? '#ffcf96' : '#efe2d2'} transparent opacity={0.85} depthWrite={false} />
            </mesh>
            <Html position={[0, 1.4, 0]} center distanceFactor={22}>
              <button className={'pad-label u' + (chosen === pad ? ' is-chosen' : '')} onClick={() => onSelect(pad)}>
                {pad === 'plain' ? tr.t('habitat.padPlain') : tr.t('habitat.padOutcrop')}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
