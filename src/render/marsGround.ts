import * as THREE from 'three'
import { SITES, type SiteId } from '../voyage/mission/sites'
import { HAB_PADS, LANDING_SPOTS, RESOURCE_TARGET, RIDGE } from '../voyage/mission/settlement'
import { buildTerrainGeometry, createDetailTextures, createRockGeometry, createTerrain, type Terrain } from '../voyage/scene/terrain'

/** Jezero, Utopia, or Elysium — the same heightfield Mars 2100 walks on. */
export function marsProfile(siteId: string): SiteId {
  if (siteId === 'utopia') return 'utopia'
  if (siteId === 'gale' || siteId === 'valles' || siteId === 'elysium') return 'elysium'
  return 'jezero'
}

/** The divert ellipse. Our ship sets down here, beside the settlement, not on a habitat. */
export const MARS_LANDING: [number, number] = LANDING_SPOTS.divert

export const MARS_SUN = new THREE.Vector3(0.62, 0.52, 0.36).normalize()

const SOLAR_SLOTS: [number, number][] = [[20, -5], [20, 1.5], [20, 8], [26.5, -5], [26.5, 1.5]]
const FISSION: [number, number] = [-34, -28]
const CAMP: [number, number] = HAB_PADS.plain

export interface CampSolid {
  id: string
  x: number
  z: number
  radius: number
  height: number
}

export interface MarsGround {
  root: THREE.Group
  sky: THREE.Mesh
  height: (x: number, z: number) => number
  /** Height of the triangle under this point, so feet sit on the mesh you see. */
  stand: (x: number, z: number) => number
  /** Peach exponential haze. Call once when this ground owns the scene. */
  dress: (scene: THREE.Scene) => void
  /** Thinner while the ship is still high, so the ground stays readable from 10–20 km. */
  haze: (scene: THREE.Scene, altitude: number) => void
  follow: (camera: THREE.Camera) => void
  /** Only these modules are visible, and only these stop the crew. */
  setPieces: (ids: string[]) => void
  solid: () => CampSolid[]
  dispose: () => void
}

/** The far tile is built 12 m under the detail square. Lift it so both tiles are one surface. */
function seatFarFlush(geometry: THREE.BufferGeometry): void {
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i += 1) {
    const inside = Math.max(Math.abs(pos.getX(i)), Math.abs(pos.getZ(i))) < 168
    pos.setY(i, pos.getY(i) + (inside ? 11.96 : 0.31))
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
}

function padHeight(raw: (x: number, z: number) => number, x: number, z: number): number {
  const h = raw(x, z)
  const pad = raw(MARS_LANDING[0], MARS_LANDING[1])
  const d = Math.hypot(x - MARS_LANDING[0], z - MARS_LANDING[1])
  if (d >= 12) return h
  const t = 1 - d / 12
  const k = t * t * (3 - 2 * t)
  return h * (1 - k) + pad * k
}

interface RockInstance {
  x: number
  y: number
  z: number
  s: number
  sy: number
  ry: number
  rx: number
  shade: number
}

