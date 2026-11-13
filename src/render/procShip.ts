import * as THREE from 'three'
import { getSpec } from '../domain/catalog'
import type { SpacecraftConfig } from '../domain/types'

/**
 * Port of Alex Sanfilippo's ProceduralMeshGeneration spaceship.
 * A regular polygon is extruded along the hull, the rings are stitched,
 * the nose tapers, and a closed bell hangs off the sealed aft.
 * Installed parts change the segment count, the radius, the wings, and the nozzles.
 * https://github.com/AlexSanfilippo/ProceduralMeshGeneration
 */

export interface GeneratedShip {
  root: THREE.Group
  nozzles: THREE.Vector3[]
  left: THREE.Object3D | null
  right: THREE.Object3D | null
}

interface V3 {
  x: number
  y: number
  z: number
}

type Profile = 'needle' | 'capsule' | 'wedge' | 'barge' | 'bulb' | 'lander'

const ATLAS = 3
const skins = new Map<number, { map: THREE.CanvasTexture; spec: THREE.CanvasTexture }>()

const PALETTES: { hull: string; dark: string; foil: string; accent: string; tile: string }[] = [
  { hull: '#e6e2d8', dark: '#2a3036', foil: '#c9a227', accent: '#1f4e79', tile: '#f4f1ea' },
  { hull: '#1a1e24', dark: '#0b0d10', foil: '#b87333', accent: '#c45a3c', tile: '#d7cfc4' },
  { hull: '#c5d0c4', dark: '#2c332c', foil: '#d8c48a', accent: '#2f6f62', tile: '#eef2ea' },
  { hull: '#8aa0c2', dark: '#1c2838', foil: '#eee6d4', accent: '#d4a017', tile: '#f7f4ee' },
  { hull: '#6e3030', dark: '#241010', foil: '#c4b8a8', accent: '#e8dcc8', tile: '#f0e6dc' },
  { hull: '#2c3a2c', dark: '#101410', foil: '#8a9a6e', accent: '#f0ead8', tile: '#dce8d4' },
  { hull: '#d8cfc2', dark: '#3c342c', foil: '#5e82a8', accent: '#9a3b2f', tile: '#f3eee6' },
  { hull: '#3a3a44', dark: '#121218', foil: '#e8e0d0', accent: '#5a8fbf', tile: '#eceaf0' },
  { hull: '#f2efe8', dark: '#22262c', foil: '#9a3b2f', accent: '#1f4e79', tile: '#ffffff' },
  { hull: '#4a3828', dark: '#1a120c', foil: '#d4c4a0', accent: '#6a8f4e', tile: '#e8dcc8' },
  { hull: '#203040', dark: '#0c1218', foil: '#7ec8d8', accent: '#e07a3d', tile: '#dce6ee' },
  { hull: '#c8b4d4', dark: '#2a2230', foil: '#f0d878', accent: '#4a3080', tile: '#f4eef8' },
]

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt))
  const b = Math.max(0, Math.min(255, (n & 255) + amt))
  return `rgb(${r},${g},${b})`
}

