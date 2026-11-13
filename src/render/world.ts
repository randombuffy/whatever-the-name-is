import * as THREE from 'three'
import type { SpacecraftConfig } from '../domain/types'
import { disposeCraft } from './craft'
import { attachLaunchStack } from './launchStack'
import { modelLoader, seatSphere } from './gltf'
import type { AscentState } from '../domain/ascent'
import { viewRatio } from './pixels'

export type SceneMode = 'menu' | 'destination' | 'design' | 'launch' | 'flight'

export interface ViewState {
  mode: SceneMode
  craft: SpacecraftConfig | null
  selectedInstanceId: string | null
  burning: boolean
  thrust: number
  progress: number
  missionId: string
  reduced: boolean
  camera: 'orbit' | 'chase' | 'aft' | 'wide'
  launchCharge: number
  ascent: AscentState | null
  onPick?: (instanceId: string | null) => void
  onNudge?: (instanceId: string, dx: number, dy: number, dz: number) => void
}

const FLAME_VERT = `
  varying float vT;
  void main() {
    vT = uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const FLAME_FRAG = `
  uniform float uTime;
  uniform vec3 uColor;
  varying float vT;
  void main() {
    float flick = 0.75 + 0.25 * sin(uTime * 30.0 - vT * 12.0);
    float alpha = pow(1.0 - vT, 1.4) * flick;
    gl_FragColor = vec4(uColor * (1.2 + flick), alpha);
  }
