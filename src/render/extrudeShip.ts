import * as THREE from 'three'

/**
 * Browser port of the extrusion in Alexander Sanfilippo's ProceduralMeshGeneration.
 * A regular polygon is extruded along its normal, scaled, and stitched into a hull.
 * The same seed rebuilds the same ship. Engineering numbers are not read off the mesh.
 * https://github.com/AlexSanfilippo/ProceduralMeshGeneration
 */

export type ShipRole = 'hull' | 'engine' | 'wing' | 'tank' | 'mast' | 'pod' | 'collar'

interface ShipOptions {
  sides: number
  segments: number
  radius: number
  length: number
  stretchX: number
  stretchY: number
}

type RGB = [number, number, number]
type Ring = THREE.Vector3[]

const ENGINE = new THREE.MeshStandardMaterial({ color: 0x241c18, emissive: 0xff6a2a, emissiveIntensity: 0.28, roughness: 0.42, metalness: 0.62 })
const TEX = new Map<string, THREE.Texture>()
let exterior: THREE.CanvasTexture | null = null

function shipTex(url: string, color: boolean): THREE.Texture {
  const cached = TEX.get(url)
  if (cached) return cached
  const map = new THREE.TextureLoader().load(url)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace
  TEX.set(url, map)
  return map
}

/** Bare metal until the ship is cleared. Panel lines are drawn here, not taken from the interior reference photos. */
function hullMaterial(dressed: boolean): THREE.MeshStandardMaterial {
  if (!dressed) {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.48,
      metalness: 0.38,
      side: THREE.DoubleSide,
    })
  }
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: exteriorPanels(),
    emissive: new THREE.Color(0x9ecfff),
    emissiveMap: shipTex('/ships/hull_lights_emit.png', true),
    emissiveIntensity: 0.4,
    roughness: 0.5,
    metalness: 0.34,
    side: THREE.DoubleSide,
  })
}

function exteriorPanels(): THREE.CanvasTexture {
  if (exterior) return exterior
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const wash = ctx.createLinearGradient(0, 0, 128, 0)
    wash.addColorStop(0, '#c5ccd4')
    wash.addColorStop(0.5, '#e7ebf0')
    wash.addColorStop(1, '#b7c0c9')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, 128, 256)
    ctx.strokeStyle = '#5c6570'
    ctx.lineWidth = 3
    const seams = [0, 48, 96, 168, 220, 256]
    for (const y of seams) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(128, y)
      ctx.stroke()
    }
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(42, 0)
    ctx.lineTo(42, 256)
    ctx.moveTo(96, 48)
    ctx.lineTo(96, 168)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(46, 52, 46, 40)
    ctx.fillRect(8, 176, 28, 36)
  }
  exterior = new THREE.CanvasTexture(canvas)
  exterior.colorSpace = THREE.SRGBColorSpace
  exterior.wrapS = THREE.RepeatWrapping
  exterior.wrapT = THREE.RepeatWrapping
  exterior.userData.keep = true
  return exterior
}

export function generateSpaceship(seed: string, role: ShipRole = 'hull', dressed = false): THREE.Group {
  const rand = mulberry(hash(seed || 'ship'))
  const options = optionsFor(role, rand)
  const palette = colorsFrom(rand)
  const group = new THREE.Group()
  group.name = `extruded-${role}`
  const positions: number[] = []
  const colors: number[] = []
  const bellPositions: number[] = []

  let ring = polygon(options.sides, options.radius, options.stretchX, options.stretchY, 0)
  const noseScale = 0.12 + rand() * 0.16
  const nose = extrude(ring, -(options.length * (0.35 + rand() * 0.9)), noseScale)
  stitch(nose, ring, positions, colors, palette.trim)
  cap(nose, positions, colors, palette.trim, true)

  const rings = [ring]
  let previous = options.radius
  for (let segment = 0; segment < options.segments; segment++) {
    const max = options.radius * (0.1029 * options.segments) + options.radius
    const min = options.radius * (0.0294 * options.segments) + options.radius * 0.45
    const nextRadius = min + rand() * (max - min)
    const scale = nextRadius / previous
    previous = nextRadius
    const lifted = extrude(ring, options.length, scale)
    const paint = segment % 2 === 0 ? palette.hull : palette.panel
    stitch(ring, lifted, positions, colors, paint)
    if (role === 'hull' || role === 'wing') detail(ring, lifted, rand, positions, colors, palette)
    rings.push(lifted)
    ring = lifted
  }
  cap(ring, positions, colors, palette.dark, false)
  bellMouth(ring, options.length, bellPositions)

  group.add(colored(positions, colors, hullMaterial(dressed)))
  if (role === 'engine' && bellPositions.length > 0) {
    const bell = new THREE.Mesh(geometry(bellPositions), ENGINE.clone())
    bell.castShadow = true
    group.add(bell)
  }
  center(group)
  return group
}

