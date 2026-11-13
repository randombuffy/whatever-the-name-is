import * as THREE from 'three'
import type { AscentState } from '../domain/ascent'
import type { SpacecraftConfig } from '../domain/types'
import { disposeCraft } from './craft'
import { attachLaunchStack, attachOrbiter, type LaunchRig } from './launchStack'
import { makeFlame, setFlame } from './exhaust'
import { loopFile, playGroup } from '../ui/audio'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { MARS_ORBIT_AU } from '../domain/constants'
import { trackMove } from '../input/moveKeys'
import { modelLoader, seatSphere } from './gltf'
import { bindWalkAstronaut, type WalkAstronaut } from './walkAstronaut'
import { useMission } from '../store/useMission'
import { viewRatio } from './pixels'
import { makeStarfield, tickStarfield } from './starfield'

export type PadAction = 'countdown' | 'engineering' | 'mission' | 'door' | 'briefing' | 'destination'
export type AscentView = 'chase' | 'cinematic' | 'side' | 'tower' | 'nose'

export interface PadContact {
  prompt: string
  place: string
  action: PadAction | null
  /** Degrees clockwise from world +Z. */
  heading: number
}

interface Block {
  box: THREE.Box3
  place: string
}

const SKY_VERT = `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const SKY_FRAG = `
  varying vec3 vPos;
  uniform float uLift;
  void main() {
    vec3 dir = normalize(vPos);
    float h = dir.y;
    vec3 horizon = vec3(0.95, 0.62, 0.38);
    vec3 mid = vec3(0.45, 0.68, 0.90);
    vec3 zenith = vec3(0.04, 0.16, 0.42);
    vec3 day = mix(horizon, mid, smoothstep(0.0, 0.18, h));
    day = mix(day, zenith, smoothstep(0.12, 0.72, h));
    float climb = smoothstep(0.0, 1.0, uLift);
    vec3 dusk = vec3(0.12, 0.07, 0.18);
    vec3 space = vec3(0.0);
    vec3 color = mix(day, dusk, smoothstep(0.12, 0.62, climb));
    color = mix(color, space, smoothstep(0.45, 1.0, climb));
    vec3 sunDir = normalize(vec3(0.42, 0.28, 0.18));
    float sun = pow(max(dot(dir, sunDir), 0.0), 380.0);
    float glow = pow(max(dot(dir, sunDir), 0.0), 5.0);
    float daylight = 1.0 - smoothstep(0.15, 0.85, uLift);
    float spaceAmt = smoothstep(0.4, 1.0, climb);
    color += (vec3(1.0, 0.93, 0.72) * sun * 1.4 + vec3(1.0, 0.55, 0.28) * glow * 0.45) * mix(daylight, 0.9, spaceAmt);
    vec3 cell = floor(dir * 260.0);
    float star = fract(sin(dot(cell, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    float up = smoothstep(0.15, 0.55, h);
    color += vec3(step(0.996, star) * climb * mix(up, 1.0, climb));
    gl_FragColor = vec4(color, 1.0);
  }
`
const WATER_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const WATER_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    float wave = sin(vUv.x * 46.0 + uTime * 0.8) * sin(vUv.y * 30.0 - uTime * 0.55);
    float rip = sin((vUv.x + vUv.y) * 90.0 + uTime);
    vec3 deep = vec3(0.03, 0.10, 0.13);
    vec3 lit = vec3(0.10, 0.22, 0.24);
    vec3 color = mix(deep, lit, clamp(wave * 0.35 + 0.22 + rip * 0.03, 0.0, 1.0));
    gl_FragColor = vec4(color, 0.82);
  }
`

export class PadWorld {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(62, 1, 0.08, 48000)
  private canvas: HTMLCanvasElement
  private blocks: Block[] = []
  private stack = new THREE.Group()
  private boosters: THREE.Group
  private fairing: THREE.Group
  private plumes: THREE.Mesh[] = []
  private upperPlume: THREE.Mesh | null = null
  private upperStage: THREE.Mesh | null = null
  private flameLight: THREE.PointLight
  private ship = new THREE.Group()
  private hangarMount = new THREE.Group()
  private craftSignature = ''
  private hangarSignature = ''
  private debris: { mesh: THREE.Object3D; velocity: THREE.Vector3; spin: number }[] = []
  private smoke: THREE.Points | null = null
  private smokeLife = new Float32Array(0)
  private smokeVel: THREE.Vector3[] = []
  private dust: THREE.Mesh | null = null
  private crew: THREE.Group
  private leftLeg: THREE.Group
  private rightLeg: THREE.Group
  private leftArm: THREE.Group
  private rightArm: THREE.Group
  private feet = new THREE.Vector3(-6, 0, 22)
  private velocity = new THREE.Vector3()
  private grounded = true
  private lookYaw = Math.atan2(-26, 24)
  private visitedControl = false
  private faceYaw = Math.atan2(-16, 0)
  private pitch = -0.08
  private firstPerson = false
  private driving = false
  private onFoot = true
  private flyingLook = false
  private dragLook = false
  private dragX = 0
  private dragY = 0
  private car = new THREE.Group()
  private carPos = new THREE.Vector3(20, 0, 34)
  private carYaw = 0
  private carSpeed = 0
  private wheelSpin = 0
  private steerAngle = 0
  private wheelRadius = 0.48
  private readonly wheelbase = 3.15
  private wheels: THREE.Object3D[] = []
  private wheelRests: THREE.Quaternion[] = []
  private wheelAxle: 'x' | 'z' = 'z'
  private walkers: Walker[] = []
  private gates: Gate[] = []
  private beacons: THREE.Mesh[] = []
  private steam: THREE.Points | null = null
  private time = 0
  private note = ''
  private noteUntil = 0
  private walkPhase = 0
  private coyote = 0.14
  private jumpLatched = false
  private launchCleared = false
  private controlAt = new THREE.Vector3(-32, 0, 46)
  private chevrons: THREE.Mesh[] = []
  private walkBody: WalkAstronaut | null = null
  private ascentView: AscentView = 'cinematic'
  private viewLocked = false
  private crewStowed = false
  private readonly padSeat = new THREE.Vector3(0, 0, 0)
  private launchRig: LaunchRig | null = null
  private peeledFairing = false
  private peeledBooster = false
  private castOffs: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = []
  private spent: { obj: THREE.Object3D; vel: THREE.Vector3 }[] = []
  private locked = false
  private lookEnabled = true
  private keys = new Set<string>()
  private skyMesh: THREE.Mesh | null = null
  private groundMesh: THREE.Mesh | null = null
  private cloudShell: THREE.Mesh | null = null
  private localClouds: THREE.Mesh[] = []
  private skyLift = 0
  private climbAlt = 0
  private spaceGroup = new THREE.Group()
  private spaceStars: THREE.Group | null = null
  private hemi: THREE.HemisphereLight
  private skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: { uLift: { value: 0 } },
  })
  private waterMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 } },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  })
  private marker: THREE.Mesh

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(viewRatio())
    this.renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene.fog = new THREE.Fog(0x6a8454, 420, 1600)
    this.skyMesh = this.makeSky()
    this.scene.add(this.skyMesh)
    this.hemi = new THREE.HemisphereLight(0xc5d7ee, 0x6a624e, 0.72)
    this.scene.add(this.hemi)
    const sun = new THREE.DirectionalLight(0xfff4e2, 2.15)
    sun.position.set(70, 110, 40)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -100
    sun.shadow.camera.right = 100
    sun.shadow.camera.top = 100
    sun.shadow.camera.bottom = -100
    sun.shadow.camera.near = 10
    sun.shadow.camera.far = 260
    sun.shadow.bias = -0.00035
    this.scene.add(sun)
    this.buildGround()
    this.buildComplex()
    this.feet.y = this.surfaceY(this.feet.x, this.feet.z)
    this.carPos.y = this.surfaceY(this.carPos.x, this.carPos.z)
    this.boosters = new THREE.Group()
    this.fairing = new THREE.Group()
    this.flameLight = new THREE.PointLight(0xff9944, 0, 90)
    this.flameLight.position.y = 1.35
    this.buildBooster()
    this.buildExhaust()
    this.stack.add(this.boosters, this.fairing, this.flameLight, this.ship)
    this.scene.add(this.stack)
    const legs = this.makeCrew()
    this.crew = legs.group
    this.leftLeg = legs.leftLeg
    this.rightLeg = legs.rightLeg
    this.leftArm = legs.leftArm
    this.rightArm = legs.rightArm
    this.scene.add(this.crew)
    this.buildTransport()
    this.buildPeople()
    this.scene.add(this.camera)
    this.loadRover()
    this.loadGroundProps()
    this.marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.045, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e }),
    )
    this.marker.rotation.x = -Math.PI / 2
    this.marker.visible = false
    this.scene.add(this.marker)
    this.buildGuide()
    this.dressSky()
    this.buildSpace()
    canvas.addEventListener('click', this.onClick)
    canvas.addEventListener('pointerdown', this.onDragDown)
    window.addEventListener('pointermove', this.onDragMove)
    window.addEventListener('pointerup', this.onDragUp)
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

  setAscentView(view: AscentView): void {
    this.ascentView = view
    this.viewLocked = true
  }

  /** Countdown and flight. The suit stays in the cabin. The camera leaves the player and watches the stack. */
  setCrewStowed(stowed: boolean): void {
    if (stowed && !this.crewStowed) {
      this.firstPerson = false
      this.ascentView = 'cinematic'
      this.viewLocked = false
      this.lookYaw = 0.85
      this.pitch = 0.28
      if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    }
    this.crewStowed = stowed
  }

  /** False while a menu is open, so the cursor stays free for clicks. */
  setLookEnabled(enabled: boolean): void {
    this.lookEnabled = enabled
    if (!enabled && document.pointerLockElement === this.canvas) document.exitPointerLock()
  }

  /** Player position for the corner map. North is +Z. */
  mapBlip(): { x: number; z: number; yaw: number } {
    if (this.driving) return { x: this.carPos.x, z: this.carPos.z, yaw: this.carYaw }
    return { x: this.feet.x, z: this.feet.z, yaw: this.lookYaw }
  }

  step(dt: number, craft: SpacecraftConfig | null, ascent: AscentState | null, dressed = false): PadContact {
    this.launchCleared = dressed
    if (craft) {
      this.mountCraft(craft, true)
      this.mountHangar(craft, true)
    } else {
      this.ship.visible = false
      this.hangarMount.visible = false
      for (const plume of this.plumes) plume.visible = false
    }
    this.time += dt
    this.waterMat.uniforms.uTime.value = this.time
    this.tickGates(dt)
    this.tickSteam(dt)
    this.tickBeacons()
    const flying = Boolean(ascent && (ascent.altitudeM > 0.4 || ascent.phase === 'ignition' || ascent.phase === 'liftoff' || ascent.phase === 'orbit' || ascent.throttle > 0.2 && ascent.phase !== 'pad'))
    const watching = flying || this.crewStowed
    this.onFoot = !watching
    this.flyingLook = watching
    if (watching && document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.crew.visible = !watching && !this.driving && !this.crewStowed
    this.tickPeople(dt)
    if (!ascent && !this.crewStowed) {
      this.viewLocked = false
      this.recoverStack()
    }
    if (watching || this.driving) {
      for (const chevron of this.chevrons) chevron.visible = false
    }
    if (flying && ascent) this.placeStack(ascent, dt)
    else if (this.crewStowed) this.frameLaunchCinema()
    else if (this.driving) this.drive(dt)
    else this.walk(dt)
    if (!flying) this.tickSmoke(false, 0, false, dt)
    this.tickDebris(dt)
    if (this.cloudShell) this.cloudShell.rotation.y += dt * 0.012
    for (const cloud of this.localClouds) {
      cloud.position.x += Math.sin(this.time * 0.04 + cloud.position.z * 0.01) * dt * 1.6
      cloud.rotation.z = Math.sin(this.time * 0.08 + cloud.position.x * 0.008) * 0.04
    }
    if (this.skyMesh) this.skyMesh.position.copy(this.camera.position)
    if (this.spaceStars) this.spaceStars.position.copy(this.camera.position)
    this.renderer.render(this.scene, this.camera)
    if (flying) {
      const heading = Math.round(((this.lookYaw * 180) / Math.PI + 360) % 360)
      return { prompt: 'Arrow keys pitch and yaw. Shift and Ctrl set throttle. X aborts. Drag to look around the stack.', place: 'Ascent', action: null, heading }
    }
    if (this.crewStowed) {
      const heading = Math.round(((this.lookYaw * 180) / Math.PI + 360) % 360)
      return { prompt: 'The stack is on the clock.', place: 'Ascent', action: null, heading }
    }
    return this.contact()
  }

  dispose(): void {
    this.canvas.removeEventListener('click', this.onClick)
    this.canvas.removeEventListener('pointerdown', this.onDragDown)
    window.removeEventListener('pointermove', this.onDragMove)
    window.removeEventListener('pointerup', this.onDragUp)
    document.removeEventListener('pointerlockchange', this.onLock)
    window.removeEventListener('mousemove', this.onMove)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.clearDebris()
    this.smoke?.geometry.dispose()
    const smokeMat = this.smoke?.material
    if (smokeMat && !Array.isArray(smokeMat)) smokeMat.dispose()
    this.dust?.geometry.dispose()
    const dustMat = this.dust?.material
    if (dustMat && !Array.isArray(dustMat)) dustMat.dispose()
    this.renderer.dispose()
  }

  private mountCraft(config: SpacecraftConfig, dressed: boolean): void {
    if (!dressed) {
      if (this.craftSignature === 'empty') return
      disposeCraft(this.ship)
      this.ship.clear()
      this.ship.visible = false
      this.launchRig = null
      this.craftSignature = 'empty'
      return
    }
    const missionId = useMission.getState().missionId ?? 'lunar'
    const signature = `${missionId}|${config.name}|${config.hullSeed ?? 0}|${config.parts.map((part) => `${part.instanceId}:${part.specId}:${part.enabled}:${part.fill}`).join('|')}`
    if (signature === this.craftSignature) return
    this.craftSignature = signature
    disposeCraft(this.ship)
    this.ship.clear()
    this.ship.visible = true
    this.launchRig = null
    attachLaunchStack(this.ship, (rig) => { this.launchRig = rig }, 22, config, missionId)
    this.boosters.visible = false
    this.showShip()
  }

  private mountHangar(config: SpacecraftConfig, dressed: boolean): void {
    if (!dressed) {
      this.hangarMount.visible = false
      this.hangarSignature = ''
      return
    }
    const missionId = useMission.getState().missionId ?? 'lunar'
    const signature = `hangar|${missionId}|${config.name}|${config.hullSeed ?? 0}|${config.parts.map((part) => `${part.instanceId}:${part.specId}:${part.enabled}`).join('|')}`
    if (signature === this.hangarSignature) return
    this.hangarSignature = signature
    disposeCraft(this.hangarMount)
    this.hangarMount.clear()
    this.hangarMount.visible = true
    attachOrbiter(this.hangarMount, 4.2, true, undefined, config, missionId)
  }

  private recoverStack(): void {
    this.clearDebris()
    this.stack.position.copy(this.padSeat)
    this.stack.rotation.set(0, 0, 0)
    this.stack.scale.setScalar(1)
    this.showShip()
    this.setPlumes(0)
    if (this.upperPlume) this.upperPlume.visible = false
    this.flameLight.position.y = 1.35
    this.flameLight.intensity = 0
    if (this.dust) this.dust.visible = false
    this.dressAtmosphere(0, 0.016)
  }

  private openFairing(spread: number): void {
    const left = this.fairing.children[0]
    const right = this.fairing.children[1]
    if (!left || !right) return
    left.rotation.z = spread
    right.rotation.z = -spread
    left.position.x = -0.4 - spread * 0.85
    right.position.x = 0.4 + spread * 0.85
  }

  /** Wide orbit of the stack. Used from countdown through ascent so this is never a player camera. */
  private frameLaunchCinema(): void {
    this.stack.position.copy(this.padSeat)
    this.stack.rotation.set(0, 0, 0)
    const focus = new THREE.Vector3(this.padSeat.x, this.padSeat.y + 16, this.padSeat.z)
    this.aimLaunchCamera(focus, this.time)
  }

  private aimLaunchCamera(focus: THREE.Vector3, tSec: number): void {
    const view = this.ascentView
    let yaw = this.lookYaw
    let pitch = Math.max(-0.2, Math.min(0.85, this.pitch))
    let dist = 48
    if (view === 'cinematic' && !this.viewLocked && !this.dragLook) {
      yaw = 0.7 + tSec * 0.12
      pitch = 0.3
      dist = 64
    } else if (view === 'tower') {
      yaw = 2.55
      pitch = 0.52
      dist = 58
    } else if (view === 'side') {
      yaw = 1.2
      pitch = 0.14
      dist = 48
    } else if (view === 'nose') {
      yaw = 0.05
      pitch = 0.78
      dist = 32
    } else if (view === 'chase') {
      yaw = Math.PI
      pitch = 0.16
      dist = 42
    } else {
      dist = 58
    }
    const space = Math.min(1, Math.max(0, (this.climbAlt - 55_000) / 90_000))
    dist += space * 56
    pitch = pitch * (1 - space * 0.22) + 0.28 * space
    const flat = Math.cos(pitch)
    this.camera.position.set(
      focus.x + Math.sin(yaw) * flat * dist,
      focus.y + Math.sin(pitch) * dist + 8 + space * 18,
      focus.z + Math.cos(yaw) * flat * dist,
    )
    const look = focus.clone()
    look.y += space * 6
    this.camera.lookAt(look)
    this.stack.scale.setScalar(1 + space * 0.55)
  }

  private placeStack(ascent: AscentState, dt: number): void {
    const alt = ascent.altitudeM / 35
    const range = ascent.downrangeM / 35
    this.stack.position.set(range + this.padSeat.x, alt, this.padSeat.z)
    if (!this.viewLocked) this.ascentView = 'cinematic'
    const lean = Math.max(-1.35, Math.min(0.15, ascent.flightPathRad - Math.PI / 2))
    this.stack.rotation.set(0, ascent.yawRad, lean)
    if (this.launchRig) {
      const burning = ascent.throttle > 0.05 && ascent.phase !== 'abort' && ascent.phase !== 'orbit'
      const flameScale = 1.6 + ascent.throttle * 3.4
      for (const flame of this.launchRig.flames) {
        const mesh = flame as THREE.Mesh
        setFlame(mesh, burning ? Math.min(1, ascent.throttle * 1.35) : 0, this.time)
        mesh.scale.set(1.4 + ascent.throttle * 1.1, flameScale, 1.4 + ascent.throttle * 1.1)
      }
      this.boosters.visible = false
    }
    const burning = ascent.throttle > 0.05 && !ascent.aborted && ascent.phase !== 'abort' && ascent.phase !== 'orbit'
    const upperBurn = false
    if (burning && ascent.altitudeM < 500) {
      const shake = (0.045 + ascent.throttle * 0.07) * (1 - ascent.altitudeM / 500)
      this.stack.position.x += Math.sin(this.time * 86) * shake
      this.stack.position.z += Math.cos(this.time * 71) * shake * 0.65
    }
    this.showShip()
    const flicker = 0.82 + Math.sin(ascent.tSec * 46) * 0.08
    this.setPlumes(burning ? ascent.throttle * flicker : 0)
    if (this.upperPlume) {
      this.upperPlume.visible = upperBurn
      const scale = upperBurn ? ascent.throttle * flicker : 0
      this.upperPlume.scale.set(0.7 + scale * 0.45, 0.45 + scale, 0.7 + scale * 0.45)
    }
    this.flameLight.position.set(0, 0.7, 0)
      this.flameLight.intensity = burning || upperBurn ? 28 + ascent.throttle * 42 : 0
    this.tickSmoke(burning, ascent.throttle, alt < 18, dt)
    if (this.dust) {
      const onPad = burning && ascent.altitudeM < 180
      this.dust.visible = onPad
      this.dust.scale.setScalar(1 + ascent.throttle * 1.4 + ascent.altitudeM * 0.01)
      const mat = this.dust.material as THREE.MeshBasicMaterial
      mat.opacity = onPad ? 0.18 + ascent.throttle * 0.28 : 0
    }
    const focus = new THREE.Vector3(this.stack.position.x, this.stack.position.y + 14, this.stack.position.z)
    this.aimLaunchCamera(focus, this.time)
    if (ascent.fairingGone && !this.peeledFairing) {
      this.peeledFairing = true
      if (this.launchRig) this.dropVehiclePart(this.launchRig.tank, 0.4)
      else this.peel('fairing')
    }
    if (ascent.boosterGone && !this.peeledBooster) {
      this.peeledBooster = true
      if (this.launchRig) {
        this.dropVehiclePart(this.launchRig.left, -1)
        this.dropVehiclePart(this.launchRig.right, 1)
      } else this.peel('booster')
    }
    this.tickPeel(dt)
    if (burning && ascent.altitudeM < 4000) {
      const mag = ascent.throttle * 0.08 * Math.exp(-ascent.altitudeM / 700)
      this.camera.position.x += Math.sin(this.time * 73) * mag
      this.camera.position.y += Math.cos(this.time * 91) * mag * 0.4
    }
    this.dressAtmosphere(ascent.altitudeM, dt)
  }

  /** Sky, clouds, and fog follow the real altitude through the atmospheric layers. */
  private dressAtmosphere(altitudeM: number, dt: number): void {
    this.climbAlt = altitudeM
    const target = altitudeM <= 0
      ? 0
      : altitudeM < 20_000
        ? (altitudeM / 20_000) * 0.22
        : altitudeM < 80_000
          ? 0.22 + ((altitudeM - 20_000) / 60_000) * 0.38
          : altitudeM < 200_000
            ? 0.6 + ((altitudeM - 80_000) / 120_000) * 0.28
            : 0.88 + Math.min(0.12, (altitudeM - 200_000) / 800_000)
    this.skyLift += (target - this.skyLift) * Math.min(1, dt * 1.4)
    const lift = this.skyLift
    this.skyMat.uniforms.uLift.value = lift
    const cloudFade = 1 - Math.min(1, altitudeM / 28_000)
    if (this.cloudShell) {
      this.cloudShell.visible = altitudeM > 1800
      const mat = this.cloudShell.material
      if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = 0.9 * cloudFade
    }
    const groundFade = 1 - Math.min(1, Math.max(0, (altitudeM - 900) / 7000))
    if (this.groundMesh) {
      const mat = this.groundMesh.material
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.transparent = groundFade < 0.98
        mat.opacity = groundFade
      }
      this.groundMesh.visible = groundFade > 0.04
    }
    this.hemi.intensity = 0.72 * (1 - Math.min(0.82, lift)) + 0.08
    const space = Math.min(1, Math.max(0, (altitudeM - 40_000) / 90_000))
    this.spaceGroup.visible = space > 0.02
    this.spaceGroup.traverse((node) => {
      const line = node as THREE.Line
      const mat = line.material
      if (!mat || Array.isArray(mat) || !(mat instanceof THREE.LineBasicMaterial)) return
      mat.opacity = space * 0.7
    })
    if (this.spaceStars) {
      this.spaceStars.visible = space > 0.04
      this.spaceStars.traverse((node) => {
        const mat = (node as THREE.Points).material
        if (!mat || Array.isArray(mat)) return
        if (mat instanceof THREE.PointsMaterial || mat instanceof THREE.SpriteMaterial) mat.opacity = space * (mat instanceof THREE.SpriteMaterial ? 0.42 : 0.95)
      })
    }
    const fog = this.scene.fog as THREE.Fog
    if (altitudeM > 70_000) {
      const clear = Math.min(1, (altitudeM - 70_000) / 80_000)
      fog.color.setRGB(0.02 * (1 - clear), 0.03 * (1 - clear), 0.05 * (1 - clear))
      fog.near = 4000 + clear * 18000
      fog.far = 16000 + clear * 28000
    } else {
      const day = new THREE.Color(0x6a8454)
      const dusk = new THREE.Color(0x1a1028)
      fog.color.copy(day).lerp(dusk, Math.min(1, lift))
      fog.near = 420 + lift * 900
      fog.far = 1600 + lift * 5000
    }
    this.camera.far = 12000 + Math.min(52000, altitudeM / 6)
    this.camera.updateProjectionMatrix()
    if (this.spaceStars) tickStarfield(this.spaceStars, dt, this.camera)
  }

  private tickDebris(dt: number): void {
    const gravity = 9.81 / 35
    for (const bit of this.debris) {
      bit.velocity.y -= gravity * dt
      bit.mesh.position.addScaledVector(bit.velocity, dt)
      bit.mesh.rotation.z += bit.spin * dt
      bit.mesh.rotation.x += bit.spin * 0.35 * dt
    }
  }

  private clearDebris(): void {
    for (const bit of this.debris) this.scene.remove(bit.mesh)
    this.debris = []
    for (const bit of this.castOffs) {
      this.scene.remove(bit.mesh)
      bit.mesh.geometry.dispose()
      ;(bit.mesh.material as THREE.Material).dispose()
    }
    this.castOffs = []
    for (const bit of this.spent) this.scene.remove(bit.obj)
    this.spent = []
    if (this.launchRig) {
      for (const part of [this.launchRig.left, this.launchRig.right, this.launchRig.tank]) {
        if (part) part.visible = true
      }
    }
    this.peeledFairing = false
    this.peeledBooster = false
  }

  /** A real tank or booster leaves the stack and falls away. The original stays hidden until reset. */
  private dropVehiclePart(part: THREE.Object3D | null, side: number): void {
    if (!part || !part.visible) return
    part.updateWorldMatrix(true, true)
    const clone = part.clone(true)
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scl = new THREE.Vector3()
    part.matrixWorld.decompose(pos, quat, scl)
    clone.position.copy(pos)
    clone.quaternion.copy(quat)
    clone.scale.copy(scl)
    this.scene.add(clone)
    part.visible = false
    this.spent.push({ obj: clone, vel: new THREE.Vector3(side * 9, 4, side * 1.5) })
  }

  /** Spent fairing and booster halves slide off to either side and fade, instead of vanishing. */
  private peel(kind: 'fairing' | 'booster'): void {
    const base = this.stack.position.clone()
    const tall = kind === 'fairing'
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(tall ? 1.6 : 2.4, tall ? 5.5 : 9, 0.28),
        new THREE.MeshStandardMaterial({ color: 0xf2efe8, transparent: true, opacity: 1, roughness: 0.42, metalness: 0.35 }),
      )
      mesh.position.set(base.x + side * 1.1, base.y + (tall ? 16 : 5), base.z)
      mesh.rotation.z = side * 0.15
      this.scene.add(mesh)
      this.castOffs.push({
        mesh,
        vel: new THREE.Vector3(side * (tall ? 7 : 4.5), tall ? 1.4 : 0.6, side * 0.8),
        life: 1,
      })
    }
  }

  private tickPeel(dt: number): void {
    for (const bit of this.castOffs) {
      bit.vel.y -= 1.6 * dt
      bit.mesh.position.addScaledVector(bit.vel, dt)
      bit.mesh.rotation.y += bit.vel.x * 0.04 * dt
      bit.life -= dt * 0.16
      const mat = bit.mesh.material as THREE.MeshStandardMaterial
      mat.opacity = Math.max(0, bit.life)
    }
    for (const bit of this.spent) {
      bit.vel.y -= 6 * dt
      bit.obj.position.addScaledVector(bit.vel, dt)
      bit.obj.rotateZ(bit.vel.x * 0.04 * dt)
    }
  }

  private setPlumes(scale: number): void {
    for (const plume of this.plumes) setFlame(plume, scale, this.time)
  }

  private buildExhaust(): void {
    const count = 180
    const positions = new Float32Array(count * 3)
    positions.fill(-80)
    this.smokeLife = new Float32Array(count)
    this.smokeVel = Array.from({ length: count }, () => new THREE.Vector3())
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.smoke = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: puffMap(),
      color: 0xe6e0d4,
      size: 2.8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    this.smoke.frustumCulled = false
    this.scene.add(this.smoke)
    this.dust = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 16, 40),
      new THREE.MeshBasicMaterial({ color: 0xd7c6a6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    )
    this.dust.rotation.x = -Math.PI / 2
    this.dust.position.y = 1.02
    this.dust.visible = false
    this.scene.add(this.dust)
  }

  private tickSmoke(burning: boolean, throttle: number, nearPad: boolean, dt: number): void {
    if (!this.smoke) return
    const position = this.smoke.geometry.getAttribute('position') as THREE.BufferAttribute
    const step = Math.min(0.05, Math.max(0, dt))
    const spawn = burning && nearPad ? 6 : 0
    let spawned = 0
    for (let i = 0; i < this.smokeLife.length; i++) {
      if (this.smokeLife[i] <= 0) {
        if (spawned >= spawn) continue
        spawned += 1
        this.smokeLife[i] = 1
        position.setXYZ(i, (Math.random() - 0.5) * 3.2, 0.6, (Math.random() - 0.5) * 3.2)
        this.smokeVel[i].set((Math.random() - 0.5) * 4, 6 + throttle * 10, (Math.random() - 0.5) * 4)
        continue
      }
      this.smokeLife[i] -= step * 0.45
      position.setXYZ(
        i,
        position.getX(i) + this.smokeVel[i].x * step,
        position.getY(i) + this.smokeVel[i].y * step,
        position.getZ(i) + this.smokeVel[i].z * step,
      )
      if (this.smokeLife[i] <= 0) position.setXYZ(i, -80, -80, -80)
    }
    position.needsUpdate = true
  }

  private walk(dt: number): void {
    loopFile('truck', null, 0)
    const sprint = this.keys.has('shift')
    const speed = sprint ? 22 : 12.5
    const forward = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0)
    const strafe = (this.keys.has('a') ? 1 : 0) - (this.keys.has('d') ? 1 : 0)
    const ahead = new THREE.Vector3(Math.sin(this.lookYaw), 0, Math.cos(this.lookYaw))
    const side = new THREE.Vector3(ahead.z, 0, -ahead.x)
    const wish = new THREE.Vector3().addScaledVector(ahead, forward).addScaledVector(side, strafe)
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed)
    const accel = (this.grounded ? (sprint ? 28 : 18) : 7) * dt
    const delta = new THREE.Vector3(wish.x - this.velocity.x, 0, wish.z - this.velocity.z)
    if (delta.length() > accel) delta.setLength(accel)
    this.velocity.x += delta.x
    this.velocity.z += delta.z
    if (wish.lengthSq() === 0 && this.grounded) {
      const drag = Math.exp(-dt * 12)
      this.velocity.x *= drag
      this.velocity.z *= drag
    }
    this.velocity.y -= 19 * dt
    this.coyote = this.grounded ? 0.14 : this.coyote - dt
    if (!this.keys.has(' ')) this.jumpLatched = false
    if (this.coyote > 0 && this.keys.has(' ') && !this.jumpLatched) {
      this.velocity.y = 7.5
      this.jumpLatched = true
      this.coyote = 0
    }
    const nextX = this.feet.x + this.velocity.x * dt
    const nextZ = this.feet.z + this.velocity.z * dt
    const rise = this.groundAt(nextX, nextZ) - this.feet.y
    if (rise < 0.45 || (this.grounded && rise < 0.62)) {
      this.feet.x = nextX
      this.feet.z = nextZ
    } else {
      this.velocity.x = 0
      this.velocity.z = 0
    }
    this.solveWalls()
    this.feet.x = Math.max(-380, Math.min(380, this.feet.x))
    this.feet.z = Math.max(-220, Math.min(380, this.feet.z))
    this.feet.y += this.velocity.y * dt
    const ground = this.groundAt(this.feet.x, this.feet.z)
    if (this.feet.y <= ground + 0.02) {
      this.feet.y = ground
      if (this.velocity.y < 0) this.velocity.y = 0
      this.grounded = true
    } else this.grounded = false
    const moving = wish.lengthSq() > 0.2
    if (moving) {
      this.faceYaw = dampAngle(this.faceYaw, Math.atan2(wish.x, wish.z), 10, dt)
      this.walkPhase += dt * (sprint ? 13 : 8.4)
    }
    const swing = moving ? Math.sin(this.walkPhase) * (sprint ? 0.62 : 0.48) : 0
    this.leftLeg.rotation.x = swing
    this.rightLeg.rotation.x = -swing
    this.leftArm.rotation.x = -swing * 0.55
    this.rightArm.rotation.x = swing * 0.55
    this.crew.rotation.y = this.faceYaw
    this.crew.updateMatrixWorld(true)
    const bend = (leg: THREE.Group, amount: number) => {
      const shin = leg.getObjectByName('shin')
      if (shin) shin.rotation.x = Math.max(0, amount)
    }
    bend(this.leftLeg, -swing * 1.15)
    bend(this.rightLeg, swing * 1.15)
    const torso = this.crew.getObjectByName('torso')
    if (torso) torso.rotation.x = moving ? (sprint ? 0.16 : 0.07) : Math.sin(this.time * 1.6) * 0.02
    const bob = this.walkBody
      ? 0
      : moving ? Math.abs(Math.sin(this.walkPhase * 2)) * (sprint ? 0.06 : 0.035) : Math.sin(this.time * 2.2) * 0.012
    this.crew.position.set(this.feet.x, this.feet.y + bob, this.feet.z)
    const helmet = this.crew.getObjectByName('helmet')
    if (helmet) helmet.visible = !this.firstPerson && !this.walkBody
    if (this.walkBody) {
      this.walkBody.setClip(!this.grounded ? 'air' : moving ? 'walk' : 'idle')
      this.walkBody.setVisible(!this.firstPerson)
      this.walkBody.tick(dt)
    }
    this.aimCamera(dt)
    this.aimGuide()
    this.hemi.intensity = 0.72
  }

  private aimCamera(dt: number): void {
    const head = new THREE.Vector3(this.feet.x, this.feet.y + 1.58, this.feet.z)
    const look = new THREE.Vector3(
      Math.sin(this.lookYaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.lookYaw) * Math.cos(this.pitch),
    )
    const dist = this.firstPerson ? 0.22 : 5.4
    const right = new THREE.Vector3(look.z, 0, -look.x)
    if (right.lengthSq() > 0) right.normalize()
    const desired = head.clone().addScaledVector(look, -dist)
    if (!this.firstPerson) {
      desired.y += 0.55
      desired.addScaledVector(right, 0.72)
    }
    const clear = this.cameraClear(head, desired)
    if (this.firstPerson) this.camera.position.copy(clear)
    else this.camera.position.lerp(clear, 1 - Math.exp(-dt * 9))
    this.camera.lookAt(head.clone().addScaledVector(look, 6))
  }

  private cameraClear(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
    const delta = to.clone().sub(from)
    const len = delta.length()
    if (len < 0.05) return to
    const dir = delta.multiplyScalar(1 / len)
    let reach = len
    for (let distance = 0.35; distance <= len; distance += 0.25) {
      const point = from.clone().addScaledVector(dir, distance)
      if (point.y < this.surfaceY(point.x, point.z) + 0.4 || this.hitsSolid(point)) {
        reach = Math.max(0.2, distance - 0.25)
        break
      }
    }
    return from.clone().addScaledVector(dir, reach)
  }

  private hitsSolid(point: THREE.Vector3): boolean {
    for (const block of this.blocks) {
      const box = block.box
      if (box.max.y < 1.2) continue
      if (point.x < box.min.x || point.x > box.max.x) continue
      if (point.y < box.min.y || point.y > box.max.y) continue
      if (point.z < box.min.z || point.z > box.max.z) continue
      return true
    }
    return false
  }

  private solveWalls(): void {
    const radius = 0.38
    for (let pass = 0; pass < 2; pass++) {
      for (const block of this.blocks) {
        const box = block.box
        if (this.feet.y + 1.55 < box.min.y || this.feet.y + 0.25 > box.max.y) continue
        const expanded = box.clone().expandByScalar(radius)
        const point = new THREE.Vector3(this.feet.x, (box.min.y + box.max.y) / 2, this.feet.z)
        if (!expanded.containsPoint(point)) continue
        const left = point.x - expanded.min.x
        const right = expanded.max.x - point.x
        const back = point.z - expanded.min.z
        const front = expanded.max.z - point.z
        const min = Math.min(left, right, back, front)
        if (min === left) this.feet.x = expanded.min.x
        else if (min === right) this.feet.x = expanded.max.x
        else if (min === back) this.feet.z = expanded.min.z
        else this.feet.z = expanded.max.z
      }
    }
  }

  private groundAt(x: number, z: number): number {
    let top = this.surfaceY(x, z)
    for (const block of this.blocks) {
      const box = block.box
      if (x < box.min.x - 0.25 || x > box.max.x + 0.25) continue
      if (z < box.min.z - 0.25 || z > box.max.z + 0.25) continue
      if (box.max.y > this.feet.y + 0.55) continue
      if (box.max.y > top) top = box.max.y
    }
    return top
  }

  private contact(): PadContact {
    const heading = Math.round(((this.lookYaw * 180) / Math.PI + 360) % 360)
    const spots: { at: THREE.Vector3; radius: number; action: PadAction; prompt: string; place: string }[] = [
      { at: new THREE.Vector3(-58, 1.2, -6), radius: 5, action: 'engineering', prompt: 'E — Open the spacecraft', place: 'Assembly building' },
      { at: new THREE.Vector3(-8, 1.2, 54), radius: 5, action: 'engineering', prompt: 'E — Inspect the spacecraft', place: 'Hangar' },
      { at: this.controlAt.clone(), radius: 6.5, action: 'destination', prompt: 'E — Choose a destination', place: 'Launch control' },
    ]
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    const eye = this.camera.position
    let best: (typeof spots)[number] | null = null
    let bestD = Infinity
    for (const spot of spots) {
      const offset = spot.at.clone().sub(eye)
      const distance = offset.length()
      if (distance > spot.radius || distance >= bestD) continue
      if (offset.normalize().dot(forward) < 0.2) continue
      best = spot
      bestD = distance
    }
    if (this.driving) {
      const pace = Math.abs(this.carSpeed) * 3.6
      this.showMarker(null)
      return { prompt: `F — Step out · ${pace.toFixed(0)} km/h`, place: 'Transport', action: null, heading }
    }
    if (this.launchCleared && this.feet.distanceTo(new THREE.Vector3(0, 0.9, 0)) < 9) {
      this.showMarker(new THREE.Vector3(0, 0, 0))
      return { prompt: 'E — Begin the countdown', place: 'Launch pad', action: 'countdown', heading }
    }
    if (this.feet.distanceTo(this.controlAt) < 5.5) {
      this.showMarker(this.controlAt)
      return { prompt: 'E — Choose a destination', place: 'Launch control', action: 'destination', heading }
    }
    const gate = this.gates.find((item) => item.open < 0.2 && this.feet.distanceTo(item.at) < 4.4)
    if (gate) {
      this.showMarker(gate.at)
      return { prompt: 'E — Open the door', place: gate.place, action: 'door', heading }
    }
    if (best) {
      this.showMarker(best.at)
      return { prompt: this.noteLive() || best.prompt, place: best.place, action: best.action, heading }
    }
    if (this.feet.distanceTo(new THREE.Vector3(4.2, 0, 3)) < 3.4) {
      this.showMarker(this.launchCleared ? new THREE.Vector3(4.2, 0, 3) : this.controlAt)
      return {
        prompt: this.launchCleared ? (this.noteLive() || 'E — Check the umbilical') : 'The pad is empty. Destination is at launch control.',
        place: this.launchCleared ? 'Launch tower' : 'Launch complex',
        action: null,
        heading,
      }
    }
    if (this.nearCar()) {
      this.showMarker(this.carPos)
      return { prompt: 'F — Drive', place: 'Transport', action: null, heading }
    }
    let place = 'Launch complex'
    let near = 12
    for (const block of this.blocks) {
      const distance = block.box.distanceToPoint(eye)
      if (distance < near) {
        near = distance
        place = block.place
      }
    }
    this.showMarker(null)
    const prompt = this.launchCleared
      ? 'Follow the arrows back to your ship. E starts the countdown.'
      : 'Follow the arrows to launch control.'
    return { prompt, place, action: null, heading }
  }

  private showMarker(at: THREE.Vector3 | null): void {
    if (!at) {
      this.marker.visible = false
      return
    }
    this.marker.visible = true
    const y = this.surfaceY(at.x, at.z)
    this.marker.position.set(at.x, y + 0.06, at.z)
    const pulse = 1 + Math.sin(this.time * 4) * 0.08
    this.marker.scale.setScalar(pulse)
  }

  private showShip(): void {
    this.ship.visible = true
    this.boosters.visible = !this.launchRig
    this.fairing.visible = false
    if (this.upperStage) this.upperStage.visible = false
    for (const child of this.boosters.children) {
      child.visible = this.plumes.includes(child as THREE.Mesh)
    }
  }

  private buildGuide(): void {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.62,
      -0.26, 0, -0.22,
      0, 0, -0.02,
      0, 0, 0.62,
      0, 0, -0.02,
      0.26, 0, -0.22,
    ], 3))
    geo.computeVertexNormals()
    const material = new THREE.MeshBasicMaterial({
      color: 0xf2c14e,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(geo, material)
      mesh.visible = false
      mesh.renderOrder = 2
      this.chevrons.push(mesh)
      this.scene.add(mesh)
    }
  }

  private aimGuide(): void {
    if (this.feet.distanceTo(this.controlAt) < 6) this.visitedControl = true
    const target = this.launchCleared && this.visitedControl ? new THREE.Vector3(0, 0, 0) : this.controlAt
    const flat = new THREE.Vector3(target.x - this.feet.x, 0, target.z - this.feet.z)
    const distance = flat.length()
    if (distance < 7) {
      for (const chevron of this.chevrons) chevron.visible = false
      return
    }
    flat.multiplyScalar(1 / distance)
    const yaw = Math.atan2(flat.x, flat.z)
    const up = new THREE.Vector3(0, 1, 0)
    const heading = new THREE.Quaternion().setFromAxisAngle(up, yaw)
    this.chevrons.forEach((chevron, index) => {
      const reach = 2.6 + index * 2.15
      const x = this.feet.x + flat.x * reach
      const z = this.feet.z + flat.z * reach
      const normal = this.groundNormal(x, z)
      const tilt = new THREE.Quaternion().setFromUnitVectors(up, normal)
      chevron.visible = true
      chevron.position.set(x, this.surfaceY(x, z) + 0.05, z)
      chevron.quaternion.copy(tilt).multiply(heading)
      const pulse = 0.92 + ((Math.sin(this.time * 3.2 - index * 0.7) + 1) * 0.5) * 0.16
      chevron.scale.set(pulse, pulse, pulse)
    })
  }

  private groundNormal(x: number, z: number): THREE.Vector3 {
    const sample = 0.65
    const left = this.surfaceY(x - sample, z)
    const right = this.surfaceY(x + sample, z)
    const back = this.surfaceY(x, z - sample)
    const fore = this.surfaceY(x, z + sample)
    return new THREE.Vector3(left - right, sample * 2, back - fore).normalize()
  }

  private dressSky(): void {
    /* Earth launch looks at an empty sky. Heliocentric bodies fade in as the stack leaves the air. */
  }

  /** Sun, Mars, and the transfer rings sit in world space so they are already there when cruise starts. */
  private buildSpace(): void {
    const sunAt = new THREE.Vector3(16000, 11000, 9000)
    const earthAt = new THREE.Vector3(0, -1400, 0)
    const sunMap = new THREE.TextureLoader().load('/textures/sun/material_baseColor.jpg')
    sunMap.colorSpace = THREE.SRGBColorSpace
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(420, 40, 28),
      new THREE.MeshBasicMaterial({ map: sunMap, color: 0xfff3c8 }),
    )
    sun.position.copy(sunAt)
    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(470, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffc978, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.BackSide }),
    )
    sun.add(corona)
    this.spaceGroup.add(sun)
    const earthR = earthAt.distanceTo(sunAt)
    const earthOrbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(orbitPoints(earthR)),
      new THREE.LineBasicMaterial({ color: 0x9eb4d4, transparent: true, opacity: 0, depthWrite: false }),
    )
    earthOrbit.position.copy(sunAt)
    const marsR = earthR * MARS_ORBIT_AU
    const marsOrbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(orbitPoints(marsR)),
      new THREE.LineBasicMaterial({ color: 0xd7a08a, transparent: true, opacity: 0, depthWrite: false }),
    )
    marsOrbit.position.copy(sunAt)
    this.spaceGroup.add(earthOrbit, marsOrbit)
    const marsHold = new THREE.Group()
    const out = new THREE.Vector3(1, 0.08, 0.55).normalize()
    marsHold.position.copy(sunAt).addScaledVector(out, marsR)
    this.spaceGroup.add(marsHold)
    modelLoader().load('/3d/glb/Mars.glb', (gltf) => {
      const model = gltf.scene
      seatSphere(model, 110)
      marsHold.add(model)
    })
    this.spaceStars = makeStarfield(4200)
    this.spaceStars.visible = false
    this.spaceStars.traverse((node) => {
      const mat = (node as THREE.Points).material
      if (mat instanceof THREE.PointsMaterial || mat instanceof THREE.SpriteMaterial) mat.opacity = 0
    })
    this.spaceGroup.visible = false
    this.scene.add(this.spaceGroup, this.spaceStars)
  }

  private plantTrees(): void {
    modelLoader().load('/3d/low_poly_tree_set.glb', (gltf) => {
      const kinds: THREE.Object3D[] = []
      gltf.scene.updateMatrixWorld(true)
      gltf.scene.traverse((node) => {
        if (/^Lowpoly_Tree_\d+$/.test(node.name)) kinds.push(node)
      })
      if (kinds.length === 0) return
      const groves = [
        [-88, 36], [-96, 8], [-70, 62], [78, 18], [92, 48], [70, -28], [-24, 78], [18, 86], [-110, -20], [110, 8], [-40, -36], [48, -40],
        [-120, 48], [120, -18], [8, -48], [-18, 96],
        [-180, 70], [-160, 140], [160, 90], [190, 30], [40, 170], [-70, 180], [140, 150], [-200, 20], [210, 110], [-40, 150], [70, 190],
        [-220, 160], [240, 80], [130, 220], [-90, 240], [280, 40], [-250, 90], [60, 250], [-160, 210], [200, 180], [90, -60],
      ]
      let planted = 0
      groves.forEach(([gx, gz], grove) => {
        const count = 4 + (grove % 3)
        for (let i = 0; i < count; i++) {
          const angle = grove * 1.7 + i * 2.2
          const radius = 2.5 + (i % 4) * 3.2
          const x = gx + Math.cos(angle) * radius
          const z = gz + Math.sin(angle) * radius
          if (z < -70 || this.hardGround(x, z)) continue
          const source = kinds[planted % kinds.length]
          const tree = source.clone(true)
          tree.traverse((node) => {
            const mesh = node as THREE.Mesh
            if (!mesh.isMesh) return
            mesh.castShadow = true
            mesh.receiveShadow = true
          })
          const height = 5.2 + ((grove + i) % 5) * 0.9
          const lift = fitHeight(tree, height)
          tree.position.set(x, this.surfaceY(x, z) + lift, z)
          tree.rotation.y = angle
          this.scene.add(tree)
          planted += 1
        }
      })
    })
  }

  /** Scatter the forest pieces across the grounds. Trees block the player. Grass does not. */
  private plantForest(): void {
    modelLoader().load('/3d/free_low_poly_forest/scene.gltf', (gltf) => {
      const picks: THREE.Mesh[] = []
      const seen = new Set<string>()
      gltf.scene.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh || !mesh.geometry) return
        const key = mesh.name.replace(/_\d+$/, '')
        if (seen.has(key)) return
        seen.add(key)
        mesh.geometry.userData.keep = true
        picks.push(mesh)
      })
      const props = picks.filter((mesh) => {
        mesh.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(mesh)
        const size = box.getSize(new THREE.Vector3())
        const widest = Math.max(size.x, size.y, size.z)
        return widest > 0.05 && widest < 40 && Math.max(size.x, size.z) < size.y * 8
      })
      if (props.length === 0) return
      let placed = 0
      for (let x = -420; x <= 420 && placed < 340; x += 14) {
        for (let z = -70; z <= 360 && placed < 340; z += 14) {
          const px = x + ((placed * 5) % 9) - 4
          const pz = z + ((placed * 3) % 9) - 4
          if (this.hardGround(px, pz)) continue
          const src = props[placed % props.length]
          const clone = src.clone(true)
          clone.position.set(0, 0, 0)
          clone.rotation.set(0, placed * 0.7, 0)
          clone.scale.set(1, 1, 1)
          clone.updateMatrixWorld(true)
          const local = new THREE.Box3().setFromObject(clone)
          const size = local.getSize(new THREE.Vector3())
          const tree = size.y > Math.max(size.x, size.z) * 1.15 && size.y > 0.2
          const target = tree ? 5.5 + (placed % 6) * 1.1 : 0.4 + (placed % 3) * 0.12
          clone.scale.setScalar(target / Math.max(size.y, 0.01))
          clone.updateMatrixWorld(true)
          const fitted = new THREE.Box3().setFromObject(clone)
          const ground = this.surfaceY(px, pz)
          const midX = (fitted.min.x + fitted.max.x) / 2
          const midZ = (fitted.min.z + fitted.max.z) / 2
          clone.position.set(px - midX, ground - fitted.min.y, pz - midZ)
          clone.traverse((node) => {
            const mesh = node as THREE.Mesh
            if (mesh.isMesh) mesh.castShadow = true
          })
          this.scene.add(clone)
          if (tree) {
            this.blocks.push({
              box: new THREE.Box3(
                new THREE.Vector3(px - 0.45, ground, pz - 0.45),
                new THREE.Vector3(px + 0.45, ground + target * 0.65, pz + 0.45),
              ),
              place: 'tree',
            })
          }
          placed += 1
        }
      }
    })
  }

  private plantRocks(): void {
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0x6d675c, roughness: 0.94, metalness: 0.04 }),
      new THREE.MeshStandardMaterial({ color: 0x8a7d6a, roughness: 0.9, metalness: 0.05 }),
      new THREE.MeshStandardMaterial({ color: 0x4f4a42, roughness: 0.96, metalness: 0.08 }),
    ]
    let placed = 0
    for (let i = 0; i < 420 && placed < 220; i++) {
      const angle = i * 2.399
      const radius = 28 + (i % 17) * 14 + (i % 5) * 3.4
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius * 0.82 + 40
      if (this.hardGround(x, z) || z < -70) continue
      const scale = 0.22 + (i % 9) * 0.16 + (i % 3) * 0.08
      const rock = new THREE.Mesh(geo, mats[i % mats.length])
      rock.scale.set(scale * (0.8 + (i % 4) * 0.12), scale * (0.45 + (i % 5) * 0.1), scale * (0.7 + (i % 3) * 0.15))
      rock.rotation.set(i * 0.31, i * 0.71, i * 0.17)
      rock.position.set(x, this.surfaceY(x, z) - scale * 0.18, z)
      rock.castShadow = true
      rock.receiveShadow = true
      this.scene.add(rock)
      placed += 1
    }
  }

  private dressClouds(): void {
    const map = new THREE.TextureLoader().load('/textures/earth/clouds.png')
    map.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.MeshBasicMaterial({
      map,
      alphaMap: map,
      transparent: true,
      depthWrite: false,
      opacity: 0.42,
      side: THREE.DoubleSide,
    })
    const spots: [number, number, number, number][] = [
      [-90, 78, 36, 92],
      [130, 96, -24, 110],
      [28, 118, 150, 84],
      [-160, 88, 80, 120],
      [210, 128, 48, 140],
      [-40, 104, 210, 100],
      [80, 86, -90, 76],
    ]
    for (const [x, y, z, span] of spots) {
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(span, span * 0.34), material)
      cloud.position.set(x, y, z)
      cloud.lookAt(0, 40, 20)
      cloud.renderOrder = -1
      this.localClouds.push(cloud)
      this.scene.add(cloud)
    }
  }

  private makeSky(): THREE.Mesh {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 20), this.skyMat)
    sky.renderOrder = -1
    sky.frustumCulled = false
    const sunMap = new THREE.TextureLoader().load('/textures/sun/material_baseColor.jpg')
    sunMap.colorSpace = THREE.SRGBColorSpace
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(90, 32, 24),
      new THREE.MeshBasicMaterial({ map: sunMap, color: 0xffe7b0 }),
    )
    sun.position.set(920, 1100, 420)
    sky.add(sun)
    return sky
  }

  private buildGround(): void {
    const soil = surfaceTexture('grass')
    soil.map.repeat.set(18, 18)
    soil.normal.repeat.set(18, 18)
    soil.map.anisotropy = 8
    soil.normal.anisotropy = 8
    const earthR = 1400
    const geo = new THREE.PlaneGeometry(980, 980, 140, 140)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = -pos.getY(i)
      pos.setZ(i, this.surfaceY(x, z))
    }
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: soil.map, normalMap: soil.normal, roughness: 0.92, metalness: 0.02, side: THREE.FrontSide }))
    this.groundMesh = mesh
    const earthMap = new THREE.TextureLoader().load('/textures/earth/earth-color-2k.jpg')
    earthMap.colorSpace = THREE.SRGBColorSpace
    earthMap.anisotropy = 8
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(earthR, 64, 48),
      new THREE.MeshStandardMaterial({ map: earthMap, roughness: 1, metalness: 0 }),
    )
    const bury = 260
    ball.position.y = -earthR - bury
    this.scene.add(ball)
    const clouds = new THREE.TextureLoader().load('/textures/earth/clouds.png')
    clouds.colorSpace = THREE.SRGBColorSpace
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(earthR + 70, 64, 48),
      new THREE.MeshBasicMaterial({
        map: clouds,
        alphaMap: clouds,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: 0.9,
      }),
    )
    shell.position.y = -earthR - 260
    shell.visible = false
    this.cloudShell = shell
    this.scene.add(shell)
    mesh.rotation.x = -Math.PI / 2
    mesh.receiveShadow = true
    this.scene.add(mesh)
    const count = 48
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 6
      positions[i * 3 + 1] = Math.random() * 2
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4
    }
    const steamGeo = new THREE.BufferGeometry()
    steamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.steam = new THREE.Points(
      steamGeo,
      new THREE.PointsMaterial({
        color: 0xf7f4ee,
        size: 0.55,
        map: softDot(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    )
    this.steam.position.set(0, 1.2, 6)
    this.scene.add(this.steam)
  }

  private earthDrop(x: number, z: number): number {
    const radius = 1400
    const reach = x * x + z * z
    return radius - Math.sqrt(Math.max(1, radius * radius - reach))
  }

  private surfaceY(x: number, z: number): number {
    return this.terrain(x, z) - this.earthDrop(x, z)
  }

  private seat(object: THREE.Object3D): void {
    object.position.y -= this.earthDrop(object.position.x, object.position.z)
  }

  private terrain(x: number, z: number): number {
    const reach = Math.max(Math.abs(x) / 86, Math.abs(z) / 74)
    const mask = reach <= 1 ? 0 : Math.min(1, (reach - 1) / 0.45)
    const hill = Math.sin(x * 0.018) * 16 + Math.cos(z * 0.014) * 13 + Math.sin((x * 0.7 + z) * 0.011) * 6
    const ridge = Math.sin(x * 0.007 + z * 0.005) * 22 + Math.cos(x * 0.004 - z * 0.009) * 14
    const valley = -Math.abs(Math.sin(x * 0.009 - z * 0.006)) * 9
    const rumple = Math.sin(x * 0.09) * Math.cos(z * 0.07) * 1.4 + Math.sin(x * 0.17 + z * 0.12) * 0.7
    const coast = z < -78 ? (z + 78) * 0.12 : 0
    return (hill + ridge * 0.45 + valley + rumple) * mask * mask + coast
  }

  private buildComplex(): void {
    const concreteTex = surfaceTexture('concrete')
    const wallTex = surfaceTexture('wall')
    const steelTex = surfaceTexture('steel')
    const concrete = new THREE.MeshStandardMaterial({ map: concreteTex.map, normalMap: concreteTex.normal, roughness: 0.86, metalness: 0.04 })
    const white = new THREE.MeshStandardMaterial({ map: wallTex.map, normalMap: wallTex.normal, roughness: 0.48, metalness: 0.12 })
    const steel = new THREE.MeshStandardMaterial({ map: steelTex.map, normalMap: steelTex.normal, roughness: 0.32, metalness: 0.78 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.55, metalness: 0.4 })
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.28, metalness: 0.55 })
    this.pad(concrete, dark)
    this.tower(steel, dark)
    this.shell(-58, 0, 28, 40, 34, 'px', 12, 18, white, glass, 'Assembly building')
    this.clad(-58, 0, 28, 40, 34, 'px', 12, 18, steel, glass, concrete)
    this.sign('ASSEMBLY', new THREE.Vector3(-43.4, 21.5, 0), Math.PI / 2)
    this.shell(48, 38, 22, 7, 16, 'nz', 4.2, 3.2, white, glass, 'Mission control')
    this.clad(48, 38, 22, 7, 16, 'nz', 4.2, 3.2, steel, glass, concrete)
    this.sign('CONTROL', new THREE.Vector3(48, 5.4, 29.55), Math.PI)
    this.shell(-8, 58, 22, 8, 16, 'nz', 6, 3.4, white, glass, 'Hangar')
    this.clad(-8, 58, 22, 8, 16, 'nz', 6, 3.4, steel, glass, concrete)
    this.sign('HANGAR', new THREE.Vector3(-8, 6.1, 49.55), Math.PI)
    /* Door slabs stayed shut and read as black panels. The openings stay open. */
    this.dress(new THREE.Vector3(-43.5, 8, -5.6), new THREE.Vector3(0.28, 16.6, 0.4), steel)
    this.dress(new THREE.Vector3(-43.5, 8, 5.6), new THREE.Vector3(0.28, 16.6, 0.4), steel)
    this.dress(new THREE.Vector3(-43.5, 16.4, 0), new THREE.Vector3(0.28, 0.45, 11.6), steel)
    this.dress(new THREE.Vector3(-43.55, 20.4, 0), new THREE.Vector3(0.12, 2.2, 18), glass)
    this.furnish(dark, steel)
    this.beacon(new THREE.Vector3(-46, 0, -8))
    this.beacon(new THREE.Vector3(44, 0, 28.4))
    this.beacon(new THREE.Vector3(-11, 0, 49))
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6, 16), white)
      tank.position.set(-18, 3, side * 16)
      this.seat(tank)
      tank.castShadow = true
      tank.receiveShadow = true
      this.scene.add(tank)
      this.blocks.push({ box: new THREE.Box3(new THREE.Vector3(-19.6, tank.position.y - 3, side * 16 - 1.6), new THREE.Vector3(-16.4, tank.position.y + 3, side * 16 + 1.6)), place: 'Fuel farm' })
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 12), white)
      dome.position.set(-18, 6, side * 16)
      this.seat(dome)
      dome.castShadow = true
      this.scene.add(dome)
    }
    const towerTank = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 8, 16), white)
    towerTank.position.set(-30, 8, -24)
    this.seat(towerTank)
    towerTank.castShadow = true
    this.scene.add(towerTank)
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.7, 18, 12), white)
    bowl.position.set(-30, 12.2, -24)
    this.seat(bowl)
    bowl.castShadow = true
    this.scene.add(bowl)
    this.blocks.push({ box: new THREE.Box3(new THREE.Vector3(-31.8, towerTank.position.y - 8, -25.8), new THREE.Vector3(-28.2, bowl.position.y + 1.8, -22.2)), place: 'Water tower' })
    this.fence(steel)
    this.dress(new THREE.Vector3(-58, 0.15, 0), new THREE.Vector3(30, 0.08, 36), dark)
    this.dress(new THREE.Vector3(48, 0.12, 38), new THREE.Vector3(24, 0.08, 18), dark)
    for (let i = 0; i < 6; i++) this.dress(new THREE.Vector3(-58, 8 + i * 5, 17.3), new THREE.Vector3(24, 0.35, 0.35), steel)
    this.solid(new THREE.Vector3(-58, 0.75, -8), new THREE.Vector3(3.2, 1.1, 1.2), dark, 'Assembly building', false)
    this.solid(new THREE.Vector3(48, 0.75, 40), new THREE.Vector3(2.4, 1.1, 0.8), dark, 'Mission control', false)
    this.yard(steel)
    this.lights(dark)
    this.antenna(white, steel)
    this.plantTrees()
    this.plantForest()
    this.plantRocks()
    this.dressClouds()
  }

  private pad(concrete: THREE.Material, dark: THREE.Material): void {
    this.solid(new THREE.Vector3(0, 0.45, 0), new THREE.Vector3(24, 0.9, 24), concrete, 'Launch pad')
    this.dress(new THREE.Vector3(0, 0.2, 6.5), new THREE.Vector3(4.2, 0.7, 10), dark)
    this.blocks.push({
      box: new THREE.Box3(new THREE.Vector3(-2.2, 0.95, -2.2), new THREE.Vector3(2.2, 16.5, 2.2)),
      place: 'Launch vehicle',
    })
    for (const side of [-1, 1]) {
      this.dress(new THREE.Vector3(side * 10, 6, 0), new THREE.Vector3(0.25, 12, 0.25), dark)
      const lamp = new THREE.PointLight(0xffe6c2, 1.4, 16)
      lamp.position.set(side * 10, 12, 0)
      this.scene.add(lamp)
    }
  }

  private tower(steel: THREE.Material, dark: THREE.Material): void {
    for (const x of [6.4, 8.8]) {
      for (const z of [-1.1, 1.1]) {
        this.solid(new THREE.Vector3(x, 21, z), new THREE.Vector3(0.28, 42, 0.28), steel, 'Launch tower')
      }
    }
    for (let y = 4; y <= 40; y += 4) {
      this.dress(new THREE.Vector3(7.6, y, 0), new THREE.Vector3(2.8, 0.16, 0.16), steel)
      this.dress(new THREE.Vector3(7.6, y, 0), new THREE.Vector3(0.16, 0.16, 2.6), steel)
      if (y < 40) {
        this.brace(new THREE.Vector3(6.4, y, -1.1), new THREE.Vector3(8.8, y + 4, -1.1), steel)
        this.brace(new THREE.Vector3(8.8, y, 1.1), new THREE.Vector3(6.4, y + 4, 1.1), steel)
        this.brace(new THREE.Vector3(6.4, y, -1.1), new THREE.Vector3(6.4, y + 4, 1.1), steel)
      }
    }
    for (const y of [12, 22, 32]) this.dress(new THREE.Vector3(4.2, y, 0), new THREE.Vector3(4.6, 0.16, 0.55), dark)
    this.solid(new THREE.Vector3(4.6, 16, 0), new THREE.Vector3(4.2, 0.35, 1.1), dark, 'Launch tower')
    this.dress(new THREE.Vector3(3.2, 18.5, 0), new THREE.Vector3(0.2, 5, 0.8), dark)
  }

  private shell(x: number, z: number, sx: number, sy: number, sz: number, door: 'px' | 'nz', doorW: number, doorH: number, wall: THREE.Material, glass: THREE.Material, place: string): void {
    const t = 0.42
    const x0 = x - sx / 2
    const x1 = x + sx / 2
    const z0 = z - sz / 2
    const z1 = z + sz / 2
    this.solid(new THREE.Vector3(x, sy, z), new THREE.Vector3(sx, t, sz), wall, place)
    this.solid(new THREE.Vector3(x0, sy / 2, z), new THREE.Vector3(t, sy, sz), wall, place)
    this.solid(new THREE.Vector3(x, sy / 2, z1), new THREE.Vector3(sx, sy, t), wall, place)
    if (door === 'px') {
      this.solid(new THREE.Vector3(x, sy / 2, z0), new THREE.Vector3(sx, sy, t), wall, place)
      const side = (sz - doorW) / 2
      this.solid(new THREE.Vector3(x1, doorH / 2, z0 + side / 2), new THREE.Vector3(t, doorH, side), wall, place)
      this.solid(new THREE.Vector3(x1, doorH / 2, z1 - side / 2), new THREE.Vector3(t, doorH, side), wall, place)
      this.solid(new THREE.Vector3(x1, doorH + (sy - doorH) / 2, z), new THREE.Vector3(t, sy - doorH, sz), wall, place)
      this.dress(new THREE.Vector3(x1 + 0.05, sy * 0.72, z), new THREE.Vector3(0.08, sy * 0.18, sz * 0.7), glass)
    } else {
      this.solid(new THREE.Vector3(x1, sy / 2, z), new THREE.Vector3(t, sy, sz), wall, place)
      const side = (sx - doorW) / 2
      this.solid(new THREE.Vector3(x0 + side / 2, doorH / 2, z0), new THREE.Vector3(side, doorH, t), wall, place)
      this.solid(new THREE.Vector3(x1 - side / 2, doorH / 2, z0), new THREE.Vector3(side, doorH, t), wall, place)
      this.solid(new THREE.Vector3(x, doorH + (sy - doorH) / 2, z0), new THREE.Vector3(sx, sy - doorH, t), wall, place)
      this.dress(new THREE.Vector3(x, sy * 0.62, z0 - 0.05), new THREE.Vector3(sx * 0.62, sy * 0.22, 0.08), glass)
    }
    const lamp = new THREE.PointLight(0xfff2dd, 2.2, 18)
    lamp.position.set(x, 3.2, z)
    this.seat(lamp)
    this.scene.add(lamp)
  }

  private brace(a: THREE.Vector3, b: THREE.Vector3, material: THREE.Material): void {
    const delta = b.clone().sub(a)
    const length = delta.length()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, length, 0.1), material)
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    this.seat(mesh)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
    mesh.castShadow = true
    this.scene.add(mesh)
  }

  private clad(x: number, z: number, sx: number, sy: number, sz: number, door: 'px' | 'nz', doorW: number, doorH: number, steel: THREE.Material, glass: THREE.Material, concrete: THREE.Material): void {
    const x0 = x - sx / 2
    const x1 = x + sx / 2
    const z0 = z - sz / 2
    const z1 = z + sz / 2
    this.dress(new THREE.Vector3(x, 0.22, z), new THREE.Vector3(sx + 1.1, 0.28, sz + 1.1), concrete)
    this.dress(new THREE.Vector3(x, sy + 0.45, z), new THREE.Vector3(sx + 1.4, 0.7, sz + 1.4), concrete)
    this.dress(new THREE.Vector3(x, sy + 1.5, z), new THREE.Vector3(sx * 0.42, 1.2, sz * 0.36), steel)
    const outside = (px: number, pz: number) => (door === 'px' ? Math.abs(pz - z) > doorW / 2 + 0.3 : Math.abs(px - x) > doorW / 2 + 0.3)
    for (let i = -sx / 2 + 2; i < sx / 2; i += 4) {
      const px = x + i
      if (outside(px, z1)) this.dress(new THREE.Vector3(px, sy / 2, z1 + 0.28), new THREE.Vector3(0.32, sy * 0.96, 0.16), steel)
      if (outside(px, z0)) this.dress(new THREE.Vector3(px, sy / 2, z0 - 0.28), new THREE.Vector3(0.32, sy * 0.96, 0.16), steel)
    }
    for (let i = -sz / 2 + 2; i < sz / 2; i += 4) {
      const pz = z + i
      if (outside(x0, pz)) this.dress(new THREE.Vector3(x0 - 0.28, sy / 2, pz), new THREE.Vector3(0.16, sy * 0.96, 0.32), steel)
      if (outside(x1, pz)) this.dress(new THREE.Vector3(x1 + 0.28, sy / 2, pz), new THREE.Vector3(0.16, sy * 0.96, 0.32), steel)
    }
    const bandY = Math.min(sy - 1.2, doorH + 2.2)
    if (door === 'px') this.dress(new THREE.Vector3(x1 + 0.3, bandY, z), new THREE.Vector3(0.06, 1.3, sz * 0.72), glass)
    else this.dress(new THREE.Vector3(x, bandY, z0 - 0.3), new THREE.Vector3(sx * 0.7, 1.2, 0.06), glass)
    this.dress(new THREE.Vector3(x, sy * 0.55, z1 + 0.3), new THREE.Vector3(sx * 0.62, 1.15, 0.06), glass)
  }

  private sign(text: string, at: THREE.Vector3, yaw: number): void {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#1a222c'
    ctx.fillRect(0, 0, 512, 128)
    ctx.fillStyle = '#f6f1e6'
    ctx.font = '700 72px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 256, 68)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map }))
    plate.position.copy(at)
    this.seat(plate)
    plate.rotation.y = yaw
    this.scene.add(plate)
  }

  private furnish(dark: THREE.Material, steel: THREE.Material): void {
    const bay = new THREE.Group()
    attachLaunchStack(bay, () => {}, 4.2)
    bay.position.set(-62, 0, 6)
    this.seat(bay)
    bay.rotation.y = Math.PI / 2
    this.scene.add(bay)
    this.blocks.push({ box: new THREE.Box3(new THREE.Vector3(-64.4, 0.2, 4.2), new THREE.Vector3(-59.6, 2.6, 8.2)), place: 'Assembly building' })
    this.dress(new THREE.Vector3(-58, 24, 0), new THREE.Vector3(20, 0.28, 0.28), steel)
    this.dress(new THREE.Vector3(-58, 24, 0), new THREE.Vector3(0.28, 0.28, 26), steel)
    const hangarShip = this.hangarMount
    hangarShip.position.set(-8, 1.35, 58.5)
    this.seat(hangarShip)
    hangarShip.rotation.y = Math.PI * 0.15
    this.scene.add(hangarShip)
    this.dress(new THREE.Vector3(-8, 0.35, 58.5), new THREE.Vector3(3.2, 0.35, 5.2), dark)
    this.blocks.push({ box: new THREE.Box3(new THREE.Vector3(-9.8, 0.2, 56.2), new THREE.Vector3(-6.2, 2.4, 61.2)), place: 'Hangar' })
    const screen = new THREE.MeshStandardMaterial({ color: 0x123044, emissive: 0x3c86a0, emissiveIntensity: 1.1, roughness: 0.22 })
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = 48 + side * 6.2
        const z = 33.2 + i * 2.5
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.7), dark)
        desk.position.set(x, 0.5, z)
        desk.castShadow = true
        this.scene.add(desk)
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.62), screen)
        glow.position.set(x + side * -0.2, 1.15, z)
        glow.rotation.y = side > 0 ? -0.5 : 0.5
        this.scene.add(glow)
      }
    }
    this.seatDirector()
    this.briefingBoard()
  }

  private seatDirector(): void {
    const cloth = new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.55 })
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a27a, roughness: 0.62 })
    const group = new THREE.Group()
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.22), cloth)
    torso.position.y = 1.05
    torso.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin)
    head.position.y = 1.42
    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.42), cloth)
    hip.position.set(0, 0.74, 0.12)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.34), cloth)
    arm.position.set(-0.28, 1.02, 0.18)
    const armR = arm.clone()
    armR.position.x = 0.28
    group.add(torso, head, hip, arm, armR)
    group.position.set(48, 0, 41.4)
    this.seat(group)
    this.scene.add(group)
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b5344, roughness: 0.72 })
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.72), wood)
    table.position.set(48, 0.78, 40.45)
    this.seat(table)
    table.castShadow = true
    this.scene.add(table)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), new THREE.MeshStandardMaterial({ color: 0x2c2c2c }))
    post.position.set(48, 0.37, 40.45)
    this.seat(post)
    this.scene.add(post)
  }

  private briefingBoard(): void {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 360
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#14181c'
      ctx.fillRect(0, 0, 640, 360)
      ctx.fillStyle = '#f4f1ea'
      ctx.font = '600 40px Segoe UI, sans-serif'
      ctx.fillText('How a flight starts', 36, 72)
      ctx.font = '26px Segoe UI, sans-serif'
      const lines = [
        'Follow the arrows to launch control.',
        'Press E and pick a destination.',
        'Build the ship, then press Launch.',
        'The same ship lifts off the pad.',
      ]
      lines.forEach((line, index) => ctx.fillText(line, 36, 150 + index * 46))
    }
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.9), new THREE.MeshBasicMaterial({ map }))
    board.position.set(48, 2.5, 45.55)
    this.seat(board)
    board.rotation.y = Math.PI
    this.scene.add(board)
  }

  private fence(steel: THREE.Material): void {
    const run = (x: number, z: number, sx: number, sz: number) => {
      this.dress(new THREE.Vector3(x, 0.48, z), new THREE.Vector3(sx, 0.07, sz), steel)
      this.dress(new THREE.Vector3(x, 1.05, z), new THREE.Vector3(sx, 0.07, sz), steel)
      const halfX = sx / 2
      const halfZ = sz / 2
      this.blocks.push({
        box: new THREE.Box3(new THREE.Vector3(x - halfX, 0, z - halfZ), new THREE.Vector3(x + halfX, 1.45, z + halfZ)),
        place: 'Pad fence',
      })
    }
    run(0, 14, 28, 0.1)
    run(0, -14, 28, 0.1)
    run(-14, 10, 0.1, 8)
    run(-14, -10, 0.1, 8)
    run(14, 10, 0.1, 8)
    run(14, -10, 0.1, 8)
    for (let x = -14; x <= 14; x += 3.5) {
      this.solid(new THREE.Vector3(x, 0.75, 14), new THREE.Vector3(0.12, 1.5, 0.12), steel, 'Pad fence')
      this.solid(new THREE.Vector3(x, 0.75, -14), new THREE.Vector3(0.12, 1.5, 0.12), steel, 'Pad fence')
    }
    for (let z = -10.5; z <= 10.5; z += 3.5) {
      if (Math.abs(z) < 6.5) continue
      this.solid(new THREE.Vector3(-14, 0.75, z), new THREE.Vector3(0.12, 1.5, 0.12), steel, 'Pad fence')
      this.solid(new THREE.Vector3(14, 0.75, z), new THREE.Vector3(0.12, 1.5, 0.12), steel, 'Pad fence')
    }
  }

  private yard(steel: THREE.Material): void {
    for (let i = 0; i < 8; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 6), steel)
      post.position.set(24 + (i % 4) * 4, 0.65, -40 + Math.floor(i / 4) * 8)
      this.seat(post)
      post.castShadow = true
      this.scene.add(post)
    }
    this.dress(new THREE.Vector3(30, 0.08, -36), new THREE.Vector3(14, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0x8a8174, roughness: 1 }))
  }

  private lights(dark: THREE.Material): void {
    for (const at of [new THREE.Vector3(-16, 0, 6), new THREE.Vector3(8, 0, 16), new THREE.Vector3(36, 0, 18), new THREE.Vector3(-30, 0, -8)]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 8), dark)
      pole.position.set(at.x, 3.5, at.z)
      this.seat(pole)
      pole.castShadow = true
      this.scene.add(pole)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0xfff1d2, emissive: 0xffe2b0, emissiveIntensity: 0.8 }))
      head.position.set(at.x, 7.1, at.z)
      this.seat(head)
      this.scene.add(head)
    }
  }

  private antenna(white: THREE.Material, steel: THREE.Material): void {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 16, 8), steel)
    mast.position.set(62, 8, 8)
    this.seat(mast)
    mast.castShadow = true
    this.scene.add(mast)
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 2.1, 0.35, 20), white)
    dish.position.set(62, 16.4, 8)
    this.seat(dish)
    dish.rotation.x = 0.8
    dish.castShadow = true
    this.scene.add(dish)
    const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 9, 8), steel)
    mast2.position.set(-78, 4.5, 24)
    this.seat(mast2)
    mast2.castShadow = true
    this.scene.add(mast2)
    const dish2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.35, 0.22, 16), white)
    dish2.position.set(-78, 9.1, 24)
    this.seat(dish2)
    dish2.rotation.z = -0.7
    dish2.castShadow = true
    this.scene.add(dish2)
    this.blocks.push({ box: new THREE.Box3(new THREE.Vector3(61.4, mast.position.y - 8, 7.4), new THREE.Vector3(62.6, dish.position.y, 8.6)), place: 'Antenna' })
    this.blocks.push({ box: new THREE.Box3(new THREE.Vector3(-78.6, mast2.position.y - 4.5, 23.4), new THREE.Vector3(-77.4, dish2.position.y, 24.6)), place: 'Antenna' })
  }

  private buildBooster(): void {
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.42, metalness: 0.18 })
    const band = new THREE.MeshStandardMaterial({ color: 0xc45a3c, roughness: 0.45, metalness: 0.2 })
    const metal = new THREE.MeshStandardMaterial({ color: 0x3c4248, roughness: 0.35, metalness: 0.75 })
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 24, 24), white)
    core.position.y = 12.4
    core.castShadow = true
    core.name = 'shell'
    this.boosters.add(core)
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 1.1, 24), band)
    stripe.position.y = 8
    stripe.name = 'shell'
    this.boosters.add(stripe)
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 20, 16), white)
      strap.position.set(side * 2.15, 11, 0)
      strap.castShadow = true
      strap.name = 'shell'
      this.boosters.add(strap)
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 1.3, 12), metal)
      bell.position.set(side * 2.15, 1.1, 0)
      bell.name = 'shell'
      this.boosters.add(bell)
    }
    const centerBell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, 1.6, 14), metal)
    centerBell.position.y = 0.9
    centerBell.name = 'shell'
    this.boosters.add(centerBell)
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.45, 6.4, 20), white)
    stage.position.y = 30.4
    stage.castShadow = true
    stage.name = 'upper-stage'
    this.upperStage = stage
    this.stack.add(stage)
    const half = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 6.2, 20, 1, false, 0, Math.PI), white)
    half.rotation.y = Math.PI / 2
    const other = half.clone()
    this.fairing.add(half, other)
    this.fairing.position.y = 35.4
    this.openFairing(0.22)
    const length = 9.2
    const nozzle = 0.82
    const fin = makeFlame(length, 1.7)
    const cross = makeFlame(length, 1.7)
    cross.rotation.y = Math.PI / 2
    for (const mesh of [fin, cross]) {
      mesh.position.set(0, nozzle - length / 2, 0)
      this.boosters.add(mesh)
      this.plumes.push(mesh)
    }
    this.upperPlume = null
    this.fairing.visible = false
    if (this.upperStage) this.upperStage.visible = false
    this.showShip()
  }

  private loadRover(): void {
    this.blocks.push({ box: new THREE.Box3(new THREE.Vector3(53.4, 0, 26.4), new THREE.Vector3(54.6, 1.8, 27.6)), place: 'Mission control' })
  }

  private solid(center: THREE.Vector3, size: THREE.Vector3, material: THREE.Material, place: string, collide = true): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
    mesh.position.copy(center)
    this.seat(mesh)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)
    if (collide) {
      const half = size.clone().multiplyScalar(0.5)
      const at = mesh.position
      this.blocks.push({
        box: new THREE.Box3(
          new THREE.Vector3(at.x - half.x, at.y - half.y, at.z - half.z),
          new THREE.Vector3(at.x + half.x, at.y + half.y, at.z + half.z),
        ),
        place,
      })
    }
    return mesh
  }

  private dress(center: THREE.Vector3, size: THREE.Vector3, material: THREE.Material): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
    mesh.position.copy(center)
    this.seat(mesh)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)
  }

  private makeCrew(): { group: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group } {
    const group = new THREE.Group()
    const cloth = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.48 })
    const trim = new THREE.MeshStandardMaterial({ color: 0xc45a3c, roughness: 0.5 })
    const visor = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.12, metalness: 0.82, envMapIntensity: 1.4 })
    const skin = new THREE.MeshStandardMaterial({ color: 0xd6b08a, roughness: 0.62 })
    const limb = (y: number, height: number, spread: number) => {
      const pivot = new THREE.Group()
      pivot.position.y = y
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, height * 0.45, 4, 8), cloth)
      thigh.position.y = -height * 0.22
      thigh.castShadow = true
      const shin = new THREE.Group()
      shin.name = 'shin'
      shin.position.y = -height * 0.48
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, height * 0.42, 4, 8), cloth)
      lower.position.y = -height * 0.2
      lower.castShadow = true
      shin.add(lower)
      pivot.add(thigh, shin)
      pivot.position.x = spread
      return pivot
    }
    const leftLeg = limb(0.92, 0.78, -0.16)
    const rightLeg = limb(0.92, 0.78, 0.16)
    const leftArm = limb(1.44, 0.62, -0.36)
    const rightArm = limb(1.44, 0.62, 0.36)
    leftArm.name = 'arm-left'
    rightArm.name = 'arm-right'
    const gloveOn = (arm: THREE.Group) => {
      const shin = arm.getObjectByName('shin')
      if (!shin) return
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), cloth)
      glove.position.y = -0.38
      shin.add(glove)
    }
    gloveOn(leftArm)
    gloveOn(rightArm)
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 5, 10), cloth)
    torso.name = 'torso'
    torso.position.y = 1.22
    torso.castShadow = true
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.22), trim)
    belt.position.y = 1.02
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), cloth)
    neck.position.y = 1.48
    const helmet = new THREE.Group()
    helmet.name = 'helmet'
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), cloth)
    bowl.position.y = 1.66
    bowl.castShadow = true
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), visor)
    glass.position.set(0, 1.66, 0.08)
    glass.scale.set(0.92, 0.78, 0.52)
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin)
    face.position.set(0, 1.64, 0.04)
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.4 }))
    eyeL.position.set(-0.04, 1.66, 0.14)
    const eyeR = eyeL.clone()
    eyeR.position.x = 0.04
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.02, 6, 16), trim)
    ring.position.y = 1.66
    ring.rotation.x = Math.PI / 2
    helmet.add(bowl, glass, face, eyeL, eyeR, ring)
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.14), trim)
    pack.position.set(0, 1.24, -0.2)
    const bootOn = (leg: THREE.Group) => {
      const shin = leg.getObjectByName('shin')
      if (!shin) return
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.24), trim)
      boot.position.set(0, -0.42, 0.06)
      shin.add(boot)
    }
    bootOn(leftLeg)
    bootOn(rightLeg)
    const leftElbow = leftArm.getObjectByName('shin')
    const rightElbow = rightArm.getObjectByName('shin')
    if (leftElbow) leftElbow.rotation.x = 0.35
    if (rightElbow) rightElbow.rotation.x = 0.35
    group.add(leftLeg, rightLeg, leftArm, rightArm, torso, belt, neck, helmet, pack)
    this.wearAstronaut(group)
    return { group, leftLeg, rightLeg, leftArm, rightArm }
  }

  /** walking_astronaut.glb carries idle, wave, moon_walk, and floating. */
  private wearAstronaut(group: THREE.Group): void {
    const procedural = [...group.children]
    modelLoader().load('/3d/walking_astronaut.glb', (gltf) => {
      this.walkBody = bindWalkAstronaut(gltf, 1.85)
      group.add(this.walkBody.root)
      for (const child of procedural) child.visible = false
    })
  }

  private loadGroundProps(): void {
    modelLoader().load('/props/control_station.glb', (gltf) => {
      const model = gltf.scene
      model.updateMatrixWorld(true)
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      model.scale.setScalar(2.4 / Math.max(size.y, 0.01))
      model.updateMatrixWorld(true)
      const wide = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      const footprint = Math.max(wide.x, wide.z)
      if (footprint > 4.8) model.scale.multiplyScalar(4.8 / footprint)
      model.rotation.y = Math.atan2(-this.controlAt.x, -this.controlAt.z)
      model.position.set(0, 0, 0)
      model.updateMatrixWorld(true)
      const seatedBox = new THREE.Box3().setFromObject(model)
      const center = seatedBox.getCenter(new THREE.Vector3())
      model.position.set(
        this.controlAt.x - center.x,
        this.surfaceY(this.controlAt.x, this.controlAt.z) - seatedBox.min.y,
        this.controlAt.z - center.z,
      )
      model.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })
      this.scene.add(model)
      const placed = new THREE.Box3().setFromObject(model)
      this.blocks.push({ box: placed, place: 'Launch control' })
    })
  }

  private drive(dt: number): void {
    const gas = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0)
    const steerInput = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0)
    const speed = this.carSpeed
    const resistance = speed * 0.22 + speed * Math.abs(speed) * 0.015
    const drive = gas > 0 ? 8.2 : gas < 0 ? -12 : 0
    this.carSpeed += (drive - resistance) * dt
    this.carSpeed = Math.max(-8, Math.min(32, this.carSpeed))
    const steerLimit = 0.62 / (1 + Math.abs(this.carSpeed) * 0.045)
    this.steerAngle = damp(this.steerAngle, steerInput * steerLimit, 8, dt)
    if (Math.abs(this.carSpeed) > 0.15) {
      const yawRate = Math.tan(this.steerAngle) / this.wheelbase
      this.carYaw -= yawRate * this.carSpeed * dt
    }
    const forward = new THREE.Vector3(Math.sin(this.carYaw), 0, Math.cos(this.carYaw))
    const next = this.carPos.clone().addScaledVector(forward, this.carSpeed * dt)
    next.x = Math.max(-380, Math.min(380, next.x))
    next.z = Math.max(-220, Math.min(380, next.z))
    if (this.carBlocked(next.x, next.z, this.carYaw)) this.carSpeed *= -0.35
    else this.carPos.copy(next)
    const axle = new THREE.Vector3(Math.cos(this.carYaw), 0, -Math.sin(this.carYaw))
    const nose = forward.clone().multiplyScalar(this.wheelbase * 0.5)
    const tail = forward.clone().multiplyScalar(-this.wheelbase * 0.5)
    const span = axle.clone().multiplyScalar(0.95)
    const frontL = this.driveSurface(this.carPos.x + nose.x + span.x, this.carPos.z + nose.z + span.z)
    const frontR = this.driveSurface(this.carPos.x + nose.x - span.x, this.carPos.z + nose.z - span.z)
    const rearL = this.driveSurface(this.carPos.x + tail.x + span.x, this.carPos.z + tail.z + span.z)
    const rearR = this.driveSurface(this.carPos.x + tail.x - span.x, this.carPos.z + tail.z - span.z)
    const floor = (frontL + frontR + rearL + rearR) / 4
    this.car.position.set(this.carPos.x, floor, this.carPos.z)
    this.car.rotation.order = 'YXZ'
    this.car.rotation.y = this.carYaw
    this.car.rotation.z = Math.atan2(frontL - frontR, 1.9) * 0.45
    this.car.rotation.x = Math.atan2((rearL + rearR) - (frontL + frontR), this.wheelbase * 2) * 0.35
    this.wheelSpin += (this.carSpeed / this.wheelRadius) * dt
    this.wheels.forEach((wheel, index) => {
      const rest = this.wheelRests[index]
      if (!rest) return
      wheel.quaternion.copy(rest)
      if (index < 2) wheel.rotateY(this.steerAngle)
      if (this.wheelAxle === 'x') wheel.rotateX(this.wheelSpin)
      else wheel.rotateZ(this.wheelSpin)
    })
    const fast = Math.abs(this.carSpeed) > 8
    loopFile('truck', fast ? 'VEHCar_CarEngineHigh_LOOP_01.ogg' : 'VEHCar_CarEngineSlow_LOOP_01.ogg', Math.min(0.55, 0.18 + Math.abs(this.carSpeed) / 48))
    const look = new THREE.Vector3(
      Math.sin(this.lookYaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.lookYaw) * Math.cos(this.pitch),
    )
    const focus = this.car.position.clone()
    focus.y += 1.35
    this.camera.position.copy(focus).addScaledVector(look, -8.4)
    this.camera.position.y += 1.15
    this.camera.lookAt(focus.clone().addScaledVector(look, 8))
  }

  private enterCar(): void {
    playGroup('VEHDoor_CarDoorOpen', 0.6)
    this.driving = true
    this.carSpeed = 0
    this.lookYaw = this.carYaw
    this.pitch = -0.12
  }

  private exitCar(): void {
    playGroup('VEHDoor_CarDoorClose', 0.6)
    loopFile('truck', null, 0)
    const side = new THREE.Vector3(Math.cos(this.carYaw), 0, -Math.sin(this.carYaw))
    const spot = this.carPos.clone().addScaledVector(side, 2.4)
    this.feet.set(spot.x, this.driveSurface(spot.x, spot.z), spot.z)
    this.velocity.set(0, 0, 0)
    this.driving = false
    this.faceYaw = this.carYaw
    this.lookYaw = this.carYaw
  }

  private nearCar(): boolean {
    return this.feet.distanceTo(this.carPos) < 4.2
  }

  private carBlocked(x: number, z: number, yaw: number): boolean {
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    const side = new THREE.Vector3(forward.z, 0, -forward.x)
    for (const lx of [-1, 1]) {
      for (const lz of [-1.7, 1.7]) {
        const px = x + side.x * lx * 0.95 + forward.x * lz
        const pz = z + side.z * lx * 0.95 + forward.z * lz
        for (const block of this.blocks) {
          const box = block.box
          if (box.max.y < 1.15) continue
          if (px < box.min.x || px > box.max.x || pz < box.min.z || pz > box.max.z) continue
          return true
        }
        if (this.surfaceY(px, pz) > this.surfaceY(x, z) + 1.1) return true
      }
    }
    return false
  }

  private driveSurface(x: number, z: number): number {
    let top = this.surfaceY(x, z)
    for (const block of this.blocks) {
      const box = block.box
      if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue
      if (box.max.y > 1.15) continue
      if (box.max.y > top) top = box.max.y
    }
    return top
  }

  private buildTransport(): void {
    this.car.position.set(this.carPos.x, 0, this.carPos.z)
    this.scene.add(this.car)
    modelLoader().load('/vehicles/cybertruck.glb', (gltf) => {
      const model = gltf.scene
      model.rotation.y = Math.PI / 2
      model.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(model)
      const center = bounds.getCenter(new THREE.Vector3())
      model.position.set(-center.x, -bounds.min.y, -center.z)
      model.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
        if (!node.name.startsWith('Wheel')) return
        this.wheels.push(node)
      })
      this.wheels.sort((a, b) => a.name.localeCompare(b.name))
      this.wheelRests = this.wheels.map((wheel) => wheel.quaternion.clone())
      const wheel = this.wheels[0] as THREE.Mesh
      if (wheel?.geometry) {
        wheel.geometry.computeBoundingBox()
        const size = wheel.geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1)
        this.wheelRadius = Math.max(size.x, size.y, size.z) * 0.5
        this.wheelAxle = size.x <= size.z ? 'x' : 'z'
      }
      this.car.add(model)
    })
  }

  /** Concrete, asphalt, and the dark pads. */
  private hardGround(x: number, z: number): boolean {
    if (Math.abs(x) < 13.2 && Math.abs(z) < 13.2) return true
    if (Math.abs(z) < 4.4 && x > -54 && x < 2) return true
    if (Math.abs(x - 20) < 4.4 && z > 0 && z < 44) return true
    if (Math.abs(x + 58) < 16 && Math.abs(z) < 19) return true
    if (Math.abs(x - 48) < 13 && Math.abs(z - 38) < 10) return true
    if (Math.abs(x + 8) < 13 && Math.abs(z - 58) < 10) return true
    if (Math.abs(x - 30) < 8 && Math.abs(z + 36) < 6) return true
    if (Math.abs(x + 32) < 6 && Math.abs(z - 46) < 6) return true
    if (Math.abs(x - 20) < 4.4 && z > 44 && z < 206) return true
    if (Math.abs(z - 70) < 4.4 && x > 20 && x < 182) return true
    if (Math.abs(x + 120) < 4.4 && z > -22 && z < 102) return true
    if (Math.abs(z - 120) < 4.4 && x > -132 && x < 52) return true
    return false
  }

  private buildPeople(): void {
    const starts = [
      new THREE.Vector3(-22, 0, 20),
      new THREE.Vector3(-14, 0, 18),
      new THREE.Vector3(-38, 0, 8),
      new THREE.Vector3(-26, 0, 38),
      new THREE.Vector3(-8, 0, 40),
      new THREE.Vector3(16, 0, 22),
      new THREE.Vector3(30, 0, 28),
      new THREE.Vector3(10, 0, -8),
      new THREE.Vector3(-48, 0, 16),
    ]
    modelLoader().load('/3d/tesla_bot/scene.gltf', (gltf) => {
      const source = gltf.scene
      source.updateMatrixWorld(true)
      source.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.frustumCulled = false
        mesh.geometry.userData.keep = true
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of materials) mat.userData.keep = true
      })
      const clip = gltf.animations[0] ?? null
      for (const start of starts) {
        const group = new THREE.Group()
        const model = cloneSkinned(source)
        group.add(model)
        group.updateMatrixWorld(true)
        const raw = new THREE.Box3().setFromObject(model)
        const tall = Math.max(0.01, raw.max.y - raw.min.y)
        model.scale.multiplyScalar(1.78 / tall)
        group.updateMatrixWorld(true)
        const seated = new THREE.Box3().setFromObject(model)
        model.position.y -= seated.min.y
        group.position.set(start.x, this.surfaceY(start.x, start.z), start.z)
        this.scene.add(group)
        const mixer = new THREE.AnimationMixer(model)
        const action = clip ? mixer.clipAction(clip) : null
        if (action) {
          action.enabled = true
          action.setLoop(THREE.LoopRepeat, Infinity)
          action.play()
        }
        this.walkers.push({
          group,
          mixer,
          action,
          bones: action ? [] : botBones(model),
          goal: this.wanderPoint(start),
          speed: 0.4 + Math.random() * 0.8,
          yaw: Math.random() * Math.PI * 2,
          pause: Math.random() * 1.4,
          phase: Math.random() * 6,
        })
      }
    })
  }

  private wanderPoint(from: THREE.Vector3): THREE.Vector3 {
    for (let n = 0; n < 32; n++) {
      const ang = Math.random() * Math.PI * 2
      const dist = 10 + Math.random() * 42
      const x = from.x + Math.cos(ang) * dist
      const z = from.z + Math.sin(ang) * dist
      if (Math.abs(x) > 92 || Math.abs(z) > 92) continue
      if (Math.hypot(x, z) < 16) continue
      if (this.botBlocked(x, z)) continue
      return new THREE.Vector3(x, 0, z)
    }
    return new THREE.Vector3(from.x + 8, 0, from.z + 6)
  }

  private botBlocked(x: number, z: number): boolean {
    for (const block of this.blocks) {
      const box = block.box
      if (x < box.min.x - 0.9 || x > box.max.x + 0.9) continue
      if (z < box.min.z - 0.9 || z > box.max.z + 0.9) continue
      if (box.max.y - box.min.y > 1.1) return true
    }
    return false
  }

  private tickPeople(dt: number): void {
    const player = new THREE.Vector3(this.driving ? this.carPos.x : this.feet.x, 0, this.driving ? this.carPos.z : this.feet.z)
    for (const walker of this.walkers) {
      const at = walker.group.position
      const flat = new THREE.Vector3(at.x, 0, at.z)
      if (walker.pause > 0) walker.pause -= dt
      const offset = new THREE.Vector3(walker.goal.x - at.x, 0, walker.goal.z - at.z)
      const distance = offset.length()
      if (distance < 1.4 || this.botBlocked(walker.goal.x, walker.goal.z)) {
        walker.goal.copy(this.wanderPoint(at))
        if (Math.random() < 0.28) walker.pause = 0.8 + Math.random() * 2.4
      }
      const blocked = flat.distanceTo(player) < 1.9
      const desired = walker.pause > 0 || blocked ? 0 : 1.7
      const follow = 1 - Math.exp(-dt * (desired > 0 ? 2.6 : 7))
      walker.speed += (desired - walker.speed) * follow
      if (walker.speed > 0.05 && distance > 0.08) {
        const heading = Math.atan2(offset.x, offset.z)
        let turn = heading - walker.yaw
        while (turn > Math.PI) turn -= Math.PI * 2
        while (turn < -Math.PI) turn += Math.PI * 2
        walker.yaw += turn * (1 - Math.exp(-dt * 6))
        const step = walker.speed * dt
        const nx = at.x + Math.sin(walker.yaw) * step
        const nz = at.z + Math.cos(walker.yaw) * step
        if (this.botBlocked(nx, nz)) walker.goal.copy(this.wanderPoint(at))
        else {
          at.x = nx
          at.z = nz
        }
      }
      walker.group.rotation.y = walker.yaw
      walker.phase += dt * (2 + walker.speed * 3.4)
      const bob = walker.action ? 0 : Math.abs(Math.sin(walker.phase)) * 0.04 * Math.min(1, walker.speed / 1.7)
      at.y = this.surfaceY(at.x, at.z) + bob
      if (walker.action) {
        walker.action.paused = walker.speed < 0.15
        walker.action.timeScale = 0.7 + walker.speed * 0.45
        walker.mixer.update(dt)
      } else {
        const swing = Math.sin(walker.phase) * 0.55 * Math.min(1, walker.speed / 1.7)
        this.poseBot(walker, swing, walker.speed < 0.15)
      }
    }
  }

  /** Mixamo bind is a T-pose. Arms drop to the sides, then swing opposite the legs. */
  private poseBot(walker: Walker, swing: number, idle: boolean): void {
    for (const limb of walker.bones) {
      limb.bone.quaternion.copy(limb.rest)
      const gait = swing * limb.side
      if (limb.kind === 'leg') limb.bone.rotateX(gait)
      else if (limb.kind === 'shin') limb.bone.rotateX(Math.max(0, gait) * 1.15)
      else if (limb.kind === 'foot') limb.bone.rotateX(-gait * 0.45)
      else if (limb.kind === 'arm') {
        limb.bone.rotateZ(limb.side * (idle ? 0.95 : 1.12))
        limb.bone.rotateX(idle && limb.side > 0 ? -0.7 + swing * 2 : -gait * 0.85)
      } else limb.bone.rotateX(0.4 + Math.max(0, -gait) * 0.35)
    }
  }

  private noteLive(): string {
    return this.time < this.noteUntil ? this.note : ''
  }

  private useWorld(): void {
    const gate = this.gates.find((item) => item.open < 0.2 && this.feet.distanceTo(item.at) < 4.4)
    if (gate) {
      gate.target = 1
      playGroup('DOORMetl_HatchOpen', 0.6)
      this.blocks = this.blocks.filter((block) => block.place !== `door:${gate.id}`)
      return
    }
    if (this.feet.distanceTo(new THREE.Vector3(4.2, 0, 3)) < 3.4) {
      this.note = 'Umbilical is seated. The core is loaded. The ship on top is the one you built.'
      this.noteUntil = this.time + 7
    }
  }

  private tickGates(dt: number): void {
    for (const gate of this.gates) {
      if (gate.target < 0.5 && this.feet.distanceTo(gate.at) < 3.2) {
        gate.target = 1
        this.blocks = this.blocks.filter((block) => block.place !== `door:${gate.id}`)
      }
      gate.open = damp(gate.open, gate.target, 6, dt)
      gate.mesh.rotation.y = gate.open * gate.sign * 1.35
    }
  }

  private tickSteam(dt: number): void {
    if (!this.steam) return
    const attr = this.steam.geometry.getAttribute('position')
    if (!(attr instanceof THREE.BufferAttribute)) return
    for (let i = 0; i < attr.count; i++) {
      let y = attr.getY(i) + dt * (0.8 + (i % 5) * 0.15)
      if (y > 5) y = 0.1
      attr.setY(i, y)
    }
    attr.needsUpdate = true
  }

  private tickBeacons(): void {
    const pulse = 1 + Math.sin(this.time * 3) * 0.18
    for (const beacon of this.beacons) beacon.scale.setScalar(pulse)
  }

  private beacon(at: THREE.Vector3): void {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.4 }),
    )
    pole.position.set(at.x, 0.28, at.z)
    this.seat(pole)
    pole.castShadow = true
    this.scene.add(pole)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xfff6df, emissive: 0xf2c14e, emissiveIntensity: 0.6, roughness: 0.4 }),
    )
    mesh.position.set(at.x, 0.58, at.z)
    this.seat(mesh)
    this.scene.add(mesh)
    this.beacons.push(mesh)
  }

  private onClick = () => {
    if (!this.lookEnabled) return
    if (!this.locked) this.canvas.requestPointerLock()
  }

  private onLock = () => {
    this.locked = document.pointerLockElement === this.canvas
  }

  private onMove = (event: MouseEvent) => {
    if (this.flyingLook || !this.locked) return
    this.lookYaw -= event.movementX * 0.0022
    this.pitch = Math.max(-0.7, Math.min(1.2, this.pitch - event.movementY * 0.002))
  }

  private onDragDown = (event: PointerEvent) => {
    if (!this.flyingLook || event.button !== 0) return
    this.dragLook = true
    this.dragX = event.clientX
    this.dragY = event.clientY
  }

  private onDragMove = (event: PointerEvent) => {
    if (!this.dragLook) return
    const dx = event.clientX - this.dragX
    const dy = event.clientY - this.dragY
    this.dragX = event.clientX
    this.dragY = event.clientY
    this.lookYaw -= dx * 0.005
    this.pitch = Math.max(-0.45, Math.min(1.05, this.pitch + dy * 0.004))
  }

  private onDragUp = () => {
    this.dragLook = false
  }

  private onKey = (event: KeyboardEvent) => {
    const key = trackMove(this.keys, event)
    if (event.type === 'keydown') {
      if (key === 'v' && !event.repeat && !this.driving && !this.crewStowed) this.firstPerson = !this.firstPerson
      if (key === 'f' && !event.repeat && this.onFoot) {
        if (this.driving) this.exitCar()
        else if (this.nearCar()) this.enterCar()
      }
      if (key === 'e' && !event.repeat && this.onFoot && !this.driving) this.useWorld()
    }
  }
}