`

type Axis = 'x' | 'y' | 'z'

interface Drag {
  id: string
  axis: Axis
  sx: number
  sy: number
  sz: number
  x: number
  y: number
  z: number
}

export class MissionWorld {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500)
  private craft: THREE.Group | null = null
  private signature = ''
  private flame: THREE.Mesh
  private flameMat: THREE.ShaderMaterial
  private stars: THREE.Points
  private starMat: THREE.ShaderMaterial
  private aurora: THREE.Mesh
  private auroraMat: THREE.ShaderMaterial
  private earthPivot = new THREE.Group()
  private earthMesh: THREE.Mesh
  private earthClouds: THREE.Mesh
  private moon: THREE.Mesh
  private mars: THREE.Mesh
  private europa: THREE.Mesh
  private asteroid: THREE.Mesh
  private jupiter: THREE.Mesh
  private halo: THREE.Mesh
  private stack = new THREE.Group()
  private fairingLeft: THREE.Mesh
  private fairingRight: THREE.Mesh
  private boosterCore: THREE.Group
  private tower: THREE.Group
  private galaxy: THREE.Sprite
  private path: THREE.Line
  private pad: THREE.Mesh
  private gizmo = new THREE.Group()
  private engineLight: THREE.PointLight
  private designLamp!: THREE.DirectionalLight
  private yaw = 0.12
  private pitch = 0.16
  private distance = 6.6
  private framed = ''
  private orbiting = false
  private moved = false
  private userAimed = false
  private downX = 0
  private downY = 0
  private lastX = 0
  private lastY = 0
  private pointerX = 0
  private pointerY = 0
  private time = 0
  private reduced = false
  private view: ViewState | null = null
  private drag: Drag | null = null
  private hold: { id: string; x: number; y: number; z: number } | null = null
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private tmp = new THREE.Vector3()
  private tmp2 = new THREE.Vector3()
  private tmp3 = new THREE.Vector3()
  private look = new THREE.Vector3()

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas)
    this.renderer.setClearColor(0x03040c, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.scene.add(new THREE.AmbientLight(0xb7c4d8, 0.22))
    this.scene.add(new THREE.HemisphereLight(0x1a2744, 0x050505, 0.45))
    const sun = new THREE.DirectionalLight(0xfff3df, 3.4)
    sun.position.set(28, 14, 18)
    const fill = new THREE.DirectionalLight(0x6a8cc4, 0.55)
    fill.position.set(-12, -3, -8)
    this.designLamp = new THREE.DirectionalLight(0xfff8ee, 0)
    this.designLamp.position.set(6, 10, 8)
    this.scene.add(sun, fill, this.designLamp)
    this.engineLight = new THREE.PointLight(0xffb26b, 0, 8, 2)
    this.scene.add(this.engineLight)

    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,244,220,0.95)', 'rgba(255,220,160,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    sunSprite.position.copy(sun.position)
    sunSprite.scale.set(7, 7, 1)
    this.scene.add(sunSprite)

    this.stars = makeStars(2400)
    this.starMat = this.stars.material as THREE.ShaderMaterial
    this.scene.add(this.stars)
    this.aurora = makeAurora()
    this.auroraMat = this.aurora.material as THREE.ShaderMaterial
    this.scene.add(this.aurora)
    this.scene.add(makeNebula(-18, 4, -28, 'rgba(70,110,190,0.55)', 22))
    this.scene.add(makeNebula(16, -2, -34, 'rgba(120,80,160,0.4)', 18))
    this.galaxy = makeGalaxy()
    this.scene.add(this.galaxy)

    const earth = makeEarth()
    this.earthMesh = earth.ground
    this.earthClouds = earth.clouds
    this.earthPivot.add(earth.ground, earth.clouds, earth.air)
    this.moon = makeMoon()
    this.mars = makeMars()
    this.europa = makeEuropa()
    this.asteroid = makeAsteroid()
    this.jupiter = makeJupiter()
    this.halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.018, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0.85 }),
    )
    this.halo.visible = false
    this.boosterCore = makeBooster()
    const fairing = makeFairing()
    this.fairingLeft = fairing.left
    this.fairingRight = fairing.right
    this.tower = makeTower()
    this.stack.add(this.boosterCore, this.fairingLeft, this.fairingRight)
    this.stack.visible = false
    this.tower.visible = false
    this.path = makePath()
    this.pad = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1.18, 56),
      new THREE.MeshBasicMaterial({ color: 0xc5d0dc, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
    )
    this.pad.rotation.x = -Math.PI / 2
    this.scene.add(this.earthPivot, this.moon, this.mars, this.europa, this.asteroid, this.jupiter, this.halo, this.stack, this.tower, this.path, this.pad)
    wearGlobe(this.earthMesh, '/3d/glb/Earth.glb')
    wearGlobe(this.moon, '/3d/glb/moon.glb')
    wearGlobe(this.mars, '/3d/glb/Mars.glb')
    wearGlobe(this.europa, '/3d/glb/Europa.glb')
    wearGlobe(this.jupiter, '/3d/glb/Jupiter.glb')

    this.gizmo.add(makeArrow('x', 0xff6b6b), makeArrow('y', 0x7dffa8), makeArrow('z', 0x79b0ff))
    this.gizmo.visible = false
    this.gizmo.renderOrder = 20

    this.flameMat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#f4e2c4') } },
    })
    const flameGeo = new THREE.ConeGeometry(0.16, 0.9, 20, 1, true)
    flameGeo.translate(0, -0.45, 0)
    flameGeo.rotateX(Math.PI / 2)
    this.flame = new THREE.Mesh(flameGeo, this.flameMat)
    this.flame.visible = false
    this.scene.add(this.flame)

    this.canvas.style.touchAction = 'none'
    this.canvas.addEventListener('pointerdown', this.onDown)
    this.canvas.addEventListener('pointermove', this.onMove)
    this.canvas.addEventListener('pointerup', this.onUp)
    this.canvas.addEventListener('pointercancel', this.onUp)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true })
    this.resize()
  }

  resize(): void {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const ratio = viewRatio(this.reduced)
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(width, height, false)
  }

  sync(view: ViewState, dt: number): void {
    this.view = view
    this.reduced = view.reduced
    if (!view.reduced) this.time += dt
    this.flameMat.uniforms.uTime.value = this.time
    this.starMat.uniforms.uTime.value = this.time
    this.auroraMat.uniforms.uTime.value = this.time
    if (!view.reduced && !this.userAimed && view.mode === 'destination') this.yaw += dt * 0.045
    this.stars.rotation.y = this.time * 0.008 + this.pointerX * 0.08
    this.stars.rotation.x = this.pointerY * 0.04
    this.galaxy.rotation.z = this.time * 0.02
    if (!view.reduced) {
      this.earthMesh.rotation.y += dt * 0.05
      this.earthClouds.rotation.y += dt * 0.07
      this.moon.rotation.y += dt * 0.08
      this.mars.rotation.y += dt * 0.04
      this.europa.rotation.y += dt * 0.03
      this.asteroid.rotation.y += dt * 0.09
      this.asteroid.rotation.x += dt * 0.04
      this.jupiter.rotation.y += dt * 0.06
    }
    this.designLamp.intensity = view.mode === 'design' ? 2.6 : 0
    this.syncCraft(view)
    this.applyOffsets(view)
    this.attachGizmo(view)
    this.paintSelection(view)
    this.showTags(view)
    this.layoutBodies(view)
    this.placeCraft(view)
    this.placeFlame(view)
    this.placeCamera(view)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown)
    this.canvas.removeEventListener('pointermove', this.onMove)
    this.canvas.removeEventListener('pointerup', this.onUp)
    this.canvas.removeEventListener('pointercancel', this.onUp)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.detachGizmo()
    this.scene.add(this.gizmo)
    this.scene.traverse((obj) => {
      const drawable = obj as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }
      if (drawable.geometry) drawable.geometry.dispose()
      if (!drawable.material) return
      const list = Array.isArray(drawable.material) ? drawable.material : [drawable.material]
      for (const mat of list) mat.dispose()
    })
    this.renderer.dispose()
  }

  private syncCraft(view: ViewState): void {
    if (!view.craft) {
      if (this.craft) {
        this.detachGizmo()
        this.scene.remove(this.craft)
        disposeCraft(this.craft)
        this.craft = null
        this.signature = ''
      }
      return
    }
    const next = `${view.missionId}|${view.craft.name}|${view.craft.hullSeed ?? 0}|${view.craft.parts.map((part) => `${part.instanceId}:${part.specId}:${part.fill}:${part.enabled}`).join('|')}`
    if (next === this.signature && this.craft) return
    this.detachGizmo()
    if (this.craft) {
      this.scene.remove(this.craft)
      disposeCraft(this.craft)
    }
    this.craft = new THREE.Group()
    this.craft.name = 'craft-root'
    attachLaunchStack(this.craft, (rig) => {
      const box = new THREE.Box3().setFromObject(rig.root)
      rig.root.position.sub(box.getCenter(new THREE.Vector3()))
    }, 5.2, view.craft, view.missionId)
    this.scene.add(this.craft)
    this.signature = next
  }

  private applyOffsets(view: ViewState): void {
    if (!this.craft || !view.craft) return
    this.craft.traverse((obj) => {
      if (!obj.userData.offsetRoot) return
      const id = String(obj.userData.instanceId ?? '')
      const part = view.craft?.parts.find((item) => item.instanceId === id)
      const base = obj.userData.base as THREE.Vector3 | undefined
      if (!part || !base) return
      let x = part.offset?.x ?? 0
      let y = part.offset?.y ?? 0
      let z = part.offset?.z ?? 0
      if (this.drag?.id === id) {
        x = this.drag.x
        y = this.drag.y
        z = this.drag.z
      } else if (this.hold?.id === id) {
        const caught = Math.abs(x - this.hold.x) < 0.04 && Math.abs(y - this.hold.y) < 0.04 && Math.abs(z - this.hold.z) < 0.04
        const replaced = Math.abs(x) + Math.abs(y) + Math.abs(z) < 0.001 && Math.abs(this.hold.x) + Math.abs(this.hold.y) + Math.abs(this.hold.z) > 0.05
        if (caught || replaced) this.hold = null
        else {
          x = this.hold.x
          y = this.hold.y
          z = this.hold.z
        }
      }
      obj.position.set(base.x + x, base.y + y, base.z + z)
    })
  }

  private attachGizmo(view: ViewState): void {
    if (view.mode !== 'design' || !view.selectedInstanceId || !this.craft) {
      this.gizmo.visible = false
      return
    }
    const host = this.findPart(view.selectedInstanceId)
    if (!host) {
      this.gizmo.visible = false
      return
    }
    if (this.gizmo.parent !== this.scene) this.scene.add(this.gizmo)
    host.updateWorldMatrix(true, false)
    host.getWorldPosition(this.gizmo.position)
    this.gizmo.quaternion.identity()
    this.gizmo.scale.setScalar(1)
    this.gizmo.visible = true
  }

  private paintSelection(view: ViewState): void {
    if (!this.craft) return
    const selected = view.mode === 'design' ? view.selectedInstanceId : null
    this.craft.traverse((obj) => {
      if (obj.userData.kind === 'outline') {
        obj.visible = Boolean(selected) && obj.userData.instanceId === selected
        const mat = (obj as THREE.LineSegments).material
        if (mat instanceof THREE.LineBasicMaterial && obj.visible) {
          mat.opacity = this.reduced ? 1 : 0.62 + 0.38 * Math.sin(this.time * 5)
        }
        return
      }
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material
      if (!(mat instanceof THREE.MeshStandardMaterial)) return
      if (mat.userData.base === undefined) {
        mat.userData.base = mat.emissive.getHex()
        mat.userData.baseI = mat.emissiveIntensity
      }
      const on = Boolean(selected) && mesh.userData.instanceId === selected
      mat.emissive.set(on ? 0x9ec0ff : (mat.userData.base as number))
      mat.emissiveIntensity = on ? 0.55 : (mat.userData.baseI as number)
    })
  }

  private showTags(view: ViewState): void {
    if (!this.craft) return
    this.craft.traverse((obj) => {
      if (obj.userData.kind !== 'tag') return
      const id = String(obj.userData.instanceId ?? '')
      const picked = view.selectedInstanceId === id
      obj.visible = view.mode === 'design' && (picked || !view.selectedInstanceId)
    })
  }

  private layoutBodies(view: ViewState): void {
    const kind = bodyKind(view.missionId, view.mode)
    const hero = this.meshFor(kind)
    this.moon.visible = false
    this.mars.visible = false
    this.europa.visible = false
    this.asteroid.visible = false
    this.jupiter.visible = false
    this.earthPivot.visible = true
    hero.visible = true
    this.path.visible = view.mode === 'flight'
    this.stack.visible = view.mode === 'launch'
    this.tower.visible = false
    this.pad.visible = false
    this.halo.visible = false
    const ang = this.time * 0.16

    if (view.mode === 'flight') {
      this.earthPivot.position.copy(transferPoint(0))
      this.earthPivot.scale.setScalar(0.85)
      hero.position.copy(transferPoint(1))
      hero.scale.setScalar(kind === 'asteroid' ? 0.46 : 0.74)
      return
    }
    if (view.mode === 'launch') {
      const ascent = view.ascent
      const flying = Boolean(ascent && ascent.altitudeM > 1)
      const radius = 16
      this.earthPivot.position.set(flying ? -(ascent?.downrangeM ?? 0) / 18000 : 0.2, -radius, flying ? 0 : -2.4)
      this.earthPivot.scale.setScalar(radius)
      this.earthPivot.visible = true
      hero.visible = false
      this.stack.visible = true
      const altitude = (ascent?.altitudeM ?? view.launchCharge * 30) / 5500
      const downrange = (ascent?.downrangeM ?? 0) / 5500
      const gamma = ascent?.flightPathRad ?? Math.PI / 2
      this.stack.position.set(downrange, altitude, 0)
      this.stack.rotation.set(0, ascent?.yawRad ?? 0, gamma - Math.PI / 2)
      this.fairingLeft.visible = !ascent?.fairingGone
      this.fairingRight.visible = !ascent?.fairingGone
      this.boosterCore.visible = !ascent?.boosterGone
      this.boosterCore.position.y = ascent?.boosterGone ? -2.4 : 0
      this.tower.visible = altitude < 0.35
      this.pad.position.set(0, 0.02, 0)
      this.pad.scale.setScalar(1 + view.launchCharge * 0.35)
      ;(this.pad.material as THREE.MeshBasicMaterial).opacity = altitude < 0.5 ? 0.28 + view.launchCharge * 0.35 : 0
      this.pad.visible = altitude < 0.5
      return
    }
    if (view.mode === 'design') {
      this.earthPivot.position.set(-18, 6.2, -32)
      this.earthPivot.scale.setScalar(1.05)
      hero.position.set(Math.cos(ang) * 2.2 + 10, 3.2, Math.sin(ang) * 2.2 - 26)
      hero.scale.setScalar(kind === 'asteroid' ? 0.28 : 0.34)
      return
    }
    if (view.mode === 'destination') {
      this.earthPivot.position.set(-12, -2.4, -20)
      this.earthPivot.scale.setScalar(0.7)
      hero.position.set(0, 0.05, 0)
      hero.scale.setScalar(kind === 'asteroid' ? 0.46 : kind === 'europa' ? 0.42 : 0.68)
      hero.rotation.y = this.time * 0.18
      if (kind === 'europa') {
        this.jupiter.visible = true
        this.jupiter.position.set(2.6, 0.2, -2.4)
        this.jupiter.scale.set(1.35, 1.26, 1.35)
      }
      if (kind === 'mars') {
        this.asteroid.visible = true
        this.asteroid.position.set(2.4, -0.7, -1.8)
        this.asteroid.scale.setScalar(0.16)
      }
      this.halo.visible = true
      this.halo.position.copy(hero.position)
      this.halo.rotation.set(Math.PI / 2.4, this.time * 0.12, 0)
      this.halo.scale.setScalar(kind === 'asteroid' ? 0.52 : kind === 'europa' ? 0.58 : 0.78)
      return
    }
    const t = this.time
    this.earthPivot.position.set(-3.05, -0.05, -6.3)
    this.earthPivot.scale.setScalar(1.22)
    this.moon.visible = true
    const moonA = t * 0.62
    this.moon.position.set(
      this.earthPivot.position.x + Math.cos(moonA) * 1.95,
      this.earthPivot.position.y + 0.95 + Math.sin(moonA) * 0.22,
      this.earthPivot.position.z + Math.sin(moonA) * 0.85,
    )
    this.moon.scale.setScalar(0.42)
    this.mars.visible = true
    this.mars.position.set(0.15, 1.55, -7.6)
    this.mars.scale.setScalar(0.62)
    this.jupiter.visible = true
    this.jupiter.position.set(3.35, 0.35, -8.4)
    this.jupiter.scale.set(1.05, 0.98, 1.05)
    const eu = t * 0.95
    this.europa.visible = true
    this.europa.position.set(
      this.jupiter.position.x + Math.cos(eu) * 1.38,
      this.jupiter.position.y + Math.sin(eu) * 0.12,
      this.jupiter.position.z + Math.sin(eu) * 0.55,
    )
    this.europa.scale.setScalar(0.26)
    this.asteroid.visible = true
    this.asteroid.position.set(
      1.15 + Math.cos(t * 0.22) * 0.2,
      -1.55,
      -4.7 + Math.sin(t * 0.22) * 0.15,
    )
    this.asteroid.scale.setScalar(0.3)
  }

  private placeCraft(view: ViewState): void {
    if (!this.craft) return
    const progress = Math.min(1, Math.max(0, view.progress))
    if (view.mode === 'flight') {
      this.craft.scale.setScalar(0.22)
      const pos = transferPoint(progress)
      const anchors = [this.earthPivot.position, this.meshFor(bodyKind(view.missionId, view.mode)).position]
      for (const body of anchors) {
        const away = pos.clone().sub(body)
        const limit = 1.35
        if (away.length() < limit) {
          if (away.lengthSq() < 1e-8) away.copy(transferPoint(Math.min(1, progress + 0.04)).sub(body))
          pos.copy(body).add(away.normalize().multiplyScalar(limit))
        }
      }
      this.craft.position.copy(pos)
      this.craft.lookAt(transferPoint(Math.min(1, progress + 0.02)))
      return
    }
    if (view.mode === 'launch') {
      const ascent = view.ascent
      const tucked = !ascent?.fairingGone
      this.craft.scale.setScalar(tucked ? 0.2 : 0.4)
      const local = new THREE.Vector3(0, tucked ? 2.15 : 1.85, 0)
      local.applyQuaternion(this.stack.quaternion)
      this.craft.position.copy(this.stack.position).add(local)
      this.craft.quaternion.copy(this.stack.quaternion)
      return
    }
    if (view.mode === 'design') {
      this.craft.scale.setScalar(1.15)
      this.craft.position.set(0, 0.2, 0)
      this.craft.rotation.set(0.2, 0.6, 0)
      return
    }
    this.craft.scale.setScalar(view.mode === 'destination' ? 0.55 : 0.5)
    this.craft.position.set(view.mode === 'destination' ? 2.5 : 4.15, view.mode === 'destination' ? -0.15 : -1.25, view.mode === 'destination' ? 1.1 : -4.4)
    this.craft.rotation.set(0, this.reduced ? 0.4 : this.time * 0.22, 0)
  }

  private placeFlame(view: ViewState): void {
    const chemical = this.craft?.userData.engineKind !== 'electric'
    ;(this.flameMat.uniforms.uColor.value as THREE.Color).set(chemical ? '#f3d7b0' : '#d5e4f6')
    this.engineLight.color.set(chemical ? 0xffb26b : 0x9ec6ff)
    if (view.mode === 'launch') {
      const ascent = view.ascent
      const coreLit = ascent ? ascent.throttle > 0.12 && !ascent.boosterGone && ascent.phase !== 'abort' : view.launchCharge > 0.55
      const shipLit = Boolean(ascent?.boosterGone && ascent.velocityMps > 40 && ascent.phase !== 'abort')
      this.flame.visible = coreLit || shipLit
      const base = new THREE.Vector3(0, 0.12, 0).applyQuaternion(this.stack.quaternion).add(this.stack.position)
      if (shipLit && this.craft) {
        const aft = new THREE.Vector3(0, -0.35, 0).applyQuaternion(this.craft.quaternion).add(this.craft.position)
        this.flame.position.copy(aft)
        this.flame.quaternion.copy(this.craft.quaternion)
        this.flame.rotateX(Math.PI)
        this.flame.scale.setScalar(0.28)
      } else {
        this.flame.position.copy(base)
        this.flame.quaternion.copy(this.stack.quaternion)
        this.flame.rotateX(Math.PI)
        const scale = 0.55 + (ascent?.throttle ?? view.launchCharge) * 1.5
        this.flame.scale.set(scale * 0.8, scale * 1.5, scale * 0.8)
      }
      this.engineLight.position.copy(this.flame.position)
      this.engineLight.intensity = this.flame.visible ? 10 : 0
      return
    }
    if (this.craft && view.mode === 'flight') {
      const nozzle = this.tmp.set(0, 0, -1.2)
      let found = false
      this.craft.traverse((obj) => {
        if (obj.userData.nozzle) {
          obj.getWorldPosition(nozzle)
          found = true
        }
      })
      if (!found) this.craft.localToWorld(nozzle)
      this.flame.position.copy(nozzle)
      this.flame.quaternion.copy(this.craft.quaternion)
      this.flame.visible = view.burning && view.thrust > 0
      this.flame.scale.setScalar(0.22 * (0.55 + view.thrust * 0.9))
      this.engineLight.position.copy(nozzle)
      this.engineLight.intensity = view.burning ? 3 + view.thrust * 8 : 0
      return
    }
    this.flame.visible = false
    this.engineLight.intensity = 0
  }

  private placeCamera(view: ViewState): void {
    const width = Math.max(1, this.canvas.clientWidth)
    const height = Math.max(1, this.canvas.clientHeight)
    const shift = view.mode === 'flight' && (view.camera === 'wide' || view.camera === 'orbit')
    if (shift) this.camera.setViewOffset(width * 1.22, height, width * 0.18, 0, width, height)
    else this.camera.clearViewOffset()
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    if (view.mode === 'flight') {
      const progress = Math.min(1, Math.max(0, view.progress))
      const ship = this.craft?.position ?? new THREE.Vector3()
      if (view.camera === 'wide' || view.camera === 'orbit') {
        const yaw = view.camera === 'orbit' ? this.yaw : 0.15
        this.camera.position.set(-3.2 + Math.sin(yaw) * 6, view.camera === 'wide' ? 18 : 14, 15)
        this.camera.lookAt(-4.2, 0, 1.6)
        return
      }
      if (view.camera === 'aft') {
        const ahead = transferPoint(Math.min(1, progress + 0.03))
        const forward = ahead.clone().sub(ship)
        if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1)
        this.camera.position.copy(ship).add(forward.normalize().multiplyScalar(1.15)).add(new THREE.Vector3(0, 0.28, 0))
        this.camera.lookAt(ship)
        return
      }
      const ahead = transferPoint(Math.min(1, progress + 0.04))
      const back = ship.clone().sub(ahead)
      if (back.lengthSq() < 1e-8) back.set(0, 0.2, 1)
      this.camera.position.copy(ship).add(back.normalize().multiplyScalar(1.45)).add(new THREE.Vector3(0, 0.32, 0))
      this.camera.lookAt(ship)
      return
    }

    if (view.mode === 'launch') {
      const ascent = view.ascent
      if (ascent && ascent.altitudeM > 40) {
        const focus = this.stack.position
        this.camera.position.set(focus.x - 5.2, focus.y + 1.8, 7.4)
        this.camera.lookAt(focus.x, focus.y + 1.05, 0)
        return
      }
      const r = Math.max(3.2, 4.4 + (this.distance - 6.6) * 0.35)
      const shake = !this.reduced && view.launchCharge > 0.05 ? view.launchCharge : 0
      this.camera.position.set(
        Math.sin(this.yaw) * r + Math.sin(this.time * 48) * 0.04 * shake,
        1.55 + Math.sin(this.pitch) * 1.4 + Math.cos(this.time * 37) * 0.03 * shake,
        Math.cos(this.yaw) * r,
      )
      this.camera.lookAt(0, 1.4, 0)
      return
    }

    if (view.mode === 'design' && this.framed !== 'design-side') {
      this.framed = 'design-side'
      this.distance = 14
      this.pitch = 0.22
      this.yaw = 0.9
    } else if (view.mode !== 'design') this.framed = view.mode
    const extra = view.mode === 'menu' ? 3.4 : view.mode === 'destination' ? 2.4 : 0
    const orbitR = view.mode === 'destination' ? Math.max(8.4, this.distance + extra) : Math.max(2.4, this.distance + extra)
    if (view.mode === 'destination') this.look.set(0, 0.05, 0)
    else if (view.mode === 'menu') this.look.set(0.15, 0.35, -6.2)
    else this.look.set(0, 0, 0)
    this.camera.position.set(
      this.look.x + Math.sin(this.yaw) * Math.cos(this.pitch) * orbitR,
      this.look.y + Math.sin(this.pitch) * orbitR,
      this.look.z + Math.cos(this.yaw) * Math.cos(this.pitch) * orbitR,
    )
    this.camera.lookAt(this.look)
  }

  private findPart(id: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    this.craft?.traverse((obj) => {
      if (obj.userData.offsetRoot && obj.userData.instanceId === id) found = obj
    })
    return found
  }

  private meshFor(kind: string): THREE.Object3D {
    if (kind === 'mars') return this.mars
    if (kind === 'europa') return this.europa
    if (kind === 'asteroid') return this.asteroid
    return this.moon
  }

  private detachGizmo(): void {
    if (this.gizmo.parent) this.gizmo.parent.remove(this.gizmo)
  }

  private pick(event: PointerEvent): { instanceId: string | null; axis: Axis | null } {
    const rect = this.canvas.getBoundingClientRect()
    this.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const roots: THREE.Object3D[] = []
    if (this.gizmo.visible) roots.push(this.gizmo)
    if (this.craft) roots.push(this.craft)
    const hits = this.raycaster.intersectObjects(roots, true)
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object
      while (obj) {
        const axis = obj.userData.gizmoAxis
        if (axis === 'x' || axis === 'y' || axis === 'z') return { instanceId: this.view?.selectedInstanceId ?? null, axis }
        if (obj.userData.offsetRoot && typeof obj.userData.instanceId === 'string') return { instanceId: obj.userData.instanceId, axis: null }
        obj = obj.parent
      }
    }
    return { instanceId: null, axis: null }
  }

  private beginDrag(id: string, axis: Axis): void {
    const part = this.view?.craft?.parts.find((item) => item.instanceId === id)
    const origin = part?.offset ?? { x: 0, y: 0, z: 0 }
    this.drag = { id, axis, sx: origin.x, sy: origin.y, sz: origin.z, x: origin.x, y: origin.y, z: origin.z }
    this.hold = null
  }

  private dragAxis(event: PointerEvent): void {
    if (!this.drag) return
    const dx = (event.clientX - this.downX) * 0.008
    const dy = (event.clientY - this.downY) * 0.008
    this.tmp.set(this.drag.axis === 'x' ? 1 : 0, this.drag.axis === 'y' ? 1 : 0, this.drag.axis === 'z' ? 1 : 0)
    if (this.craft) this.tmp.applyQuaternion(this.craft.quaternion)
    this.camera.updateMatrixWorld()
    this.tmp2.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize()
    this.tmp3.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize()
    const along = dx * this.tmp.dot(this.tmp2) + -dy * this.tmp.dot(this.tmp3)
    const next = { x: this.drag.sx, y: this.drag.sy, z: this.drag.sz }
    next[this.drag.axis] = clampOffset(next[this.drag.axis] + along)
    this.drag.x = next.x
    this.drag.y = next.y
    this.drag.z = next.z
  }

  private endDrag(): void {
    const drag = this.drag
    this.drag = null
    if (!drag) return
    this.hold = { id: drag.id, x: drag.x, y: drag.y, z: drag.z }
    this.view?.onNudge?.(drag.id, drag.x - drag.sx, drag.y - drag.sy, drag.z - drag.sz)
  }

  private onDown = (event: PointerEvent) => {
    this.downX = event.clientX
    this.downY = event.clientY
    this.lastX = event.clientX
    this.lastY = event.clientY
    this.moved = false
    this.canvas.setPointerCapture(event.pointerId)
    const hit = this.view?.mode === 'design' ? this.pick(event) : { instanceId: null, axis: null as Axis | null }
    if (hit.axis && this.view?.selectedInstanceId) {
      this.beginDrag(this.view.selectedInstanceId, hit.axis)
      this.orbiting = false
      this.canvas.style.cursor = 'grabbing'
      return
    }
    this.orbiting = true
    this.userAimed = true
    this.canvas.style.cursor = 'grabbing'
  }

  private onMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    this.pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1
    if (this.drag) {
      this.dragAxis(event)
      return
    }
    if (!this.orbiting) {
      if (this.view?.mode === 'design') {
        const hit = this.pick(event)
        this.canvas.style.cursor = hit.axis ? 'grab' : hit.instanceId ? 'pointer' : 'grab'
      }
      return
    }
    if (Math.hypot(event.clientX - this.downX, event.clientY - this.downY) > 4) this.moved = true
    this.yaw -= (event.clientX - this.lastX) * 0.008
    this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch + (event.clientY - this.lastY) * 0.006))
    this.lastX = event.clientX
    this.lastY = event.clientY
  }

  private onUp = (event: PointerEvent) => {
    const wasDrag = this.drag !== null
    if (wasDrag) this.endDrag()
    this.orbiting = false
    this.canvas.style.cursor = 'grab'
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    if (!wasDrag && !this.moved && this.view?.mode === 'design') {
      const hit = this.pick(event)
      this.view.onPick?.(hit.instanceId)
    }
    this.moved = false
  }

  private onWheel = (event: WheelEvent) => {
    this.userAimed = true
    this.distance = Math.max(2.4, Math.min(24, this.distance + event.deltaY * 0.004))
  }
}

function clampOffset(value: number): number {
  return Math.max(-2.4, Math.min(2.4, value))
}

function bodyKind(missionId: string, mode: SceneMode): string {
  if (mode === 'menu') return 'moon'
  if (missionId === 'mars') return 'mars'
  if (missionId === 'europa') return 'europa'
  if (missionId === 'asteroid') return 'asteroid'
  return 'moon'
}

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const attempts: THREE.WebGLRendererParameters[] = [
    { antialias: true, powerPreference: 'high-performance', stencil: false },
    { antialias: false, powerPreference: 'default', stencil: false },
  ]
  let last: unknown = new Error('WebGL is not available')
  for (const attempt of attempts) {
    try {
      return new THREE.WebGLRenderer({ canvas, alpha: false, ...attempt })
    } catch (error) {
      last = error
    }
  }
  throw last
}

function makeStars(count: number): THREE.Points {
  const positions = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  const sizes = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const radius = 48 + Math.random() * 110
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)
    phases[i] = Math.random() * Math.PI * 2
    sizes[i] = 0.7 + Math.random() * 2.1
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      varying float vTw;
      void main() {
        vTw = 0.4 + 0.6 * sin(uTime * 1.7 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * vTw * (260.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vTw;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float a = smoothstep(1.0, 0.15, d) * vTw;
        gl_FragColor = vec4(0.93, 0.96, 1.0, a);
      }
    `,
  })
  return new THREE.Points(geo, mat)
}

