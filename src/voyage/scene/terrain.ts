import * as THREE from 'three';
import type { LandingSite } from '../mission/sites';
import { RIDGE } from '../mission/settlement';
import { voyageTune } from '../tune';

// Procedural Martian terrain. Shapes and colours take visual cues from NASA rover
// panoramas (Jezero, Gale, Elysium), but this is NOT a reconstruction of any real
// location and does not use MOLA or HiRISE elevation data.

const fract = (value: number) => value - Math.floor(value);
const hash2 = (ix: number, iz: number, seed: number) => fract(Math.sin(ix * 127.1 + iz * 311.7 + seed * 74.7) * 43758.5453);
const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoothstep = (x: number, edge0: number, edge1: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function valueNoise(x: number, z: number, scale: number, seed: number) {
  const gx = x / scale;
  const gz = z / scale;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const sx = smooth(gx - ix);
  const sz = smooth(gz - iz);
  const a = hash2(ix, iz, seed) + (hash2(ix + 1, iz, seed) - hash2(ix, iz, seed)) * sx;
  const b = hash2(ix, iz + 1, seed) + (hash2(ix + 1, iz + 1, seed) - hash2(ix, iz + 1, seed)) * sx;
  return (a + (b - a) * sz) * 2 - 1;
}

export function fbm(x: number, z: number, scale: number, octaves: number, seed: number) {
  let total = 0;
  let amplitude = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += valueNoise(x, z, scale, seed + i * 13) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    scale *= 0.5;
  }
  return total / norm;
}

// Cheap Worley edge distance, used for Utopia's polygonal (thermal-contraction) ground.
function polygonEdge(x: number, z: number, cell: number, seed: number) {
  const gx = x / cell;
  const gz = z / cell;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  let f1 = 9;
  let f2 = 9;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const cx = ix + dx + hash2(ix + dx, iz + dz, seed);
      const cz = iz + dz + hash2(ix + dx, iz + dz, seed + 5);
      const d = Math.hypot(gx - cx, gz - cz);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  return f2 - f1;
}

export interface Crater { x: number; z: number; r: number }

// Construction zones that the crew grades flat (lander spots, habitat pads, arrays, extractor, fission unit).
const GRADED: [number, number, number][] = [[3, -3, 52], [-13, 6, 16], [23, 1.5, 16], [13, -21, 14], [-34, -28, 10]];

export interface Terrain {
  site: LandingSite;
  craters: Crater[];
  height: (x: number, z: number) => number;
  slope: (x: number, z: number) => number;
  colorAt: (x: number, z: number, h: number, slope: number, out: THREE.Color) => THREE.Color;
}

