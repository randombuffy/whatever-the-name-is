import * as THREE from 'three'
import type { DescentSave } from '../domain/save'
import type { SpacecraftConfig } from '../domain/types'
import { dynamicPressure, exponentialDensity } from '../domain/dynamics'
import { bakeHeightsRay, flattenPad, globeUrl, heightFromGrid, landUrl, loadTerrain, type HeightGrid } from './landform'
import { buildMarsGround, MARS_LANDING, MARS_SUN, type MarsGround } from './marsGround'
import { attachOrbiter, type LaunchRig } from './launchStack'
import { setFlame } from './exhaust'
import { modelLoader, seatSphere } from './gltf'
import { viewRatio } from './pixels'
import { makeStarfield, tickStarfield } from './starfield'

/** One smooth curve from orbit to the gear. No step at 2 km, so the ship does not lurch. */
function visualAlt(meters: number): number {
  if (meters <= 0) return 0
  return 980 * (1 - Math.exp(-meters / 2200))
}

export interface DescentBody {
  massKg: number
  gravity: number
  surfaceRho: number
  scaleHeightM: number
  thrustN: number
  chute: boolean
  shield: boolean
  legs: boolean
  propellantKg: number
}

export interface DescentReadout {
  altitude: number
  sink: number
  lateral: number
  offset: number
  throttle: number
  fuel: number
  chute: boolean
  heat: number
  assist: boolean
  phase: 'fly' | 'down' | 'hard' | 'crash'
  prompt: string
  view: 'chase' | 'ground' | 'side'
  warnSink: boolean
  warnSide: boolean
  warnFuel: boolean
  warnHeat: boolean
  warnOffset: boolean
  choice: boolean
}

function terrainMesh(airless: boolean): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(240, 240, 96, 96)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const craters = Array.from({ length: 18 }, (_, index) => ({
    x: Math.sin(index * 12.3) * 90,
    z: Math.cos(index * 7.7) * 90,
    r: 8 + (index % 5) * 4,
    depth: 0.7 + (index % 3) * 0.45,
  }))
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    let height = Math.sin(x * 0.045) * Math.cos(z * 0.038) * 2.4
    height += Math.sin(x * 0.12 + z * 0.04) * 0.55
    for (const crater of craters) {
      const distance = Math.hypot(x - crater.x, z - crater.z)
      if (distance < crater.r) height -= Math.cos((distance / crater.r) * Math.PI * 0.5) * crater.depth
      else if (distance < crater.r * 1.25) height += (1 - (distance - crater.r) / (crater.r * 0.25)) * crater.depth * 0.28
    }
    const pad = Math.min(1, Math.hypot(x, z) / 16)
    height *= pad
    pos.setY(i, height)
    const shade = Math.max(0, Math.min(1, (height + 2.2) / 4.4))
    if (airless) {
      colors[i * 3] = 0.32 + shade * 0.28
      colors[i * 3 + 1] = 0.31 + shade * 0.26
      colors[i * 3 + 2] = 0.29 + shade * 0.22
    } else {
      colors[i * 3] = 0.42 + shade * 0.28
      colors[i * 3 + 1] = 0.18 + shade * 0.16
      colors[i * 3 + 2] = 0.1 + shade * 0.08
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  )
  mesh.receiveShadow = true
  return mesh
}