function optionsFor(role: ShipRole, rand: () => number): ShipOptions {
  if (role === 'hull') {
    const sides = [4, 6, 6, 8][Math.floor(rand() * 4)]
    return { sides, segments: 5 + Math.floor(rand() * 2), radius: 0.34, length: 0.62, stretchX: 0.7 + rand() * 0.55, stretchY: 0.38 + rand() * 0.28 }
  }
  if (role === 'engine') return { sides: 6, segments: 2, radius: 0.16, length: 0.22, stretchX: 1, stretchY: 1 }
  if (role === 'wing') return { sides: 4, segments: 2, radius: 0.22, length: 0.18, stretchX: 1.8, stretchY: 0.18 }
  if (role === 'tank') return { sides: 8, segments: 2, radius: 0.2, length: 0.28, stretchX: 1, stretchY: 1 }
  if (role === 'mast') return { sides: 4, segments: 3, radius: 0.05, length: 0.22, stretchX: 1, stretchY: 1 }
  if (role === 'collar') return { sides: 6, segments: 1, radius: 0.28, length: 0.12, stretchX: 1.1, stretchY: 0.7 }
  return { sides: 5, segments: 2, radius: 0.12, length: 0.16, stretchX: 1, stretchY: 0.8 }
}

function colorsFrom(rand: () => number): { hull: RGB; panel: RGB; trim: RGB; dark: RGB } {
  const lift = rand() * 0.06
  return {
    hull: [0.73 + lift, 0.75 + lift, 0.79 + lift],
    panel: [0.86, 0.87, 0.9],
    trim: [0.33, 0.37, 0.43],
    dark: [0.16, 0.18, 0.2],
  }
}

function polygon(sides: number, radius: number, stretchX: number, stretchY: number, z: number): Ring {
  const ring: Ring = []
  const start = Math.PI / sides
  const step = (Math.PI * 2) / sides
  for (let i = 1; i <= sides; i++) {
    const angle = start + step * -i
    ring.push(new THREE.Vector3(Math.cos(angle) * radius * stretchX, Math.sin(angle) * radius * stretchY, z))
  }
  return ring
}

function extrude(ring: Ring, distance: number, scale: number): Ring {
  const origin = centroid(ring)
  return ring.map((point) => new THREE.Vector3(
    origin.x + (point.x - origin.x) * scale,
    origin.y + (point.y - origin.y) * scale,
    point.z + distance,
  ))
}

function stitch(back: Ring, front: Ring, positions: number[], colors: number[], color: RGB): void {
  const count = back.length
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count
    quad(positions, colors, front[i], back[i], back[j], front[j], color)
  }
}

function cap(ring: Ring, positions: number[], colors: number[], color: RGB, inward: boolean): void {
  const mid = centroid(ring)
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length
    if (inward) tri(positions, colors, mid, ring[j], ring[i], color)
    else tri(positions, colors, mid, ring[i], ring[j], color)
  }
}