function makeSkin(seed: number): { map: THREE.CanvasTexture; spec: THREE.CanvasTexture } {
  const cached = skins.get(seed)
  if (cached) return cached
  const rng = new Rng(seed ^ 0x9e3779b9)
  const pal = PALETTES[seed % PALETTES.length]
  const size = 768
  const cell = size / ATLAS
  const color = document.createElement('canvas')
  color.width = size
  color.height = size
  const spec = document.createElement('canvas')
  spec.width = size
  spec.height = size
  const ctx = color.getContext('2d')
  const sx = spec.getContext('2d')
  if (ctx && sx) {
    const cells: { fill: string; kind: 'plate' | 'carbon' | 'foil' | 'tile' }[] = [
      { fill: pal.hull, kind: 'plate' },
      { fill: pal.dark, kind: 'carbon' },
      { fill: pal.foil, kind: 'foil' },
      { fill: pal.tile, kind: 'tile' },
      { fill: pal.accent, kind: 'plate' },
      { fill: pal.dark, kind: 'foil' },
      { fill: pal.hull, kind: 'tile' },
      { fill: pal.foil, kind: 'plate' },
      { fill: pal.accent, kind: 'carbon' },
    ]
    for (let i = 0; i < 9; i += 1) {
      const col = i % ATLAS
      const row = Math.floor(i / ATLAS)
      const x = col * cell
      const y = row * cell
      const slot = cells[i]
      ctx.fillStyle = slot.fill
      ctx.fillRect(x, y, cell, cell)
      sx.fillStyle = slot.kind === 'foil' ? '#e8e8e8' : slot.kind === 'carbon' ? '#5a5a5a' : '#9a9a9a'
      sx.fillRect(x, y, cell, cell)
      if (slot.kind === 'plate') {
        ctx.strokeStyle = shade(slot.fill, -28)
        ctx.lineWidth = 2
        const gap = 18 + Math.floor(rng.next() * 10)
        for (let px = x; px < x + cell; px += gap) {
          ctx.beginPath()
          ctx.moveTo(px, y)
          ctx.lineTo(px, y + cell)
          ctx.stroke()
        }
        for (let py = y; py < y + cell; py += gap) {
          ctx.beginPath()
          ctx.moveTo(x, py)
          ctx.lineTo(x + cell, py)
          ctx.stroke()
        }
        for (let n = 0; n < 40; n += 1) {
          ctx.fillStyle = shade(slot.fill, rng.next() > 0.5 ? 18 : -18)
          ctx.fillRect(x + rng.next() * cell, y + rng.next() * cell, 6, 4)
        }
      } else if (slot.kind === 'carbon') {
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        for (let n = 0; n < 220; n += 1) ctx.fillRect(x + rng.next() * cell, y + rng.next() * cell, 3, 8)
      } else if (slot.kind === 'foil') {
        const glow = ctx.createLinearGradient(x, y, x + cell, y + cell)
        glow.addColorStop(0, shade(slot.fill, 40))
        glow.addColorStop(0.5, slot.fill)
        glow.addColorStop(1, shade(slot.fill, -30))
        ctx.fillStyle = glow
        ctx.fillRect(x, y, cell, cell)
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 1
        for (let n = 0; n < 8; n += 1) {
          ctx.beginPath()
          ctx.moveTo(x, y + (n / 8) * cell)
          ctx.lineTo(x + cell, y + ((n + 2) / 8) * cell)
          ctx.stroke()
        }
      } else {
        const tile = 14
        for (let tx = 0; tx < cell; tx += tile) {
          for (let ty = 0; ty < cell; ty += tile) {
            ctx.fillStyle = rng.next() > 0.08 ? shade(slot.fill, (rng.next() - 0.5) * 22) : shade(pal.dark, 10)
            ctx.fillRect(x + tx + 1, y + ty + 1, tile - 2, tile - 2)
          }
        }
      }
    }
  }
  const map = new THREE.CanvasTexture(color)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  map.needsUpdate = true
  const specMap = new THREE.CanvasTexture(spec)
  specMap.colorSpace = THREE.LinearSRGBColorSpace
  specMap.anisotropy = 4
  specMap.needsUpdate = true
  const made = { map, spec: specMap }
  skins.set(seed, made)
  return made
}

class Rng {
  private state: number
  constructor(seed: number) {
    this.state = seed >>> 0 || 1
  }
  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0
    return this.state / 4294967296
  }
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const v = (x: number, y: number, z: number): V3 => ({ x, y, z })
const add = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z)
const sub = (a: V3, b: V3): V3 => v(a.x - b.x, a.y - b.y, a.z - b.z)
const mul = (a: V3, s: number): V3 => v(a.x * s, a.y * s, a.z * s)
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
const len = (a: V3): number => Math.hypot(a.x, a.y, a.z)
function norm(a: V3): V3 {
  const l = len(a) || 1
  return mul(a, 1 / l)
}
function mean(pts: V3[]): V3 {
  const s = pts.reduce((m, p) => add(m, p), v(0, 0, 0))
  return mul(s, 1 / Math.max(1, pts.length))
}
function lerp(a: V3, b: V3, t: number): V3 {
  return add(a, mul(sub(b, a), t))
}

function polygon(sides: number, radius: number, stretchX: number, stretchZ: number, y: number, rng: Rng, wobble: number): V3[] {
  const pts: V3[] = []
  const step = (Math.PI * 2) / sides
  const start = Math.PI / sides
  for (let i = 1; i <= sides; i += 1) {
    const angle = start + step * -i
    const r = radius * (1 + (rng.next() - 0.5) * wobble)
    pts.push(v(Math.cos(angle) * r * stretchX, y, Math.sin(angle) * r * stretchZ))
  }
  return pts
}

function scaleRing(ring: V3[], scale: number): V3[] {
  const c = mean(ring)
  return ring.map((p) => v(c.x + (p.x - c.x) * scale, p.y, c.z + (p.z - c.z) * scale))
}