export class DescentWorld {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(62, 1, 0.4, 24000)
  private canvas: HTMLCanvasElement
  private ship = new THREE.Group()
  private flame: THREE.Mesh
  private chute: THREE.Mesh
  private ground: THREE.Mesh
  private keys = new Set<string>()
  private altitude = 125_000
  private sink = 78
  private lateral = 22
  private pitch = 0.15
  private throttle = 0
  private heat = 0
  private chuteOpen = false
  private chuteFailed = false
  private assist = true
  private view: 'chase' | 'ground' | 'side' = 'side'
  private orbitYaw = 0.55
  private orbitPitch = 0.42
  private dragging = false
  private lastX = 0
  private lastY = 0
  private offset = 0
  private fuelKg = 0
  private markedGate = false
  private markedFinal = false
  private marks: { altitude: number; sink: number; lateral: number; offset: number; pitch: number; throttle: number; heat: number; fuel: number; chuteOpen: boolean; chuteFailed: boolean }[] = []
  private done: 'down' | 'hard' | 'crash' | null = null
  private body: DescentBody
  private difficulty: number
  private craftSignature = ''
  private reason = ''
  private pace = 4
  private planet = new THREE.Group()
  private airless = false
  private beat: 'approach' | 'entry' | 'chute' | 'choice' | 'burn' = 'approach'
  private beatT = 0
  private path: 'divert' | 'hold' | null = null
  private rig: LaunchRig | null = null
  private heatGlow: THREE.Mesh | null = null
  private relief: THREE.Object3D | null = null
  private heightGrid: HeightGrid | null = null
  private missionId = 'mars'
  private siteId = 'jezero'
  private globeR = 520
  private stars: THREE.Group | null = null
  private marsGround: MarsGround | null = null
  private blendCam = 0
  private approachEye = new THREE.Vector3(-22, 9, -38)
  private approachAim = new THREE.Vector3(0, 2, 90)
  private trackX = 0
  private trackZ = 40
  private vx = 1600
  private heading = 0

