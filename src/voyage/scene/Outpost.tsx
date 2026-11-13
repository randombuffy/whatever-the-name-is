import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Terrain } from './terrain';
import type { ModuleKind, OutpostModule } from '../mission/settlement';
import type { Translator } from '../i18n';
import { moduleName } from '../i18n/format';

export interface ModuleVisualState {
  powered: boolean;
  storm: boolean;
  panelDust: number;
  charge: number;
  warning: boolean;
  shelter: boolean;
  cleaning: boolean;
  anchor: [number, number];
}

function SolarModel({ powered, storm, panelDust }: { powered: boolean; storm: boolean; panelDust: number }) {
  const panels = useRef<THREE.Group>(null);
  const cell = useMemo(() => new THREE.MeshStandardMaterial({ color: '#173a55', metalness: 0.6, roughness: 0.32, emissive: '#0f2c40', emissiveIntensity: 0.3 }), []);
  const clean = useMemo(() => new THREE.Color('#173a55'), []);
  const dusty = useMemo(() => new THREE.Color('#7a5c48'), []);
  useFrame(({ clock }, delta) => {
    if (panels.current) {
      const target = powered ? Math.sin(clock.getElapsedTime() * 0.05) * 0.08 : -0.12;
      panels.current.rotation.y = THREE.MathUtils.damp(panels.current.rotation.y, target, 1.1, delta);
    }
    cell.color.copy(clean).lerp(dusty, Math.min(1, (1 - panelDust) * 1.8));
    cell.emissiveIntensity = THREE.MathUtils.damp(cell.emissiveIntensity, powered && !storm ? 0.3 : 0.04, 1.5, delta);
  });
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.18, 1.0, 12]} />
        <meshStandardMaterial color="#aeb3b3" metalness={0.6} roughness={0.4} />
      </mesh>
      <group ref={panels} position={[0, 1.02, 0]}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 1.0, 0, 0]} rotation={[0.42, 0, 0]}>
            <mesh castShadow material={cell}>
              <boxGeometry args={[1.9, 0.05, 2.4]} />
            </mesh>
            {[0, 1, 2, 3, 4, 5, 6].map((line) => (
              <mesh key={line} position={[-0.81 + line * 0.27, 0.03, 0]}>
                <boxGeometry args={[0.014, 0.008, 2.38]} />
                <meshStandardMaterial color="#9ab3bd" metalness={0.5} roughness={0.4} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}

function HabitatModel({ lit, level, shelter }: { lit: boolean; level: number; shelter: boolean }) {
  const scale = 1.3 + Math.max(0, level - 1) * 0.08;
  const windowMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#263d4a', metalness: 0.5, roughness: 0.3, emissive: '#ffd9a8', emissiveIntensity: 0 }), []);
  const light = useRef<THREE.PointLight>(null);
  useFrame((_, delta) => {
    windowMaterial.emissiveIntensity = THREE.MathUtils.damp(windowMaterial.emissiveIntensity, lit ? (shelter ? 1.45 : 0.9) : 0, 3, delta);
    if (light.current) light.current.intensity = THREE.MathUtils.damp(light.current.intensity, lit ? (shelter ? 2.1 : 1.2) : 0, 3, delta);
  });
  return (
    <group scale={scale}>
      <mesh position={[0, 1.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <capsuleGeometry args={[1.0, 2.5, 8, 24]} />
        <meshStandardMaterial color="#dcd9d0" metalness={0.15} roughness={0.75} />
      </mesh>
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} position={[x * 0.62, 1.15, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[1.01, 0.035, 8, 32]} />
          <meshStandardMaterial color="#a39f96" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {[-0.8, 0, 0.8].map((x) => (
        <mesh key={x} position={[x, 1.28, 0.93]} material={windowMaterial}>
          <boxGeometry args={[0.36, 0.22, 0.06]} />
        </mesh>
      ))}
      <mesh position={[2.35, 0.95, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.5, 20]} />
        <meshStandardMaterial color="#c9c5bb" metalness={0.25} roughness={0.6} />
      </mesh>
      {[-1.3, 1.3].map((x) => [-0.6, 0.6].map((z) => (
        <mesh key={x + ':' + z} position={[x, 0.22, z]} castShadow>
          <cylinderGeometry args={[0.07, 0.1, 0.45, 8]} />
          <meshStandardMaterial color="#8d8a83" metalness={0.5} roughness={0.5} />
        </mesh>
      )))}
      <mesh position={[1.2, 2.45, -0.4]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 0.9, 6]} />
        <meshStandardMaterial color="#79756d" metalness={0.4} />
      </mesh>
      <mesh position={[1.2, 2.95, -0.4]} rotation={[0.5, 0, -0.6]}>
        <cylinderGeometry args={[0.04, 0.22, 0.12, 16, 1, true]} />
        <meshStandardMaterial color="#b5afa4" metalness={0.4} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 2.18, 0.3]}>
        <boxGeometry args={[0.2, 0.08, 0.1]} />
        <meshBasicMaterial color={lit ? '#7ee3a4' : '#5c2a24'} />
      </mesh>
      <pointLight ref={light} position={[0, 1.2, 1.5]} color="#ffd8a8" intensity={1.2} distance={5} />
    </group>
  );
}

function GreenhouseModel({ powered, compact }: { powered: boolean; compact: boolean }) {
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f0b6d8', transparent: true, opacity: 0, depthWrite: false }), []);
  const light = useRef<THREE.PointLight>(null);
  useFrame((_, delta) => {
    glow.opacity = THREE.MathUtils.damp(glow.opacity, powered ? 0.16 : 0, 3, delta);
    if (light.current) light.current.intensity = THREE.MathUtils.damp(light.current.intensity, powered ? 1.6 : 0, 3, delta);
  });
  return (
    <group scale={compact ? 0.72 : 1}>
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.55, 1.2, 36]} />
        <meshPhysicalMaterial color="#c9dcd6" roughness={0.18} metalness={0.05} transparent opacity={0.32} />
      </mesh>
      <mesh position={[0, 1.22, 0]} castShadow>
        <sphereGeometry args={[1.5, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#d6e8e2" roughness={0.16} transparent opacity={0.26} side={THREE.DoubleSide} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[0, 1.22, 0]} rotation={[0, (i * Math.PI) / 6, 0]}>
          <torusGeometry args={[1.5, 0.02, 6, 36, Math.PI]} />
          <meshStandardMaterial color="#9a978f" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {[[-0.6, 0], [0, 0.1], [0.6, 0], [-0.35, 0.65], [0.35, -0.6]].map(([x, z], i) => (
        <group key={i} position={[x, 0.32, z]}>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[0.36, 0.14, 0.72]} />
            <meshStandardMaterial color="#5a4433" roughness={1} />
          </mesh>
          {[0, 1, 2].map((leaf) => (
            <mesh key={leaf} position={[0, 0.27 + (leaf % 2) * 0.06, -0.22 + leaf * 0.22]} castShadow>
              <sphereGeometry args={[0.15, 8, 6]} />
              <meshStandardMaterial color={powered ? (leaf % 2 ? '#5f9a5f' : '#86a85c') : '#5b5a3c'} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 1.0, 0]} material={glow}>
        <sphereGeometry args={[1.35, 20, 12]} />
      </mesh>
      <pointLight ref={light} position={[0, 1.7, 0]} color="#f2b9da" intensity={0} distance={5.5} />
    </group>
  );
}

function WaterModel({ powered }: { powered: boolean }) {
  const fluid = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4ca8b0', emissive: '#1d6670', emissiveIntensity: 0, roughness: 0.3 }), []);
  const rotor = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    fluid.emissiveIntensity = THREE.MathUtils.damp(fluid.emissiveIntensity, powered ? 0.65 : 0, 3, delta);
    fluid.color.set(powered ? '#4ca8b0' : '#4c4642');
    if (rotor.current && powered) rotor.current.rotation.y += delta * 2.4;
  });
  return (
    <group>
      {[-0.55, 0.55].map((x, i) => (
        <group key={i} position={[x, 0, i === 0 ? 0 : -0.2]}>
          <mesh position={[0, 0.72, 0]} castShadow>
            <cylinderGeometry args={[0.47, 0.47, 1.3, 24]} />
            <meshStandardMaterial color="#c3c3ba" metalness={0.42} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.5, 0.42]} material={fluid}>
            <boxGeometry args={[0.12, 0.6, 0.06]} />
          </mesh>
          <mesh position={[0, 1.42, 0]} castShadow>
            <sphereGeometry args={[0.47, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c3c3ba" metalness={0.42} roughness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.43, 0.15]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.48, 0.07, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#8fa09d" metalness={0.52} roughness={0.43} />
      </mesh>
      <mesh ref={rotor} position={[0, 1.95, -0.1]}>
        <boxGeometry args={[0.5, 0.03, 0.06]} />
        <meshStandardMaterial color="#8fa09d" metalness={0.5} />
      </mesh>
    </group>
  );
}

function LifeSupportModel({ powered, warning }: { powered: boolean; warning: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.58, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.65, 1.1, 1.18]} />
        <meshStandardMaterial color="#b9b8b0" metalness={0.34} roughness={0.62} />
      </mesh>
      <mesh position={[0.83, 0.58, 0]} castShadow>
        <boxGeometry args={[0.15, 0.8, 0.92]} />
        <meshStandardMaterial color="#4d6870" metalness={0.42} roughness={0.43} />
      </mesh>
      {[-0.36, 0, 0.36].map((x) => (
        <mesh key={x} position={[x, 0.7, 0.6]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color={!powered || warning ? '#ff625a' : '#71e6b0'} />
        </mesh>
      ))}
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 1.31, -0.05]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.35, 16]} />
          <meshStandardMaterial color="#d2d0c6" metalness={0.32} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function BatteryModel({ charge }: { charge: number }) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <group key={i} position={[(i - 1) * 0.57, 0, 0]}>
          <mesh position={[0, 0.43, 0]} castShadow>
            <boxGeometry args={[0.49, 0.83, 0.76]} />
            <meshStandardMaterial color="#8d9aa0" metalness={0.52} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.2 + Math.max(0.02, charge) * 0.24, 0.39]}>
            <boxGeometry args={[0.3, Math.max(0.04, charge * 0.48), 0.025]} />
            <meshBasicMaterial color={charge < 0.25 ? '#e8826b' : '#86d9df'} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Regolith berm: packed soil and filled bags hugging the habitat, open at the airlock (+x).
function BermModel() {
  const segments = useMemo(() => {
    const list: { x: number; z: number; rot: number }[] = [];
    const a = 4.9;
    const b = 3.3;
    for (let i = 0; i < 18; i += 1) {
      const t = THREE.MathUtils.degToRad(32 + (i / 17) * 296);
      const x = Math.cos(t) * a;
      const z = Math.sin(t) * b;
      list.push({ x, z, rot: -Math.atan2(b * Math.cos(t), -a * Math.sin(t)) });
    }
    return list;
  }, []);
  return (
    <group>
      {segments.map((segment, i) => (
        <group key={i} position={[segment.x, 0, segment.z]} rotation={[0, segment.rot, 0]}>
          <mesh position={[0, 0.25, 0]} scale={[1.25, 0.85, 0.8]} castShadow receiveShadow>
            <sphereGeometry args={[1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#8d6b53" roughness={1} />
          </mesh>
          <mesh position={[0, 0.98, 0]} castShadow>
            <boxGeometry args={[1.1, 0.24, 0.55]} />
            <meshStandardMaterial color={i % 2 ? '#a08066' : '#97775e'} roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function RoverModel({ active }: { active: boolean }) {
  const wheels = useRef<THREE.Mesh[]>([]);
  useFrame((_, delta) => {
    if (active) wheels.current.forEach((wheel) => { if (wheel) wheel.rotation.y += delta * 1.6; });
  });
  return (
    <group>
      <mesh position={[0, 0.57, 0]} castShadow>
        <boxGeometry args={[1.35, 0.42, 0.92]} />
        <meshStandardMaterial color="#c9c7bd" metalness={0.36} roughness={0.58} />
      </mesh>
      <mesh position={[0.2, 1.02, 0]} castShadow>
        <boxGeometry args={[0.55, 0.45, 0.7]} />
        <meshStandardMaterial color="#a7aa9f" metalness={0.36} roughness={0.56} />
      </mesh>
      <mesh position={[-0.45, 1.05, 0.3]} rotation={[0, 0, 0.5]}>
        <cylinderGeometry args={[0.03, 0.03, 0.8, 6]} />
        <meshStandardMaterial color="#41494c" metalness={0.5} />
      </mesh>
      {[-0.55, 0.55].flatMap((x) => [-0.52, 0.52].map((z) => (
        <mesh key={x + ':' + z} ref={(node) => { if (node && !wheels.current.includes(node)) wheels.current.push(node); }} position={[x, 0.27, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.18, 14]} />
          <meshStandardMaterial color="#31383a" roughness={0.9} />
        </mesh>
      )))}
    </group>
  );
}

function FissionModel({ powered }: { powered: boolean }) {
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, delta) => { if (glow.current) glow.current.opacity = THREE.MathUtils.damp(glow.current.opacity, powered ? 0.9 : 0.15, 2, delta); });
  return (
    <group>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.6, 2.4, 20]} />
        <meshStandardMaterial color="#c8c4ba" metalness={0.45} roughness={0.5} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[Math.cos((i * Math.PI) / 3) * 0.95, 2.4, Math.sin((i * Math.PI) / 3) * 0.95]} rotation={[0, -(i * Math.PI) / 3, 0.18]} castShadow>
          <boxGeometry args={[1.0, 2.4, 0.04]} />
          <meshStandardMaterial color="#5e6466" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 3.7, 0]}>
        <sphereGeometry args={[0.1, 8, 6]} />
        <meshBasicMaterial ref={glow} color="#9fe3b6" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function DrillModel({ powered }: { powered: boolean }) {
  const bit = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => { if (bit.current && powered) bit.current.rotation.y += delta * 5; });
  return (
    <group>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.55, 1.2, Math.sin(a) * 0.55]} rotation={[Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 2.6, 6]} />
            <meshStandardMaterial color="#b9b4a8" metalness={0.5} roughness={0.5} />
          </mesh>
        );
      })}
      <mesh ref={bit} position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 1.9, 8]} />
        <meshStandardMaterial color="#6d6a64" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[1.3, 0.45, 0.2]} castShadow>
        <cylinderGeometry args={[0.38, 0.38, 0.9, 16]} />
        <meshStandardMaterial color={powered ? '#9cc7c9' : '#8a8780'} metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}

