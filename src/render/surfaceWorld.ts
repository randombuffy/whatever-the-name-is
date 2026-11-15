import * as THREE from 'three'
import type { FieldSample, SampleKind } from '../domain/campaign'
import { contactBytes, kindFor, observe, returnedBits, returnedScience, sendChosen, type Observation } from '../domain/evidence'
import { fieldSol } from '../domain/fieldEvents'
import type { FieldSave } from '../domain/save'
import { stepDrive, surfaceHeight, type DriveState } from '../domain/surface'
import type { SpacecraftConfig } from '../domain/types'
import { disposeCraft } from './craft'
import { attachOrbiter } from './launchStack'
import { bakeHeightsRay, flattenPad, heightFromGrid, landUrl, loadTerrain, type HeightGrid } from './landform'
import { buildMarsGround, MARS_LANDING, MARS_SUN, type MarsGround } from './marsGround'
import { bindWalkAstronaut, type WalkAstronaut } from './walkAstronaut'
import { fitModel, modelLoader } from './gltf'
import { trackMove } from '../input/moveKeys'
import { viewRatio } from './pixels'

export type SurfaceCam = 'chase' | 'mast' | 'overhead'
export type SurfaceMode = 'drive' | 'eva' | 'scout'
export type WeatherSim = 'auto' | 'clear' | 'dust' | 'flare' | 'blackout'

export interface SurfaceSetup {
  missionId: string
  siteId: string
  difficulty: number
  gravity: number
  air: boolean
  steady: boolean
  roverMassKg: number | null
  heli: boolean
  craft: SpacecraftConfig
  samples: FieldSample[]
  instruments: string[]
  storageBits: number
  uplinkBps: number
  objectiveId: string
  damaged: boolean
  entryFault: boolean
  resume?: FieldSave
}

export interface SurfaceHint {
  name: string
  nx: number
  ny: number
  onScreen: boolean
}

export interface SurfaceReadout {
  speed: number
  slopeDeg: number
  energy: number
  oxygen: number
  sol: number
  held: number
  sent: number
  found: number
  total: number
  link: boolean
  label: string
  zoom: number
  cue: string
  toast: string
  dust: number
  mode: SurfaceMode
  parked: boolean
  assist: boolean
  cam: SurfaceCam
  prompt: string
  target: string
  hasRover: boolean
  hasHeli: boolean
  wheels: number
  crisis: '' | 'power' | 'comm'
  lost: boolean
  sky: string
  weather: WeatherSim
  hint: SurfaceHint | null
}

const CHUNK = 36
const SEG = 16
const loader = modelLoader()
const RUIN_URL: Record<SampleKind, string> = {
  core: '/3d/r1.glb',
  crystal: '/3d/r2.glb',
  dust: '/3d/r3.glb',
  ice: '/3d/r4.glb',
  metal: '/3d/r5.glb',
}
const ruinCache = new Map<string, THREE.Group>()

interface Rock {
  x: number
  z: number
  r: number
}

interface Palette {
  skyTop: number
  skyHorizon: number
  fog: number
  low: number
  high: number
  dust: number
  rock: number
}

function palette(missionId: string): Palette {
  if (missionId === 'lunar') return { skyTop: 0x020308, skyHorizon: 0x07080e, fog: 0x07080e, low: 0x6e6a64, high: 0x9a968e, dust: 0xb7b4ae, rock: 0x5c5954 }
  if (missionId === 'europa') return { skyTop: 0x03060c, skyHorizon: 0x101820, fog: 0x101820, low: 0xc5d0d6, high: 0xeef3f6, dust: 0xd5dee4, rock: 0x8e9aa3 }
  if (missionId === 'asteroid') return { skyTop: 0x010102, skyHorizon: 0x050504, fog: 0x050504, low: 0x4a453f, high: 0x6e655c, dust: 0x6e655c, rock: 0x3a3632 }
  return { skyTop: 0x3a241c, skyHorizon: 0xc47a55, fog: 0xc47a55, low: 0x7a3e2a, high: 0xc4a48a, dust: 0xc47a55, rock: 0x5c4036 }
}

function shade(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return n - Math.floor(n)
}

export class SurfaceWorld {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(62, 1, 0.12, 2800)
  private canvas: HTMLCanvasElement
  private setup: SurfaceSetup
  private colors: Palette
  private chunkRoot = new THREE.Group()
  private chunkKey = ''
  private geos: THREE.BufferGeometry[] = []
  private groundMat: THREE.MeshStandardMaterial
  private rocks: Rock[] = []
  private rockMat: THREE.MeshStandardMaterial | null = null
  private markers: THREE.Object3D[] = []
  private lander: THREE.Group
  private rover = new THREE.Group()
  private suit = new THREE.Group()
  private heli = new THREE.Group()
  private sky: THREE.Mesh
  private dust: THREE.Points
  private dustMat: THREE.PointsMaterial
  private stormDust: THREE.Points
  private stormDustMat: THREE.PointsMaterial
  private blob: THREE.Mesh
  private route: THREE.Line
  private sun: THREE.DirectionalLight
  private fill!: THREE.AmbientLight
  private hemi!: THREE.HemisphereLight
  private sunTarget = new THREE.Object3D()
  private drive: DriveState = { x: 8, z: 5, yaw: 0.4, speed: 0 }
  private foot = { x: 5.2, z: 3.8 }
  private boarded = false
  private heliAt = { x: 7, z: 5 }
  private rockMesh: THREE.InstancedMesh | null = null
  private mode: SurfaceMode
  private cam: SurfaceCam = 'chase'
  private parked = false
  private assist = false
  private routeIndex = 0
  private found = new Set<string>()
  private notes: Observation[] = []
  private pick = 0
  private fov = 62
  private cue = ''
  private cueFor = 0
  private toast = ''
  private toastFor = 0
  private notice = ''
  private noticeFor = 0
  private energy = 100
  private wheels = 100
  private crisis: '' | 'power' | 'comm' = ''
  private lost = false
  private linkForce = false
  private commSol = -1
  private oxygen = 100
  private sol = 1
  private lookYaw = 0.4
  private orbitYaw = 0
  private lookPitch = -0.18
  private gap = 9
  private keys = new Set<string>()
  private locked = false
  private arm: THREE.Object3D | null = null
  private armBase = 0
  private mastHead: THREE.Object3D | null = null
  private mastBase = 0
  private armT = 0
  private bump = 0
  private bob = 0
  private walk = 0
  private intro = 0
  private introDone = false
  private hop = 0
  private hopV = 0
  private odometer = 0
  private dead = false
  private cargo = 8
  private globeR = 0
  private clock = 0
  private weatherSim: WeatherSim = 'auto'
  private hintDue = 8
  private hintOn = false
  private hintArrow!: THREE.Group
  private readonly hintNdc = new THREE.Vector3()
  private readonly pathPts = Array.from({ length: 13 }, () => new THREE.Vector3())
  private readonly up = new THREE.Vector3()
  private readonly fwd = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly ahead = new THREE.Vector3()
  private readonly basis = new THREE.Matrix4()

