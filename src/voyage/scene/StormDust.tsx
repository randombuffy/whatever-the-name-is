import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Drifting grains while the regional storm is active. The simulation still owns
// panel dust and power; this only makes that state visible.
export function StormDust({ active, reduced }: { active: boolean; reduced: boolean }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = 160;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = ((i * 47) % 90) - 45;
      positions[i * 3 + 1] = 0.6 + ((i * 13) % 28) * 0.45;
      positions[i * 3 + 2] = ((i * 29) % 90) - 45;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    const mesh = points.current;
    if (!mesh) return;
    mesh.visible = active;
    if (!active) return;
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const speed = (reduced ? 4 : 16) * delta;
    for (let i = 0; i < attr.count; i += 1) {
      let x = attr.getX(i) + speed;
      if (x > 46) x = -46;
      attr.setX(i, x);
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial color="#c4a08a" size={reduced ? 0.12 : 0.2} transparent opacity={reduced ? 0.28 : 0.55} depthWrite={false} />
    </points>
  );
}
