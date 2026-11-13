import * as THREE from 'three'
import { trackMove } from '../input/moveKeys'
import { attachOrbiter } from './launchStack'
import { viewRatio } from './pixels'

export type StationAction = 'mission' | 'engineering' | 'launch' | 'observe'

export interface StationContact {
  prompt: string
  place: string
  speed: number
  action: StationAction | null
}

interface Volume {
  box: THREE.Box3
  place: string
}

interface Hotspot {
  point: THREE.Vector3
  radius: number
  action: StationAction
  prompt: string
  place: string
}

const HOTSPOTS: Hotspot[] = [
  { point: new THREE.Vector3(0, 0.4, -9.5), radius: 3.4, action: 'mission', prompt: 'E — Open mission control', place: 'Zarya module' },
  { point: new THREE.Vector3(0, 1.2, 16), radius: 5.5, action: 'engineering', prompt: 'E — Board the spacecraft', place: 'Surveyor, docked' },
  { point: new THREE.Vector3(0, 0.2, 11.2), radius: 2.6, action: 'launch', prompt: 'E — Take the stack to the pad', place: 'Pressurized mating adapter' },
  { point: new THREE.Vector3(0, -2.4, 0.2), radius: 2.8, action: 'observe', prompt: 'E — Hold on the cupola', place: 'Cupola' },
]