function detail(back: Ring, front: Ring, rand: () => number, positions: number[], colors: number[], palette: { trim: RGB; dark: RGB }): void {
  const count = back.length
  const pairs = Math.floor(count / 2)
  for (let pair = 0; pair < pairs; pair++) {
    const roll = rand()
    if (roll > 0.62) continue
    const depth = roll < 0.28 ? 0.28 : 0.12
    const scale = roll < 0.28 ? 0.72 : 0.84
    for (const index of [pair, pair + pairs]) {
      if (index >= count) continue
      const next = (index + 1) % count
      const face = [back[index], back[next], front[next], front[index]]
      const mid = centroid(face)
      const n = faceNormal(face[0], face[1], face[2])
      const pushed = face.map((point) => point.clone().lerp(mid, 1 - scale).addScaledVector(n, depth))
      const paint = roll < 0.28 ? palette.trim : palette.dark
      quad(positions, colors, face[0], face[1], pushed[1], pushed[0], paint)
      quad(positions, colors, face[1], face[2], pushed[2], pushed[1], paint)
      quad(positions, colors, face[2], face[3], pushed[3], pushed[2], paint)
      quad(positions, colors, face[3], face[0], pushed[0], pushed[3], paint)
      quad(positions, colors, pushed[0], pushed[1], pushed[2], pushed[3], paint)
    }
  }
}

function bellMouth(ring: Ring, length: number, positions: number[]): void {
  const mid = centroid(ring)
  const inset = ring.map((point) => point.clone().lerp(mid, 0.28))
  const sunk = inset.map((point) => point.clone().add(new THREE.Vector3(0, 0, length * 0.45)))
  const count = ring.length
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count
    triRaw(positions, ring[i], inset[i], inset[j])
    triRaw(positions, ring[i], inset[j], ring[j])
    triRaw(positions, inset[i], sunk[i], sunk[j])
    triRaw(positions, inset[i], sunk[j], inset[j])
  }
  const pit = centroid(sunk)
  for (let i = 0; i < count; i++) triRaw(positions, pit, sunk[(i + 1) % count], sunk[i])
}

function colored(positions: number[], colors: number[], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry(positions, colors), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function geometry(positions: number[], colors?: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const uvs = new Float32Array((positions.length / 3) * 2)
  const edgeA = new THREE.Vector3()
  const edgeB = new THREE.Vector3()
  const normal = new THREE.Vector3()
  for (let i = 0; i < positions.length; i += 9) {
    edgeA.set(positions[i + 3] - positions[i], positions[i + 4] - positions[i + 1], positions[i + 5] - positions[i + 2])
    edgeB.set(positions[i + 6] - positions[i], positions[i + 7] - positions[i + 1], positions[i + 8] - positions[i + 2])
    normal.crossVectors(edgeA, edgeB)
    const ax = Math.abs(normal.x)
    const ay = Math.abs(normal.y)
    const az = Math.abs(normal.z)
    const axis = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2
    for (let k = 0; k < 3; k++) {
      const x = positions[i + k * 3]
      const y = positions[i + k * 3 + 1]
      const z = positions[i + k * 3 + 2]
      const u = axis === 0 ? z : x
      const v = axis === 1 ? z : y
      uvs[(i / 3 + k) * 2] = u * 4.2
      uvs[(i / 3 + k) * 2 + 1] = v * 4.2
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()
  return geo
}

function center(group: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(group)
  const mid = box.getCenter(new THREE.Vector3())
  group.position.sub(mid)
}

function quad(positions: number[], colors: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: RGB): void {
  tri(positions, colors, a, b, c, color)
  tri(positions, colors, a, c, d, color)
}

function tri(positions: number[], colors: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: RGB): void {
  for (const point of [a, b, c]) {
    positions.push(point.x, point.y, point.z)
    colors.push(color[0], color[1], color[2])
  }
}

function triRaw(positions: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
  for (const point of [a, b, c]) positions.push(point.x, point.y, point.z)
}

function centroid(points: THREE.Vector3[]): THREE.Vector3 {
  const mid = new THREE.Vector3()
  for (const point of points) mid.add(point)
  return mid.multiplyScalar(1 / points.length)
}

function faceNormal(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
}

function hash(name: string): number {
  let h = 2166136261
  const text = name.trim().toLowerCase() || 'unnamed'
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry(seed: number): () => number {
  let a = seed || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