export function createTerrain(site: LandingSite): Terrain {
  const p = site.terrain;
  const seed = p.seed;
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

  const craters: Crater[] = [];
  const bigCount = Math.round(90 * p.craterDensity);
  for (let i = 0; i < bigCount; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 4 + Math.pow(rand(), 3) * 60;
    const d = Math.max(r + 34, 40 + Math.pow(rand(), 1.5) * 1500);
    craters.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r });
  }
  const smallCount = Math.round(18 * p.craterDensity);
  for (let i = 0; i < smallCount; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = 38 + rand() * 70;
    craters.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 1.6 + rand() * 5.5 });
  }

  const broad = (x: number, z: number) => fbm(x, z, 300, 3, seed) * 16 * p.relief + fbm(x, z, 70, 3, seed + 3) * 3.4 * p.relief;
  const origin = broad(0, 0);
  const scarpCenter = { x: -330, z: -210 };

  const raw = (x: number, z: number) => {
    let h = broad(x, z) - origin;
    h += valueNoise(x, z, 16, seed + 5) * 0.75 * p.relief + valueNoise(x, z, 5, seed + 7) * 0.2 + valueNoise(x, z, 1.7, seed + 9) * 0.05;

    if (p.polygons) {
      const edge = polygonEdge(x, z, 11, seed + 11);
      h -= (1 - smoothstep(edge, 0, 0.12)) * 0.22;
    }

    if (p.layeredScarp) {
      // Eroded sedimentary delta front: stacked terraces suggest exposed layers.
      const wobble = fbm(x, z, 90, 3, seed + 21) * 70;
      const d = Math.hypot((x - scarpCenter.x) / 1.7, z - scarpCenter.z) + wobble;
      const plateau = smoothstep(-d, -260, -170);
      if (plateau > 0) {
        const lift = plateau * 26;
        const step = 3.6;
        const k = lift / step;
        h += (Math.floor(k) + smoothstep(fract(k), 0.72, 1)) * step;
      }
    }

    if (p.rimRing) {
      // A distant crater rim on the horizon (stylised; Jezero's real rim is much farther away).
      const d = Math.hypot(x - 420, z + 380);
      h += Math.exp(-Math.pow((d - 1450) / 170, 2)) * 70 + smoothstep(d, 1450, 1700) * 30;
    } else {
      h += Math.max(0, fbm(x, z, 520, 2, seed + 31)) * 38 * smoothstep(Math.hypot(x, z), 700, 1500);
    }

    for (const crater of craters) {
      const dx = x - crater.x;
      const dz = z - crater.z;
      if (Math.abs(dx) > crater.r * 3 || Math.abs(dz) > crater.r * 3) continue;
      const q = Math.hypot(dx, dz) / crater.r;
      const depth = crater.r * 0.2;
      if (q < 1) h += depth * (q * q - 1) * 0.9;
      h += crater.r * 0.05 * Math.exp(-Math.pow((q - 1) / 0.2, 2));
      if (q > 1) h += crater.r * 0.018 * Math.exp(-(q - 1) * 2.4);
    }

    let grade = 0;
    for (const [gx, gz, radius] of GRADED) {
      const d = Math.hypot(x - gx, z - gz);
      grade = Math.max(grade, 1 - smoothstep(d, radius * 0.62, radius));
    }
    if (grade > 0) h += (valueNoise(x, z, 9, seed + 41) * 0.12 - h) * grade;

    // Rocky ridge west of the settlement (the "lee of ridge" habitat option).
    const along = smoothstep(z, RIDGE.z0 - 6, RIDGE.z0 + 2) * (1 - smoothstep(z, RIDGE.z1 - 2, RIDGE.z1 + 6));
    if (along > 0) {
      const across = Math.exp(-Math.pow((x - RIDGE.x - valueNoise(x, z, 8, seed + 51) * 1.2) / 3.4, 2));
      h += across * along * (3.2 + valueNoise(x, z, 6, seed + 53) * 1.1);
    }
    return h;
  };

  const height = (x: number, z: number) => raw(x, z);
  const slope = (x: number, z: number) => {
    const e = 0.7;
    const dx = (raw(x + e, z) - raw(x - e, z)) / (2 * e);
    const dz = (raw(x, z + e) - raw(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  };

  // Palette tuned against Perseverance Mastcam-Z colour panoramas: dusty tan-brown,
  // darker basaltic sand in hollows, grey-brown exposed rock on slopes.
  const dust = new THREE.Color().setRGB(0.66, 0.49, 0.37, THREE.SRGBColorSpace);
  const regolith = new THREE.Color().setRGB(0.56, 0.41, 0.31, THREE.SRGBColorSpace);
  const sand = new THREE.Color().setRGB(0.36, 0.29, 0.25, THREE.SRGBColorSpace);
  const rock = new THREE.Color().setRGB(0.47, 0.39, 0.33, THREE.SRGBColorSpace);
  const layerLight = new THREE.Color().setRGB(0.72, 0.58, 0.45, THREE.SRGBColorSpace);
  const tint = new THREE.Color(p.tint[0], p.tint[1], p.tint[2]);
  const tmp = new THREE.Color();

  const colorAt = (x: number, z: number, h: number, sl: number, out: THREE.Color) => {
    const n = fbm(x, z, 38, 3, seed + 61) * 0.5 + 0.5;
    out.copy(regolith).lerp(dust, smoothstep(n, 0.35, 0.8));
    const hollow = smoothstep(-valueNoise(x, z, 13, seed + 63) - h * 0.04, 0.1, 0.55);
    out.lerp(sand, hollow * 0.55);
    if (p.layeredScarp && h > 2.5) {
      const band = Math.sin(h * 1.75 + valueNoise(x, z, 30, seed + 67) * 0.8) * 0.5 + 0.5;
      tmp.copy(rock).lerp(layerLight, band);
      out.lerp(tmp, smoothstep(sl, 0.25, 0.7) * 0.9);
    }
    out.lerp(rock, smoothstep(sl, 0.45, 1.1) * 0.75);

    // Regional albedo: bright dust mantles and dark sand fields with wind ripples,
    // the patterns that make Mars readable from altitude.
    const regional = fbm(x, z, 260, 3, seed + 71);
    out.multiplyScalar(0.88 + regional * 0.34);
    const field = smoothstep(fbm(x, z, 170, 2, seed + 73), 0.12, 0.42);
    if (field > 0) {
      const ripple = Math.sin((x * 0.55 + z * 0.83) * 0.42 + valueNoise(x, z, 20, seed + 75) * 2.2) * 0.5 + 0.5;
      out.lerp(sand, field * (0.45 + ripple * 0.35));
    }
    for (const crater of craters) {
      const dx = x - crater.x;
      const dz = z - crater.z;
      const reach = crater.r * 2.2;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const q = Math.hypot(dx, dz) / crater.r;
      if (q < 0.85) out.lerp(sand, 0.35 * (1 - q / 0.85) + 0.12);
      else if (q < 2.2) out.lerp(dust, 0.18 * (1 - (q - 0.85) / 1.35));
    }
    if (voyageTune.body !== 'mars') {
      tmp.set(voyageTune.ground);
      out.lerp(tmp, 0.82);
    }
    return out.multiply(tint);
  };

  return { site, craters, height, slope, colorAt };
}

export function buildTerrainGeometry(terrain: Terrain, size: number, segments: number, far: boolean) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const row = segments + 1;
  const cell = size / segments;
  const heights = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i += 1) heights[i] = terrain.height(positions.getX(i), positions.getZ(i));
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const col = i % row;
    const rowIndex = Math.floor(i / row);
    const left = heights[rowIndex * row + Math.max(0, col - 1)];
    const right = heights[rowIndex * row + Math.min(row - 1, col + 1)];
    const up = heights[Math.max(0, rowIndex - 1) * row + col];
    const down = heights[Math.min(row - 1, rowIndex + 1) * row + col];
    const slope = Math.hypot(right - left, down - up) / (2 * cell);
    terrain.colorAt(x, z, heights[i], slope, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    // The far ring sits under the detailed tile so the two never fight in the centre.
    const drop = far ? (Math.max(Math.abs(x), Math.abs(z)) < 168 ? 12 : 0.35) : 0;
    positions.setY(i, heights[i] - drop);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Neutral, tileable detail texture (grain, pebbles) that modulates the vertex colours.
export function createDetailTextures() {
  const size = 512;
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const tile = (x: number, y: number, cells: number, seed: number) => {
    const gx = (x / size) * cells;
    const gy = (y / size) * cells;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const w = (v: number) => ((v % cells) + cells) % cells;
    const sx = smooth(gx - ix);
    const sy = smooth(gy - iy);
    const a = hash2(w(ix), w(iy), seed) + (hash2(w(ix + 1), w(iy), seed) - hash2(w(ix), w(iy), seed)) * sx;
    const b = hash2(w(ix), w(iy + 1), seed) + (hash2(w(ix + 1), w(iy + 1), seed) - hash2(w(ix), w(iy + 1), seed)) * sx;
    return (a + (b - a) * sy) * 2 - 1;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const mid = tile(x, y, 8, 3);
      const fine = tile(x, y, 32, 5);
      const grain = tile(x, y, 128, 7);
      const pebble = Math.max(0, tile(x, y, 64, 9) - 0.55) * 2.6;
      const h = mid * 0.3 + fine * 0.2 + grain * 0.12 + pebble * 0.5;
      heights[y * size + x] = h;
      const shade = 214 + mid * 16 + fine * 12 + grain * 10 - pebble * 50;
      const i = (y * size + x) * 4;
      color[i] = THREE.MathUtils.clamp(shade + 4, 0, 255);
      color[i + 1] = THREE.MathUtils.clamp(shade, 0, 255);
      color[i + 2] = THREE.MathUtils.clamp(shade - 4, 0, 255);
      color[i + 3] = 255;
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const dx = heights[y * size + ((x + 1) % size)] - heights[y * size + ((x + size - 1) % size)];
      const dy = heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x];
      normal[i] = THREE.MathUtils.clamp(128 - dx * 160, 0, 255);
      normal[i + 1] = THREE.MathUtils.clamp(128 - dy * 160, 0, 255);
      normal[i + 2] = 255;
      normal[i + 3] = 255;
    }
  }
  const make = (data: Uint8Array, srgb: boolean) => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  };
  return { colorMap: make(color, true), normalMap: make(normal, false) };
}

// Irregular rock geometry: an icosphere pushed around by noise, with a flattened base
// so it sits into the ground instead of balancing on a point.
export function createRockGeometry(seed: number, detail = 2) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const positions = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) {
    v.fromBufferAttribute(positions, i);
    const n = valueNoise(v.x * 40 + seed * 7, v.z * 40 + v.y * 23, 18, seed) * 0.28
      + valueNoise(v.x * 90 + v.y * 31, v.z * 90 + seed, 12, seed + 3) * 0.12;
    const facet = Math.round((v.y + 1) * 2.5) / 2.5 - (v.y + 1);
    v.multiplyScalar(1 + n + facet * 0.08);
    v.y = v.y < -0.25 ? -0.25 + (v.y + 0.25) * 0.25 : v.y * 0.72;
    positions.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}
