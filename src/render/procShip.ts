import * as THREE from 'three'
import { getSpec } from '../domain/catalog'
import { fitHardware } from './shipKit'
import type { ComponentSpec, PropellantType, SpacecraftConfig } from '../domain/types'

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
  { hull: '#6a7078', dark: '#1c1e22', foil: '#8a929a', accent: '#163a68', tile: '#c5ccd4' },
  { hull: '#c8d2dc', dark: '#2a3440', foil: '#7ec8e8', accent: '#1a5a90', tile: '#e8eef4' },
  { hull: '#3a3c42', dark: '#101114', foil: '#5c6068', accent: '#8a241c', tile: '#6a6e74' },
  { hull: '#2a3850', dark: '#0c1420', foil: '#4a88c8', accent: '#1a68b0', tile: '#6ab4e4' },
  { hull: '#8a847c', dark: '#242018', foil: '#c4b49a', accent: '#1e4e82', tile: '#d8d0c4' },
  { hull: '#1a1a1e', dark: '#08080a', foil: '#3a3a44', accent: '#d46a18', tile: '#2a2a32' },
  { hull: '#5a646c', dark: '#16181c', foil: '#b8c0c8', accent: '#2a6a9a', tile: '#9aa8b4' },
  { hull: '#4a4038', dark: '#14100c', foil: '#8a7a68', accent: '#3a6a48', tile: '#c4b8a8' },
  { hull: '#9aa4b0', dark: '#222830', foil: '#d8e0e8', accent: '#245888', tile: '#f0f4f8' },
  { hull: '#2c3038', dark: '#0e1014', foil: '#6a7380', accent: '#c43a28', tile: '#4a5058' },
  { hull: '#3e5248', dark: '#121814', foil: '#7a9a88', accent: '#1a4a40', tile: '#c8d8cc' },
  { hull: '#5a4a62', dark: '#161018', foil: '#a090b0', accent: '#3a2068', tile: '#d8cce4' },
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
        for (let n = 0; n < 90; n += 1) {
          ctx.fillStyle = shade(slot.fill, rng.next() > 0.5 ? 22 : -28)
          ctx.fillRect(x + rng.next() * cell, y + rng.next() * cell, 4 + rng.next() * 8, 3)
        }
        ctx.fillStyle = 'rgba(0,0,0,0.22)'
        for (let n = 0; n < 18; n += 1) ctx.fillRect(x + rng.next() * cell, y + rng.next() * cell, 14, 2)
      } else if (slot.kind === 'carbon') {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'
        ctx.lineWidth = 1
        for (let n = 0; n < 14; n += 1) {
          ctx.beginPath()
          ctx.moveTo(x, y + (n / 14) * cell)
          ctx.lineTo(x + cell, y + ((n + 3) / 14) * cell)
          ctx.stroke()
        }
        ctx.fillStyle = 'rgba(255,255,255,0.16)'
        for (let n = 0; n < 80; n += 1) ctx.fillRect(x + rng.next() * cell, y + rng.next() * cell, 10, 3)
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
  map.userData.keep = true
  const specMap = new THREE.CanvasTexture(spec)
  specMap.colorSpace = THREE.LinearSRGBColorSpace
  specMap.anisotropy = 4
  specMap.needsUpdate = true
  specMap.userData.keep = true
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

/**
 * Sanfilippo's radius walk: each segment picks a new radius in a band that
 * grows with segment count, so the hull swells and pinches instead of tapering smoothly.
 */
function radiusSteps(segments: number, rng: Rng, radius: number): number[] {
  const steps: number[] = []
  let previous = radius
  for (let i = 0; i < segments; i += 1) {
    const max = radius * (0.1029 * segments) + radius
    const min = radius * (0.0294 * segments) + radius * 0.42
    const next = min + rng.next() * (max - min)
    steps.push(next / Math.max(0.08, previous))
    previous = next
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
  /** One real piece per fitted part. Empty on the title card, which uses a small showcase kit. */
  fittings?: ShipFitting[]
}

export interface ShipFitting {
  instanceId: string
  specId: string
  fill: number
  role: 'tank' | 'engine' | 'acs' | 'solar' | 'battery' | 'nuclear' | 'antenna' | 'radio' | 'radiator' | 'blanket' | 'heater' | 'shield' | 'chute' | 'stage' | 'legs' | 'rover' | 'heli' | 'arm' | 'cache' | 'instrument' | 'frame'
  magnitude: number
  propellant: PropellantType
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
  const sideChoices = [5, 6, 6, 7, 8, 8]
  const noses: ShipRecipe['nose'][] = profile === 'capsule' || profile === 'lander' ? ['blunt', 'point'] : profile === 'needle' ? ['spike', 'point'] : ['point', 'blunt', 'spike']
  return {
    seed,
    sides: sideChoices[Math.floor(rng.next() * sideChoices.length)],
    segments: Math.max(5, Math.min(10, 5 + tanks + (profile === 'needle' ? 2 : 1))),
    radius: (profile === 'needle' ? 0.28 : profile === 'lander' || profile === 'bulb' ? 0.58 : 0.4) + Math.sqrt(Math.max(dry, 12)) / 22 + tanks * 0.025,
    length: (profile === 'needle' ? 0.7 : profile === 'lander' ? 0.34 : 0.5) + Math.min(1.4, dry / 560) + tanks * 0.05,
    stretchX: profile === 'wedge' || profile === 'barge' ? 1.15 + rng.next() * 0.45 : 0.72 + rng.next() * 0.5,
    stretchZ: profile === 'barge' ? 0.42 + rng.next() * 0.22 : 0.55 + rng.next() * 0.4,
    nozzles: Math.max(0, engines),
    wings,
    dishes,
    fins,
    missionId: missionId === 'custom' ? 'mars' : missionId,
    profile,
    nose: noses[Math.floor(rng.next() * noses.length)],
    bind,
    fittings: fittingsFrom(fitted),
  }
}

function fittingsFrom(parts: SpacecraftConfig['parts']): ShipFitting[] {
  const made: ShipFitting[] = []
  for (const part of parts) {
    if (!part.enabled) continue
    const spec = getSpec(part.specId)
    if (!spec) continue
    const role = roleOf(spec)
    if (!role) continue
    made.push({
      instanceId: part.instanceId,
      specId: spec.id,
      fill: part.fill,
      role,
      magnitude: magnitudeOf(spec, role),
      propellant: spec.propellant,
    })
  }
  return made
}

function roleOf(spec: ComponentSpec): ShipFitting['role'] | null {
  if (spec.id.startsWith('bus')) return null
  if (spec.id === 'frame') return 'frame'
  if (spec.id === 'mli') return 'blanket'
  if (spec.id === 'heaters') return 'heater'
  if (spec.id === 'heatshield') return 'shield'
  if (spec.id === 'chute') return 'chute'
  if (spec.id === 'descent') return 'stage'
  if (spec.id === 'legs') return 'legs'
  if (spec.id.startsWith('rover')) return 'rover'
  if (spec.id === 'heli') return 'heli'
  if (spec.id === 'arm') return 'arm'
  if (spec.id === 'cache') return 'cache'
  if (spec.tankCapacityKg > 0) return 'tank'
  if (spec.id === 'acs') return 'acs'
  if (spec.thrustN > 0 && spec.feedsMainEngine) return 'engine'
  if (spec.powerGenW > 0 && spec.powerScale === 'solar') return 'solar'
  if (spec.powerScale === 'constant' && spec.powerGenW > 0) return 'nuclear'
  if (spec.energyWh > 0) return 'battery'
  if (spec.antennaGainDbi > 0) return 'antenna'
  if (spec.id === 'transponder') return 'radio'
  if (spec.radiatorM2 > 0) return 'radiator'
  if (spec.instrument) return 'instrument'
  return 'frame'
}

function magnitudeOf(spec: ComponentSpec, role: ShipFitting['role']): number {
  if (role === 'tank') return spec.tankCapacityKg
  if (role === 'engine' || role === 'acs') return spec.thrustN
  if (role === 'solar' || role === 'nuclear') return spec.powerGenW
  if (role === 'battery') return spec.energyWh
  if (role === 'antenna') return spec.antennaGainDbi
  if (role === 'radiator') return spec.radiatorM2
  return spec.massKg
}

function shrinkXZ(ring: V3[], scale: number): V3[] {
  const c = mean(ring)
  return ring.map((p) => v(c.x + (p.x - c.x) * scale, p.y, c.z + (p.z - c.z) * scale))
}

/** A wing or fin grown out of a hull panel, so it belongs to the shell instead of sitting beside it. */
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

/** Closed engine bell on the aft face. */
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

/** Replaces a hull face the way the Unity generator does: pyramid, box, scoop, ridge, or a blue inset. */
function greeble(hull: Hull, quad: V3[], rng: Rng, roll: number): void {
  const [a, b, c, d] = quad
  const center = mean(quad)
  const outward = norm(cross(sub(b, a), sub(d, a)))
  const tex = roll < 0.18 ? 3 : roll < 0.4 ? 1 : roll < 0.62 ? 2 : 4
  if (roll < 0.2) {
    const peak = add(center, mul(outward, 0.22 + rng.next() * 0.38))
    hull.tri(a, b, peak, tex)
    hull.tri(b, c, peak, tex)
    hull.tri(c, d, peak, tex)
    hull.tri(d, a, peak, tex)
    return
  }
  if (roll < 0.52) {
    const inset = 0.06 + rng.next() * 0.16
    const depth = 0.16 + rng.next() * 0.28
    const box = [a, b, c, d].map((p) => add(lerp(p, center, inset), mul(outward, depth)))
    hull.quad(a, b, box[1], box[0], 1)
    hull.quad(b, c, box[2], box[1], 1)
    hull.quad(c, d, box[3], box[2], 1)
    hull.quad(d, a, box[0], box[3], 1)
    if (rng.next() < 0.58) {
      const peak = add(mean(box), mul(outward, 0.1 + rng.next() * 0.2))
      hull.tri(box[0], box[1], peak, tex)
      hull.tri(box[1], box[2], peak, tex)
      hull.tri(box[2], box[3], peak, tex)
      hull.tri(box[3], box[0], peak, tex)
    } else hull.quad(box[0], box[1], box[2], box[3], tex)
    return
  }
  if (roll < 0.74) {
    const lip = [a, b, c, d].map((p) => add(lerp(p, center, 0.06), mul(outward, 0.05)))
    const scoop = [a, b, c, d].map((p) => add(lerp(p, center, 0.2 + rng.next() * 0.1), mul(outward, 0.24 + rng.next() * 0.22)))
    hull.quad(lip[0], lip[1], scoop[1], scoop[0], 1)
    hull.quad(lip[1], lip[2], scoop[2], scoop[1], 1)
    hull.quad(lip[2], lip[3], scoop[3], scoop[2], 1)
    hull.quad(lip[3], lip[0], scoop[0], scoop[3], 1)
    hull.quad(scoop[0], scoop[1], scoop[2], scoop[3], 3)
    return
  }
  if (roll < 0.9) {
    const ridge = [a, b, c, d].map((p, i) => add(lerp(p, i % 2 === 0 ? a : b, 0.28), mul(outward, 0.1 + rng.next() * 0.1)))
    hull.quad(a, b, ridge[1], ridge[0], 1)
    hull.quad(b, c, ridge[2], ridge[1], 2)
    hull.quad(c, d, ridge[3], ridge[2], 1)
    hull.quad(d, a, ridge[0], ridge[3], 2)
    hull.quad(ridge[0], ridge[1], ridge[2], ridge[3], tex)
    return
  }
  const inner = [a, b, c, d].map((p) => lerp(p, center, 0.22))
  const sunk = inner.map((p) => add(p, mul(outward, -0.05)))
  hull.quad(a, b, inner[1], inner[0], 1)
  hull.quad(b, c, inner[2], inner[1], 1)
  hull.quad(c, d, inner[3], inner[2], 1)
  hull.quad(d, a, inner[0], inner[3], 1)
  hull.quad(inner[0], inner[1], sunk[1], sunk[0], 2)
  hull.quad(inner[1], inner[2], sunk[2], sunk[1], 2)
  hull.quad(inner[2], inner[3], sunk[3], sunk[2], 2)
  hull.quad(inner[3], inner[0], sunk[0], sunk[3], 2)
  hull.quad(sunk[0], sunk[1], sunk[2], sunk[3], 3)
}

/** Same plate, foil and tile atlas the hull uses. Shared maps, a fresh material. */
export function hullSkin(seed = 4): THREE.MeshStandardMaterial {
  return hullMaterial(seed)
}

function hullMaterial(seed: number): THREE.MeshStandardMaterial {
  const skin = makeSkin(seed)
  return new THREE.MeshStandardMaterial({
    map: skin.map,
    metalnessMap: skin.spec,
    color: 0xffffff,
    metalness: 0.42 + (seed % 7) * 0.07,
    roughness: 0.28 + (seed % 5) * 0.08,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    flatShading: true,
  })
}

function solarMaterial(seed: number): THREE.MeshStandardMaterial {
  const tones = [0x1a5a9c, 0x163e78, 0x0e4a88, 0x245888, 0x1c6ab0]
  return new THREE.MeshStandardMaterial({
    color: tones[seed % tones.length],
    metalness: 0.55,
    roughness: 0.28,
    emissive: tones[seed % tones.length],
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide,
    flatShading: true,
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
  const bellPoints: V3[] = []
  const wobble = 0.1 + (recipe.seed % 5) * 0.02
  const aft = polygon(recipe.sides, recipe.radius, recipe.stretchX, recipe.stretchZ, 0, rng, wobble)
  const rings: V3[][] = [aft]
  let ring = aft
  const steps = radiusSteps(recipe.segments, rng, recipe.radius)
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
      const wingHere = recipe.wings > 0 && s === Math.min(1, recipe.segments - 1) && i % pairs === 0
      const finHere = recipe.fins > 0 && s === recipe.segments - 1 && i % pairs === Math.min(2, pairs - 1)
      if (wingHere) panel(wingBody, quad, recipe.radius * (profile === 'barge' || profile === 'wedge' ? 1.55 : 1.05) * (0.95 + recipe.wings * 0.38))
      else if (finHere) panel(finBody, quad, recipe.radius * (profile === 'needle' ? 0.34 : 0.55))
      else greeble(hull, quad, rng, rolls[i])
    }
  }

  const noseLen = recipe.length * (nose === 'blunt' ? 0.32 + rng.next() * 0.16 : nose === 'spike' ? 0.7 + rng.next() * 0.28 : 0.46 + rng.next() * 0.22)
  const noseRing = scaleRing(lift(ring, noseLen), nose === 'blunt' ? 0.58 : nose === 'spike' ? 0.16 : 0.28)
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length
    greeble(hull, [ring[i], ring[j], noseRing[j], noseRing[i]], rng, rng.next())
  }
  hull.cap(noseRing, 1, false)
  hull.cap(aft, 4, true)
  rings.push(noseRing)
  for (let i = 0; i < rings.length - 1; i += 1) {
    hull.stitch(shrinkXZ(rings[i], 0.82), shrinkXZ(rings[i + 1], 0.82), 4)
  }
  hull.cap(shrinkXZ(aft, 0.82), 6, false)
  hull.cap(shrinkXZ(noseRing, 0.82), 6, true)
  if (recipe.dishes > 0) {
    const mast = scaleRing(lift(noseRing, recipe.length * 0.22), 0.55)
    dishBody.stitch(noseRing, mast, 2)
    dishBody.cap(mast, 7, false)
  }
  if (recipe.nozzles > 0) addBell(hull, aft, bellPoints)

  const material = hullMaterial(recipe.seed)
  const mesh = piece(hull, material, 'hull')!
  tagPart(mesh, recipe.bind.hull)
  const root = new THREE.Group()
  root.name = 'generated-ship'
  root.add(mesh)
  const wing = piece(wingBody, solarMaterial(recipe.seed), 'wings')
  const fin = piece(finBody, material, 'fins')
  const dish = piece(dishBody, material, 'dish')
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
  const placed = fitHardware(mesh, recipe, material)
  const nozzles = bellPoints.length > 0
    ? bellPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z))
    : placed.nozzles
  if (nozzles[0]) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.08, recipe.radius * 0.2), 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7a28, transparent: true, opacity: 0.82 }),
    )
    glow.position.copy(nozzles[0])
    glow.name = 'bell-glow'
    mesh.add(glow)
  }

  return { root, nozzles, left: null, right: null }
}