function WarningBeacon() {
  const lamp = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => { if (lamp.current) lamp.current.opacity = 0.35 + (Math.sin(clock.getElapsedTime() * 5) + 1) * 0.3; });
  return (
    <group position={[0, 2.75, 0]}>
      <mesh><sphereGeometry args={[0.11, 10, 8]} /><meshBasicMaterial ref={lamp} color="#ff5148" transparent opacity={0.7} /></mesh>
      <pointLight color="#ff5148" intensity={1.2} distance={4} />
    </group>
  );
}

const LABEL_HEIGHT: Partial<Record<ModuleKind, number>> = { habitat: 3.7, greenhouse: 2.9, fission: 4.1, drill: 2.9, shield: 1.6 };

export function Building({ module, terrain, visual, selected, onSelect, tr }: { tr: Translator; module: OutpostModule; terrain: Terrain; visual: ModuleVisualState; selected: boolean; onSelect: () => void }) {
  const group = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    born.current ??= clock.getElapsedTime();
    const age = clock.getElapsedTime() - born.current;
    const grow = Math.min(1, age / 0.9);
    const eased = 1 - Math.pow(1 - grow, 3);
    const pulse = selected ? 1.03 : 1;
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, Math.max(0.02, eased) * pulse, 10, delta));
    if (module.kind === 'rover') {
      const working = module.active;
      const cleaning = working && visual.cleaning;
      const t = clock.getElapsedTime() * (cleaning ? 0.42 : 0.14);
      const cx = working ? (cleaning ? visual.anchor[0] : 23) : module.position[0];
      const cz = working ? (cleaning ? visual.anchor[1] : 1.5) : module.position[1];
      const radius = cleaning ? 3.1 : 6.2;
      const x = working ? cx + Math.sin(t) * radius : cx;
      const z = working ? cz + Math.cos(t) * (cleaning ? radius : 7.5) : cz;
      group.current.position.x = THREE.MathUtils.damp(group.current.position.x, x, cleaning ? 1.4 : 0.8, delta);
      group.current.position.z = THREE.MathUtils.damp(group.current.position.z, z, cleaning ? 1.4 : 0.8, delta);
      group.current.position.y = terrain.height(group.current.position.x, group.current.position.z);
      if (working) group.current.rotation.y = -t + Math.PI;
    }
  });
  const [x, z] = module.position;
  const y = terrain.height(x, z);
  const content = (() => {
    switch (module.kind) {
      case 'habitat': return <HabitatModel lit={visual.powered} level={module.level} shelter={visual.shelter} />;
      case 'solar': return <SolarModel powered={visual.powered} storm={visual.storm} panelDust={visual.panelDust} />;
      case 'life-support': return <LifeSupportModel powered={visual.powered} warning={visual.warning} />;
      case 'water': return <WaterModel powered={visual.powered} />;
      case 'greenhouse': return <GreenhouseModel powered={visual.powered} compact={module.variant === 'compact'} />;
      case 'battery': return <BatteryModel charge={visual.charge} />;
      case 'shield': return <BermModel />;
      case 'rover': return <RoverModel active={module.active} />;
      case 'fission': return <FissionModel powered={visual.powered} />;
      case 'drill': return <DrillModel powered={visual.powered} />;
    }
  })();
  const labelHeight = LABEL_HEIGHT[module.kind] ?? 2.3;
  const live = visual.powered && !visual.warning;
  return (
    <group ref={group} position={[x, y, z]} scale={0.02}>
      <group
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        {content}
        {selected && (
          <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[module.kind === 'habitat' || module.kind === 'shield' ? 6.2 : 1.9, module.kind === 'habitat' || module.kind === 'shield' ? 6.4 : 2.05, 64]} />
            <meshBasicMaterial color="#ffd09a" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )}
      </group>
      {visual.warning && (module.kind === 'habitat' || module.kind === 'life-support') && <WarningBeacon />}
      {module.kind !== 'shield' && (
        <Html position={[0, labelHeight, 0]} center distanceFactor={22} style={{ pointerEvents: 'none' }}>
          <div className={'scene-label' + (selected ? ' scene-label-selected' : '') + (visual.warning ? ' scene-label-critical' : '') + (!visual.powered ? ' scene-label-off' : '')}>
            <span className={'scene-label-dot' + (live ? ' is-live' : '')} />
            {moduleName(tr, module)}
          </div>
        </Html>
      )}
    </group>
  );
}

