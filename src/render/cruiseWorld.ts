import * as THREE from 'three'
import { AU_M, MARS_ORBIT_AU } from '../domain/constants'
import { rebase } from '../domain/frames'
import { sceneOf, SYSTEM_SCALE, transferState } from '../domain/transfer'
import type { SpacecraftConfig } from '../domain/types'
import { disposeCraft } from './craft'
import { makeFlame, setFlame } from './exhaust'
import { attachOrbiter } from './launchStack'
import { modelLoader, seatSphere } from './gltf'
import { viewRatio } from './pixels'
import { makeStarfield, tickStarfield } from './starfield'

export type FlightCam = 'chase' | 'cockpit' | 'free' | 'side' | 'map' | 'ground'

export const FLIGHT_CAMS: FlightCam[] = ['side', 'chase', 'cockpit', 'free', 'map', 'ground']

export interface CruiseStick {
  pitch: number
  yaw: number
  roll: number
  stable: boolean
  level: boolean
  throttle: number
  engines: boolean
  camera: FlightCam
}

export interface CruisePose {
  burning: boolean
  thrust: number
  fraction: number
  missionId: string
  destAu: number
  tSec: number
  lat?: number
  lon?: number
  craft: SpacecraftConfig
  stick: CruiseStick
}

export class CruiseWorld {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(58, 1, 0.05, 8000)
  private canvas: HTMLCanvasElement
  private ship = new THREE.Group()
  private payload = new THREE.Group()
  private flame: THREE.Group
  private plumes: THREE.Mesh[] = []
  private burnTime = 0
  private earth: THREE.Mesh
  private dest: THREE.Mesh
  private stars: THREE.Group
  private path: THREE.Line
  private orbits!: THREE.Group
  private earthOrbit!: THREE.Line
  private marsOrbit!: THREE.Line
  private sun: THREE.Mesh
  private marker: THREE.Mesh
  private signature = ''
  private pitch = 0
  private yaw = 0
  private roll = 0
  private orbitYaw = Math.PI
  private orbitPitch = 0.22
  private glanceYaw = 0
  private glancePitch = 0
  private dragging = false
  private lastX = 0
  private lastY = 0
  private cam: FlightCam = 'side'
  private zoom = 1
  private prograde = new THREE.Vector3(0, 0, 1)
  private readonly aim = new THREE.Vector3(0, 0, 1)

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(viewRatio())
    this.renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene.add(new THREE.AmbientLight(0xb9c7e4, 0.45))
    const sun = new THREE.DirectionalLight(0xfff6ea, 2.2)
    sun.position.set(30, 18, 12)
    this.scene.add(sun)
    this.stars = makeStarfield(1400)
    this.scene.add(this.stars)
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(8, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0x1d4e89, roughness: 0.85 }),
    )
    const air = new THREE.Mesh(
      new THREE.SphereGeometry(8.35, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x8eb7ff, transparent: true, opacity: 0.18, side: THREE.BackSide }),
    )
    this.earth.add(air)
    modelLoader().load('/3d/glb/Earth.glb', (gltf) => {
      const model = gltf.scene
      seatSphere(model, 16)
      this.earth.add(model)
      const mat = this.earth.material
      if (mat instanceof THREE.Material) {
        mat.visible = false
        mat.depthWrite = false
      }
    })
    this.dest = new THREE.Mesh(
      new THREE.SphereGeometry(5, 40, 28),
      new THREE.MeshStandardMaterial({ color: 0x8a4b32, roughness: 0.9 }),
    )
    this.scene.add(this.earth, this.dest, this.ship)
    const sunMap = new THREE.TextureLoader().load('/textures/sun/material_baseColor.jpg')
    sunMap.colorSpace = THREE.SRGBColorSpace
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(9.4, 48, 32),
      new THREE.MeshBasicMaterial({ map: sunMap, color: 0xfff3c8 }),
    )
    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(10.2, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffc978, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.BackSide }),
    )
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(11, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe7b0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.BackSide }),
    )
    this.sun.add(corona, bloom)
    const sunLight = new THREE.PointLight(0xffe2a8, 12, 1600, 0.4)
    this.sun.add(sunLight)
    this.scene.add(this.sun)
    this.orbits = new THREE.Group()
    this.earthOrbit = orbitRing(1, 0x9eb4d4)
    this.marsOrbit = orbitRing(1, 0xd7a08a)
    this.orbits.add(this.earthOrbit, this.marsOrbit)
    this.orbits.visible = true
    this.scene.add(this.orbits)
    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xf2c14e }),
    )
    this.dest.add(this.marker)
    this.path = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.85 }),
    )
    this.path.visible = false
    this.scene.add(this.path)
    this.flame = new THREE.Group()
    const plumeLength = 4.4
    const fin = makeFlame(plumeLength, 0.7)
    const cross = makeFlame(plumeLength, 0.7)
    // The bright throat sits at the mesh's +Y. Shift it onto the nozzle, then aim that axis aft (-Z).
    fin.position.y = -plumeLength / 2
    cross.position.y = -plumeLength / 2
    cross.rotation.y = Math.PI / 2
    this.plumes.push(fin, cross)
    this.flame.add(fin, cross)
    this.flame.rotation.x = Math.PI / 2
    this.flame.position.z = -2.6
    this.ship.add(this.payload, this.flame)
    this.dressSpace()
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
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

  attitude(): { pitch: number; yaw: number; roll: number } {
    return { pitch: this.pitch, yaw: this.yaw, roll: this.roll }
  }

  /** Put the nose back on the departure. Looking around does not call this. */
  level(): void {
    this.pitch = 0
    this.yaw = 0
    this.roll = 0
    this.glanceYaw = 0
    this.glancePitch = 0
  }

  step(dt: number, pose: CruisePose): void {
    this.dress(pose.craft, pose.missionId)
    const stick = pose.stick
    if (!stick.stable) {
      this.pitch += stick.pitch * dt * 0.7
      this.yaw += stick.yaw * dt * 0.7
      this.roll += stick.roll * dt * 0.9
    }
    if (stick.level) {
      const fade = Math.exp(-dt * 6)
      this.pitch *= fade
      this.yaw *= fade
      this.roll *= fade
    }
    this.cam = stick.camera
    this.place(pose)
    const forward = this.prograde.lengthSq() > 1e-6 ? this.prograde : this.aim
    this.ship.quaternion.setFromUnitVectors(this.aim, forward)
    this.ship.rotateX(this.pitch)
    this.ship.rotateY(this.yaw)
    this.ship.rotateZ(this.roll)
    this.burnTime += dt
    const lit = pose.burning && stick.engines && stick.throttle > 0.08 ? stick.throttle : 0
    this.flame.visible = false
    for (const plume of this.plumes) setFlame(plume, 0, this.burnTime)
    this.payload.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.name === 'plume') setFlame(mesh, lit, this.burnTime)
    })
    tickStarfield(this.stars, dt, this.camera)
    if (this.jupiterSpin) this.jupiterSpin.rotation.y += dt * 0.04
    this.frame(stick.camera)
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    disposeCraft(this.payload)
    this.renderer.dispose()
  }

  private place(pose: CruisePose): void {
    const state = transferState(pose.missionId, pose.destAu, pose.fraction, pose.tSec)
    const earth = sceneOf(state.earth)
    let dest = sceneOf(state.dest)
    let ship = sceneOf(state.ship)
    if (pose.missionId === 'lunar') {
      const out = new THREE.Vector3(dest.x - earth.x, dest.y - earth.y, dest.z - earth.z)
      if (out.length() < 0.001) out.set(1, 0, 0)
      out.setLength(16)
      dest = { x: earth.x + out.x, y: earth.y + out.y, z: earth.z + out.z }
      const f = Math.min(1, Math.max(0, pose.fraction))
      ship = { x: earth.x + out.x * f, y: earth.y + out.y * f, z: earth.z + out.z * f }
    }
    const mat = this.dest.material
    if (mat instanceof THREE.MeshStandardMaterial && !mat.map) {
      const color = pose.missionId === 'europa' ? 0xc5d0d6 : pose.missionId === 'lunar' ? 0xb7b4ae : pose.missionId === 'asteroid' ? 0x6e655c : 0x8a4b32
      mat.color.setHex(color)
    }
    this.fraction = pose.fraction
    this.paintBody(pose.missionId)
    this.earth.rotation.y += 0.004
    this.dest.rotation.y += 0.002
    if (pose.lat !== undefined && pose.lon !== undefined) {
      const lat = (pose.lat * Math.PI) / 180
      const lon = (pose.lon * Math.PI) / 180
      const radius = 5.2
      this.marker.visible = true
      this.marker.position.set(Math.cos(lat) * Math.sin(lon) * radius, Math.sin(lat) * radius, Math.cos(lat) * Math.cos(lon) * radius)
    } else this.marker.visible = false
    const map = pose.stick.camera === 'map'
    this.path.visible = true
    this.orbits.visible = true
    this.sun.visible = true
    if (map) {
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= 64; i += 1) {
        const sample = sceneOf(transferState(pose.missionId, pose.destAu, i / 64, pose.tSec).ship)
        if (pose.missionId === 'lunar') {
          points.push(new THREE.Vector3(earth.x + (dest.x - earth.x) * (i / 64), earth.y, earth.z + (dest.z - earth.z) * (i / 64)))
        } else points.push(new THREE.Vector3(sample.x, sample.y, sample.z))
      }
      this.path.geometry.dispose()
      this.path.geometry = new THREE.BufferGeometry().setFromPoints(points)
      this.earth.position.set(earth.x, earth.y, earth.z)
      this.dest.position.set(dest.x, dest.y, dest.z)
      this.ship.position.set(ship.x, ship.y, ship.z)
      this.sun.position.set(0, 0, 0)
      this.sun.scale.setScalar(0.95)
      this.earth.scale.setScalar(0.55)
      this.dest.scale.setScalar(0.32)
      this.ship.scale.setScalar(2.2)
      this.earthOrbit.scale.setScalar(AU_M * SYSTEM_SCALE)
      this.marsOrbit.scale.setScalar(AU_M * SYSTEM_SCALE * (pose.missionId === 'lunar' ? 0.4 : MARS_ORBIT_AU))
      aimRing(this.earthOrbit, this.sun.position, this.earth.position)
      aimRing(this.marsOrbit, this.sun.position, this.dest.position)
      const leg = new THREE.Vector3(dest.x - ship.x, dest.y - ship.y, dest.z - ship.z)
      if (leg.lengthSq() > 1e-6) this.prograde.copy(leg).normalize()
      return
    }
    this.ship.position.set(0, 0, 0)
    this.ship.scale.setScalar(1)
    const sunFromShip = rebase({ x: 0, y: 0, z: 0 }, ship)
    const sunPos = new THREE.Vector3(sunFromShip.x, sunFromShip.y, sunFromShip.z)
    if (sunPos.lengthSq() < 1e-6) sunPos.set(-1, 0.2, -0.35)
    sunPos.setLength(820)
    this.sun.position.copy(sunPos)
    this.sun.scale.setScalar(1.7)
    const toDest = rebase(dest, ship)
    const dir = new THREE.Vector3(toDest.x, toDest.y, toDest.z)
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1)
    dir.normalize()
    const climb = Math.min(1, Math.max(0, pose.fraction))
    const leave = Math.pow(climb, 0.42)
    const arrive = Math.pow(climb, 2.35)
    const behindDist = pose.missionId === 'lunar' ? 28 + leave * 180 : 32 + leave * 680
    const aheadDist = pose.missionId === 'lunar' ? 220 - arrive * 170 : 560 - arrive * 500
    this.earth.position.copy(dir).multiplyScalar(-behindDist)
    this.dest.position.copy(dir).multiplyScalar(Math.max(36, aheadDist))
    this.earth.scale.setScalar(2.85 * (1 - leave * 0.93) + 0.08)
    this.dest.scale.setScalar((pose.missionId === 'lunar' ? 0.12 : 0.055) + arrive * (pose.missionId === 'lunar' ? 1.1 : 0.72))
    aimRing(this.earthOrbit, this.sun.position, this.earth.position)
    aimRing(this.marsOrbit, this.sun.position, this.dest.position)
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= 72; i += 1) points.push(this.earth.position.clone().lerp(this.dest.position, i / 72))
    this.path.geometry.dispose()
    this.path.geometry = new THREE.BufferGeometry().setFromPoints(points)
    this.prograde.copy(dir)
  }

  private frame(mode: FlightCam): void {
    this.ship.updateWorldMatrix(true, false)
    const origin = this.ship.position
    this.camera.up.set(0, 1, 0)
    if (mode === 'cockpit') {
      const eye = new THREE.Vector3(0, 0.42, 2.6).applyQuaternion(this.ship.quaternion).add(origin)
      const ahead = new THREE.Vector3(
        Math.sin(this.glanceYaw) * 12,
        0.08 + this.glancePitch * 6,
        Math.cos(this.glanceYaw) * 12,
      ).applyQuaternion(this.ship.quaternion).add(origin)
      this.camera.position.copy(eye)
      this.camera.lookAt(ahead)
      return
    }
    if (mode === 'side' || mode === 'chase' || mode === 'free') {
      const radius = (mode === 'side' ? 22 : mode === 'free' ? 16 : 14) * this.zoom
      const flat = Math.cos(this.orbitPitch)
      this.camera.position.set(
        origin.x + radius * flat * Math.sin(this.orbitYaw),
        origin.y + radius * Math.sin(this.orbitPitch) + 0.7,
        origin.z + radius * flat * Math.cos(this.orbitYaw),
      )
      this.camera.lookAt(origin.x, origin.y + 0.15, origin.z)
      return
    }
    if (mode === 'map') {
      const lift = 72 + this.fraction * 6
      this.camera.position.set(16, lift, 18)
      this.camera.lookAt(0, 0, 0)
      return
    }
    const outward = origin.clone().sub(this.earth.position)
    if (outward.lengthSq() < 1) outward.set(0, 0.3, 1)
    outward.normalize()
    const earthRadius = 8.6 * this.earth.scale.x
    this.camera.position.copy(this.earth.position).addScaledVector(outward, earthRadius + 22).add(new THREE.Vector3(0, earthRadius * 0.18, 0))
    this.camera.lookAt(origin)
  }

  private painted = ''
  private fraction = 0
  private jupiterSpin: THREE.Object3D | null = null

  private destShell: THREE.Object3D | null = null

  private paintBody(missionId: string): void {
    const url = missionId === 'lunar' ? '/3d/glb/moon.glb'
      : missionId === 'europa' ? '/3d/glb/Europa.glb'
      : missionId === 'mars' || missionId === 'custom' ? '/3d/glb/Mars.glb'
      : ''
    if (this.painted === missionId) return
    this.painted = missionId
    if (this.destShell) {
      this.dest.remove(this.destShell)
      this.destShell = null
    }
    const mat = this.dest.material
    if (!url) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.visible = true
        mat.map = null
        mat.color.set(0x8a6a52)
        mat.needsUpdate = true
      }
      return
    }
    modelLoader().load(url, (gltf) => {
      if (this.painted !== missionId) return
      const model = gltf.scene
      seatSphere(model, 10)
      this.dest.add(model)
      this.destShell = model
      if (mat instanceof THREE.Material) {
        mat.visible = false
        mat.depthWrite = false
      }
    })
  }

  /** Jupiter and its moons, plus the space diorama, sit in the cruise sky. */
  private dressSpace(): void {
    modelLoader().load('/props/jupiter.glb', (gltf) => {
      const model = gltf.scene
      seat(model, 16)
      const rig = new THREE.Group()
      rig.add(model)
      rig.position.set(760, 180, -620)
      this.jupiterSpin = rig
      this.scene.add(rig)
    })
    /* The diorama sat on top of the transfer and read as a second Earth. The cruise uses the real globes. */
  }

  private dress(config: SpacecraftConfig, missionId: string): void {
    const signature = `${missionId}|${config.name}|${config.hullSeed ?? 0}|${config.parts.map((part) => `${part.instanceId}:${part.specId}:${part.enabled}`).join('|')}`
    if (signature === this.signature) return
    this.signature = signature
    disposeCraft(this.payload)
    this.payload.clear()
    const length = 11
    attachOrbiter(this.payload, length, false, undefined, config, missionId)
  }

  private onPointerDown = (event: PointerEvent) => {
    this.dragging = true
    this.lastX = event.clientX
    this.lastY = event.clientY
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging) return
    const dx = event.clientX - this.lastX
    const dy = event.clientY - this.lastY
    this.lastX = event.clientX
    this.lastY = event.clientY
    if (this.cam === 'cockpit') {
      this.glanceYaw = Math.max(-1.2, Math.min(1.2, this.glanceYaw - dx * 0.004))
      this.glancePitch = Math.max(-0.7, Math.min(0.7, this.glancePitch - dy * 0.003))
      return
    }
    this.orbitYaw -= dx * 0.008
    this.orbitPitch = Math.max(-1.05, Math.min(1.15, this.orbitPitch + dy * 0.006))
  }

  private onPointerUp = () => {
    this.dragging = false
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const next = this.zoom * (event.deltaY > 0 ? 1.06 : 0.94)
    this.zoom = Math.max(0.62, Math.min(1.75, next))
  }
}

/** The ring is a unit circle in XZ. Turn local +X toward the planet so the line passes through it. */
function aimRing(ring: THREE.Object3D, sun: THREE.Vector3, planet: THREE.Vector3): void {
  const to = planet.clone().sub(sun)
  const radius = Math.max(8, to.length())
  ring.position.copy(sun)
  ring.scale.setScalar(radius)
  if (to.lengthSq() < 1e-4) return
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), to.normalize())
}

function orbitRing(radius: number, color: number): THREE.Line {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 160; i += 1) {
    const angle = (i / 160) * Math.PI * 2
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
  )
}

function seat(model: THREE.Object3D, span: number): void {
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const extent = Math.max(size.x, size.y, size.z) || 1
  const scale = span / extent
  const center = box.getCenter(new THREE.Vector3())
  model.scale.setScalar(scale)
  model.position.copy(center).multiplyScalar(-scale)
}