function makeAurora(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float wave = sin(vUv.x * 7.0 + uTime * 0.35) * 0.08 + sin(vUv.x * 16.0 - uTime * 0.22) * 0.035;
        float band = smoothstep(0.38, 0.0, abs(vUv.y - 0.55 - wave));
        vec3 col = mix(vec3(0.22, 0.42, 0.95), vec3(0.62, 0.36, 0.9), vUv.x);
        gl_FragColor = vec4(col, band * 0.22);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(42, 9), mat)
  mesh.position.set(0, 8, -18)
  mesh.rotation.x = -0.35
  return mesh
}

function makeGalaxy(): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256)
    ctx.translate(128, 128)
    for (let arm = 0; arm < 2; arm += 1) {
      ctx.rotate(Math.PI)
      for (let i = 0; i < 420; i += 1) {
        const t = i / 420
        const angle = t * Math.PI * 3.4
        const radius = 8 + t * 108
        const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 10
        const y = Math.sin(angle) * radius * 0.42 + (Math.random() - 0.5) * 6
        ctx.fillStyle = `rgba(${210 + Math.floor(t * 40)}, ${200 + Math.floor((1 - t) * 30)}, 255, ${0.15 + (1 - t) * 0.45})`
        ctx.fillRect(x, y, 1.4, 1.4)
      }
    }
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 28)
    core.addColorStop(0, 'rgba(255,236,210,0.85)')
    core.addColorStop(1, 'rgba(255,236,210,0)')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(0, 0, 28, 0, Math.PI * 2)
    ctx.fill()
  }
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.72,
  }))
  sprite.position.set(-26, 7, -42)
  sprite.scale.set(34, 18, 1)
  return sprite
}