export class StationWorld {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(68, 1, 0.08, 800)
  private stars: THREE.Points
  private earth: THREE.Mesh
  private ship = new THREE.Group()
  private shipName = ''
  private volumes: Volume[] = []
  private eye = new THREE.Vector3(5.2, 1.1, 20)
  private velocity = new THREE.Vector3()
  private yaw = Math.PI
  private pitch = -0.08
  private locked = false
  private keys = new Set<string>()
  private suit: THREE.Group
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(viewRatio())
    this.renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1)
    this.scene.background = new THREE.Color(0x05060c)
    this.scene.add(new THREE.AmbientLight(0xc5d4ee, 0.35))
    const sun = new THREE.DirectionalLight(0xfff4e4, 2.4)
    sun.position.set(40, 28, 18)
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0x7ea0ff, 0.35)
    fill.position.set(-20, -8, -10)
    this.scene.add(fill)

    this.stars = this.makeStars()
    this.scene.add(this.stars)
    this.earth = this.makeEarth()
    this.scene.add(this.earth)
    this.scene.add(this.makeStation())
    this.volumes.push({
      box: new THREE.Box3(new THREE.Vector3(-90, -80, -90), new THREE.Vector3(90, -5.5, 90)),
      place: 'Earth limb',
    })
    this.scene.add(this.ship)
    this.suit = this.makeSuit()
    this.camera.add(this.suit)
    this.scene.add(this.camera)

    this.canvas.addEventListener('click', this.onClick)
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

  setShip(name: string): void {
    const call = name.trim() || 'Surveyor'
    if (call === this.shipName) return
    this.shipName = call
    this.ship.clear()
    this.ship.scale.setScalar(1)
    attachOrbiter(this.ship, 6, false)
    this.ship.position.set(0, 0.15, 17.5)
    this.ship.rotation.y = Math.PI
    this.volumes = this.volumes.filter((volume) => volume.place !== 'Surveyor, docked')
    this.volumes.push({
      box: new THREE.Box3(new THREE.Vector3(-3.4, -1.8, 13.2), new THREE.Vector3(3.4, 2.4, 23.5)),
      place: 'Surveyor, docked',
    })
  }

  step(dt: number, name: string): StationContact {
    this.setShip(name)
    const thrust = this.keys.has('shift') ? 9.5 : 5.4
    const forward = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0)
    const strafe = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0)
    const lift = (this.keys.has(' ') ? 1 : 0) - (this.keys.has('control') ? 1 : 0)
    const ahead = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    const side = new THREE.Vector3(ahead.z, 0, -ahead.x)
    this.velocity.addScaledVector(ahead, forward * thrust * dt)
    this.velocity.addScaledVector(side, strafe * thrust * dt)
    this.velocity.y += lift * thrust * dt
    this.velocity.multiplyScalar(Math.exp(-dt * 1.7))
    const next = this.eye.clone().addScaledVector(this.velocity, dt)
    this.eye.copy(this.resolve(next))
    if (this.eye.length() > 42) {
      this.eye.setLength(42)
      this.velocity.multiplyScalar(0.2)
    }
    this.camera.position.copy(this.eye)
    const look = new THREE.Vector3(
      this.eye.x + Math.sin(this.yaw) * Math.cos(this.pitch),
      this.eye.y + Math.sin(this.pitch),
      this.eye.z + Math.cos(this.yaw) * Math.cos(this.pitch),
    )
    this.camera.lookAt(look)
    this.earth.rotation.y += dt * 0.012
    this.stars.rotation.y += dt * 0.002
    const contact = this.contact()
    this.renderer.render(this.scene, this.camera)
    return contact
  }

  dispose(): void {
    this.canvas.removeEventListener('click', this.onClick)
    document.removeEventListener('pointerlockchange', this.onLock)
    window.removeEventListener('mousemove', this.onMove)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.renderer.dispose()
  }

  private contact(): StationContact {
    let best: Hotspot | null = null
    let bestD = Infinity
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
    for (const spot of HOTSPOTS) {
      const offset = spot.point.clone().sub(this.eye)
      const distance = offset.length()
      if (distance > spot.radius || distance >= bestD) continue
      if (offset.normalize().dot(forward) < 0.2) continue
      best = spot
      bestD = distance
    }
    const place = best?.place ?? this.nearestPlace()
    return {
      prompt: best?.prompt ?? 'WASD to translate. Space up, Ctrl down. Click to look.',
      place,
      speed: this.velocity.length(),
      action: best?.action ?? null,
    }
  }

  private nearestPlace(): string {
    let place = 'Outside the station'
    let best = 8
    for (const volume of this.volumes) {
      const distance = volume.box.distanceToPoint(this.eye)
      if (distance < best) {
        best = distance
        place = volume.place
      }
    }
    return place
  }

  private resolve(next: THREE.Vector3): THREE.Vector3 {
    const radius = 0.45
    const point = next.clone()
    for (let pass = 0; pass < 3; pass++) {
      for (const volume of this.volumes) {
        const expanded = volume.box.clone().expandByScalar(radius)
        if (!expanded.containsPoint(point)) continue
        const left = point.x - expanded.min.x
        const right = expanded.max.x - point.x
        const down = point.y - expanded.min.y
        const up = expanded.max.y - point.y
        const back = point.z - expanded.min.z
        const front = expanded.max.z - point.z
        const min = Math.min(left, right, down, up, back, front)
        if (min === left) point.x = expanded.min.x
        else if (min === right) point.x = expanded.max.x
        else if (min === down) point.y = expanded.min.y
        else if (min === up) point.y = expanded.max.y
        else if (min === back) point.z = expanded.min.z
        else point.z = expanded.max.z
        this.velocity.multiplyScalar(0.35)
      }
    }
    return point
  }

  private makeStars(): THREE.Points {
    const count = 1800
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const radius = 180 + Math.random() * 220
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = radius * Math.cos(phi)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf4f1ea, size: 0.7, sizeAttenuation: true }))
  }

  private makeEarth(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(62, 64, 48),
      new THREE.MeshStandardMaterial({ color: 0x1d4e89, roughness: 0.85, metalness: 0.05 }),
    )
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(62.8, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0xf7f4ee, transparent: true, opacity: 0.18, roughness: 1 }),
    )
    mesh.add(clouds)
    const air = new THREE.Mesh(
      new THREE.SphereGeometry(64.2, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x8eb7ff, transparent: true, opacity: 0.12, side: THREE.BackSide }),
    )
    mesh.add(air)
    mesh.position.set(8, -78, -24)
    return mesh
  }

  private makeStation(): THREE.Group {
    const root = new THREE.Group()
    const white = new THREE.MeshStandardMaterial({ color: 0xe7e2d8, roughness: 0.46, metalness: 0.25 })
    const panel = new THREE.MeshStandardMaterial({ color: 0x1c3148, roughness: 0.35, metalness: 0.55, emissive: 0x102033, emissiveIntensity: 0.35 })
    const gold = new THREE.MeshStandardMaterial({ color: 0xc6a15b, roughness: 0.4, metalness: 0.6 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.5, metalness: 0.4 })
    const glass = new THREE.MeshStandardMaterial({ color: 0x9ec7ff, emissive: 0x17365c, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.2 })
    const add = (mesh: THREE.Object3D, box: THREE.Box3, place: string) => {
      root.add(mesh)
      this.volumes.push({ box, place })
    }
    const hab = (z: number, length: number, place: string) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, length, 20), white)
      mesh.rotation.x = Math.PI / 2
      mesh.position.set(0, 0, z)
      add(mesh, new THREE.Box3(new THREE.Vector3(-1.4, -1.4, z - length / 2), new THREE.Vector3(1.4, 1.4, z + length / 2)), place)
      for (let i = 0; i < 4; i++) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.06), glass)
        window.position.set(1.32, 0.35, z - length * 0.28 + i * (length * 0.18))
        root.add(window)
      }
    }
    hab(0, 5.2, 'Harmony node')
    hab(-8.2, 6.4, 'Zarya module')
    hab(7.4, 5.6, 'Destiny laboratory')
    const truss = new THREE.Mesh(new THREE.BoxGeometry(28, 0.45, 0.7), dark)
    truss.position.set(0, 1.7, 0)
    add(truss, new THREE.Box3(new THREE.Vector3(-14, 1.45, -0.4), new THREE.Vector3(14, 1.95, 0.4)), 'Integrated truss')
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.05, 16), panel)
      wing.position.set(side * 16.2, 1.7, 0)
      add(wing, new THREE.Box3(new THREE.Vector3(side * 16.2 - 3.8, 1.5, -8), new THREE.Vector3(side * 16.2 + 3.8, 2.1, 8)), 'Solar array')
      const boom = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 0.12), gold)
      boom.position.set(side * 11.2, 1.7, 0)
      root.add(boom)
    }
    const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.2, 7), white)
    radiator.position.set(0, 1.7, -4.2)
    root.add(radiator)
    const cupola = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass)
    cupola.position.set(0, -1.35, 0.2)
    cupola.rotation.x = Math.PI
    add(cupola, new THREE.Box3(new THREE.Vector3(-1.1, -2.5, -0.9), new THREE.Vector3(1.1, -1.2, 1.3)), 'Cupola')
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.4, 16), dark)
    port.rotation.x = Math.PI / 2
    port.position.set(0, 0, 11.2)
    add(port, new THREE.Box3(new THREE.Vector3(-1, -1, 10.4), new THREE.Vector3(1, 1, 12)), 'Pressurized mating adapter')
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 1.1, 0.2, 16), white)
    dish.position.set(-2.2, 2.4, -6)
    dish.rotation.x = 0.6
    root.add(dish)
    return root
  }

  private makeSuit(): THREE.Group {
    const suit = new THREE.Group()
    const cloth = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.6 })
    const visor = new THREE.MeshStandardMaterial({ color: 0x142033, roughness: 0.15, metalness: 0.6, emissive: 0x102030, emissiveIntensity: 0.3 })
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.22), cloth)
    chest.position.set(0, -0.42, -0.35)
    suit.add(chest)
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.2), visor)
    helm.position.set(0, -0.18, -0.28)
    suit.add(helm)
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.55), cloth)
      arm.position.set(side * 0.28, -0.38, -0.55)
      suit.add(arm)
    }
    return suit
  }

  private onClick = () => {
    if (!this.locked) this.canvas.requestPointerLock()
  }

  private onLock = () => {
    this.locked = document.pointerLockElement === this.canvas
  }

  private onMove = (event: MouseEvent) => {
    if (!this.locked) return
    this.yaw -= event.movementX * 0.0022
    this.pitch = Math.max(-1.2, Math.min(1.15, this.pitch - event.movementY * 0.0022))
  }

  private onKey = (event: KeyboardEvent) => {
    trackMove(this.keys, event)
  }
}