function lift(ring: V3[], dy: number): V3[] {
  return ring.map((p) => v(p.x, p.y + dy, p.z))
}

/** Atlas cell, matching the generator's left-to-right, top-to-bottom index. */
function cell(u: number, t: number, index: number, size: number): [number, number] {
  const col = index % size
  const row = size - 1 - Math.floor(index / size)
  const s = 1 / size
  return [(col + u) * s, (row + t) * s]
}

class Hull {
  readonly positions: number[] = []
  readonly normals: number[] = []
  readonly uvs: number[] = []
  constructor(private readonly atlas: number = ATLAS) {}

  tri(a: V3, b: V3, c: V3, index: number): void {
    const n = norm(cross(sub(b, a), sub(c, a)))
    if (!Number.isFinite(n.x)) return
    const uv = [cell(0, 0, index, this.atlas), cell(1, 0, index, this.atlas), cell(0.5, 1, index, this.atlas)]
    const pts = [a, b, c]
    for (let i = 0; i < 3; i += 1) {
      this.positions.push(pts[i].x, pts[i].y, pts[i].z)
      this.normals.push(n.x, n.y, n.z)
      this.uvs.push(uv[i][0], uv[i][1])
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, index: number): void {
    this.tri(a, b, c, index)
    this.tri(a, c, d, index)
  }

  /** Two rings, same winding, connected so the normal points outward. */
  stitch(lower: V3[], upper: V3[], index: number): void {
    const n = lower.length
    const c = mean(lower)
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n
      const a = lower[i]
      const b = lower[j]
      const d = upper[i]
      const e = upper[j]
      const outward = norm(sub(mean([a, b, e, d]), c))
      const face = norm(cross(sub(b, a), sub(d, a)))
      if (dot(face, outward) < 0) this.quad(a, d, e, b, index)
      else this.quad(a, b, e, d, index)
    }
  }

  cap(ring: V3[], index: number, flip: boolean): void {
    const c = mean(ring)
    const n = ring.length
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n
      if (flip) this.tri(c, ring[j], ring[i], index)
      else this.tri(c, ring[i], ring[j], index)
    }
  }

  get vacant(): boolean {
    return this.positions.length === 0
  }

  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
    return geo
  }
}

/** Profile decides the silhouette. Seed noise keeps two of the same profile from matching. */
function radiusSteps(segments: number, rng: Rng, profile: Profile): number[] {
  const steps: number[] = []
  let last = 1
  for (let i = 0; i < segments; i += 1) {
    const t = (i + 1) / segments
    let shape = Math.sqrt(Math.max(0.12, 1 - t * t * 0.78))
    if (profile === 'needle') shape = Math.max(0.16, 1 - t * 0.78)
    else if (profile === 'capsule') shape = 0.55 + Math.sin(Math.min(1, t * 0.92) * Math.PI) * 0.42
    else if (profile === 'barge') shape = 1 - t * 0.14
    else if (profile === 'bulb') shape = 0.62 + Math.sin(t * Math.PI) * 0.58
    else if (profile === 'lander') shape = 1.18 - t * 0.38
    else if (profile === 'wedge') shape = Math.sqrt(Math.max(0.18, 1 - t * t * 0.88))
    const next = Math.max(0.16, shape * (1 + (rng.next() - 0.5) * 0.16))
    steps.push(next / last)
    last = next
  }
  return steps
}

export interface ShipRecipe {
  seed: number
  sides: number
  segments: number
  radius: number
  length: number
  stretchX: number
  stretchZ: number
  nozzles: number
  wings: number
  dishes: number
  fins: number
  missionId: string
  profile?: Profile
  nose?: 'point' | 'blunt' | 'spike'
  /** Part ids so the builder can slide the fuselage, wings, dish and engines. */
  bind: { hull?: string; wing?: string; dish?: string; fin?: string; engine?: string }
}