function makeNebula(x: number, y: number, z: number, color: string, size: number): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(color, 'rgba(0,0,0,0)'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
  sprite.position.set(x, y, z)
  sprite.scale.set(size, size * 0.62, 1)
  return sprite
}

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const grd = ctx.createRadialGradient(128, 128, 8, 128, 128, 128)
    grd.addColorStop(0, inner)
    grd.addColorStop(1, outer)
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 256, 256)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function stageMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 0.48, metalness: 0.14 })
}

function makeBooster(): THREE.Group {
  const group = new THREE.Group()
  const mat = stageMaterial()
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 2.15, 20), mat)
  core.position.y = 1.15
  group.add(core)
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(core.geometry, 28), new THREE.LineBasicMaterial({ color: 0x1c1c1c }))
  edges.position.copy(core.position)
  group.add(edges)
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.16, 16), new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.45, metalness: 0.55 }))
  skirt.position.y = 0.12
  group.add(skirt)
  const inter = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.26, 16), mat)
  inter.position.y = 2.32
  group.add(inter)
  return group
}

function makeFairing(): { left: THREE.Mesh; right: THREE.Mesh } {
  const geo = new THREE.CylinderGeometry(0.02, 0.34, 1.2, 14, 1, false, 0, Math.PI)
  const left = new THREE.Mesh(geo, stageMaterial())
  const right = new THREE.Mesh(geo, stageMaterial())
  left.position.set(-0.02, 2.9, 0)
  right.position.set(0.02, 2.9, 0)
  right.rotation.y = Math.PI
  const edge = new THREE.LineBasicMaterial({ color: 0x1c1c1c })
  for (const half of [left, right]) {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(half.geometry, 24), edge)
    half.add(lines)
  }
  return { left, right }
}