function damp(current: number, target: number, rate: number, dt: number): number {
  const t = 1 - Math.exp(-rate * dt)
  return current + (target - current) * t
}

function dampAngle(current: number, target: number, rate: number, dt: number): number {
  let delta = target - current
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-rate * dt))
}

interface Gate {
  id: string
  mesh: THREE.Object3D
  at: THREE.Vector3
  open: number
  target: number
  sign: number
  place: string
}

function surfaceTexture(kind: 'grass' | 'concrete' | 'wall' | 'steel' | 'asphalt'): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const heights = new Float32Array(size * size)
  const base = kind === 'grass' ? [86, 104, 62] : kind === 'asphalt' ? [46, 48, 50] : kind === 'steel' ? [154, 160, 166] : kind === 'wall' ? [228, 222, 210] : [176, 170, 160]
  if (ctx) {
    const image = ctx.createImageData(size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = hash(x, y)
        const speck = hash(x * 3 + 9, y * 5 + 4)
        let shade = (n - 0.5) * (kind === 'grass' ? 42 : 26)
        if (kind === 'concrete' && y % 28 < 2) shade -= 16
        if (kind === 'wall' && x % 48 < 2) shade -= 14
        if (kind === 'steel') shade += Math.sin(y * 0.7) * 8
        if (kind === 'asphalt' && speck > 0.9) shade += 36
        if (kind === 'grass' && speck > 0.84) shade -= 18
        if (kind === 'grass' && x % 7 === 0 && y % 11 < 5) shade -= 22
        if (kind === 'grass' && (x + 3) % 9 === 0 && y % 13 < 4) shade += 16
        const index = (y * size + x) * 4
        image.data[index] = clampByte(base[0] + shade)
        image.data[index + 1] = clampByte(base[1] + shade)
        image.data[index + 2] = clampByte(base[2] + shade * 0.85)
        image.data[index + 3] = 255
        heights[y * size + x] = image.data[index] / 255
      }
    }
    ctx.putImageData(image, 0, 0)
    if (kind === 'grass') {
      ctx.lineWidth = 1
      for (let i = 0; i < 500; i++) {
        const x = hash(i, 2) * size
        const y = hash(i, 7) * size
        ctx.strokeStyle = i % 2 === 0 ? '#23401c' : '#7d9a4e'
        ctx.globalAlpha = 0.65
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (hash(i, 4) - 0.5) * 5, y - 5 - hash(i, 5) * 9)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
  }
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.RepeatWrapping
  map.repeat.set(kind === 'grass' ? 8 : 3, kind === 'grass' ? 8 : 3)
  const normalCanvas = document.createElement('canvas')
  normalCanvas.width = size
  normalCanvas.height = size
  const nctx = normalCanvas.getContext('2d')
  if (nctx) {
    const image = nctx.createImageData(size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const l = heights[y * size + Math.max(0, x - 1)]
        const r = heights[y * size + Math.min(size - 1, x + 1)]
        const u = heights[Math.max(0, y - 1) * size + x]
        const d = heights[Math.min(size - 1, y + 1) * size + x]
        const index = (y * size + x) * 4
        image.data[index] = (r - l) * 180 + 128
        image.data[index + 1] = (d - u) * 180 + 128
        image.data[index + 2] = 255
        image.data[index + 3] = 255
      }
    }
    nctx.putImageData(image, 0, 0)
  }
  const normal = new THREE.CanvasTexture(normalCanvas)
  normal.colorSpace = THREE.LinearSRGBColorSpace
  normal.wrapS = THREE.RepeatWrapping
  normal.wrapT = THREE.RepeatWrapping
  normal.repeat.copy(map.repeat)
  return { map, normal }
}