  constructor(canvas: HTMLCanvasElement, setup: SurfaceSetup) {
    this.canvas = canvas
    this.setup = setup
    this.colors = palette(setup.missionId)
    this.mode = 'eva'
    const saved = setup.resume
    if (saved) {
      this.drive = { x: saved.x, z: saved.z, yaw: saved.yaw, speed: saved.speed }
      this.foot = { x: saved.footX, z: saved.footZ }
      this.lookYaw = saved.lookYaw
      this.sol = saved.sol
      this.energy = saved.energy
      this.oxygen = saved.oxygen
      this.boarded = saved.boarded
      this.parked = saved.parked
      this.mode = saved.mode
      this.found = new Set(saved.found)
      this.notes = saved.notes
      this.introDone = true
      this.intro = 20
    }
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(viewRatio(true))
    this.renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const mars = setup.missionId === 'mars' || setup.missionId === 'custom'
    this.scene.background = new THREE.Color(mars ? 0x8a6a58 : this.colors.skyTop)
    this.scene.fog = mars
      ? new THREE.FogExp2(0xb8957c, 0.0042)
      : new THREE.Fog(this.colors.fog, setup.air ? 70 : 140, setup.air ? 640 : 1600)
    this.fill = new THREE.AmbientLight(mars ? 0xf7e6d4 : 0xfff2e0, mars ? 0.42 : 0.85)
    this.scene.add(this.fill)
    this.hemi = new THREE.HemisphereLight(mars ? 0xf0d5bd : this.colors.skyHorizon, mars ? 0x6a4a38 : this.colors.low, mars ? 0.85 : 0.85)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(mars ? 0xfff4e6 : 0xfff1df, mars ? 3.55 : 2.9)
    if (mars) this.renderer.toneMappingExposure = 1.18
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 160
    this.sun.shadow.camera.left = -22
    this.sun.shadow.camera.right = 22
    this.sun.shadow.camera.top = 22
    this.sun.shadow.camera.bottom = -22
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.035
    this.scene.add(this.sun, this.sunTarget)
    this.sun.target = this.sunTarget
    this.sky = this.makeSky()
    this.scene.add(this.sky)
    if (!setup.air) this.sky.add(this.makeStars())
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true })
    this.scene.add(this.chunkRoot)
    this.dust = this.makeDust()
    this.dustMat = this.dust.material as THREE.PointsMaterial
    this.stormDust = this.makeStormDust()
    this.stormDustMat = this.stormDust.material as THREE.PointsMaterial
    this.scene.add(this.dust, this.stormDust)
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 22),
      new THREE.MeshBasicMaterial({ color: 0x1a100c, transparent: true, opacity: 0.58, depthWrite: false }),
    )
    this.blob.rotation.x = -Math.PI / 2
    this.blob.renderOrder = 1
    this.scene.add(this.blob)
    this.route = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(this.pathPts),
      new THREE.LineBasicMaterial({ color: 0xffe14a }),
    )
    this.route.frustumCulled = false
    this.scene.add(this.route)
    this.hintArrow = this.makeHintArrow()
    this.globeR = 0
    this.lander = new THREE.Group()
    this.scene.add(this.lander)
    attachOrbiter(this.lander, 5.2, true, undefined, setup.craft, setup.missionId)
    this.lander.traverse((obj) => {
      if (obj.userData.nozzle || /plume|flame/i.test(obj.name)) obj.visible = false
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    this.scene.add(this.rover, this.suit, this.heli)
    if (setup.roverMassKg !== null) this.loadRover()
    this.loadSuit()
    if (setup.heli && setup.air) this.loadHeli()
    this.heli.visible = setup.heli && setup.air
    this.rover.visible = setup.roverMassKg !== null
    if (mars) {
      this.chunkRoot.visible = false
      this.sky.visible = false
      this.marsGround = buildMarsGround(setup.siteId)
      this.scene.add(this.marsGround.root, this.marsGround.sky)
      this.marsGround.dress(this.scene)
      const [lx, lz] = MARS_LANDING
      if (!saved) {
        this.drive = { x: lx + 6.2, z: lz + 5.4, yaw: 0.6, speed: 0 }
        this.foot = { x: lx + 8.4, z: lz + 2.4 }
        this.lookYaw = Math.atan2(lx - this.foot.x, lz - this.foot.z)
        this.heliAt = { x: lx + 11, z: lz - 6 }
      }
      this.marsGround.setPieces([])
      this.seat(this.lander, lx, lz)
      this.seat(this.rover, this.drive.x, this.drive.z)
      this.seat(this.heli, this.heliAt.x, this.heliAt.z)
      this.layoutField()
    } else {
    const terrainUrl = landUrl(setup.missionId)
    if (terrainUrl) {
      this.chunkRoot.visible = false
      loadTerrain(terrainUrl, 1400, this.scene, (mesh) => {
        if (this.dead) return
        this.groundMesh = mesh
        this.heightGrid = bakeHeightsRay(mesh, 680, 72)
        flattenPad(this.heightGrid, 14)
        this.seat(this.lander, 0, 0)
        this.seat(this.rover, this.drive.x, this.drive.z)
        this.seat(this.heli, 7, 5)
        this.layoutField()
      }, setup.siteId, true)
    } else {
      this.chunkRoot.visible = true
      this.layoutField()
    }
    }
    canvas.addEventListener('click', this.onClick)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    document.addEventListener('pointerlockchange', this.onLock)
    window.addEventListener('mousemove', this.onMove)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
  }

  resize(): void {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  chooseCrisis(choice: 'sleep' | 'push' | 'wait' | 'blast'): string {
    if (this.crisis === 'power' && choice === 'sleep') {
      this.energy = Math.max(this.energy, 32)
      this.crisis = ''
      this.say('Deep sleep. Only the heaters stay on. The sol waits.')
      return 'sleep'
    }
    if (this.crisis === 'power' && choice === 'push') {
      this.energy = 0
      this.lost = true
      this.crisis = ''
      this.say('Kept driving. The rover died in the cold.')
      return 'dead'
    }
    if (this.crisis === 'comm' && choice === 'wait') {
      this.crisis = ''
      this.linkForce = true
      this.say('Waiting for the orbiter. The pass takes the recorder.')
      return 'relay'
    }
    if (this.crisis === 'comm' && choice === 'blast') {
      this.energy = Math.max(0, this.energy - 20)
      this.crisis = ''
      this.say('The hill ate the signal. A fifth of the battery is gone and nothing was sent.')
      return 'miss'
    }
    return ''
  }

  cycleCam(): void {
    this.cam = this.cam === 'chase' ? 'mast' : this.cam === 'mast' ? 'overhead' : 'chase'
  }

  setWeather(kind: WeatherSim): void {
    this.weatherSim = kind
    if (kind === 'dust') {
      this.ping('storm')
      this.say('Regional dust storm. Visibility gone. Walk and drive crawl.')
    } else if (kind === 'flare') {
      this.ping('storm')
      this.say('Solar particle event. Seek the lander. Movement is cautious.')
    } else if (kind === 'blackout') {
      this.say('Relay blackout. No line to Earth until the orbiter returns.')
    } else if (kind === 'clear') {
      this.say('Skies forced clear.')
    } else {
      this.say('Weather follows the sol clock.')
    }
  }

  togglePark(): void {
    if (this.mode !== 'drive') return
    this.parked = !this.parked
  }

  toggleAssist(): void {
    if (this.mode !== 'drive') return
    this.assist = !this.assist
  }

  setCamp(ids: string[]): void {
    this.marsGround?.setPieces(ids)
  }

  snapshot(): FieldSave {
    return {
      x: this.drive.x,
      z: this.drive.z,
      yaw: this.drive.yaw,
      speed: this.drive.speed,
      footX: this.foot.x,
      footZ: this.foot.z,
      lookYaw: this.lookYaw,
      sol: this.sol,
      energy: this.energy,
      oxygen: this.oxygen,
      boarded: this.boarded,
      parked: this.parked,
      mode: this.mode,
      found: [...this.found],
      notes: this.notes.map((item) => ({ ...item })),
    }
  }

  cycleTarget(): void {
    const open = this.openSamples()
    if (open.length === 0) return
    this.routeIndex = (this.routeIndex + 1) % open.length
    this.assist = true
  }

  toggleEgress(): void {
    this.introDone = true
    this.hop = 0
    if (this.setup.roverMassKg === null) {
      this.mode = 'eva'
      this.say('On the ground. WASD to walk.')
      return
    }
    if (this.mode === 'drive') {
      this.drive.speed = 0
      this.parked = true
      this.foot.x = this.drive.x + Math.cos(this.drive.yaw) * 2.4
      this.foot.z = this.drive.z - Math.sin(this.drive.yaw) * 2.4
      this.lookYaw = this.drive.yaw
      this.orbitYaw = 0
      this.mode = 'eva'
      this.say('On the ground. WASD to walk.')
      return
    }
    if (this.mode === 'eva' && Math.hypot(this.foot.x - this.drive.x, this.foot.z - this.drive.z) < 5.5) {
      this.mode = 'drive'
      this.lookYaw = this.drive.yaw
      this.boarded = true
      this.parked = false
      if (this.setup.damaged) this.say('The gear is bent. The wheels drag.')
      else this.say('Rover. WASD to drive, F to get down.')
      return
    }
    this.say('Walk to the rover, then press F.')
  }

  toggleScout(): void {
    if (!this.setup.heli || !this.setup.air || this.energy <= 1) return
    if (this.mode === 'scout') {
      this.mode = this.boarded && this.setup.roverMassKg !== null ? 'drive' : 'eva'
      return
    }
    const face = this.mode === 'eva' ? this.lookYaw : this.drive.yaw
    const at = this.focus()
    this.lookYaw = face
    this.mode = 'scout'
    this.heliAt.x = at.x
    this.heliAt.z = at.z
  }

  sample(): void {
    const here = this.nearSample()
    if (!here) {
      this.say('Walk to a glowing marker and press E.')
      return
    }
    const cost = 4
    if (this.energy < cost) {
      this.say('Need more charge to sample.')
      return
    }
    const sky = this.condition()
    const obs = observe({
      id: `sample-${here.id}-${this.sol}`,
      kind: kindFor(this.setup.objectiveId, this.setup.instruments),
      name: here.name,
      x: here.x,
      z: here.z,
      sol: this.sol,
      objectiveId: this.setup.objectiveId,
      instruments: this.setup.instruments,
      basePoints: here.points,
      dust: sky.dust,
      fault: sky.fault,
      near: true,
      fov: this.fov,
    })
    if (!this.roomFor(obs.bytes)) {
      this.say('The recorder is full. Transmit first.')
      return
    }
    if (this.notes.some((item) => item.id === obs.id)) return
    this.energy -= cost
    this.notes.push(obs)
    this.found.add(here.id)
    const mark = this.markers.find((item) => item.userData.sample === here.id)
    if (mark) mark.visible = false
    this.armT = 1
    this.ping('sample')
    this.hintOn = false
    this.hintDue = this.clock + 8
    const left = this.openSamples().length
    if (left === 0) this.say(`Picked up ${obs.name}. All samples are in. Send each one, then File return.`)
    else this.say(`Picked up ${obs.name}. ${left} still out. Send when you can.`)
  }

  capture(): void {
    const at = this.focus()
    const near = this.nearSample()
    const name = near?.name ?? 'Context'
    const id = `image-${name}-${this.sol}`
    if (this.notes.some((item) => item.id === id)) return
    if (this.energy < 6) {
      this.say('Power')
      return
    }
    const sky = this.condition()
    const obs = observe({
      id,
      kind: 'image',
      name,
      x: at.x,
      z: at.z,
      sol: this.sol,
      objectiveId: this.setup.objectiveId,
      instruments: this.setup.instruments,
      basePoints: near ? near.points * 0.45 : 6,
      dust: sky.dust,
      fault: false,
      near: Boolean(near),
      fov: this.fov,
    })
    if (!this.roomFor(obs.bytes)) {
      this.say('The recorder is full. Transmit first.')
      return
    }
    this.energy -= 6
    this.notes.push(obs)
    this.ping('sample')
    this.say('Image stored.')
  }

  transmit(): void {
    const sky = this.condition()
    const room = contactBytes(this.setup.uplinkBps, sky.comms)
    const used = this.notes.filter((item) => item.sent && item.sol === this.sol).reduce((sum, item) => sum + item.bytes, 0)
    const result = sendChosen(this.notes, this.pick, Math.max(0, room - used), this.energy)
    this.notes = result.notes
    this.energy = result.energy
    if (result.reason === 'sent') {
      this.ping('send')
      const left = this.notes.filter((item) => !item.sent).length
      this.toast = left > 0 ? `Sent 1 sample · ${left} left` : 'Sent 1 sample · none left'
      this.toastFor = 2.4
      return
    }
    if (!sky.comms) {
      this.ping('blackout')
      this.say('No relay in view this sol.')
      return
    }
    this.say(result.reason === 'power' ? 'Need more charge to send.' : result.reason === 'empty' ? 'Nothing to send yet.' : 'Relay window too short.')
  }

  cycleHold(): void {
    const held = this.notes.filter((item) => !item.sent)
    if (held.length === 0) return
    this.pick = (this.pick + 1) % held.length
    this.say(held[this.pick].name)
  }

  report(): { points: number; note: string; bits: number } {
    const sent = this.notes.filter((item) => item.sent).length
    const held = this.notes.length - sent
    const sky = this.condition()
    return {
      points: Math.round(returnedScience(this.notes)),
      bits: returnedBits(this.notes),
      note: `${this.setup.siteId}: ${sent} findings returned, ${held} still in the recorder, sol ${this.sol}, ${sky.label}.`,
    }
  }

  /** Spend landed cargo on the outpost. Power, water, or a berm. The tanks are finite. */
  provision(kind: 'power' | 'water' | 'shelter'): void {
    if (this.cargo < 2) {
      this.say('Cargo is gone. Run the sols on what is already built.')
      return
    }
    this.cargo -= 2
    if (kind === 'power') {
      this.energy = Math.min(100, this.energy + 28)
      this.say(`Arrays online. Cargo ${this.cargo}.`)
    } else if (kind === 'water') {
      this.oxygen = Math.min(100, this.oxygen + 30)
      this.say(`Water loop closed. Cargo ${this.cargo}.`)
    } else {
      this.say(`Berm up around the habitat. Cargo ${this.cargo}.`)
    }
  }

  nextSol(): void {
    this.sol += 1
    const sky = this.condition()
    const gift = (this.setup.steady ? 58 : 46) * (1 - sky.dust)
    this.energy = Math.min(100, this.energy + gift)
    this.oxygen = 100
    if (sky.storm || sky.flare) this.ping('storm')
    this.say(sky.label)
  }

  step(dt: number): SurfaceReadout {
    const stepDt = Math.min(0.05, Math.max(0, dt))
    this.clock += stepDt
    if (!this.introDone) {
      this.intro += stepDt
      if (this.intro > 3.2 || this.keys.size > 0) this.introDone = true
    }
    if (this.mode === 'drive') this.driveRover(stepDt)
    else if (this.mode === 'eva') this.walkSuit(stepDt)
    else this.flyHeli(stepDt)
    this.power(stepDt)
    const focus = this.focus()
    this.syncChunks(focus.x, focus.z)
    this.poseVehicles(stepDt)
    this.poseDust(focus.x, focus.z, stepDt)
    this.poseRoute()
    this.tickHint()
    this.frame()
    if (this.marsGround) this.pinLander()
    if (this.marsGround) {
      this.marsGround.follow(this.camera)
      this.sun.position.set(focus.x + MARS_SUN.x * 80, MARS_SUN.y * 80, focus.z + MARS_SUN.z * 80)
    } else {
      this.sky.position.set(focus.x, 0, focus.z)
      this.sun.position.set(focus.x + 40, 48, focus.z + 18)
    }
    this.sunTarget.position.set(focus.x, this.heightAt(focus.x, focus.z), focus.z)
    this.sun.updateMatrixWorld()
    this.renderer.render(this.scene, this.camera)
    return this.readout()
  }

  dispose(): void {
    this.dead = true
    this.canvas.removeEventListener('click', this.onClick)
    this.canvas.removeEventListener('wheel', this.onWheel)
    document.removeEventListener('pointerlockchange', this.onLock)
    window.removeEventListener('mousemove', this.onMove)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    for (const geo of this.geos) geo.dispose()
    this.groundMat.dispose()
    this.rockMesh?.geometry.dispose()
    this.rockMat?.dispose()
    this.marsGround?.dispose()
    disposeCraft(this.lander)
    this.hintArrow.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((item) => item.dispose())
      else mat.dispose()
    })
    this.renderer.dispose()
  }

  private driveRover(dt: number): void {
    const grade = this.grade(this.drive.x, this.drive.z)
    const target = this.currentTarget()
    let throttle = this.keys.has('w') ? 1 : this.keys.has('s') ? -0.65 : 0
    let steer = this.keys.has('a') ? 1 : this.keys.has('d') ? -1 : 0
    if (this.assist && target && steer === 0 && throttle === 0) {
      const desired = Math.atan2(target.x - this.drive.x, target.z - this.drive.z)
      let diff = desired - this.drive.yaw
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      steer = Math.max(-1, Math.min(1, diff * 1.6))
      if (Math.hypot(target.x - this.drive.x, target.z - this.drive.z) > 3.2) throttle = 0.7
    }
    if (this.energy <= 0 || this.crisis || this.lost) throttle = 0
    throttle *= Math.max(0.25, this.wheels / 100)
    const sky = this.condition()
    if (sky.storm) throttle *= 0.18
    else if (sky.flare) throttle *= 0.62
    const mag = Math.hypot(grade.x, grade.z)
    const cap = 0.42
    const scale = mag > cap ? cap / mag : 1
    const next = stepDrive(this.drive, {
      throttle,
      steer,
      brake: this.keys.has(' '),
      park: this.parked,
      boost: this.keys.has('shift'),
      massKg: this.setup.roverMassKg ?? 80,
      gravity: this.setup.gravity,
      rough: 0.12 + this.setup.difficulty * 0.35 + (this.parked ? 0 : this.condition().wheel),
      gradX: grade.x * scale,
      gradZ: grade.z * scale,
    }, dt)
    this.odometer += Math.abs(next.speed) * dt
    this.drive = next
    this.drive.x = Math.max(-680, Math.min(680, this.drive.x))
    this.drive.z = Math.max(-680, Math.min(680, this.drive.z))
    if (this.bump > 0) this.bump = Math.max(0, this.bump - dt)
  }

  private walkSuit(dt: number): void {
    const forward = this.keys.has('w') ? 1 : this.keys.has('s') ? -1 : 0
    const strafe = this.keys.has('a') ? 1 : this.keys.has('d') ? -1 : 0
    const moving = forward !== 0 || strafe !== 0
    const gravity = Math.max(0.04, this.setup.gravity)
    const sky = this.condition()
    let pace = (this.oxygen > 8 ? 6.4 : 3.2) * Math.sqrt(gravity / 3.71)
    if (sky.storm) pace *= 0.16
    else if (sky.flare) pace *= 0.6
    const grade = this.grade(this.foot.x, this.foot.z)
    const slope = Math.hypot(grade.x, grade.z)
    const crawl = 1 - Math.min(0.32, slope * 0.4)
    const nx = this.foot.x + (Math.sin(this.lookYaw) * forward + Math.cos(this.lookYaw) * strafe) * pace * crawl * dt
    const nz = this.foot.z + (Math.cos(this.lookYaw) * forward - Math.sin(this.lookYaw) * strafe) * pace * crawl * dt
    const blocked = this.hits(nx, nz, 0.42, this.hop)
    const steep = this.hop < 0.28 && !this.climbOk(this.foot.x, this.foot.z, nx, nz, 2.6)
    const clear = !blocked && !steep
    if (clear) {
      this.foot.x = nx
      this.foot.z = nz
    }
    if (this.groundMesh) {
      this.foot.x = Math.max(-680, Math.min(680, this.foot.x))
      this.foot.z = Math.max(-680, Math.min(680, this.foot.z))
    }
    if (moving) this.walk += dt * (4.2 + gravity)
    else this.walk *= Math.max(0, 1 - dt * 4)
    if (this.keys.has(' ') && this.hop <= 0 && this.hopV <= 0 && !sky.storm) {
      const hang = Math.sqrt(2 * gravity * 2.4)
      this.hopV = Math.min(4.2, Math.max(hang, 2.1 * Math.sqrt(3.71 / gravity)))
    }
    this.hopV -= gravity * dt
    this.hop += this.hopV * dt
    if (this.hop <= 0) {
      this.hop = 0
      this.hopV = 0
    }
    const drain = moving ? 0.55 : 0.12
    this.oxygen = Math.max(0, this.oxygen - dt * drain)
    if (this.nearPad() || (this.setup.roverMassKg !== null && Math.hypot(this.foot.x - this.drive.x, this.foot.z - this.drive.z) < 3.5)) {
      this.oxygen = Math.min(100, this.oxygen + dt * 14)
    }
  }

  private flyHeli(dt: number): void {
    const forward = this.keys.has('w') ? 1 : this.keys.has('s') ? -0.6 : 0
    const steer = this.keys.has('a') ? 1 : this.keys.has('d') ? -1 : 0
    this.lookYaw += steer * dt * 0.8
    const sky = this.condition()
    const speed = this.energy > 0 ? (sky.storm ? 1.4 : sky.flare ? 4.2 : 7) : 0
    const nx = this.heliAt.x + Math.sin(this.lookYaw) * forward * speed * dt
    const nz = this.heliAt.z + Math.cos(this.lookYaw) * forward * speed * dt
    if (!this.hits(nx, nz, 0.4, 8)) {
      this.heliAt.x = nx
      this.heliAt.z = nz
    }
    this.energy = Math.max(0, this.energy - dt * 5)
    if (this.energy <= 0) this.mode = this.boarded && this.setup.roverMassKg !== null ? 'drive' : 'eva'
  }

  private power(dt: number): void {
    const sky = this.condition()
    const moving = this.mode === 'drive' ? Math.abs(this.drive.speed) : 0
    const draw = moving * (0.55 + (this.setup.roverMassKg ?? 40) / 220) * (sky.storm ? 1.8 : 1)
    this.energy -= dt * draw
    const sun = 1 - sky.dust
    const charging = this.mode !== 'scout' && (this.setup.steady || moving < 0.08)
    if (charging) this.energy += dt * (this.setup.steady ? 4.5 * Math.max(0.45, sun) : 3.2 * sun)
    if (this.setup.air && !this.setup.steady && this.crisis !== 'power') this.energy -= dt * 0.4
    this.energy = Math.max(0, Math.min(100, this.energy))
    if (this.setup.air && this.mode === 'drive' && !this.lost && !this.crisis && this.energy < 15 && this.energy > 0) {
      this.crisis = 'power'
      this.say('Battery under 15%. Dust and the night heaters. Push on and the rover freezes. Sleep and it lives.')
    }
    if (this.setup.air && !sky.comms && this.commSol !== this.sol && !this.crisis && !this.lost) {
      this.commSol = this.sol
      this.crisis = 'comm'
      this.linkForce = false
      this.say('No line to Earth. The relay orbiter is not overhead.')
    }
    if (this.cueFor > 0) this.cueFor = Math.max(0, this.cueFor - dt)
    else this.cue = ''
    if (this.toastFor > 0) this.toastFor = Math.max(0, this.toastFor - dt)
    else this.toast = ''
    if (this.noticeFor > 0) this.noticeFor = Math.max(0, this.noticeFor - dt)
    else this.notice = ''
    const fog = this.scene.fog
    if (fog instanceof THREE.FogExp2) {
      fog.density = sky.storm ? 0.028 : sky.flare ? 0.007 : 0.0042
      fog.color.set(sky.storm ? 0x8a5c48 : sky.flare ? 0xc48a62 : 0xb8957c)
    } else if (fog instanceof THREE.Fog) {
      fog.near = sky.storm ? 12 : this.setup.air ? 70 : 140
      fog.far = sky.storm ? 90 : this.setup.air ? 1800 : 1600
    }
    this.dustMat.opacity = sky.storm ? 0.72 : 0.12 + sky.dust * 0.22
    this.dustMat.size = sky.storm ? 0.14 : 0.05
    this.stormDust.visible = sky.storm || sky.flare
    this.stormDustMat.opacity = sky.storm ? 0.7 : sky.flare ? 0.28 : 0
    const mars = this.setup.missionId === 'mars' || this.setup.missionId === 'custom'
    if (mars) {
      this.sun.intensity = sky.storm ? 1.4 : sky.flare ? 5.2 : 4.4
      this.fill.intensity = sky.storm ? 0.38 : sky.flare ? 0.22 : 0.42
      this.hemi.intensity = sky.storm ? 0.7 : 0.85
      this.scene.background = new THREE.Color(sky.storm ? 0x6a4a3a : sky.flare ? 0xa86848 : 0x8a6a58)
    }
  }

  private poseVehicles(dt: number): void {
    const gy = this.heightAt(this.drive.x, this.drive.z)
    this.bob += (gy - this.bob) * 0.18
    const bounce = Math.sin(this.odometer * 4) * 0.02 * Math.min(1, Math.abs(this.drive.speed))
    this.rover.position.set(this.drive.x, this.bob + bounce + 0.06, this.drive.z)
    const grade = this.grade(this.drive.x, this.drive.z)
    this.up.copy(this.normalAt(this.drive.x, this.drive.z))
    const slope = new THREE.Vector3(-grade.x, 0, -grade.z)
    slope.addScaledVector(this.up, -slope.dot(this.up))
    this.up.addScaledVector(slope, 0.35).normalize()
    this.fwd.set(Math.sin(this.drive.yaw), 0, Math.cos(this.drive.yaw))
    this.right.crossVectors(this.up, this.fwd)
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0)
    this.right.normalize()
    this.ahead.crossVectors(this.right, this.up).normalize()
    this.basis.makeBasis(this.right, this.up, this.ahead)
    this.rover.quaternion.setFromRotationMatrix(this.basis)
    if (this.arm) this.arm.rotation.x = this.armBase + Math.sin(this.armT * Math.PI) * 0.65
    if (this.armT > 0) this.armT = Math.max(0, this.armT - 0.016)
    if (this.mastHead) this.mastHead.rotation.y = this.mastBase + (this.cam === 'mast' && this.mode === 'drive' ? this.orbitYaw : 0)
    const fy = this.heightAt(this.foot.x, this.foot.z)
    const up = this.normalAt(this.foot.x, this.foot.z)
    this.suit.position.set(this.foot.x, fy + 0.06, this.foot.z).addScaledVector(up, this.hop)
    const ahead = new THREE.Vector3(Math.sin(this.lookYaw), 0, Math.cos(this.lookYaw))
    ahead.addScaledVector(up, -ahead.dot(up))
    if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, 1)
    ahead.normalize()
    const right = new THREE.Vector3().crossVectors(up, ahead).normalize()
    this.basis.makeBasis(right, up, ahead)
    this.suit.quaternion.setFromRotationMatrix(this.basis)
    const sky = this.condition()
    if (sky.storm) this.suit.rotateZ(Math.sin(this.clock * 9.4) * 0.1)
    const climbing = false
    this.suit.visible = this.mode === 'eva'
    this.rover.visible = this.setup.roverMassKg !== null
    if (this.walkBody) {
      const moving = this.keys.has('w') || this.keys.has('s') || this.keys.has('a') || this.keys.has('d')
      this.walkBody.setClip(this.hop > 0.04 ? 'air' : climbing || moving ? 'walk' : 'idle')
      this.walkBody.tick(sky.storm ? dt * 0.42 : dt)
    }
    const homeY = this.heightAt(7, 5)
    if (this.mode === 'scout') {
      this.heli.position.set(this.heliAt.x, this.heightAt(this.heliAt.x, this.heliAt.z) + 7.5, this.heliAt.z)
      this.heli.rotation.y = this.lookYaw
    } else {
      this.heli.position.set(7, homeY, 5)
      this.heli.rotation.y = 0.4
    }
    const blobAt = this.mode === 'eva' ? this.foot : this.mode === 'scout' ? this.heliAt : this.drive
    const blobY = this.heightAt(blobAt.x, blobAt.z) + 0.04
    this.blob.position.set(blobAt.x, blobY, blobAt.z)
    const blobScale = this.mode === 'eva' ? (this.hop > 0.04 ? 0.35 : 1) : this.mode === 'drive' ? 1.65 : 0.9
    this.blob.scale.setScalar(blobScale)
    const blobMat = this.blob.material as THREE.MeshBasicMaterial
    blobMat.opacity = sky.storm ? 0.22 : this.mode === 'eva' ? 0.62 : 0.48
    this.blob.visible = this.mode !== 'scout'
  }

  private frame(): void {
    const focus = this.focus()
    const y = this.heightAt(focus.x, focus.z) + (this.mode === 'eva' ? this.hop : 0)
    const up = this.normalAt(focus.x, focus.z)
    this.camera.up.copy(up)
    if (this.cam === 'overhead') {
      this.camera.position.set(focus.x, y + 26, focus.z + 8)
      this.camera.lookAt(focus.x, y, focus.z)
    } else if (this.mode === 'scout') {
      this.camera.position.set(focus.x - Math.sin(this.lookYaw) * 6, y + 9, focus.z - Math.cos(this.lookYaw) * 6)
      this.camera.lookAt(focus.x, y + 7.5, focus.z)
    } else if (this.mode === 'eva' || this.cam === 'chase') {
      const yaw = this.mode === 'eva' ? this.lookYaw : this.drive.yaw
      const glance = this.mode === 'eva' ? 0 : this.orbitYaw
      const back = this.mode === 'eva' ? this.gap : this.gap + 2.2
      const lift = this.mode === 'eva' ? 1.7 + this.gap * 0.08 : 2.2 + this.gap * 0.06
      const eye = new THREE.Vector3(focus.x, y, focus.z)
      const backDir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
      backDir.addScaledVector(up, -backDir.dot(up)).normalize()
      this.camera.position.copy(eye).addScaledVector(up, lift).addScaledVector(backDir, back)
      const look = eye.clone().addScaledVector(up, 0.8 + this.lookPitch).addScaledVector(new THREE.Vector3(Math.sin(yaw + glance), 0, Math.cos(yaw + glance)), 4)
      this.camera.lookAt(look)
    } else {
      const yaw = this.drive.yaw + this.orbitYaw
      const eyeY = y + 2.05
      this.camera.position.set(focus.x + Math.sin(this.drive.yaw) * 0.35, eyeY, focus.z + Math.cos(this.drive.yaw) * 0.35)
      const lookDist = Math.cos(this.lookPitch)
      this.camera.lookAt(
        this.camera.position.x + Math.sin(yaw) * lookDist,
        eyeY + Math.sin(this.lookPitch),
        this.camera.position.z + Math.cos(yaw) * lookDist,
      )
    }
    if (this.condition().storm) {
      this.camera.position.x += Math.sin(this.clock * 21) * 0.11
      this.camera.position.y += Math.cos(this.clock * 17) * 0.07
    }
  }

  private readout(): SurfaceReadout {
    const focus = this.focus()
    const grade = this.grade(focus.x, focus.z)
    const slope = Math.atan(Math.hypot(grade.x, grade.z)) * 180 / Math.PI
    const near = this.nearSample()
    const target = this.currentTarget()
    const sky = this.condition()
    const walking = this.keys.has('w') || this.keys.has('a') || this.keys.has('s') || this.keys.has('d')
    let prompt = ''
    if (this.lost) prompt = 'The rover froze. The mission on the surface is over.'
    else if (this.crisis === 'power') prompt = 'Battery under 15%. Sleep, or push and lose the rover.'
    else if (this.crisis === 'comm') prompt = 'No relay. Wait for the orbiter, or burn power on a blind send.'
    else if (!this.introDone) prompt = this.setup.siteId === 'jezero'
      ? 'On Jezero crater. Five glowing markers. WASD walk, F rover, E sample.'
      : 'On the surface. Five glowing markers. WASD walk, F rover, E sample.'
    else if (this.notice) prompt = this.notice
    else if (sky.storm) prompt = 'Dust storm. Visibility gone. WASD crawls. Wait it out or reach the lander.'
    else if (sky.flare) prompt = 'Solar flare. Particle flux is high. Keep close to the lander.'
    else if (this.mode === 'drive' && this.energy <= 0) prompt = 'Batteries empty. Wait in the sun.'
    else if (this.mode === 'drive' && this.parked) prompt = 'Parked. WASD drive. F get down.'
    else if (this.mode === 'drive' && slope > 38 && Math.abs(this.drive.speed) < 0.12 && this.keys.has('w')) prompt = 'Grade too steep.'
    else if (this.mode === 'drive') prompt = 'WASD drive. F get down.'
    else if (this.mode === 'eva' && this.setup.roverMassKg !== null && Math.hypot(this.foot.x - this.drive.x, this.foot.z - this.drive.z) < 5.5) prompt = 'F — Board the rover'
    else if (this.mode === 'eva' && this.oxygen < 18) prompt = 'Air low. Walk back to the lander.'
    else if (this.bump > 0) prompt = 'Rock'
    else if (near) prompt = `E — Pick up ${near.name}`
    else if (sky.label !== 'Clear') prompt = sky.label
    else if (this.mode === 'eva') prompt = 'WASD walk. E sample. F rover.'
    const held = this.notes.filter((item) => !item.sent)
    const chosen = held.length > 0 ? held[Math.abs(this.pick) % held.length] : null
    return {
      speed: this.mode === 'drive' ? this.drive.speed : this.mode === 'scout' ? (sky.storm ? 1.4 : 7) : walking ? (sky.storm ? 1 : sky.flare ? 3.8 : 6.4) : 0,
      slopeDeg: slope,
      energy: this.energy,
      oxygen: this.oxygen,
      sol: this.sol,
      held: held.length,
      sent: this.notes.length - held.length,
      found: this.found.size,
      total: this.setup.samples.length,
      link: sky.comms || this.linkForce,
      label: chosen ? chosen.name : sky.label,
      zoom: Math.round(this.fov),
      cue: this.cue,
      toast: this.toast,
      dust: sky.dust,
      mode: this.mode,
      parked: this.parked,
      assist: this.assist,
      cam: this.cam,
      prompt,
      target: target?.name ?? '',
      hasRover: this.setup.roverMassKg !== null,
      hasHeli: this.setup.heli && this.setup.air,
      wheels: this.wheels,
      crisis: this.crisis,
      lost: this.lost,
      sky: sky.label,
      weather: this.weatherSim,
      hint: this.hintReadout(),
    }
  }

  private condition() {
    const sky = fieldSol(this.sol, this.setup.air, this.setup.steady, this.setup.difficulty)
    let next = { ...sky }
    if (this.weatherSim === 'clear') next = { storm: false, dust: 0.04, comms: true, wheel: 0, fault: false, flare: false, label: 'Clear' }
    else if (this.weatherSim === 'dust') next = { storm: true, dust: 0.88, comms: true, wheel: 0.4, fault: false, flare: false, label: 'Dust' }
    else if (this.weatherSim === 'flare') next = { storm: false, dust: 0.22, comms: false, wheel: 0, fault: false, flare: true, label: 'Flare' }
    else if (this.weatherSim === 'blackout') next = { storm: false, dust: 0.08, comms: false, wheel: 0, fault: false, flare: false, label: 'Blackout' }
    const fault = next.fault || (this.sol === 1 && this.setup.entryFault && this.weatherSim === 'auto')
    const wheel = this.setup.damaged ? Math.max(next.wheel, 0.55) : next.wheel
    const label = next.label !== 'Clear' ? next.label : fault ? 'Fault' : wheel > 0.2 ? 'Wheel' : 'Clear'
    return { ...next, fault, wheel, label }
  }

  private roomFor(bytes: number): boolean {
    const used = this.notes.reduce((sum, item) => sum + item.bytes, 0)
    return used + bytes <= Math.max(this.setup.storageBits, 512e6) / 8
  }

  private say(text: string): void {
    this.notice = text
    this.noticeFor = 2.4
  }

  private ping(cue: string): void {
    this.cue = cue
    this.cueFor = 0.35
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    this.gap = Math.max(3.4, Math.min(36, this.gap * (event.deltaY > 0 ? 1.12 : 0.88)))
    this.fov = Math.max(48, Math.min(68, this.fov + Math.sign(event.deltaY)))
    this.camera.fov = this.fov
    this.camera.updateProjectionMatrix()
  }

  private focus(): { x: number; z: number } {
    if (this.mode === 'scout') return this.heliAt
    if (this.mode === 'eva') return this.foot
    return this.drive
  }

  private normalAt(x: number, z: number): THREE.Vector3 {
    if (this.globeR <= 0) return new THREE.Vector3(0, 1, 0)
    const radius = this.globeR
    const flat = Math.min(Math.hypot(x, z), radius * 0.96)
    const lift = Math.sqrt(Math.max(1, radius * radius - flat * flat))
    return new THREE.Vector3(x, lift, z).normalize()
  }

  private groundMesh: THREE.Object3D | null = null
  private heightGrid: HeightGrid | null = null
  private marsGround: MarsGround | null = null
  private landerLift = 0.05
  private lastHeight = 0

  private heightAt(x: number, z: number): number {
    if (this.marsGround) {
      this.lastHeight = this.marsGround.stand(x, z)
      return this.lastHeight
    }
    if (this.heightGrid) {
      this.lastHeight = heightFromGrid(this.heightGrid, x, z)
      return this.lastHeight
    }
    if (landUrl(this.setup.missionId)) return this.lastHeight
    if (this.globeR > 0) {
      const radius = this.globeR
      const flat = Math.min(Math.hypot(x, z), radius * 0.96)
      const curve = Math.sqrt(radius * radius - flat * flat) - radius
      return curve + surfaceHeight(this.setup.siteId, x, z) * 0.18
    }
    const raw = surfaceHeight(this.setup.siteId, x, z)
    const pad = surfaceHeight(this.setup.siteId, 0, 0)
    const d = Math.hypot(x, z)
    if (d >= 5) return raw
    const t = d / 5
    const blend = t * t
    return pad * (1 - blend) + raw * blend
  }

  /** A rise steeper than this is a face, not a path. Short steps are walked; walls still stop. */
  private climbOk(x0: number, z0: number, x1: number, z1: number, limit: number): boolean {
    const rise = this.heightAt(x1, z1) - this.heightAt(x0, z0)
    const run = Math.hypot(x1 - x0, z1 - z0)
    if (run < 1e-4) return true
    if (rise <= 2.4) return true
    if (rise < 0) return true
    return rise / run <= Math.max(limit, 2.8)
  }

  private grade(x: number, z: number): { x: number; z: number } {
    const e = 0.45
    return {
      x: (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      z: (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e),
    }
  }

  private hits(x: number, z: number, radius: number, hop = 0): boolean {
    if (this.mode === 'drive') return false
    const blocks: { x: number; z: number; radius: number; height: number }[] = [
      { x: this.lander.position.x, z: this.lander.position.z, radius: 2.2, height: 3.4 },
    ]
    for (const block of this.marsGround?.solid() ?? []) blocks.push(block)
    for (const block of blocks) {
      if (hop > block.height - 0.12) continue
      if (Math.hypot(x - block.x, z - block.z) < block.radius + radius) return true
    }
    return false
  }

  private nearPad(): boolean {
    return Math.hypot(this.foot.x - this.lander.position.x, this.foot.z - this.lander.position.z) < 6
  }

  private openSamples(): FieldSample[] {
    return this.setup.samples.filter((sample) => !this.found.has(sample.id))
  }

  private currentTarget(): FieldSample | null {
    const open = this.openSamples()
    if (open.length === 0) return null
    return open[this.routeIndex % open.length]
  }

  private nearSample(): FieldSample | null {
    const at = this.focus()
    return this.setup.samples.find((sample) => !this.found.has(sample.id) && Math.hypot(at.x - sample.x, at.z - sample.z) < 5.6) ?? null
  }

  private syncChunks(x: number, z: number): void {
    if (this.globeR > 0 || this.marsGround) return
    const cx = Math.floor(x / CHUNK)
    const cz = Math.floor(z / CHUNK)
    const key = `${cx},${cz}`
    if (key === this.chunkKey) return
    this.chunkKey = key
    for (const geo of this.geos) geo.dispose()
    this.geos = []
    this.chunkRoot.clear()
    for (let iz = -2; iz <= 2; iz++) {
      for (let ix = -2; ix <= 2; ix++) {
        const mesh = this.makeChunk((cx + ix) * CHUNK, (cz + iz) * CHUNK)
        this.chunkRoot.add(mesh)
        this.geos.push(mesh.geometry)
      }
    }
  }

  private makeChunk(x0: number, z0: number): THREE.Mesh {
    const n = SEG + 1
    const positions = new Float32Array(n * n * 3)
    const colors = new Float32Array(n * n * 3)
    const low = new THREE.Color(this.colors.low)
    const high = new THREE.Color(this.colors.high)
    const tint = new THREE.Color()
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = x0 + (ix / SEG) * CHUNK
        const z = z0 + (iz / SEG) * CHUNK
        const y = this.heightAt(x, z)
        const i = (iz * n + ix) * 3
        positions[i] = x
        positions[i + 1] = y
        positions[i + 2] = z
        const lift = Math.max(0, Math.min(1, (y + 2) / 9))
        tint.copy(low).lerp(high, lift)
        tint.offsetHSL(0, 0, (shade(ix + x0, iz + z0) - 0.5) * 0.08)
        colors[i] = tint.r
        colors[i + 1] = tint.g
        colors[i + 2] = tint.b
      }
    }
    const indices: number[] = []
    for (let iz = 0; iz < SEG; iz++) {
      for (let ix = 0; ix < SEG; ix++) {
        const a = iz * n + ix
        const b = a + 1
        const c = a + n
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, this.groundMat)
    mesh.receiveShadow = true
    return mesh
  }

  private layoutField(): void {
    if (this.rockMesh) {
      this.scene.remove(this.rockMesh)
      this.rockMesh.geometry.dispose()
      this.rockMesh = null
    }
    for (const mark of this.markers) this.scene.remove(mark)
    this.markers = []
    this.rocks = []
    if (!this.marsGround) this.placeRocks()
    this.placeSamples()
  }

  private placeRocks(): void {
    const count = 36 + Math.round(this.setup.difficulty * 12)
    const geo = new THREE.DodecahedronGeometry(1, 0)
    this.rockMat = new THREE.MeshStandardMaterial({ color: this.colors.rock, roughness: 0.96 })
    const mesh = new THREE.InstancedMesh(geo, this.rockMat, count)
    mesh.castShadow = true
    mesh.receiveShadow = true
    const dummy = new THREE.Object3D()
    let placed = 0
    for (let i = 0; placed < count && i < count * 4; i++) {
      const x = (shade(i, 3) - 0.5) * 160
      const z = (shade(i, 9) - 0.5) * 160
      if (Math.hypot(x, z) < 12) continue
      if (this.setup.samples.some((sample) => Math.hypot(sample.x - x, sample.z - z) < 6.2)) continue
      const scale = 0.35 + shade(i, 5) * (0.7 + this.setup.difficulty)
      const tall = this.setup.siteId === 'valles' || this.setup.siteId === 'boulders' ? 1.4 + shade(i, 2) : 0.7 + shade(i, 2) * 0.5
      dummy.position.set(x, this.heightAt(x, z) + scale * tall, z)
      dummy.scale.set(scale, scale * tall, scale)
      dummy.rotation.set(0, shade(i, 1) * 6, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(placed, dummy.matrix)
      this.rocks.push({ x, z, r: scale * 0.7 })
      placed += 1
    }
    mesh.count = placed
    this.rockMesh = mesh
    this.scene.add(mesh)
  }

  private placeSamples(): void {
    for (const sample of this.setup.samples) {
      const mark = this.buildSampleStation(sample)
      mark.position.set(sample.x, this.heightAt(sample.x, sample.z), sample.z)
      mark.visible = !this.found.has(sample.id)
      this.scene.add(mark)
      this.markers.push(mark)
    }
  }

  private sampleLook(kind: SampleKind): { color: number; glow: number } {
    if (kind === 'core') return { color: 0xff7a18, glow: 0xffb060 }
    if (kind === 'crystal') return { color: 0x3de0ff, glow: 0x9af2ff }
    if (kind === 'dust') return { color: 0xff4d9a, glow: 0xff9ec8 }
    if (kind === 'ice') return { color: 0xe8f6ff, glow: 0xffffff }
    return { color: 0xffd24a, glow: 0xffe9a0 }
  }

  private tagSample(obj: THREE.Object3D, id: string): void {
    obj.userData.sample = id
    obj.traverse((child) => {
      child.userData.sample = id
    })
  }

  /** Ruin GLB plus a ground ring and a pin so the find stays readable at range. */
  private buildSampleStation(sample: FieldSample): THREE.Group {
    const root = new THREE.Group()
    const look = this.sampleLook(sample.kind)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1.05, 28), new THREE.MeshBasicMaterial({
      color: look.color,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.06
    root.add(ring)
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({
      color: look.color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }))
    pad.rotation.x = -Math.PI / 2
    pad.position.y = 0.04
    root.add(pad)
    const pin = new THREE.Group()
    pin.name = 'sample-pin'
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.036, 1.15, 8),
      new THREE.MeshBasicMaterial({ color: look.color, depthTest: false }),
    )
    stem.position.y = 1.85
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.38, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe14a, depthTest: false }),
    )
    head.rotation.x = Math.PI
    head.position.y = 2.58
    pin.add(stem, head)
    pin.renderOrder = 8
    root.add(pin)
    const lamp = new THREE.PointLight(look.color, 1.4, 16, 1.8)
    lamp.position.set(0, 1.4, 0)
    root.add(lamp)
    this.mountRuin(root, sample)
    this.tagSample(root, sample.id)
    return root
  }

  private mountRuin(root: THREE.Group, sample: FieldSample): void {
    const url = RUIN_URL[sample.kind]
    const seat = (source: THREE.Object3D) => {
      if (this.dead || !this.markers.includes(root)) return
      const model = source.clone(true)
      fitModel(model, 2.2)
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = true
      })
      this.tagSample(model, sample.id)
      root.add(model)
    }
    const cached = ruinCache.get(url)
    if (cached) {
      seat(cached)
      return
    }
    loader.load(url, (gltf) => {
      if (this.dead) return
      ruinCache.set(url, gltf.scene)
      seat(gltf.scene)
    })
  }

  private makeHintArrow(): THREE.Group {
    const root = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe14a, depthTest: false })
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mat)
    head.position.y = 1.9
    const needle = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.65, 8), mat)
    needle.rotation.x = Math.PI
    needle.position.y = 0.78
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.055, 8, 22), mat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.06
    root.add(head, needle, ring)
    root.renderOrder = 12
    root.visible = false
    this.scene.add(root)
    return root
  }

  private tickHint(): void {
    const open = this.openSamples()
    if (open.length === 0) {
      this.hintOn = false
      this.hintArrow.visible = false
      return
    }
    if (!this.hintOn && this.clock >= this.hintDue) this.hintOn = true
    const target = open[0]
    const y = this.heightAt(target.x, target.z)
    this.hintArrow.position.set(target.x, y + 2.15 + Math.sin(this.clock * 2.4) * 0.16, target.z)
    this.hintArrow.visible = this.hintOn
    for (const mark of this.markers) {
      const pin = mark.getObjectByName('sample-pin')
      if (pin) pin.position.y = Math.sin(this.clock * 2.2 + mark.position.x) * 0.14
    }
  }

  private hintReadout(): SurfaceHint | null {
    if (!this.hintOn) return null
    const target = this.openSamples()[0]
    if (!target) return null
    this.hintNdc.set(target.x, this.heightAt(target.x, target.z) + 2.4, target.z).project(this.camera)
    const onScreen = this.hintNdc.z < 1 && this.hintNdc.z > 0 && Math.abs(this.hintNdc.x) <= 0.9 && Math.abs(this.hintNdc.y) <= 0.78
    return { name: target.name, nx: this.hintNdc.x, ny: this.hintNdc.y, onScreen }
  }

  private poseRoute(): void {
    const target = this.hintOn ? this.openSamples()[0] ?? null : (this.assist ? this.currentTarget() : null)
    this.route.visible = Boolean(target)
    if (!target) return
    const from = this.focus()
    const last = this.pathPts.length - 1
    const pos = this.route.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i <= last; i++) {
      const t = i / last
      const x = from.x + (target.x - from.x) * t
      const z = from.z + (target.z - from.z) * t
      const y = this.heightAt(x, z) + 0.34
      this.pathPts[i].set(x, y, z)
      pos.setXYZ(i, x, y, z)
    }
    pos.needsUpdate = true
  }

  private poseDust(x: number, z: number, dt: number): void {
    const sky = this.condition()
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute
    const speed = this.mode === 'drive' ? Math.abs(this.drive.speed) : 0.2
    const drift = sky.storm ? 9.5 : 0.35 + speed * 0.35
    const lift = sky.storm ? 2.4 : 0.15 + speed * 0.35
    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i) + x + dt * drift
      let py = pos.getY(i) + dt * lift
      let pz = pos.getZ(i) + z + dt * (sky.storm ? Math.sin(this.clock * 3 + i) * 1.4 : 0)
      if (py > (sky.storm ? 6 : 1.6) || Math.hypot(px - x, pz - z) > (sky.storm ? 28 : 18)) {
        const a = shade(i, this.sol) * Math.PI * 2
        const r = 2 + shade(i, 4) * (sky.storm ? 22 : 12)
        px = x + Math.cos(a) * r
        py = 0.12 + shade(i, 8) * (sky.storm ? 3.2 : 0.9)
        pz = z + Math.sin(a) * r
      }
      pos.setXYZ(i, px - x, py, pz - z)
    }
    this.dust.position.set(x, this.heightAt(x, z), z)
    pos.needsUpdate = true
    const storm = this.stormDust.geometry.getAttribute('position') as THREE.BufferAttribute
    if (this.stormDust.visible) {
      const gust = (sky.storm ? 22 : 8) * dt
      for (let i = 0; i < storm.count; i++) {
        let sx = storm.getX(i) + gust
        let sy = storm.getY(i)
        let sz = storm.getZ(i) + Math.sin(this.clock * 2.2 + i * 0.15) * dt * 3
        if (sx > 36) sx = -36
        if (sz > 36) sz = -36
        if (sz < -36) sz = 36
        storm.setXYZ(i, sx, sy, sz)
      }
      storm.needsUpdate = true
      this.stormDust.position.set(x, this.heightAt(x, z), z)
    }
  }

  private seat(obj: THREE.Object3D, x: number, z: number): void {
    obj.position.set(x, 0, z)
    obj.updateWorldMatrix(true, true)
    const hull = obj.getObjectByName('hull') ?? obj.getObjectByName('launch-stack') ?? obj
    const box = new THREE.Box3()
    hull.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.visible) return
      if (mesh.userData.nozzle || /flame|plume|bell/i.test(mesh.name)) return
      box.expandByObject(mesh)
    })
    if (box.isEmpty()) box.setFromObject(hull)
    obj.position.y += this.heightAt(x, z) - box.min.y + 0.05
  }

  /** Keep the lander on the pad every frame so egress cannot leave it hanging. */
  private pinLander(): void {
    const [lx, lz] = MARS_LANDING
    this.lander.traverse((obj) => {
      if (obj.userData.nozzle || /plume|flame|bell/i.test(obj.name)) obj.visible = false
    })
    this.landerLift = this.heightAt(lx, lz) + 0.02
    this.lander.position.set(lx, this.landerLift, lz)
  }

  private loadRover(): void {
    loader.load('/models/perseverance.glb', (gltf) => {
      if (this.dead) return
      const model = gltf.scene
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      model.scale.setScalar(2.7 / (Math.max(size.x, size.y, size.z) || 1))
      model.position.y -= new THREE.Box3().setFromObject(model).min.y
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })
      this.rover.add(model)
      this.arm = model.getObjectByName('arm.001') ?? null
      this.mastHead = model.getObjectByName('head') ?? null
      this.armBase = this.arm?.rotation.x ?? 0
      this.mastBase = this.mastHead?.rotation.y ?? 0
    })
  }

  private walkBody: WalkAstronaut | null = null

  private loadSuit(): void {
    loader.load('/3d/walking_astronaut.glb', (gltf) => {
      if (this.dead) return
      this.walkBody = bindWalkAstronaut(gltf, 1.85)
      this.walkBody.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })
      this.suit.add(this.walkBody.root)
    })
  }

  private loadHeli(): void {
    loader.load('/vehicles/ingenuity.glb', (gltf) => {
      if (this.dead) return
      const model = gltf.scene
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      model.scale.setScalar(1.35 / (Math.max(size.x, size.y, size.z) || 1))
      model.position.y -= new THREE.Box3().setFromObject(model).min.y
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) mesh.castShadow = true
      })
      this.heli.add(model)
    })
  }

  private makeStars(): THREE.Points {
    const count = 900
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const radius = 390
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi))
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf7f4ee, size: 1.2, sizeAttenuation: false }))
    stars.frustumCulled = false
    return stars
  }

  private makeSky(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(this.colors.skyTop) },
        horizon: { value: new THREE.Color(this.colors.skyHorizon) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 horizon; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.65, h)), 1.0); }',
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 28, 16), mat)
    mesh.frustumCulled = false
    return mesh
  }

  private makeDust(): THREE.Points {
    const count = 160
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const a = shade(i, 2) * Math.PI * 2
      const r = 2 + shade(i, 6) * 14
      positions[i * 3] = Math.cos(a) * r
      positions[i * 3 + 1] = 0.12 + shade(i, 4) * 0.9
      positions[i * 3 + 2] = Math.sin(a) * r
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: this.colors.dust, size: 0.05, transparent: true, opacity: 0.28, depthWrite: false }))
  }

  private makeStormDust(): THREE.Points {
    const count = 280
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = ((i * 47) % 72) - 36
      positions[i * 3 + 1] = 0.4 + ((i * 13) % 28) * 0.22
      positions[i * 3 + 2] = ((i * 29) % 72) - 36
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xc4a08a,
      size: 0.22,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }))
    points.visible = false
    points.frustumCulled = false
    return points
  }

  private onClick = () => {
    if (!this.locked) this.canvas.requestPointerLock()
  }

  private onLock = () => {
    this.locked = document.pointerLockElement === this.canvas
  }

  private onMove = (event: MouseEvent) => {
    if (!this.locked) return
    this.lookPitch = Math.max(-1.05, Math.min(0.45, this.lookPitch - event.movementY * 0.002))
    if (this.mode === 'drive') this.orbitYaw -= event.movementX * 0.0022
    else this.lookYaw -= event.movementX * 0.0022
  }

  private onKey = (event: KeyboardEvent) => {
    const name = trackMove(this.keys, event)
    if (event.type === 'keyup' || event.repeat) return
    if (name === ' ') event.preventDefault()
    if (name === 'c') this.cycleCam()
    if (name === 'p') this.togglePark()
    if (name === 'g') this.toggleAssist()
    if (name === 'f') this.toggleEgress()
    if (name === 'e') this.sample()
    if (name === 'v') this.capture()
    if (name === 't') this.transmit()
    if (name === 'x') this.cycleHold()
    if (name === 'r') this.nextSol()
    if (name === 'h') this.toggleScout()
    if (name === 'q') this.cycleTarget()
  }
}
