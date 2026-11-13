import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { getSpec } from '../domain/catalog'
import { hullSkin } from '../render/procShip'

const shots = new Map<string, string>()
let renderer: THREE.WebGLRenderer | null = null
let skin: THREE.MeshStandardMaterial | null = null

function gl(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.setClearColor(0x14181e, 1)
  }
  return renderer
}

function plate(tint = 0xffffff): THREE.MeshStandardMaterial {
  if (!skin) skin = hullSkin(9)
  const mat = skin.clone()
  mat.color.setHex(tint)
  return mat
}

function mesh(geometry: THREE.BufferGeometry, tint = 0xffffff): THREE.Mesh {
  return new THREE.Mesh(geometry, plate(tint))
}

/** A small still of the real part, so the card shows the object and not a flat icon. */
function build(specId: string): THREE.Group {
  const spec = getSpec(specId)
  const group = new THREE.Group()
  const add = (item: THREE.Object3D) => group.add(item)
  if (specId.startsWith('tank')) {
    const xenon = specId.includes('xe')
    const h = specId.includes('1500') ? 1.7 : specId.includes('500') ? 1.35 : specId.includes('160') || specId.includes('120') ? 1.05 : 0.75
    add(mesh(new THREE.CylinderGeometry(0.32, 0.32, h, 20), xenon ? 0xd5e8f4 : 0xf4efe4))
    for (const end of [-1, 1]) {
      const cap = mesh(new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xe7c56a)
      cap.scale.y = 0.4
      cap.position.y = (end * h) / 2
      if (end < 0) cap.rotation.x = Math.PI
      add(cap)
    }
    const liquid = mesh(new THREE.CylinderGeometry(0.26, 0.26, h * 0.62, 16), xenon ? 0x7ec8ee : 0xe07a32)
    liquid.position.y = -h * 0.12
    add(liquid)
  } else if (specId.startsWith('panel')) {
    const span = specId.includes('8000') ? 1.6 : specId.includes('2000') ? 1.25 : specId.includes('600') ? 1 : 0.7
    for (const side of [-1, 1]) {
      const board = mesh(new THREE.BoxGeometry(span, 0.045, 0.55), 0xc5d8ea)
      board.position.x = side * (span * 0.55 + 0.08)
      add(board)
    }
    add(mesh(new THREE.BoxGeometry(0.14, 0.08, 0.18)))
  } else if (specId === 'antenna-lga' || specId === 'transponder') {
    add(mesh(new THREE.BoxGeometry(0.42, 0.22, 0.28)))
    const whip = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.72, 6))
    whip.position.y = 0.44
    add(whip)
  } else if (specId.startsWith('antenna')) {
    const dish = mesh(new THREE.SphereGeometry(specId.includes('hga-l') ? 0.72 : 0.5, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), 0xf3efe4)
    dish.rotation.x = Math.PI * 0.15
    add(dish)
    const feed = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6))
    feed.position.y = 0.18
    add(feed)
  } else if (specId === 'acs' || specId === 'cold-gas') {
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const pod = mesh(new THREE.BoxGeometry(0.18, 0.1, 0.22))
      pod.position.set(x * 0.28, 0, z * 0.22)
      add(pod)
      const tip = mesh(new THREE.ConeGeometry(0.045, 0.12, 8), 0xe07a3d)
      tip.position.set(x * 0.28, 0, z * 0.38)
      tip.rotation.x = Math.PI / 2
      add(tip)
    }
  } else if (specId === 'ion' || specId === 'hall') {
    add(mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.55, 16), 0xd5dce8))
    const grid = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), 0x7eb4e0)
    grid.position.y = -0.32
    add(grid)
  } else if (spec?.subsystem === 'propulsion') {
    add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 16)))
    const bell = mesh(new THREE.CylinderGeometry(0.36, 0.14, 0.5, 20, 1, true), 0xf0e6d4)
    bell.position.y = -0.38
    ;(bell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    add(bell)
  } else if (specId.startsWith('battery')) {
    const bulk = specId.includes('6000') ? 0.72 : specId.includes('1500') ? 0.52 : 0.36
    add(mesh(new THREE.BoxGeometry(bulk * 1.4, bulk * 0.72, bulk)))
    const mark = mesh(new THREE.BoxGeometry(bulk * 0.7, bulk * 0.12, 0.03), 0x3d8a4a)
    mark.position.set(0, 0, bulk * 0.52)
    add(mark)
  } else if (specId === 'rtg' || specId === 'fission') {
    add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.72, 12), 0xf0d78a))
    for (const side of [-1, 1]) {
      const fin = mesh(new THREE.BoxGeometry(0.06, 0.62, 0.48))
      fin.position.x = side * 0.3
      add(fin)
    }
  } else if (specId === 'heatshield') {
    add(mesh(new THREE.CylinderGeometry(0.74, 0.22, 0.24, 24), 0xd4894a))
  } else if (specId === 'chute') {
    const can = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 12))
    can.position.y = -0.12
    add(can)
    const canopy = mesh(new THREE.ConeGeometry(0.55, 0.28, 16, 1, true), 0xf7f3ea)
    canopy.position.y = 0.28
    ;(canopy.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    add(canopy)
  } else if (specId === 'legs') {
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const top = new THREE.Vector3(x * 0.12, 0.22, z * 0.12)
      const bottom = new THREE.Vector3(x * 0.42, -0.34, z * 0.42)
      const delta = bottom.clone().sub(top)
      const leg = mesh(new THREE.CylinderGeometry(0.035, 0.028, delta.length(), 6))
      leg.position.copy(top).add(bottom).multiplyScalar(0.5)
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize())
      add(leg)
      const foot = mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.045, 8), 0xe7e2d6)
      foot.position.set(bottom.x, bottom.y - 0.02, bottom.z)
      add(foot)
    }
  } else if (specId === 'descent') {
    add(mesh(new THREE.CylinderGeometry(0.55, 0.72, 0.3, 16), 0xe7c07a))
  } else if (specId.startsWith('rover')) {
    const bulk = specId.includes('heavy') ? 0.85 : 0.55
    add(mesh(new THREE.BoxGeometry(bulk, bulk * 0.35, bulk * 1.3)))
    for (const [x, z] of [[-1, 0.7], [1, 0.7], [-1, 0], [1, 0], [-1, -0.7], [1, -0.7]] as const) {
      const wheel = mesh(new THREE.CylinderGeometry(bulk * 0.18, bulk * 0.18, bulk * 0.1, 10), 0x8a98a6)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x * bulk * 0.55, -bulk * 0.22, z * bulk * 0.4)
      add(wheel)
    }
  } else if (specId === 'heli') {
    add(mesh(new THREE.BoxGeometry(0.22, 0.1, 0.34)))
    const rotor = mesh(new THREE.BoxGeometry(0.95, 0.02, 0.07))
    rotor.position.y = 0.12
    add(rotor)
  } else if (specId === 'mli') {
    add(mesh(new THREE.BoxGeometry(0.95, 0.52, 0.08), 0xe2b84a))
  } else if (specId.startsWith('radiator')) {
    add(mesh(new THREE.BoxGeometry(specId.endsWith('-l') ? 1.15 : 0.72, 0.045, 0.55), 0xf0e6d4))
  } else if (specId === 'heaters') {
    add(mesh(new THREE.BoxGeometry(0.55, 0.08, 0.16), 0xe08a4a))
  } else if (specId === 'arm') {
    add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16)))
    const upper = mesh(new THREE.BoxGeometry(0.08, 0.46, 0.08))
    upper.position.set(0.14, 0.22, 0)
    upper.rotation.z = -0.55
    add(upper)
    const fore = mesh(new THREE.BoxGeometry(0.38, 0.06, 0.06))
    fore.position.set(0.36, 0.34, 0)
    add(fore)
  } else if (specId === 'drill') {
    add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8)))
    const bit = mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.28, 8), 0xc8c4bc)
    bit.position.y = -0.38
    add(bit)
  } else if (specId === 'camera' || specId === 'spectrometer') {
    add(mesh(new THREE.BoxGeometry(0.36, 0.22, 0.28)))
    const lens = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.14, 12), 0x3d8ec4)
    lens.rotation.x = Math.PI / 2
    lens.position.z = 0.18
    add(lens)
  } else if (specId.startsWith('bus') || specId === 'frame') {
    add(mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.72, 8)))
    const nose = mesh(new THREE.ConeGeometry(0.28, 0.3, 8))
    nose.position.y = 0.5
    add(nose)
  } else {
    add(mesh(new THREE.BoxGeometry(0.42, 0.28, 0.32)))
    const lens = mesh(new THREE.SphereGeometry(0.09, 12, 8), 0x3d8ec4)
    lens.position.set(0, 0.06, 0.18)
    add(lens)
  }
  return group
}