function makeTower(): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0xb7b2a8, roughness: 0.72, metalness: 0.08 })
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), mat)
  mast.position.set(0.78, 1.25, 0)
  group.add(mast)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.08), mat)
  arm.position.set(0.48, 2.25, 0)
  group.add(arm)
  return group
}

function makeEarth(): { ground: THREE.Mesh; clouds: THREE.Mesh; air: THREE.Mesh } {
  const ground = globe('/planets/earth.jpg', 0.78)
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.025, 64, 40),
    new THREE.MeshStandardMaterial({ map: cloudMap(), transparent: true, depthWrite: false, roughness: 1, metalness: 0, opacity: 0.85 }),
  )
  const air = new THREE.Mesh(new THREE.SphereGeometry(1.08, 48, 32), atmosphereMaterial())
  return { ground, clouds, air }
}

function makeMoon(): THREE.Mesh {
  return globe('/planets/moon.jpg', 0.92)
}

function makeJupiter(): THREE.Mesh {
  return globe('/planets/jupiter.jpg', 0.58)
}

function makeMars(): THREE.Mesh {
  return globe('/planets/mars.jpg', 0.9)
}

function makeEuropa(): THREE.Mesh {
  return globe('/planets/europa.jpg', 0.42)
}

function wearGlobe(mesh: THREE.Mesh, url: string): void {
  modelLoader().load(url, (gltf) => {
    const model = gltf.scene
    seatSphere(model, 2)
    model.traverse((node) => {
      const child = node as THREE.Mesh
      if (!child.isMesh) return
      child.castShadow = true
      child.receiveShadow = true
    })
    mesh.add(model)
    const mat = mesh.material
    if (mat instanceof THREE.Material) {
      mat.visible = false
      mat.depthWrite = false
    }
  })
}