function softDot(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const glow = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
    glow.addColorStop(0, 'rgba(255,255,255,0.9)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, 64, 64)
  }
  return new THREE.CanvasTexture(canvas)
}

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function botBones(model: THREE.Object3D): Walker['bones'] {
  const found = new Map<string, THREE.Object3D>()
  model.traverse((node) => {
    if (node.name) found.set(node.name, node)
  })
  const spec: [string, Walker['bones'][number]['kind'], 1 | -1][] = [
    ['mixamorig_LeftUpLeg_045', 'leg', 1],
    ['mixamorig_RightUpLeg_00', 'leg', -1],
    ['mixamorig_LeftLeg_046', 'shin', 1],
    ['mixamorig_RightLeg_049', 'shin', -1],
    ['mixamorig_LeftFoot_047', 'foot', 1],
    ['mixamorig_RightFoot_050', 'foot', -1],
    ['mixamorig_LeftArm_08', 'arm', 1],
    ['mixamorig_RightArm_027', 'arm', -1],
    ['mixamorig_LeftForeArm_09', 'fore', 1],
    ['mixamorig_RightForeArm_028', 'fore', -1],
  ]
  const bones: Walker['bones'] = []
  for (const [name, kind, side] of spec) {
    const bone = found.get(name)
    if (!bone) continue
    bones.push({ bone, rest: bone.quaternion.clone(), kind, side })
  }
  return bones
}