export function recipeFromCraft(config: SpacecraftConfig, missionId: string): ShipRecipe | null {
  const fitted = config.parts.filter((part) => part.enabled)
  if (fitted.length === 0) return null
  let tanks = 0
  let engines = 0
  let wings = 0
  let dishes = 0
  let fins = 0
  let dry = 0
  const bind: ShipRecipe['bind'] = {}
  for (const part of fitted) {
    const spec = getSpec(part.specId)
    if (!spec) continue
    dry += spec.massKg
    if (spec.tankCapacityKg > 0) tanks += 1
    if (spec.thrustN > 0 && spec.feedsMainEngine) {
      engines += 1
      bind.engine ??= part.instanceId
    }
    if (spec.powerGenW > 0 && spec.subsystem === 'power') {
      wings += 1
      bind.wing ??= part.instanceId
    }
    if (spec.subsystem === 'communications' && spec.antennaGainDbi > 0) {
      dishes += 1
      bind.dish ??= part.instanceId
    }
    if (spec.subsystem === 'thermal' && spec.radiatorM2 > 0) {
      fins += 1
      bind.fin ??= part.instanceId
    }
    if (spec.subsystem === 'structure' || spec.id.startsWith('bus')) bind.hull ??= part.instanceId
  }
  const seed = hash(`${config.name}|${missionId}|${config.hullSeed ?? 0}`)
  const rng = new Rng(seed)
  const profiles: Profile[] = ['needle', 'capsule', 'wedge', 'barge', 'bulb', 'lander']
  const profile = profiles[seed % profiles.length]
  const sideChoices = profile === 'wedge' ? [3, 4, 5] : profile === 'barge' ? [4, 4, 6] : [5, 6, 7, 8, 10, 12]
  const noses: ShipRecipe['nose'][] = profile === 'capsule' || profile === 'lander' ? ['blunt', 'blunt', 'point'] : profile === 'needle' ? ['spike', 'point'] : ['point', 'blunt', 'spike']
  return {
    seed,
    sides: sideChoices[Math.floor(rng.next() * sideChoices.length)],
    segments: Math.max(3, Math.min(8, 3 + tanks + (profile === 'needle' ? 2 : 0) - (profile === 'lander' ? 1 : 0))),
    radius: (profile === 'needle' ? 0.32 : profile === 'lander' || profile === 'bulb' ? 0.62 : 0.46) + Math.sqrt(Math.max(dry, 12)) / 19 + tanks * 0.03,
    length: (profile === 'needle' ? 0.82 : profile === 'lander' ? 0.38 : 0.58) + Math.min(1.6, dry / 540) + tanks * 0.06,
    stretchX: profile === 'wedge' || profile === 'barge' ? 1.15 + rng.next() * 0.55 : 0.78 + rng.next() * 0.5,
    stretchZ: profile === 'barge' ? 0.62 + rng.next() * 0.22 : profile === 'wedge' ? 0.7 + rng.next() * 0.35 : 0.85 + rng.next() * 0.45,
    nozzles: Math.max(0, engines),
    wings,
    dishes,
    fins,
    missionId: missionId === 'custom' ? 'mars' : missionId,
    profile,
    nose: noses[Math.floor(rng.next() * noses.length)],
    bind,
  }
}

function shrinkXZ(ring: V3[], scale: number): V3[] {
  const c = mean(ring)
  return ring.map((p) => v(c.x + (p.x - c.x) * scale, p.y, c.z + (p.z - c.z) * scale))
}

/** Extra detail sits on the skin. The wall itself is already closed. */
function greeble(hull: Hull, quad: V3[], rng: Rng, roll: number): void {
  const [a, b, c, d] = quad
  const center = mean(quad)
  const outward = norm(cross(sub(b, a), sub(d, a)))
  if (roll < 0.28) {
    const peak = add(center, mul(outward, 0.16 + rng.next() * 0.2))
    hull.tri(a, b, peak, 2)
    hull.tri(b, c, peak, 2)
    hull.tri(c, d, peak, 2)
    hull.tri(d, a, peak, 2)
    return
  }
  if (roll < 0.55) {
    const box = [a, b, c, d].map((p) => add(lerp(p, center, 0.12), mul(outward, 0.14 + rng.next() * 0.08)))
    hull.quad(a, b, box[1], box[0], 1)
    hull.quad(b, c, box[2], box[1], 1)
    hull.quad(c, d, box[3], box[2], 1)
    hull.quad(d, a, box[0], box[3], 1)
    hull.quad(box[0], box[1], box[2], box[3], 2)
    return
  }
  if (roll < 0.78) {
    const lip = [a, b, c, d].map((p) => add(lerp(p, center, 0.08), mul(outward, 0.06)))
    const scoop = [a, b, c, d].map((p) => add(lerp(p, center, 0.22), mul(outward, 0.28)))
    hull.quad(lip[0], lip[1], scoop[1], scoop[0], 1)
    hull.quad(lip[1], lip[2], scoop[2], scoop[1], 1)
    hull.quad(lip[2], lip[3], scoop[3], scoop[2], 1)
    hull.quad(lip[3], lip[0], scoop[0], scoop[3], 1)
    hull.quad(scoop[0], scoop[1], scoop[2], scoop[3], 3)
    return
  }
}

