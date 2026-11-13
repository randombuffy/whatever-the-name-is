import * as THREE from 'three'
import type { FieldSample } from '../domain/campaign'
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
import { modelLoader } from './gltf'
import { viewRatio } from './pixels'

export type SurfaceCam = 'chase' | 'mast' | 'overhead'
export type SurfaceMode = 'drive' | 'eva' | 'scout'

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

export interface SurfaceReadout {
  speed: number
  slopeDeg: number
  energy: number
  oxygen: number
  sol: number
  held: number
  sent: number
  link: boolean
  label: string
  zoom: number
  cue: string
  dust: number
  mode: SurfaceMode
  parked: boolean
  assist: boolean
  cam: SurfaceCam
  prompt: string
  target: string
  hasRover: boolean
  hasHeli: boolean
}

const CHUNK = 36
const SEG = 16
const loader = modelLoader()

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
  private markers: THREE.Mesh[] = []
  private lander: THREE.Group
  private rover = new THREE.Group()
  private suit = new THREE.Group()
  private heli = new THREE.Group()
  private sky: THREE.Mesh
  private dust: THREE.Points
  private dustMat: THREE.PointsMaterial
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
  private notice = ''
  private noticeFor = 0
  private energy = 100
  private oxygen = 100
  private sol = 1
  private lookYaw = 0.4
  private orbitYaw = 0
  private lookPitch = -0.18
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
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
    this.fill = new THREE.AmbientLight(mars ? 0xf0d5bd : 0xfff2e0, mars ? 0.12 : 0.72)
    this.scene.add(this.fill)
    this.hemi = new THREE.HemisphereLight(mars ? 0xcfb39b : this.colors.skyHorizon, mars ? 0x4f3a2e : this.colors.low, mars ? 0.5 : 0.7)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(mars ? 0xfff0dd : 0xfff1df, mars ? 2.7 : 2.9)
    if (mars) this.renderer.toneMappingExposure = 1.12
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(mars ? 2048 : 1024, mars ? 2048 : 1024)
    this.sun.shadow.camera.near = 2
    this.sun.shadow.camera.far = 140
    this.sun.shadow.camera.left = -48
    this.sun.shadow.camera.right = 48
    this.sun.shadow.camera.top = 48
    this.sun.shadow.camera.bottom = -48
    this.sun.shadow.bias = -0.0004
    this.scene.add(this.sun, this.sunTarget)
    this.sun.target = this.sunTarget
    this.sky = this.makeSky()
    this.scene.add(this.sky)
    if (!setup.air) this.sky.add(this.makeStars())
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true })
    this.scene.add(this.chunkRoot)
    this.dust = this.makeDust()
    this.dustMat = this.dust.material as THREE.PointsMaterial
    this.scene.add(this.dust)
    this.route = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xf2c14e }),
    )
    this.route.frustumCulled = false
    this.scene.add(this.route)
    this.globeR = 0
    this.lander = new THREE.Group()
    this.scene.add(this.lander)
    attachOrbiter(this.lander, 7, true, () => this.seat(this.lander, 0, 0), setup.craft, setup.missionId)
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
        this.drive = { x: lx + 4.4, z: lz + 0.6, yaw: -0.4, speed: 0 }
        this.foot = { x: lx + 1.5, z: lz + 2.6 }
        this.lookYaw = Math.atan2(6 - this.foot.x, 4 - this.foot.z)
        this.heliAt = { x: lx + 7, z: lz - 4 }
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

  cycleCam(): void {
    this.cam = this.cam === 'chase' ? 'mast' : this.cam === 'mast' ? 'overhead' : 'chase'
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
      this.say('Walk to a glowing rock and press E.')
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
    this.say(`Picked up ${obs.name}.`)
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
      this.say('Sent')
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
    this.frame()
    if (this.marsGround && !this.campSeated) {
      this.campSeated = true
      this.seat(this.lander, this.lander.position.x, this.lander.position.z)
    }
    if (this.marsGround) {
      this.marsGround.follow(this.camera)
      this.sun.position.set(focus.x + MARS_SUN.x * 80, MARS_SUN.y * 80, focus.z + MARS_SUN.z * 80)
    } else {
      this.sky.position.set(focus.x, 0, focus.z)
      this.sun.position.set(focus.x + 40, 48, focus.z + 18)
    }
    this.sunTarget.position.set(focus.x, 0, focus.z)
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
    if (this.energy <= 0) throttle = 0
    const next = stepDrive(this.drive, {
      throttle,
      steer,
      brake: this.keys.has(' '),
      park: this.parked,
      boost: this.keys.has('shift'),
      massKg: this.setup.roverMassKg ?? 80,
      gravity: this.setup.gravity,
      rough: 0.15 + this.setup.difficulty * 0.7 + (this.parked ? 0 : this.condition().wheel),
      gradX: grade.x,
      gradZ: grade.z,
    }, dt)
    if (this.hits(next.x, next.z, 1.25)) {
      this.drive = { ...this.drive, speed: this.drive.speed * -0.25 }
      this.bump = 0.7
    } else {
      this.odometer += Math.abs(next.speed) * dt
      this.drive = next
      if (this.groundMesh) {
        this.drive.x = Math.max(-680, Math.min(680, this.drive.x))
        this.drive.z = Math.max(-680, Math.min(680, this.drive.z))
      }
    }
    if (this.bump > 0) this.bump = Math.max(0, this.bump - dt)
  }

  private walkSuit(dt: number): void {
    const forward = this.keys.has('w') ? 1 : this.keys.has('s') ? -1 : 0
    const strafe = this.keys.has('a') ? 1 : this.keys.has('d') ? -1 : 0
    const moving = forward !== 0 || strafe !== 0
    const gravity = Math.max(0.04, this.setup.gravity)
    const pace = (this.oxygen > 8 ? 3.05 : 1.6) * Math.sqrt(gravity / 3.71)
    const grade = this.grade(this.foot.x, this.foot.z)
    const slope = Math.hypot(grade.x, grade.z)
    const nx = this.foot.x + (Math.sin(this.lookYaw) * forward + Math.cos(this.lookYaw) * strafe) * pace * (1 - Math.min(0.65, slope)) * dt
    const nz = this.foot.z + (Math.cos(this.lookYaw) * forward - Math.sin(this.lookYaw) * strafe) * pace * (1 - Math.min(0.65, slope)) * dt
    const stepUp = this.heightAt(nx, nz) - this.heightAt(this.foot.x, this.foot.z)
    if (!this.hits(nx, nz, 0.55) && stepUp < 1.8) {
      this.foot.x = nx
      this.foot.z = nz
    }
    if (this.groundMesh) {
      this.foot.x = Math.max(-680, Math.min(680, this.foot.x))
      this.foot.z = Math.max(-680, Math.min(680, this.foot.z))
    }
    if (moving) this.walk += dt * (4.2 + gravity)
    else this.walk *= Math.max(0, 1 - dt * 4)
    if (this.keys.has(' ') && this.hop <= 0 && this.hopV <= 0) {
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
    const speed = this.energy > 0 ? 7 : 0
    const nx = this.heliAt.x + Math.sin(this.lookYaw) * forward * speed * dt
    const nz = this.heliAt.z + Math.cos(this.lookYaw) * forward * speed * dt
    if (!this.hits(nx, nz, 0.4)) {
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
    this.energy = Math.max(0, Math.min(100, this.energy))
    if (this.cueFor > 0) this.cueFor = Math.max(0, this.cueFor - dt)
    else this.cue = ''
    if (this.noticeFor > 0) this.noticeFor = Math.max(0, this.noticeFor - dt)
    else this.notice = ''
    const fog = this.scene.fog
    if (fog instanceof THREE.FogExp2) {
      fog.density = sky.storm ? 0.013 : 0.0042
      fog.color.set(sky.storm ? 0x9f7660 : 0xb8957c)
    } else if (fog instanceof THREE.Fog) {
      fog.near = sky.storm ? 28 : this.setup.air ? 70 : 140
      fog.far = sky.storm ? 240 : this.setup.air ? 1800 : 1600
    }
    this.dustMat.opacity = sky.storm ? 0.55 : 0.12 + sky.dust * 0.22
  }

  private poseVehicles(dt: number): void {
    const gy = this.heightAt(this.drive.x, this.drive.z)
    this.bob += (gy - this.bob) * 0.18
    const bounce = Math.sin(this.odometer * 4) * 0.02 * Math.min(1, Math.abs(this.drive.speed))
    this.rover.position.set(this.drive.x, this.bob + bounce, this.drive.z)
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
    this.suit.position.set(this.foot.x, fy, this.foot.z).addScaledVector(up, this.hop)
    const ahead = new THREE.Vector3(Math.sin(this.lookYaw), 0, Math.cos(this.lookYaw))
    ahead.addScaledVector(up, -ahead.dot(up))
    if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, 1)
    ahead.normalize()
    const right = new THREE.Vector3().crossVectors(up, ahead).normalize()
    this.basis.makeBasis(right, up, ahead)
    this.suit.quaternion.setFromRotationMatrix(this.basis)
    const climbing = false
    this.suit.visible = this.mode === 'eva'
    this.rover.visible = this.setup.roverMassKg !== null
    if (this.walkBody) {
      const moving = this.keys.has('w') || this.keys.has('s') || this.keys.has('a') || this.keys.has('d')
      this.walkBody.setClip(this.hop > 0.04 ? 'air' : climbing || moving ? 'walk' : 'idle')
      this.walkBody.tick(dt)
    }
    const homeY = this.heightAt(7, 5)
    if (this.mode === 'scout') {
      this.heli.position.set(this.heliAt.x, this.heightAt(this.heliAt.x, this.heliAt.z) + 7.5, this.heliAt.z)
      this.heli.rotation.y = this.lookYaw
    } else {
      this.heli.position.set(7, homeY, 5)
      this.heli.rotation.y = 0.4
    }
  }

  private frame(): void {
    const focus = this.focus()
    const y = this.heightAt(focus.x, focus.z)
    const up = this.normalAt(focus.x, focus.z)
    this.camera.up.copy(up)
    if (this.cam === 'overhead') {
      this.camera.position.set(focus.x, y + 26, focus.z + 8)
      this.camera.lookAt(focus.x, y, focus.z)
      return
    }
    if (this.mode === 'scout') {
      this.camera.position.set(focus.x - Math.sin(this.lookYaw) * 6, y + 9, focus.z - Math.cos(this.lookYaw) * 6)
      this.camera.lookAt(focus.x, y + 7.5, focus.z)
      return
    }
    if (this.mode === 'eva' || this.cam === 'chase') {
      const yaw = this.mode === 'eva' ? this.lookYaw : this.drive.yaw
      const glance = this.mode === 'eva' ? 0 : this.orbitYaw
      const back = this.mode === 'eva' ? 4.2 : 6.4
      const lift = this.mode === 'eva' ? 1.85 : 2.4
      const eye = new THREE.Vector3(focus.x, y, focus.z)
      const backDir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
      backDir.addScaledVector(up, -backDir.dot(up)).normalize()
      this.camera.position.copy(eye).addScaledVector(up, lift).addScaledVector(backDir, back)
      const look = eye.clone().addScaledVector(up, 0.8 + this.lookPitch).addScaledVector(new THREE.Vector3(Math.sin(yaw + glance), 0, Math.cos(yaw + glance)), 4)
      this.camera.lookAt(look)
      return
    }
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

  private readout(): SurfaceReadout {
    const focus = this.focus()
    const grade = this.grade(focus.x, focus.z)
    const slope = Math.atan(Math.hypot(grade.x, grade.z)) * 180 / Math.PI
    const near = this.nearSample()
    const target = this.currentTarget()
    const sky = this.condition()
    const walking = this.keys.has('w') || this.keys.has('a') || this.keys.has('s') || this.keys.has('d')
    let prompt = ''
    if (!this.introDone) prompt = this.setup.siteId === 'jezero'
      ? 'On Jezero crater. WASD walk. F boards the rover. E picks a sample.'
      : 'On the surface. WASD walk. F boards the rover. E picks a sample.'
    else if (this.notice) prompt = this.notice
    else if (this.mode === 'drive' && this.energy <= 0) prompt = 'Batteries empty. Wait in the sun.'
    else if (this.mode === 'drive' && this.parked) prompt = 'Parked. WASD drive. F get down.'
    else if (this.mode === 'drive' && slope > 16 && Math.abs(this.drive.speed) < 0.15 && this.keys.has('w')) prompt = 'Grade too steep.'
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
      speed: this.mode === 'drive' ? this.drive.speed : this.mode === 'scout' ? 7 : walking ? 3.05 : 0,
      slopeDeg: slope,
      energy: this.energy,
      oxygen: this.oxygen,
      sol: this.sol,
      held: held.length,
      sent: this.notes.length - held.length,
      link: sky.comms,
      label: chosen ? chosen.name : sky.label,
      zoom: Math.round(this.fov),
      cue: this.cue,
      dust: sky.dust,
      mode: this.mode,
      parked: this.parked,
      assist: this.assist,
      cam: this.cam,
      prompt,
      target: target?.name ?? '',
      hasRover: this.setup.roverMassKg !== null,
      hasHeli: this.setup.heli && this.setup.air,
    }
  }

  private condition() {
    const sky = fieldSol(this.sol, this.setup.air, this.setup.steady, this.setup.difficulty)
    const fault = sky.fault || (this.sol === 1 && this.setup.entryFault)
    const wheel = this.setup.damaged ? Math.max(sky.wheel, 0.55) : sky.wheel
    const label = sky.label !== 'Clear' ? sky.label : fault ? 'Fault' : wheel > 0.2 ? 'Wheel' : 'Clear'
    return { ...sky, fault, wheel, label }
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
    this.fov = Math.max(26, Math.min(72, this.fov + Math.sign(event.deltaY) * 3))
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
  private campSeated = false
  private lastHeight = 0

  private heightAt(x: number, z: number): number {
    if (this.marsGround) {
      this.lastHeight = this.marsGround.height(x, z)
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

  private grade(x: number, z: number): { x: number; z: number } {
    const e = 0.45
    return {
      x: (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      z: (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e),
    }
  }

  private hits(x: number, z: number, radius: number): boolean {
    const ship = Math.hypot(x - this.lander.position.x, z - this.lander.position.z)
    if (ship < 3.3 + radius * 0.15) return true
    const camp = this.marsGround?.solid() ?? []
    if (camp.some((block) => Math.hypot(x - block.x, z - block.z) < block.radius + radius * 0.2)) return true
    return this.rocks.some((rock) => Math.hypot(x - rock.x, z - rock.z) < rock.r + radius * 0.35)
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
    return this.setup.samples.find((sample) => !this.found.has(sample.id) && Math.hypot(at.x - sample.x, at.z - sample.z) < 4.8) ?? null
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
      if (this.setup.samples.some((sample) => Math.hypot(sample.x - x, sample.z - z) < 2.4)) continue
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
      const mark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshStandardMaterial({ color: 0xf4f1ea, emissive: 0xf2c14e, emissiveIntensity: 0.7 }),
      )
      mark.position.set(sample.x, this.heightAt(sample.x, sample.z) + 0.34, sample.z)
      mark.userData.sample = sample.id
      mark.visible = !this.found.has(sample.id)
      this.scene.add(mark)
      this.markers.push(mark)
      const outcrop = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.7, 0),
        new THREE.MeshStandardMaterial({ color: this.colors.rock, roughness: 1 }),
      )
      const lift = 0.7 * 0.6
      outcrop.position.set(sample.x + 0.8, this.heightAt(sample.x + 0.8, sample.z) + lift, sample.z)
      outcrop.scale.set(1, 0.6, 1.3)
      outcrop.castShadow = true
      this.scene.add(outcrop)
      this.markers.push(outcrop)
      this.rocks.push({ x: sample.x + 0.8, z: sample.z, r: 0.55 })
    }
  }

  private poseRoute(): void {
    const target = this.assist ? this.currentTarget() : null
    this.route.visible = Boolean(target) && this.mode === 'drive'
    if (!target) return
    const pos = this.route.geometry.getAttribute('position') as THREE.BufferAttribute
    pos.setXYZ(0, this.drive.x, this.heightAt(this.drive.x, this.drive.z) + 0.3, this.drive.z)
    pos.setXYZ(1, target.x, this.heightAt(target.x, target.z) + 0.4, target.z)
    pos.needsUpdate = true
  }

  private poseDust(x: number, z: number, dt: number): void {
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute
    const speed = this.mode === 'drive' ? Math.abs(this.drive.speed) : 0.2
    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i) + x
      let py = pos.getY(i) + dt * (0.15 + speed * 0.35)
      let pz = pos.getZ(i) + z
      if (py > 1.6 || Math.hypot(px - x, pz - z) > 18) {
        const a = shade(i, this.sol) * Math.PI * 2
        const r = 2 + shade(i, 4) * 12
        px = x + Math.cos(a) * r
        py = 0.12 + shade(i, 8) * 0.9
        pz = z + Math.sin(a) * r
      }
      pos.setXYZ(i, px - x, py, pz - z)
    }
    this.dust.position.set(x, this.heightAt(x, z), z)
    pos.needsUpdate = true
  }

  private seat(obj: THREE.Object3D, x: number, z: number): void {
    obj.position.set(x, 0, z)
    obj.updateWorldMatrix(true, true)
    const hull = obj.getObjectByName('hull') ?? obj.getObjectByName('launch-stack') ?? obj
    const box = new THREE.Box3()
    hull.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.visible) return
      if (mesh.userData.nozzle || /flame|plume/i.test(mesh.name)) return
      box.expandByObject(mesh)
    })
    if (box.isEmpty()) box.setFromObject(hull)
    obj.position.y += this.heightAt(x, z) - box.min.y
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
    const count = 40
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
    const key = event.key.toLowerCase()
    const name = key === ' ' ? ' ' : key
    if (event.type === 'keyup') {
      this.keys.delete(name)
      return
    }
    this.keys.add(name)
    if (event.repeat) return
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