// Cables lie on the ground from power sources and loads to the habitat.
export function PowerCables({ modules, terrain }: { modules: OutpostModule[]; terrain: Terrain }) {
  const habitat = modules.find((module) => module.kind === 'habitat');
  const geometries = useMemo(() => {
    if (!habitat) return [];
    return modules
      .filter((module) => ['solar', 'fission', 'drill', 'battery'].includes(module.kind))
      .map((module) => {
        const [ax, az] = module.position;
        const [bx, bz] = habitat.position;
        const steps = Math.max(4, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
        const points = Array.from({ length: steps + 1 }, (_, i) => {
          const f = i / steps;
          const x = ax + (bx - ax) * f + Math.sin(f * Math.PI) * 0.6;
          const z = az + (bz - az) * f;
          return new THREE.Vector3(x, terrain.height(x, z) + 0.05, z);
        });
        return { id: module.id, geometry: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps * 2, 0.045, 5, false) };
      });
  }, [modules, terrain, habitat]);
  return <group>{geometries.map(({ id, geometry }) => <mesh key={id} geometry={geometry} receiveShadow><meshStandardMaterial color="#2f2a27" roughness={0.8} /></mesh>)}</group>;
}

export function Astronauts({ center, visible }: { center: [number, number]; visible: boolean }) {
  return visible ? <group>{[0, 1].map((i) => <Astronaut key={i} index={i} center={center} />)}</group> : null;
}