function panel(hull: Hull, quad: V3[], reach: number): void {
  const [a, b, c, d] = quad
  const outward = norm(cross(sub(b, a), sub(d, a)))
  const shift = mul(outward, reach)
  const tip = [a, b, c, d].map((p) => add(p, shift))
  hull.quad(a, b, tip[1], tip[0], 1)
  hull.quad(b, c, tip[2], tip[1], 1)
  hull.quad(c, d, tip[3], tip[2], 1)
  hull.quad(d, a, tip[0], tip[3], 1)
  hull.quad(tip[0], tip[1], tip[2], tip[3], 3)
}

function hullMaterial(seed: number): THREE.MeshStandardMaterial {
  const skin = makeSkin(seed)
  return new THREE.MeshStandardMaterial({
    map: skin.map,
    metalnessMap: skin.spec,
    color: 0xffffff,
    metalness: 0.16 + (seed % 7) * 0.09,
    roughness: 0.22 + (seed % 5) * 0.11,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  })
}

function solarMaterial(seed: number): THREE.MeshStandardMaterial {
  const tones = [0x16324a, 0x1a2740, 0x0e2a28, 0x241428, 0x3a2410]
  return new THREE.MeshStandardMaterial({
    color: tones[seed % tones.length],
    metalness: 0.72,
    roughness: 0.22,
    emissive: tones[seed % tones.length],
    emissiveIntensity: 0.12,
    side: THREE.DoubleSide,
  })
}