function globe(url: string, roughness: number): THREE.Mesh {
  const map = new THREE.TextureLoader().load(url)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  return new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({ map, roughness, metalness: 0.04 }),
  )
}

function makeAsteroid(): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(1, 4)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = v.clone().normalize()
    const h = (fbm(n.x * 2.4, n.y * 2.4, n.z * 2.4) - 0.42) * 0.62
    v.copy(n).multiplyScalar(1 + h)
    pos.setXYZ(i, v.x, v.y, v.z)
    const rock = 0.22 + fbm(n.x * 5, n.y * 5, n.z * 5) * 0.35
    colors[i * 3] = rock * 0.85
    colors[i * 3 + 1] = rock * 0.7
    colors[i * 3 + 2] = rock * 0.55
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.04 }))
}

function hash(ix: number, iy: number, iz: number): number {
  const value = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453
  return value - Math.floor(value)
}

function noise(x: number, y: number, z: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const xf = x - x0
  const yf = y - y0
  const zf = z - z0
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  let acc = 0
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
        acc += hash(x0 + i, y0 + j, z0 + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w)
      }
    }
  }
  return acc
}

function fbm(x: number, y: number, z: number): number {
  return noise(x, y, z) * 0.6 + noise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise(x * 4.2, y * 4.2, z * 4.2) * 0.1
}

function cloudMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 512, 256)
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 512
      const y = Math.random() * 256
      const rx = 18 + Math.random() * 70
      const grd = ctx.createRadialGradient(x, y, 2, x, y, rx)
      grd.addColorStop(0, 'rgba(255,255,255,0.65)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.ellipse(x, y, rx, 8 + Math.random() * 22, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function atmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.5);
        gl_FragColor = vec4(0.4, 0.66, 1.0, fresnel * 0.8);
      }
    `,
  })
}

function makeArrow(axis: Axis, color: number): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, toneMapped: false })
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.05, 8), mat)
  shaft.position.y = 0.72
  shaft.renderOrder = 21
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 12), mat)
  head.position.y = 1.32
  head.renderOrder = 21
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 1.5, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
  )
  hit.position.y = 0.75
  hit.userData.gizmoAxis = axis
  hit.renderOrder = 22
  group.add(shaft, head, hit)
  if (axis === 'x') group.rotation.z = -Math.PI / 2
  if (axis === 'z') group.rotation.x = Math.PI / 2
  return group
}

function makePath(): THREE.Line {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 80; i++) points.push(transferPoint(i / 80))
  const geo = new THREE.BufferGeometry().setFromPoints(points)
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xc9d4e4, transparent: true, opacity: 0.55 }))
}

function transferPoint(t: number): THREE.Vector3 {
  const angle = t * Math.PI
  const a = 6.2
  const e = 0.62
  const x = a * (Math.cos(angle) - e)
  const z = a * Math.sqrt(1 - e * e) * Math.sin(angle)
  return new THREE.Vector3(x, Math.sin(angle) * 0.25, z)
}

export function graphicsLabel(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return 'WebGL2 unavailable'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'WebGL2'
    const gpu = 'gpu' in navigator ? 'WebGPU present' : 'WebGPU not exposed'
    return `${renderer}. ${gpu}.`
  } catch {
    return 'Graphics detection failed'
  }
}