interface Walker {
  group: THREE.Group
  mixer: THREE.AnimationMixer
  action: THREE.AnimationAction | null
  goal: THREE.Vector3
  phase: number
  speed: number
  yaw: number
  pause: number
  bones: { bone: THREE.Object3D; rest: THREE.Quaternion; kind: 'leg' | 'shin' | 'arm' | 'fore' | 'foot'; side: 1 | -1 }[]
}

function fitHeight(model: THREE.Object3D, height: number): number {
  model.updateMatrixWorld(true)
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const scale = height / Math.max(size.y, 0.01)
  model.scale.multiplyScalar(scale)
  model.updateMatrixWorld(true)
  const seated = new THREE.Box3().setFromObject(model)
  model.position.y -= seated.min.y
  return model.position.y
}

function puffMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const glow = ctx.createRadialGradient(32, 32, 4, 32, 32, 30)
  glow.addColorStop(0, 'rgba(236, 228, 214, 0.85)')
  glow.addColorStop(0.45, 'rgba(210, 198, 178, 0.35)')
  glow.addColorStop(1, 'rgba(210, 198, 178, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 64, 64)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.userData.keep = true
  return map
}

function orbitPoints(radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 180; i += 1) {
    const angle = (i / 180) * Math.PI * 2
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
  }
  return points
}