function shoot(specId: string, w: number, h: number): string {
  const view = gl()
  view.setSize(w, h, false)
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xd5deea, 0.75))
  const key = new THREE.DirectionalLight(0xfff6ea, 2.4)
  key.position.set(2.4, 3.6, 4.2)
  scene.add(key)
  const group = build(specId)
  scene.add(group)
  const box = new THREE.Box3().setFromObject(group)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const max = Math.max(size.x, size.y, size.z, 0.2)
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 40)
  camera.position.set(center.x + max * 1.4, center.y + max * 0.7, center.z + max * 1.75)
  camera.lookAt(center)
  view.render(scene, camera)
  const url = view.domElement.toDataURL('image/jpeg', 0.86)
  group.traverse((obj) => {
    const item = obj as THREE.Mesh
    item.geometry?.dispose()
    const material = item.material
    if (material && !Array.isArray(material)) material.dispose()
  })
  return url
}

export function PartPreview({ specId, large = false }: { specId: string; large?: boolean }) {
  const w = large ? 480 : 160
  const h = large ? 300 : 112
  const key = `${specId}:${w}x${h}`
  const [url, setUrl] = useState(() => shots.get(key) ?? '')
  useEffect(() => {
    const hit = shots.get(key)
    if (hit) {
      setUrl(hit)
      return
    }
    try {
      const shot = shoot(specId, w, h)
      shots.set(key, shot)
      setUrl(shot)
    } catch {
      setUrl('')
    }
  }, [key, specId, w, h])
  if (!url) return <span className={large ? 'part-preview large' : 'part-preview'} />
  return <img className={large ? 'part-preview large' : 'part-preview'} src={url} alt="" />
}