function scatterRocks(terrain: Terrain): RockInstance[][] {
  const { rockDensity, seed } = terrain.site.terrain
  let s = seed * 7919 + 17
  const rand = () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
  const variants: RockInstance[][] = [[], [], [], [], []]
  const keepClear = (x: number, z: number, scale: number) => {
    const zones: [number, number, number][] = [
      [...LANDING_SPOTS.divert, 5.5], [...HAB_PADS.plain, 11], [...HAB_PADS.outcrop, 10.5], [23, 1.5, 9.5],
      [...RESOURCE_TARGET, 3.5], [-34, -28, 4], [-8, -6, 4],
    ]
    return zones.some(([zx, zz, r]) => Math.hypot(x - zx, z - zz) < r + scale)
  }
  const place = (x: number, z: number, scale: number, flat = 0.75) => {
    if (keepClear(x, z, scale)) return
    if (scale > 0.45 && Math.hypot(x - 3, z + 3) < 24 && x > RIDGE.x + 4) return
    const slope = terrain.slope(x, z)
    variants[Math.floor(rand() * variants.length)].push({
      x, z, y: terrain.height(x, z) - scale * (0.18 + slope * 0.2), s: scale, sy: scale * (flat + rand() * 0.45),
      ry: rand() * Math.PI * 2, rx: (rand() - 0.5) * 0.4, shade: 0.72 + rand() * 0.38,
    })
  }
  for (let i = 0; i < 220 * rockDensity; i += 1) {
    const a = rand() * Math.PI * 2
    const r = 8 + Math.sqrt(rand()) * 380
    place(Math.cos(a) * r, Math.sin(a) * r, 0.06 + rand() ** 3 * 0.32, 0.55)
  }
  for (const crater of terrain.craters) {
    if (Math.hypot(crater.x, crater.z) > 260) continue
    const count = Math.round(crater.r * 2.2 * rockDensity)
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2
      const r = crater.r * (0.9 + rand() * 0.9)
      place(crater.x + Math.cos(a) * r, crater.z + Math.sin(a) * r, 0.2 + rand() ** 2 * crater.r * 0.09)
    }
  }
  for (let i = 0; i < 80 * rockDensity; i += 1) {
    const a = rand() * Math.PI * 2
    const r = 16 + rand() * 420
    place(Math.cos(a) * r, Math.sin(a) * r, 0.25 + rand() ** 3.2 * 1.6)
  }
  for (let i = 0; i < 46; i += 1) {
    const z = RIDGE.z0 + rand() * (RIDGE.z1 - RIDGE.z0)
    const x = RIDGE.x + (rand() - 0.5) * 6
    place(x, z, 0.5 + rand() ** 1.5 * 1.8, 0.9)
  }
  const hazardRocks = 10 + terrain.site.hazard * 9
  for (let i = 0; i < hazardRocks; i += 1) {
    const a = rand() * Math.PI * 2
    const r = 2.6 + rand() * 9
    const [hx, hz] = LANDING_SPOTS.direct
    const scale = 0.3 + rand() ** 2 * 1.1
    const x = hx + Math.cos(a) * r
    const z = hz + Math.sin(a) * r
    if (Math.hypot(x - RESOURCE_TARGET[0], z - RESOURCE_TARGET[1]) < 3) continue
    variants[i % variants.length].push({
      x, z, y: terrain.height(x, z) - scale * 0.2, s: scale, sy: scale * (0.7 + rand() * 0.4),
      ry: rand() * 6.28, rx: (rand() - 0.5) * 0.3, shade: 0.7 + rand() * 0.3,
    })
  }
  return variants
}

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_Position.z = gl_Position.w;
  }