  constructor(canvas: HTMLCanvasElement, craft: SpacecraftConfig, body: DescentBody, difficulty: number, missionId = 'mars', siteId = 'jezero') {
    this.canvas = canvas
    this.body = body
    this.difficulty = difficulty
    this.missionId = missionId
    this.siteId = siteId
    this.lateral = difficulty * 6
    this.sink = 90
    this.fuelKg = Math.max(36, body.propellantKg)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(viewRatio(true))
    this.renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    const airless = body.surfaceRho <= 0.005
    this.airless = airless
    const marsLook = missionId === 'mars' || missionId === 'custom'
    this.scene.background = new THREE.Color(airless ? 0x02030a : marsLook ? 0x8a6a58 : 0x1a0c08)
    this.scene.add(new THREE.AmbientLight(airless ? 0xc9d4ea : marsLook ? 0xf0d5bd : 0xffe6d0, airless ? 0.35 : marsLook ? 0.12 : 0.5))
    if (marsLook) this.scene.add(new THREE.HemisphereLight(0xcfb39b, 0x4f3a2e, 0.5))
    const sun = new THREE.DirectionalLight(marsLook ? 0xfff0dd : 0xfff2e2, marsLook ? 2.7 : 1.8)
    if (marsLook) {
      sun.position.copy(MARS_SUN).multiplyScalar(80)
      this.renderer.toneMappingExposure = 1.12
    } else sun.position.set(20, 40, 10)
    this.scene.add(sun)
    this.stars = makeStarfield(2200)
    this.scene.add(this.stars)
    this.ground = terrainMesh(airless)
    this.ground.visible = false
    this.scene.add(this.ground)
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(this.globeR, 64, 40),
      new THREE.MeshStandardMaterial({ color: airless ? 0x9a958c : 0x8a4b32, roughness: 1 }),
    )
    this.planet.add(shell)
    this.planet.position.set(0, -this.globeR, 0)
    this.scene.add(this.planet)
    const globe = globeUrl(missionId)
    if (globe) {
      modelLoader().load(globe, (gltf) => {
        const model = gltf.scene
        seatSphere(model, this.globeR * 2)
        this.planet.add(model)
        shell.visible = false
      })
    }
    const mars = missionId === 'mars' || missionId === 'custom'
    if (!mars) {
      const terrain = landUrl(missionId)
      if (terrain) {
        loadTerrain(terrain, 1400, this.scene, (mesh) => {
          this.relief = mesh
          mesh.visible = false
          this.heightGrid = bakeHeightsRay(mesh, 680, 72)
          flattenPad(this.heightGrid, 14)
        }, this.siteId)
      }
    }
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 3.2, 14),
      new THREE.MeshBasicMaterial({ color: 0xffb15a, transparent: true, opacity: 0 }),
    )
    this.flame.visible = false
    this.chute = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 2.4, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide, roughness: 0.7 }),
    )
    this.chute.visible = false
    this.scene.add(this.ship)
    this.dress(craft)
    this.remember()
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
  }

  resize(): void {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  step(dt: number): DescentReadout {
    if (!this.done) this.direct(dt * this.pace)
    if (!this.done && !this.markedGate && this.altitude < 6000) {
      this.markedGate = true
      this.remember()
    }
    if (!this.done && !this.markedFinal && this.altitude < 1200) {
      this.markedFinal = true
      this.remember()
    }
    this.planet.rotation.y += dt * 0.015
    this.flame.visible = false
    this.chute.visible = false
    if (this.stars) tickStarfield(this.stars, dt, this.camera)
    if ((this.missionId === 'mars' || this.missionId === 'custom') && !this.marsGround && (this.beat !== 'approach' || this.beatT > 2)) {
      this.marsGround = buildMarsGround(this.siteId, true)
      this.marsGround.root.visible = false
      this.marsGround.sky.visible = false
      this.scene.add(this.marsGround.root, this.marsGround.sky)
    }
    const coming = this.beat === 'approach'
    const low = !coming && this.altitude <= 10_000
    this.planet.visible = coming
    if (this.relief) this.relief.visible = low
    if (this.marsGround) {
      this.marsGround.root.visible = low
      this.marsGround.sky.visible = low
      if (low) {
        this.marsGround.dress(this.scene)
        this.marsGround.haze(this.scene, this.altitude)
        this.marsGround.follow(this.camera)
      } else {
        this.scene.fog = null
        this.scene.background = new THREE.Color(0x050308)
      }
      if (this.stars) this.stars.visible = !low || this.altitude > 7000
    }
    const landed = Boolean(this.done) || this.altitude < 12
    const span = landed ? 0.36 : this.altitude > 20_000 ? 1.35 : this.altitude > 10_000 ? 0.95 : this.altitude > 2500 ? 0.5 : 0.4
    this.ship.scale.setScalar(span)
    if (landed || this.altitude > 2800) this.rig?.flames.forEach((plume) => { plume.visible = false })
    const body = 18 * span
    if (coming) {
      this.camera.position.copy(this.approachEye)
      this.camera.lookAt(this.approachAim)
    } else {
      if (this.blendCam < 1) this.blendCam = Math.min(1, this.blendCam + dt * 0.35)
      const close = Math.max(body * 2.35, landed ? 16 : 22)
      const dist = close * (this.view === 'side' ? 1.15 : this.view === 'ground' ? 0.92 : 1)
      const high = Math.min(1, this.altitude / 8000)
      const pitch = landed ? 0.42 : this.orbitPitch * (1 - high) + 0.32 * high
      const flat = Math.cos(pitch)
      const orbitEye = new THREE.Vector3(
        this.ship.position.x + Math.sin(this.orbitYaw) * flat * dist,
        this.ship.position.y + Math.sin(pitch) * dist * 0.55 + body * 0.12,
        this.ship.position.z + Math.cos(this.orbitYaw) * flat * dist,
      )
      const orbitAim = new THREE.Vector3(this.ship.position.x, this.ship.position.y + body * 0.28, this.ship.position.z)
      if (this.blendCam < 1) {
        this.camera.position.lerpVectors(this.approachEye, orbitEye, this.blendCam)
        const aim = this.approachAim.clone().lerp(orbitAim, this.blendCam)
        this.camera.lookAt(aim)
      } else {
        this.camera.position.copy(orbitEye)
        this.camera.lookAt(orbitAim)
      }
    }
    this.renderer.render(this.scene, this.camera)
    const limits = this.limits()
    return {
      altitude: Math.max(0, this.altitude),
      sink: this.sink,
      lateral: this.lateral,
      offset: this.offset,
      throttle: this.throttle,
      fuel: this.fuelKg,
      chute: this.chuteOpen,
      heat: this.heat,
      assist: this.assist,
      phase: this.done ?? 'fly',
      view: this.view,
      warnSink: this.sink > limits.sink * 0.75,
      warnSide: Math.abs(this.lateral) > limits.side * 0.75,
      warnFuel: this.fuelKg < Math.max(2, this.body.propellantKg * 0.12),
      warnHeat: this.heat > 0.62,
      warnOffset: Math.abs(this.offset) > limits.offset * 0.7,
      choice: !this.done && (this.beat === 'burn' || this.beat === 'chute') && this.altitude > 40,
      prompt: this.done === 'down'
        ? 'Landing confirmed. The gear is down.'
        : this.done === 'hard'
          ? 'Hard touchdown. The gear held.'
          : this.done === 'crash'
            ? this.reason || 'The gear could not take that arrival.'
            : this.line(),
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.renderer.dispose()
  }

  snapshot(): DescentSave {
    return {
      altitude: this.altitude,
      sink: this.sink,
      lateral: this.lateral,
      pitch: this.pitch,
      throttle: this.throttle,
      heat: this.heat,
      chuteOpen: this.chuteOpen,
      chuteFailed: this.chuteFailed,
      offset: this.offset,
      fuelKg: this.fuelKg,
      done: this.done,
    }
  }

  restore(saved: DescentSave): void {
    this.altitude = saved.altitude
    this.sink = saved.sink
    this.lateral = saved.lateral
    this.pitch = saved.pitch
    this.throttle = saved.throttle
    this.heat = saved.heat
    this.chuteOpen = saved.chuteOpen
    this.chuteFailed = saved.chuteFailed
    this.offset = saved.offset
    this.fuelKg = saved.fuelKg
    this.done = saved.done
    this.markedGate = saved.altitude < 6000
    this.markedFinal = saved.altitude < 1200
    this.beat = saved.altitude > 20_000 ? 'approach' : saved.altitude > 3000 ? 'entry' : this.chuteOpen ? 'chute' : 'burn'
  }

  rewind(): void {
    if (this.marks.length > 1) this.marks.pop()
    const mark = this.marks[this.marks.length - 1]
    if (!mark) return
    this.altitude = mark.altitude
    this.sink = mark.sink
    this.lateral = mark.lateral
    this.offset = mark.offset
    this.pitch = mark.pitch
    this.throttle = mark.throttle
    this.heat = mark.heat
    this.fuelKg = mark.fuel
    this.chuteOpen = mark.chuteOpen
    this.chuteFailed = mark.chuteFailed
    this.done = null
    this.reason = ''
    this.beat = this.altitude > 3000 ? 'entry' : 'burn'
    this.beatT = 0
    this.path = null
    this.markedGate = this.altitude < 6000
    this.markedFinal = this.altitude < 1200
  }

  private remember(): void {
    this.marks.push({
      altitude: this.altitude,
      sink: this.sink,
      lateral: this.lateral,
      offset: this.offset,
      pitch: this.pitch,
      throttle: this.throttle,
      heat: this.heat,
      fuel: this.fuelKg,
      chuteOpen: this.chuteOpen,
      chuteFailed: this.chuteFailed,
    })
    if (this.marks.length > 8) this.marks.shift()
  }

  private line(): string {
    if (!this.airless && (this.missionId === 'mars' || this.missionId === 'custom')) return this.edlLine()
    if (this.beat === 'approach') return 'Coming around the planet. The entry corridor is ahead.'
    if (this.beat === 'entry') return this.airless ? 'Powered entry. No air to lean on.' : 'Heat shield forward. Hold the entry.'
    if (this.beat === 'chute') return 'Parachute. The heat shield is falling clear.'
    if (this.beat === 'burn' && !this.path) return 'Still descending. Divert to clear ground, or hold course for the target.'
    if (this.beat === 'burn') return this.path === 'hold' ? 'Holding the target. Fly the engines down.' : 'Diverting. Fly the engines down.'
    return 'Flying the entry.'
  }

  /** The Mars 2020 order, spoken from the altitude the forces are actually at. */
  private edlLine(): string {
    if (this.done) return 'Touchdown. Cables cut. The descent stage flies away.'
    if (this.beat === 'approach') return 'Cruise stage still on. The planet is ahead.'
    if (this.altitude > 20000) return 'Cruise stage off. De-spin. The ship stops the roll and faces the entry.'
    if (this.altitude > 14000) return 'Balance masses ejected. Entry interface. The air is taking the speed and the shield is taking the heat.'
    if (this.altitude > 9000) return 'Guidance on. Thrusters hold the corridor.'
    if (this.altitude > 5500) return 'Heading alignment. Straighten up and fly right. Angle of attack to zero.'
    if (this.altitude > 2400) return this.chuteOpen
      ? 'Parachute open. Heat shield separating. Cameras are matching the ground.'
      : 'Parachute deploy is next. The shield stays on until the chute is flying.'
    if (this.altitude > 700) return 'Terrain match has a clear patch. Backshell separating. The rocket pack is free.'
    if (this.altitude > 30) return 'Engines coming down toward a slow walk. Wheels deploying.'
    return 'Touchdown. Cables cut. The descent stage flies away.'
  }

  private surfaceY(x: number, z: number): number {
    if (this.marsGround) return this.altitude < 120 ? this.marsGround.stand(x, z) : this.marsGround.height(x, z)
    if (this.heightGrid) return heightFromGrid(this.heightGrid, x, z)
    return 0
  }

  /**
   * Mars is flown down the corridor onto the divert ellipse.
   * Sink is held to the altitude, so the last kilometres are a descent, not a drop.
   */
  private guidedMars(dt: number): void {
    if (this.altitude < 9000 && this.altitude > 2800) {
      this.chuteOpen = true
      this.beat = 'chute'
    }
    if (this.altitude <= 2800) this.beat = 'burn'
    else if (this.altitude >= 9000) this.beat = 'entry'
    const target = this.altitude > 8000 ? 36
      : this.altitude > 3000 ? 14
      : this.altitude > 800 ? 4.5
      : this.altitude > 80 ? 1.6
      : 0.55
    const blend = 1 - Math.exp(-dt * 0.55)
    this.sink += (target - this.sink) * blend
    this.vx += ((this.altitude > 8000 ? 18 : this.altitude > 2500 ? 4 : 0) - this.vx) * blend
    this.throttle = this.altitude < 2500 && this.altitude > 6 ? Math.min(0.8, 0.22 + this.sink / 18) : 0
    this.heading = 0
    this.altitude -= this.sink * dt
    const pull = 1 - Math.exp(-dt * 0.06)
    this.trackX += (MARS_LANDING[0] - this.trackX) * pull
    this.trackZ += (MARS_LANDING[1] - this.trackZ) * pull
    this.heat = this.altitude > 8000 ? Math.min(0.2, this.heat + dt * 0.01) : this.heat * 0.99
    if (this.altitude > 3) return
    this.altitude = 0
    this.sink = 0.6
    this.trackX = MARS_LANDING[0]
    this.trackZ = MARS_LANDING[1]
    this.done = 'down'
  }

  /** Drag, lift and gravity. Pace only stretches the clock. The path is not a keyframe. */
  private flyForces(dt: number): void {
    if (!this.airless && (this.missionId === 'mars' || this.missionId === 'custom')) {
      this.guidedMars(dt)
      return
    }
    const g = Math.max(0.2, this.body.gravity)
    const rho = this.airless ? 0 : exponentialDensity(this.body.surfaceRho, this.altitude, this.body.scaleHeightM)
    const speed = Math.hypot(this.vx, this.sink)
    const q = dynamicPressure(rho, speed)
    const area = this.chuteOpen ? 48 : this.body.shield ? 11 : 6.5
    const cd = this.chuteOpen ? 1.6 : this.body.shield ? 1.45 : 0.62
    const drag = q * cd * area
    const mass = Math.max(180, this.body.massKg)
    const alongH = speed > 1 ? this.vx / speed : 0
    const alongDown = speed > 1 ? this.sink / speed : 1
    const aoa = this.beat === 'burn' ? 0.22 : 0.1
    const lift = this.chuteOpen || this.airless ? 0 : q * 0.55 * area * Math.sin(aoa * 2)
    if (this.altitude < 11000 && speed < 900 && this.body.chute && !this.airless && !this.chuteFailed) {
      this.chuteOpen = true
      this.beat = 'chute'
    }
    if (this.altitude < 2400 || this.airless) {
      this.beat = 'burn'
      const aim = this.body.legs ? 2.2 : 6
      this.throttle = Math.max(0, Math.min(1, (this.sink - aim) / 18))
      if (this.fuelKg <= 0) this.throttle = 0
    } else if (!this.chuteOpen) {
      this.beat = 'entry'
      this.throttle = this.airless ? 0.35 : 0
    }
    const thrust = this.throttle * Math.min(Math.max(0, this.body.thrustN), mass * (g + 6))
    this.fuelKg = Math.max(0, this.fuelKg - dt * (thrust / 2200))
    const up = -g + (drag * alongDown) / mass + thrust / mass
    this.sink -= up * dt
    if (this.sink < -1.2) this.sink = -1.2
    this.vx = Math.max(0, this.vx - (drag * alongH) / mass * dt)
    if (speed > 30) this.heading += (lift / (mass * Math.max(speed, 40))) * dt
    this.altitude -= this.sink * dt
    this.trackX += Math.sin(this.heading) * this.vx * 0.02 * dt
    this.trackZ += Math.cos(this.heading) * this.vx * 0.02 * dt
    if (this.altitude < 2400 && this.marsGround) {
      const pull = 1 - Math.exp(-dt * 0.85)
      this.trackX += (MARS_LANDING[0] - this.trackX) * pull
      this.trackZ += (MARS_LANDING[1] - this.trackZ) * pull
    }
    const heatIn = this.airless ? 0 : Math.min(1, q / 18000)
    this.heat = this.body.shield ? heatIn * 0.45 : Math.max(this.heat * 0.98, heatIn)
    if (this.altitude > 4) return
    this.altitude = 0
    const soft = this.sink < (this.body.legs ? 3.4 : 6.5) && (this.airless || this.body.shield || this.heat < 0.85)
    this.done = soft ? 'down' : this.sink < 9 ? 'hard' : 'crash'
    this.sink = Math.max(0, this.sink)
    if (!this.body.shield && !this.airless && this.heat > 0.8) {
      this.done = this.done === 'crash' ? 'crash' : 'hard'
      this.reason = 'The shield was not on the craft. The entry scorched the hull, and the gear still caught it.'
    }
  }

  private direct(dt: number): void {
    const ease = (value: number) => value * value * (3 - 2 * value)
    if (this.beat === 'approach') {
      this.beatT += dt
      const p = Math.min(1, this.beatT / 11)
      const k = ease(p)
      this.altitude = 80_000 + (10_000 - 80_000) * k
      this.sink = 90 - k * 54
      this.vx = 28 - k * 10
      this.throttle = 0
      this.heat = 0
      this.heading = 0
      this.orbitYaw = Math.PI
      this.orbitPitch = 0.28
      this.ship.position.set(0, 0, 0)
      this.ship.rotation.set(0.05, 0, 0)
      const dist = this.globeR + 24 + (1 - k) * 520
      this.planet.position.set(0, -this.globeR * 0.22, dist)
      this.approachEye.set(-18, 8, -32)
      this.approachAim.set(0, 1.5, dist * 0.42)
      if (p >= 1) {
        this.beat = 'entry'
        this.beatT = 0
        this.blendCam = 0
        this.altitude = this.airless ? 4000 : 10_000
        this.sink = this.airless ? 40 : 36
        this.vx = this.airless ? 12 : 18
        this.heading = 0
        this.trackX = MARS_LANDING[0]
        this.trackZ = MARS_LANDING[1]
        this.planet.position.set(0, -this.globeR, 0)
      }
    } else {
      this.beatT += dt
      this.flyForces(dt)
    }
    if (this.beat !== 'approach') {
      const ground = this.surfaceY(this.trackX, this.trackZ)
      const lift = this.done ? 0.55 : this.marsGround ? Math.min(420, this.altitude * 0.042) : visualAlt(this.altitude)
      this.ship.position.set(this.trackX, ground + lift, this.trackZ)
      const lean = Math.atan2(this.sink, Math.max(14, this.vx))
      const straighten = this.altitude < 2200 ? Math.max(0, (this.altitude - 500) / 1700) : 1
      const nose = this.done || this.altitude < 500 ? 0 : lean * 0.28 * straighten
      this.ship.rotation.set(nose, this.heading, 0)
      if (this.blendCam === 0) {
        this.approachEye.set(this.ship.position.x - 18, this.ship.position.y + 8, this.ship.position.z - 32)
        this.approachAim.set(this.ship.position.x, this.ship.position.y + 2, this.ship.position.z + 48)
      }
    }
    if (this.heatGlow) {
      const mat = this.heatGlow.material as THREE.MeshBasicMaterial
      mat.opacity = this.beat === 'entry' && !this.airless ? this.heat * 0.42 : 0
      this.heatGlow.visible = mat.opacity > 0.02
    }
    const lit = this.altitude < 2500 && this.altitude > 8 && !this.done && this.throttle > 0.05 ? this.throttle : 0
    this.rig?.flames.forEach((plume) => {
      const mesh = plume as THREE.Mesh
      mesh.visible = lit > 0.04
      setFlame(mesh, lit, this.beatT)
    })
  }

  private limits(): { sink: number; side: number; offset: number } {
    const legs = this.body.legs ? 1.28 : 1
    return {
      sink: (3.2 + (1 - this.difficulty) * 2.4) * legs,
      side: 3.5 + (1 - this.difficulty) * 3,
      offset: 18 + (1 - this.difficulty) * 22,
    }
  }

  choose(path: 'divert' | 'hold'): void {
    if (this.done || this.beat === 'entry') return
    this.path = path
    this.offset = path === 'divert' ? 6 : 28 * this.difficulty
  }

  setCamera(view: 'chase' | 'ground' | 'side'): void {
    this.view = view
  }

  /** Speeds the descent clock. 1 is real time, 4 is the default, 16 is a fast pass. */
  setPace(pace: number): void {
    this.pace = Math.max(1, Math.min(16, pace))
  }

  private dress(config: SpacecraftConfig): void {
    const signature = `hull|${config.name}|${config.hullSeed ?? 0}|${this.missionId}`
    if (signature === this.craftSignature) return
    this.craftSignature = signature
    this.ship.clear()
    this.rig = attachOrbiter(this.ship, 18, true, undefined, config, this.missionId)
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(3.8, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffb37a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    glow.scale.set(1.1, 1.6, 1.1)
    this.heatGlow = glow
    this.ship.add(glow)
    this.rig?.flames.forEach((plume) => {
      plume.visible = false
    })
  }

  private onPointerDown = (event: PointerEvent) => {
    this.dragging = true
    this.lastX = event.clientX
    this.lastY = event.clientY
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging) return
    this.orbitYaw -= (event.clientX - this.lastX) * 0.008
    this.orbitPitch = Math.max(-0.2, Math.min(1.15, this.orbitPitch + (event.clientY - this.lastY) * 0.005))
    this.lastX = event.clientX
    this.lastY = event.clientY
  }

  private onPointerUp = () => {
    this.dragging = false
  }

  private onKey = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()
    if (event.type === 'keydown' && !event.repeat && key === 'v') {
      this.view = this.view === 'chase' ? 'ground' : this.view === 'ground' ? 'side' : 'chase'
    }
    if (event.type === 'keydown') this.keys.add(key === ' ' ? ' ' : key)
    else this.keys.delete(key === ' ' ? ' ' : key)
  }
}