function Astronaut({ index, center }: { index: number; center: [number, number] }) {
  const person = useRef<THREE.Group>(null);
  const phase = index * 2.8;
  useFrame(({ clock }) => {
    if (!person.current) return;
    // Short EVA patrol along the habitat's front, inside the berm line.
    const t = clock.getElapsedTime() * 0.32 + phase;
    person.current.position.set(center[0] + Math.sin(t) * 2.4, Math.abs(Math.sin(clock.getElapsedTime() * 2.3 + phase)) * 0.04, center[1] + 2.15 + index * 0.3);
    person.current.rotation.y = Math.cos(t) > 0 ? Math.PI / 2 : -Math.PI / 2;
  });
  return (
    <group ref={person}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.42, 4, 8]} />
        <meshStandardMaterial color="#dbd9cf" roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.18, 0.02]} castShadow>
        <sphereGeometry args={[0.19, 16, 12]} />
        <meshStandardMaterial color="#ede5d2" metalness={0.15} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.18, 0.16]}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshStandardMaterial color="#c79c4f" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.85, -0.22]} castShadow>
        <boxGeometry args={[0.32, 0.4, 0.16]} />
        <meshStandardMaterial color="#cfccc2" roughness={0.7} />
      </mesh>
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 0.25, 0.02]} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 0.48, 8]} />
          <meshStandardMaterial color="#d7d4c9" roughness={0.75} />
        </mesh>
      ))}
    </group>
  );
}