function piece(body: Hull, material: THREE.Material, name: string): THREE.Mesh | null {
  if (body.vacant) return null
  const mesh = new THREE.Mesh(body.geometry(), material)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function tagPart(obj: THREE.Object3D, id?: string): void {
  if (!id) return
  obj.userData.offsetRoot = true
  obj.userData.instanceId = id
  obj.userData.base = obj.position.clone()
}

/** Nose along +Y, nozzles on the aft face pointing -Y. Units are the generator's own. */
export function buildGeneratedShip(recipe: ShipRecipe): GeneratedShip {
  const rng = new Rng(recipe.seed)
  const profile = recipe.profile ?? (['needle', 'capsule', 'wedge', 'barge', 'bulb', 'lander'] as const)[recipe.seed % 6]
  const nose = recipe.nose ?? (profile === 'capsule' || profile === 'lander' ? 'blunt' : profile === 'needle' ? 'spike' : 'point')
  const hull = new Hull()
  const wingBody = new Hull()
  const finBody = new Hull()
  const dishBody = new Hull()
  const wobble = profile === 'wedge' ? 0.08 : 0.045
  const aft = polygon(recipe.sides, recipe.radius, recipe.stretchX, recipe.stretchZ, 0, rng, wobble)
  const rings: V3[][] = [aft]
  let ring = aft
  const steps = radiusSteps(recipe.segments, rng, profile)
  const sideQuads: V3[][] = []
  for (let s = 0; s < recipe.segments; s += 1) {
    const next = scaleRing(lift(ring, recipe.length), steps[s])
    const n = ring.length
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n
      sideQuads.push([ring[i], ring[j], next[j], next[i]])
    }
    ring = next
    rings.push(ring)
  }

  const pairs = Math.max(1, Math.floor(recipe.sides / 2))
  for (let s = 0; s < recipe.segments; s += 1) {
    const rolls = Array.from({ length: recipe.sides }, (_, i) => (i < pairs ? rng.next() : 0))
    for (let i = pairs; i < recipe.sides; i += 1) rolls[i] = rolls[i % pairs]
    for (let i = 0; i < recipe.sides; i += 1) {
      const quad = sideQuads[s * recipe.sides + i]
      hull.quad(quad[0], quad[1], quad[2], quad[3], 0)
      const wingHere = recipe.wings > 0 && s === Math.min(1, recipe.segments - 1) && (i % pairs === 0)
      const finHere = recipe.fins > 0 && s === recipe.segments - 1 && (i % pairs === Math.min(2, pairs - 1))
      if (wingHere) panel(wingBody, quad, recipe.radius * (profile === 'barge' || profile === 'wedge' ? 1.35 : 0.85) * (0.9 + recipe.wings * 0.32))
      else if (finHere) panel(finBody, quad, recipe.radius * (profile === 'needle' ? 0.28 : 0.48))
      else greeble(hull, quad, rng, rolls[i])
    }
  }

  const noseLen = recipe.length * (nose === 'blunt' ? 0.28 + rng.next() * 0.12 : nose === 'spike' ? 0.9 + rng.next() * 0.35 : 0.5 + rng.next() * 0.28)
  const noseRing = scaleRing(lift(ring, noseLen), nose === 'blunt' ? 0.52 : nose === 'spike' ? 0.045 : 0.13)
  hull.stitch(ring, noseRing, 2)
  hull.cap(noseRing, 1, false)
  hull.cap(aft, 4, true)
  rings.push(noseRing)
  for (let i = 0; i < rings.length - 1; i += 1) {
    hull.stitch(shrinkXZ(rings[i], 0.82), shrinkXZ(rings[i + 1], 0.82), 4)
  }
  hull.cap(shrinkXZ(aft, 0.82), 4, false)
  hull.cap(shrinkXZ(noseRing, 0.82), 4, true)
  if (recipe.dishes > 0) {
    const mast = scaleRing(lift(noseRing, recipe.length * 0.28), 0.4)
    dishBody.stitch(noseRing, mast, 1)
    dishBody.cap(mast, 3, false)
  }

  const nozzles: V3[] = []
  if (recipe.nozzles > 0) addBell(hull, aft, nozzles)

  const material = hullMaterial(recipe.seed)
  const mesh = piece(hull, material, 'hull')!
  tagPart(mesh, recipe.bind.hull)
  const root = new THREE.Group()
  root.name = 'generated-ship'
  root.add(mesh)
  const wing = piece(wingBody, solarMaterial(recipe.seed), 'wings')
  const fin = piece(finBody, material.clone(), 'fins')
  const dish = piece(dishBody, material.clone(), 'dish')
  if (wing) {
    mesh.add(wing)
    tagPart(wing, recipe.bind.wing)
  }
  if (fin) {
    mesh.add(fin)
    tagPart(fin, recipe.bind.fin)
  }
  if (dish) {
    mesh.add(dish)
    tagPart(dish, recipe.bind.dish)
  }

  let left: THREE.Object3D | null = null
  let right: THREE.Object3D | null = null
  if (recipe.nozzles >= 2) {
    left = booster(recipe, -1)
    right = booster(recipe, 1)
    mesh.add(left, right)
    tagPart(left, recipe.bind.engine)
    tagPart(right, recipe.bind.engine)
    nozzles.push(v(left.position.x, -0.2, 0), v(right.position.x, -0.2, 0))
  }

  return { root, nozzles: nozzles.map((p) => new THREE.Vector3(p.x, p.y, p.z)), left, right }
}

/** Closed engine bell on the aft face. The cabin stays sealed. */
function addBell(hull: Hull, mouth: V3[], nozzles: V3[]): void {
  const root = shrinkXZ(mouth, 0.55)
  const outer = lift(shrinkXZ(mouth, 0.42), -0.55)
  const inner = lift(shrinkXZ(mouth, 0.28), -0.48)
  const throat = lift(shrinkXZ(mouth, 0.22), -0.08)
  hull.stitch(root, outer, 2)
  hull.stitch(outer, inner, 2)
  hull.stitch(inner, throat, 4)
  hull.cap(throat, 4, false)
  const c = mean(inner)
  nozzles.push(v(c.x, c.y - 0.04, c.z))
}

function booster(recipe: ShipRecipe, side: number): THREE.Group {
  const rng = new Rng(recipe.seed + side * 17)
  const hull = new Hull()
  const radius = recipe.radius * 0.34
  const ring = polygon(6, radius, 1, 1, 0, rng, 0)
  const top = scaleRing(lift(ring, recipe.length * recipe.segments * 0.72), 0.55)
  hull.stitch(ring, top, 0)
  hull.cap(top, 1, false)
  hull.cap(ring, 4, true)
  addBell(hull, ring, [])
  const mesh = new THREE.Mesh(hull.geometry(), hullMaterial(recipe.seed + 19))
  mesh.castShadow = true
  const group = new THREE.Group()
  group.add(mesh)
  group.position.x = side * (recipe.radius * recipe.stretchX + radius + 0.25)
  const mark = new THREE.Object3D()
  mark.name = 'booster-nozzle'
  mark.position.set(0, -0.2, 0)
  group.add(mark)
  return group
}