`
const skyFragment = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uGround;
  uniform vec3 uSun;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.62, h));
    col = mix(uGround, col, smoothstep(-0.12, 0.0, h));
    float sunAmount = max(dot(dir, normalize(uSun)), 0.0);
    col += vec3(0.32, 0.26, 0.2) * pow(sunAmount, 6.0);
    col += vec3(0.55, 0.62, 0.7) * pow(sunAmount, 90.0) * 0.55;
    col += vec3(1.0, 0.97, 0.9) * smoothstep(0.9993, 0.9997, sunAmount);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

function marsSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHorizon: { value: new THREE.Color('#c9a68b') },
      uZenith: { value: new THREE.Color('#8a6a58') },
      uGround: { value: new THREE.Color('#9c7a64') },
      uSun: { value: MARS_SUN.clone() },
    },
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  mesh.name = 'mars-sky'
  return mesh
}

interface CampPiece {
  id: string
  x: number
  z: number
  radius: number
  height: number
  object: THREE.Object3D
}

let plateMap: THREE.CanvasTexture | null = null

/** Riveted, dusted plate. One map, tinted per module, so the camp is not flat colour. */
function plateTexture(): THREE.CanvasTexture {
  if (plateMap) return plateMap
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#e4e0d6'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = '#b7b1a4'
    ctx.lineWidth = 3
    for (let y = 0; y < size; y += 64) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(size, y)
      ctx.stroke()
    }
    for (let x = 0; x < size; x += 64) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, size)
      ctx.stroke()
    }
    ctx.fillStyle = '#9a9388'
    for (let y = 8; y < size; y += 64) {
      for (let x = 8; x < size; x += 64) ctx.fillRect(x, y, 4, 4)
    }
    ctx.fillStyle = 'rgba(120, 78, 52, 0.18)'
    for (let i = 0; i < 40; i += 1) {
      ctx.fillRect((i * 47) % size, (i * 29) % size, 18 + (i % 5) * 6, 2)
    }
  }
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 8
  plateMap = map
  return map
}

function colony(parent: THREE.Group, height: (x: number, z: number) => number): Map<string, CampPiece> {
  const pieces = new Map<string, CampPiece>()
  const hold = (id: string, mesh: THREE.Object3D, x: number, z: number, radius: number, tall = 1.4) => {
    mesh.visible = false
    mesh.position.set(x, height(x, z) + 0.08, z)
    parent.add(mesh)
    pieces.set(id, { id, x, z, radius, height: tall, object: mesh })
  }
  const skin = plateTexture()
  const hull = new THREE.MeshStandardMaterial({ map: skin, color: '#d7d2c6', metalness: 0.22, roughness: 0.62 })
  const metal = new THREE.MeshStandardMaterial({ map: skin, color: '#c5ccc8', metalness: 0.62, roughness: 0.38 })
  const pale = new THREE.MeshStandardMaterial({ map: skin, color: '#ddd6c8', metalness: 0.28, roughness: 0.5 })
  const cell = new THREE.MeshStandardMaterial({ map: skin, color: '#1d4e73', metalness: 0.55, roughness: 0.34, emissive: '#123044', emissiveIntensity: 0.28 })
  const rib = new THREE.MeshStandardMaterial({ map: skin, color: '#d5e2e4', metalness: 0.48, roughness: 0.36 })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d6e8e2', roughness: 0.12, metalness: 0.04, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
  const soil = new THREE.MeshStandardMaterial({ map: skin, color: '#a56d45', roughness: 0.96, metalness: 0.02 })
  const bag = new THREE.MeshStandardMaterial({ map: skin, color: '#b58968', roughness: 0.9 })
  const leaf = new THREE.MeshStandardMaterial({ map: skin, color: '#6f9a58', roughness: 0.82 })
  const tank = new THREE.MeshStandardMaterial({ map: skin, color: '#d9d6cc', metalness: 0.48, roughness: 0.4 })
  const fluid = new THREE.MeshStandardMaterial({ color: '#4ca8b0', emissive: '#1d6670', emissiveIntensity: 0.65, roughness: 0.3 })
  const box = new THREE.MeshStandardMaterial({ map: skin, color: '#cfc8ba', metalness: 0.32, roughness: 0.55 })
  const pack = new THREE.MeshStandardMaterial({ map: skin, color: '#9aa8ab', metalness: 0.5, roughness: 0.42 })
  const hab = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1, 2.5, 8, 24), hull)
  body.rotation.z = Math.PI / 2
  body.position.y = 1.15
  body.castShadow = true
  hab.add(body)
  for (const x of [-1.6, 1.6]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.01, 0.035, 8, 32), metal)
    ring.rotation.z = Math.PI / 2
    ring.position.set(x * 0.62, 1.15, 0)
    hab.add(ring)
  }
  const windowMat = new THREE.MeshStandardMaterial({ color: '#263d4a', metalness: 0.5, roughness: 0.3, emissive: '#ffd9a8', emissiveIntensity: 0.9 })
  for (const x of [-0.8, 0, 0.8]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.06), windowMat)
    win.position.set(x, 1.28, 0.93)
    hab.add(win)
  }
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 20), pale)
  hatch.rotation.z = Math.PI / 2
  hatch.position.set(2.35, 0.95, 0)
  hatch.castShadow = true
  hab.add(hatch)
  hold('habitat-plain', hab, CAMP[0], CAMP[1], 3.6, 2.4)
  hold('habitat-ridge', hab.clone(true), HAB_PADS.outcrop[0], HAB_PADS.outcrop[1], 3.6, 2.4)

  SOLAR_SLOTS.forEach(([sx, sz], index) => {
    const array = new THREE.Group()
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1, 12), metal)
    mast.position.y = 0.5
    mast.castShadow = true
    array.add(mast)
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 2.4), cell)
      wing.position.set(side, 1.02, 0)
      wing.rotation.x = 0.42
      wing.castShadow = true
      array.add(wing)
      for (let line = 0; line < 7; line += 1) {
        const ribMesh = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.01, 2.38), rib)
        ribMesh.position.set(side + (-0.81 + line * 0.27), 1.06, 0)
        ribMesh.rotation.x = 0.42
        array.add(ribMesh)
      }
    }
    hold(`solar-${index}`, array, sx, sz, 2.8, 1.15)
  })

  const life = new THREE.Group()
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.1, 1.18), box)
  cabinet.position.y = 0.58
  cabinet.castShadow = true
  life.add(cabinet)
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.92), new THREE.MeshStandardMaterial({ color: '#4d6870', metalness: 0.42, roughness: 0.43 }))
  vent.position.set(0.83, 0.58, 0)
  life.add(vent)
  for (const x of [-0.36, 0, 0.36]) {
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), new THREE.MeshBasicMaterial({ color: '#71e6b0' }))
    led.position.set(x, 0.7, 0.6)
    life.add(led)
  }
  hold('life', life, CAMP[0] - 5.8, CAMP[1] - 3.6, 1.9, 1.2)

  const water = new THREE.Group()
  for (const [x, z] of [[-0.55, 0], [0.55, -0.2]] as const) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 1.3, 24), tank)
    drum.position.set(x, 0.72, z)
    drum.castShadow = true
    water.add(drum)
    const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.06), fluid)
    gauge.position.set(x, 0.5, z + 0.42)
    water.add(gauge)
  }
  hold('water', water, CAMP[0] + 5.8, CAMP[1] - 3.4, 1.7, 1.4)

  const battery = new THREE.Group()
  for (let i = 0; i < 3; i += 1) {
    const cellBox = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.83, 0.76), pack)
    cellBox.position.set((i - 1) * 0.57, 0.43, 0)
    cellBox.castShadow = true
    battery.add(cellBox)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.03), new THREE.MeshBasicMaterial({ color: '#86d9df' }))
    bar.position.set((i - 1) * 0.57, 0.38, 0.39)
    battery.add(bar)
  }
  hold('battery', battery, CAMP[0] - 6.2, CAMP[1] + 3.6, 1.7, 1.05)

  const green = new THREE.Group()
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.55, 1.2, 36), glass)
  wall.position.y = 0.62
  green.add(wall)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass)
  dome.position.y = 1.22
  green.add(dome)
  for (const [x, z] of [[-0.6, 0], [0, 0.1], [0.6, 0], [-0.35, 0.65], [0.35, -0.6]] as const) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.72), soil)
    bed.position.set(x, 0.2, z)
    green.add(bed)
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), leaf)
    plant.position.set(x, 0.42, z)
    green.add(plant)
  }
  hold('greenhouse', green, CAMP[0] + 6.2, CAMP[1] + 5.2, 2.3, 1.9)

  const berm = new THREE.Group()
  for (let i = 0; i < 18; i += 1) {
    const t = THREE.MathUtils.degToRad(32 + (i / 17) * 296)
    const x = Math.cos(t) * 4.9
    const z = Math.sin(t) * 3.3
    const pile = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), soil)
    pile.scale.set(1.25, 0.85, 0.8)
    pile.position.set(x, 0.25, z)
    pile.castShadow = true
    berm.add(pile)
    const sack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.55), bag)
    sack.position.set(x, 0.98, z)
    sack.rotation.y = -Math.atan2(3.3 * Math.cos(t), -4.9 * Math.sin(t))
    berm.add(sack)
  }
  hold('berm', berm, CAMP[0], CAMP[1], 0, 1.1)

  const fission = new THREE.Group()
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 2.4, 20), pale)
  core.position.y = 1.2
  core.castShadow = true
  fission.add(core)
  const finMat = new THREE.MeshStandardMaterial({ color: '#5e6466', metalness: 0.5, roughness: 0.5 })
  for (let i = 0; i < 6; i += 1) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, 0.04), finMat)
    const a = (i * Math.PI) / 3
    fin.position.set(Math.cos(a) * 0.95, 2.4, Math.sin(a) * 0.95)
    fin.rotation.y = -a
    fission.add(fin)
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: '#9fe3b6' }))
  beacon.position.y = 3.7
  fission.add(beacon)
  hold('fission', fission, FISSION[0], FISSION[1], 2.4, 2.8)

  const mark = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.3, 48),
    new THREE.MeshBasicMaterial({ color: '#e8c48f', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  )
  mark.rotation.x = -Math.PI / 2
  mark.position.y = 0.06
  hold('marker', mark, RESOURCE_TARGET[0], RESOURCE_TARGET[1], 0, 0.2)
  return pieces
}

/**
 * Mars 2100 ground, exactly: the site heightfield, Mastcam vertex colours, grain,
 * the rock scatter, the peach sky, and the built settlement. Our ship is not part of this.
 */
export function buildMarsGround(siteId: string, drop = false): MarsGround {
  const id = marsProfile(siteId)
  const site = SITES.find((row) => row.id === id) ?? SITES[0]
  const terrain = createTerrain(site)
  const raw = (x: number, z: number) => terrain.height(x, z)
  const height = (x: number, z: number) => padHeight(raw, x, z)
  const root = new THREE.Group()
  root.name = 'mars-ground'
  const detail = createDetailTextures()
  const nearGeo = buildTerrainGeometry(terrain, 336, drop ? 96 : 120, false)
  const farGeo = buildTerrainGeometry(terrain, drop ? 2800 : 1400, drop ? 48 : 40, true)
  seatFarFlush(farGeo)
  const nearMap = detail.colorMap.clone()
  nearMap.repeat.set(36, 36)
  const nearNormal = detail.normalMap.clone()
  nearNormal.repeat.set(36, 36)
  const farMap = detail.colorMap.clone()
  farMap.repeat.set(48, 48)
  const farNormal = detail.normalMap.clone()
  farNormal.repeat.set(48, 48)
  const nearMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: nearMap,
    normalMap: nearNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.97,
    metalness: 0,
  })
  const farMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: farMap,
    normalMap: farNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.97,
    metalness: 0,
  })
  const near = new THREE.Mesh(nearGeo, nearMat)
  near.name = 'mars-skin'
  const far = new THREE.Mesh(farGeo, farMat)
  far.name = 'mars-skin'
  root.add(near, far)
  if (drop) {
    const skirt = new THREE.Mesh(
      new THREE.CircleGeometry(9000, 32),
      new THREE.MeshStandardMaterial({ color: 0x8d6248, roughness: 1, metalness: 0 }),
    )
    skirt.rotation.x = -Math.PI / 2
    skirt.position.y = height(0, 0) - 1.5
    skirt.name = 'mars-skirt'
    root.add(skirt)
  }
  const groundRay = new THREE.Raycaster()
  const groundDown = new THREE.Vector3(0, -1, 0)
  const standCache = new Map<number, number>()
  const stand = (x: number, z: number) => {
    const key = (Math.round(x * 4) + 50000) * 100000 + (Math.round(z * 4) + 50000)
    const cached = standCache.get(key)
    if (cached !== undefined) return cached
    let y = height(x, z)
    if (Math.max(Math.abs(x), Math.abs(z)) < 165) {
      groundRay.set(new THREE.Vector3(x, 400, z), groundDown)
      groundRay.far = 800
      const hit = groundRay.intersectObject(near, false)[0]
      if (hit) y = hit.point.y
    }
    y += 0.05
    if (standCache.size > 2800) standCache.clear()
    standCache.set(key, y)
    return y
  }

  const geometries = [3, 7, 11, 19, 23].map((seed, i) => createRockGeometry(seed, i < 2 ? 2 : 1))
  const lists = scatterRocks(terrain)
  const rockMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.94, metalness: 0 })
  const rockMeshes: THREE.InstancedMesh[] = []
  const dark = new THREE.Color('#4d3d34')
  const base = new THREE.Color('#7c6352')
  const color = new THREE.Color()
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler()
  lists.forEach((list, variant) => {
    if (list.length === 0) return
    const mesh = new THREE.InstancedMesh(geometries[variant], rockMat, list.length)
    list.forEach((rock, i) => {
      euler.set(rock.rx, rock.ry, rock.rx * 0.6)
      quaternion.setFromEuler(euler)
      matrix.compose(
        new THREE.Vector3(rock.x, rock.y, rock.z),
        quaternion,
        new THREE.Vector3(rock.s, rock.sy, rock.s * (0.8 + (i % 5) * 0.08)),
      )
      mesh.setMatrixAt(i, matrix)
      color.copy(dark).lerp(base, rock.shade - 0.45).multiplyScalar(rock.shade + 0.25)
      mesh.setColorAt(i, color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    root.add(mesh)
    rockMeshes.push(mesh)
  })
  const pieces = drop ? new Map<string, CampPiece>() : colony(root, raw)
  if (!drop) {
    root.updateWorldMatrix(true, true)
    for (const piece of pieces.values()) piece.object.position.set(piece.x, stand(piece.x, piece.z) + 0.04, piece.z)
  }
  const cableMat = new THREE.MeshStandardMaterial({ color: '#2f2a27', roughness: 0.8 })
  const cables: THREE.Mesh[] = []
  const sky = marsSky()
  const fog = new THREE.FogExp2(0xb8957c, 0.0042)
  const setPieces = (ids: string[]) => {
    const want = new Set(ids)
    const hab = want.has('habitat-ridge') ? HAB_PADS.outcrop : want.has('habitat-plain') ? CAMP : null
    const offsets: Record<string, [number, number]> = {
      life: [-5.8, -3.6],
      water: [5.8, -3.4],
      battery: [-6.2, 3.6],
      greenhouse: [6.2, 5.2],
      berm: [0, 0],
    }
    if (hab) {
      for (const [id, off] of Object.entries(offsets)) {
        const piece = pieces.get(id)
        if (!piece) continue
        piece.x = hab[0] + off[0]
        piece.z = hab[1] + off[1]
        piece.object.position.set(piece.x, stand(piece.x, piece.z) + 0.04, piece.z)
      }
    }
    for (const piece of pieces.values()) {
      if (piece.id === 'greenhouse') {
        const hybrid = want.has('greenhouse-hybrid')
        piece.object.visible = want.has('greenhouse') || hybrid
        piece.object.scale.setScalar(hybrid && !want.has('greenhouse') ? 0.72 : 1)
        continue
      }
      piece.object.visible = want.has(piece.id)
    }
    if (want.has('habitat-ridge')) {
      const plain = pieces.get('habitat-plain')
      if (plain) plain.object.visible = false
    }
    for (const cable of cables) {
      cable.removeFromParent()
      cable.geometry.dispose()
    }
    cables.length = 0
    if (!hab) return
    for (const piece of pieces.values()) {
      if (!piece.id.startsWith('solar-') || !piece.object.visible) continue
      const steps = 8
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= steps; i += 1) {
        const f = i / steps
        const x = piece.x + (hab[0] - piece.x) * f + Math.sin(f * Math.PI) * 0.6
        const z = piece.z + (hab[1] - piece.z) * f
        points.push(new THREE.Vector3(x, stand(x, z) + 0.14, z))
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps * 2, 0.045, 5, false), cableMat)
      root.add(tube)
      cables.push(tube)
    }
    for (const piece of pieces.values()) {
      if (!piece.object.visible) continue
      piece.object.position.y = stand(piece.x, piece.z) + 0.04
    }
  }
  return {
    root,
    sky,
    height,
    stand,
    dress: (scene) => {
      scene.fog = fog
      scene.background = new THREE.Color('#8a6a58')
    },
    haze: (scene, altitude) => {
      if (scene.fog !== fog) scene.fog = fog
      if (altitude < 80) fog.density = 0.0042 + (0.0008 - 0.0042) * (altitude / 80)
      else if (altitude < 900) fog.density = 0.0008 + (0.00034 - 0.0008) * ((altitude - 80) / 820)
      else fog.density = 0.00034
    },
    follow: (camera) => {
      sky.position.copy(camera.position)
    },
    setPieces,
    solid: () => [...pieces.values()].filter((piece) => piece.object.visible && piece.radius > 0).map((piece) => ({
      id: piece.id, x: piece.x, z: piece.z, radius: piece.radius, height: piece.height,
    })),
    dispose: () => {
      nearGeo.dispose()
      farGeo.dispose()
      nearMat.dispose()
      farMat.dispose()
      nearMap.dispose()
      nearNormal.dispose()
      farMap.dispose()
      farNormal.dispose()
      detail.colorMap.dispose()
      detail.normalMap.dispose()
      geometries.forEach((geo) => geo.dispose())
      rockMat.dispose()
      rockMeshes.forEach((mesh) => mesh.dispose())
      sky.geometry.dispose()
      ;(sky.material as THREE.Material).dispose()
      cableMat.dispose()
      cables.forEach((cable) => cable.geometry.dispose())
    },
  }
}
