import * as THREE from 'three'
import { COLD_GAS_DENSITY, HYDRAZINE_DENSITY, PANEL_W_PER_M2, XENON_DENSITY } from '../domain/constants'
import { getSpec } from '../domain/catalog'
import type { ComponentSpec, InstalledPart, SpacecraftConfig } from '../domain/types'
import { ACCENT, makeTag } from './shipwright'

const panelTexture = (() => {
  let texture: THREE.CanvasTexture | null = null
  return () => {
    if (texture) return texture
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#1a2433'
      ctx.fillRect(0, 0, 128, 64)
      ctx.strokeStyle = '#c9c3b6'
      ctx.lineWidth = 1
      for (let x = 0; x <= 128; x += 16) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, 64)
        ctx.stroke()
      }
      for (let y = 0; y <= 64; y += 16) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(128, y)
        ctx.stroke()
      }
    }
    texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }
})()

/**
 * Parametric spacecraft. Dimensions follow the component specification:
 * tank volume follows capacity and a stated density, panel area follows rated power,
 * and the engineering numbers are not read back from the mesh.
 * Each installed part is its own group so it can be outlined and moved.
 */
export function buildCraft(config: SpacecraftConfig, dressed = false): THREE.Group {
  const root = new THREE.Group()
  root.name = 'spacecraft'
  const items = config.parts
    .map((part) => ({ part, spec: getSpec(part.specId) }))
    .filter((item): item is { part: InstalledPart; spec: ComponentSpec } => Boolean(item.spec))
  const bus = items.find((item) => item.spec.id.startsWith('bus'))
  const busMass = bus?.spec.massKg ?? 40
  const scale = Math.min(1.8, 0.55 + busMass / 280)
  let busCount = 0
  let tankCursor = -0.95 * scale
  let engineCount = 0
  let panelCount = 0
  let dishCount = 0
  let instrumentCount = 0
  let radiatorCount = 0
  let batteryCount = 0
  let spareCount = 0
  let aftZ = 0
  let engineKind: 'chemical' | 'electric' = 'chemical'
  let sawChemical = false
  let sawElectric = false

  const place = (part: InstalledPart, base: THREE.Vector3, fill: (group: THREE.Group) => void) => {
    aftZ = Math.min(aftZ, base.z)
    const group = new THREE.Group()
    group.userData.offsetRoot = true
    group.userData.instanceId = part.instanceId
    group.userData.base = base.clone()
    const offset = part.offset ?? { x: 0, y: 0, z: 0 }
    group.position.set(base.x + offset.x, base.y + offset.y, base.z + offset.z)
    fill(group)
    const fitted = getSpec(part.specId)
    if (fitted) {
      const tag = makeTag(fitted.name, ACCENT[fitted.subsystem])
      tag.userData.instanceId = part.instanceId
      group.add(tag)
    }
    root.add(group)
  }

  for (const item of items) {
    const { part, spec } = item
    if (!part.enabled) continue
    if (spec.feedsMainEngine && spec.propellant === 'electric') sawElectric = true
    if (spec.feedsMainEngine && spec.propellant !== 'electric') sawChemical = true

    if (spec.id.startsWith('bus')) {
      const index = busCount
      busCount += 1
      const bulk = Math.min(1.7, 0.85 + Math.cbrt(Math.max(8, spec.massKg)) * 0.12)
      place(part, new THREE.Vector3(0, 0.05, index * 0.15), (group) => {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.72 * bulk, 0.38 * bulk, 1.35 * bulk), material(0x7ec8c2, 0.22, 0.38, 0x123834, 0.22))
        hull.userData.role = 'hull'
        addMesh(group, hull)
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.48 * bulk, 0.28 * bulk, 0.42 * bulk), material(0x6eb8b4, 0.2, 0.4, 0x123834, 0.18))
        nose.position.z = 0.82 * bulk
        addMesh(group, nose)
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.28 * bulk, 0.12 * bulk, 0.22 * bulk), material(0x1c3040, 0.7, 0.12, 0x2a6a88, 0.45))
        glass.position.set(0, 0.16 * bulk, 0.9 * bulk)
        addMesh(group, glass)
        for (const side of [-1, 1]) {
          const pod = new THREE.Mesh(new THREE.BoxGeometry(0.16 * bulk, 0.22 * bulk, 0.55 * bulk), material(0xe06a3a, 0.28, 0.42, 0x5a2010, 0.16))
          pod.position.set(side * 0.42 * bulk, -0.02, -0.15 * bulk)
          addMesh(group, pod)
        }
      })
      continue
    }

    if (spec.id === 'frame') {
      place(part, new THREE.Vector3(0.55 * scale, 0, 0.15), (group) => {
        addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, 0.34 * scale, 0.5 * scale), material(0xf4f4f2, 0.05, 0.5)))
        addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.08 * scale, 0.5 * scale), material(0xf4f4f2, 0.05, 0.5)))
      })
      continue
    }

    if (spec.id === 'mli') {
      place(part, new THREE.Vector3(0, 0.22 * scale, 0.12), (group) => {
        addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.32), material(0xf7f7f5, 0.04, 0.5)))
      })
      continue
    }

    if (spec.tankCapacityKg > 0) {
      const density = spec.propellant === 'electric' ? XENON_DENSITY : spec.propellant === 'cold-gas' ? COLD_GAS_DENSITY : HYDRAZINE_DENSITY
      const volume = spec.tankCapacityKg / density
      const radius = Math.min(0.42, 0.12 + Math.cbrt(volume) * 0.55)
      const length = Math.max(0.18, volume / (Math.PI * radius * radius) * 0.35)
      const center = tankCursor - length * 0.5
      tankCursor -= length + 0.1
      place(part, new THREE.Vector3(0, 0, center), (group) => {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(0.22, length), 16), material(0xe2b84a, 0.32, 0.38, 0x4a3010, 0.12))
        tank.rotation.x = Math.PI / 2
        addMesh(group, tank)
        const band = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, Math.max(0.06, length * 0.16), 16), material(0x6e6a62, 0.5, 0.35))
        band.rotation.x = Math.PI / 2
        addMesh(group, band)
      })
      continue
    }

    if (spec.thrustN > 0 && spec.feedsMainEngine) {
      const index = engineCount
      engineCount += 1
      const bell = 0.12 + Math.log10(spec.thrustN + 10) * 0.08
      const x = (index - 0.5) * 0.28
      place(part, new THREE.Vector3(x, -0.02, tankCursor - bell), (group) => {
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(bell * 0.85, bell * 0.42, bell * 1.7, 12), material(0xd7dde4, 0.72, 0.28, 0x2a3340, 0.18))
        nozzle.rotation.x = Math.PI / 2
        nozzle.userData.nozzle = true
        addMesh(group, nozzle)
        const bellMesh = new THREE.Mesh(new THREE.CylinderGeometry(bell * 1.15, bell * 0.7, bell * 0.7, 12), material(0xe07a45, 0.45, 0.35, 0x6a2810, 0.28))
        bellMesh.rotation.x = Math.PI / 2
        bellMesh.position.z = -bell * 1.05
        bellMesh.userData.nozzle = true
        addMesh(group, bellMesh)
      })
      continue
    }

    if (spec.id === 'acs') {
      place(part, new THREE.Vector3(0, -0.22 * scale, 0.05), (group) => {
        for (const x of [-0.32, 0.32]) {
          const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), material(0x4d5156, 0.6, 0.4))
          cluster.position.x = x * scale
          addMesh(group, cluster)
        }
      })
      continue
    }

    if (spec.powerGenW > 0 && spec.powerScale === 'solar') {
      const index = panelCount
      panelCount += 1
      const area = spec.powerGenW / PANEL_W_PER_M2
      const length = Math.min(3.2, 0.4 + Math.sqrt(area) * 0.85)
      const depth = Math.min(0.7, 0.22 + area * 0.08)
      place(part, new THREE.Vector3(0, 0.02, 0.15 - index * 0.38), (group) => {
        const mat = new THREE.MeshStandardMaterial({ map: panelTexture(), color: 0xffffff, metalness: 0.2, roughness: 0.55 })
        for (const side of [-1, 1]) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(length, 0.02, depth), mat)
          panel.position.set(side * (0.48 * scale + length / 2), 0, 0)
          addMesh(group, panel)
        }
      })
      continue
    }

    if (spec.powerScale === 'constant' && spec.powerGenW > 0) {
      const bulk = Math.min(0.7, 0.18 + Math.cbrt(spec.powerGenW) * 0.035)
      place(part, new THREE.Vector3(0, -0.32 * scale, -0.35), (group) => {
        addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(bulk, bulk * 0.7, bulk * 1.15), material(0xf4f4f2, 0.05, 0.46)))
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, bulk * 0.85, bulk), material(0xf7f7f5, 0.04, 0.55))
        fin.position.x = bulk * 0.62
        addMesh(group, fin)
      })
      continue
    }

    if (spec.energyWh > 0) {
      const index = batteryCount
      batteryCount += 1
      const span = Math.min(0.46, 0.1 + Math.cbrt(spec.energyWh) * 0.02)
      place(part, new THREE.Vector3(0.22 * scale, -0.12, 0.15 + index * (span + 0.06)), (group) => {
        addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(span, span * 0.55, span * 1.15), material(0xf4f4f2, 0.05, 0.48)))
      })
      continue
    }

    if (spec.antennaGainDbi > 0) {
      const index = dishCount
      dishCount += 1
      const diameter = Math.min(1.5, 0.12 + spec.antennaGainDbi / 34)
      place(part, new THREE.Vector3(0, 0.34 * scale + index * 0.08, 0.05), (group) => {
        addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(diameter, 0.045, diameter * 0.72), material(0xf4f4f2, 0.05, 0.42)))
        const horn = new THREE.Mesh(new THREE.BoxGeometry(diameter * 0.12, diameter * 0.28, diameter * 0.12), material(0xf7f7f5, 0.05, 0.5))
        horn.position.y = diameter * 0.14
        addMesh(group, horn)
      })
      continue
    }

    if (spec.id === 'transponder') {
      place(part, new THREE.Vector3(-0.18 * scale, 0.12, -0.05), (group) => {
        addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), material(0x7d8792, 0.45, 0.4)))
        const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), material(0xd0d4d8, 0.6, 0.3))
        whip.position.y = 0.14
        addMesh(group, whip)
      })
      continue
    }

    if (spec.id === 'heatshield' || spec.id === 'chute' || spec.id === 'descent' || spec.id === 'legs' || spec.id.startsWith('rover') || spec.id === 'heli' || spec.id === 'arm') {
      place(part, new THREE.Vector3(0, -0.42 * scale, spec.id === 'chute' ? 0.9 * scale : -0.2), (group) => {
        if (spec.id === 'heatshield') addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(0.55 * scale, 0.62 * scale, 0.08, 20), material(0x6a4636, 0.2, 0.7)))
        else if (spec.id === 'chute') {
          const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.28, 16), material(0xf4f1ea, 0.05, 0.6))
          canopy.rotation.x = Math.PI
          addMesh(group, canopy)
        } else if (spec.id === 'heli') {
          addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), material(0xf4f1ea, 0.2, 0.4)))
          const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.015, 0.06), material(0x22262b, 0.4, 0.4))
          rotor.position.y = 0.08
          addMesh(group, rotor)
        } else if (spec.id.startsWith('rover')) {
          addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.34 + spec.massKg * 0.0004, 0.12, 0.48), material(0xf4f1ea, 0.15, 0.45)))
          for (const side of [-1, 1]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), material(0x22262b, 0.3, 0.5))
            wheel.rotation.z = Math.PI / 2
            wheel.position.set(side * 0.18, -0.08, 0.12)
            addMesh(group, wheel)
          }
        } else if (spec.id === 'legs') {
          for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), material(0xd0d4d8, 0.5, 0.35))
            leg.position.set(side * 0.22, -0.1, 0)
            addMesh(group, leg)
          }
        } else if (spec.id === 'arm') {
          const boom = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.42), material(0xd0d4d8, 0.55, 0.35))
          boom.position.z = 0.16
          addMesh(group, boom)
        } else addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), material(0xc45a3c, 0.3, 0.45)))
      })
      continue
    }

    if (spec.instrument) {
      const index = instrumentCount
      instrumentCount += 1
      const span = 0.14 + spec.massKg * 0.008
      place(part, new THREE.Vector3(-0.22 + index * 0.18, 0.12, 0.78 * scale), (group) => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(span, 0.1, 0.16 + spec.massKg * 0.008), material(ACCENT.science, 0.15, 0.42))
        addMesh(group, box)
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.06), material(0xf7f7f5, 0.04, 0.4))
        lens.position.z = 0.1
        addMesh(group, lens)
      })
      continue
    }

    if (spec.radiatorM2 > 0) {
      const index = radiatorCount
      radiatorCount += 1
      const width = Math.min(1.3, 0.22 + spec.radiatorM2 * 0.38)
      place(part, new THREE.Vector3(0.52 * scale, 0, -0.15 - index * 0.22), (group) => {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.32, width), material(0xd8dbe0, 0.25, 0.55))
        addMesh(group, plate)
      })
      continue
    }

    if (spec.id === 'heaters') {
      place(part, new THREE.Vector3(-0.16, -0.16, 0.2), (group) => {
        addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.16), material(0xc48a62, 0.3, 0.5, 0x5a2810, 0.2)))
      })
      continue
    }

    const spare = spareCount
    spareCount += 1
    place(part, new THREE.Vector3(-0.3 + spare * 0.16, 0.28, 0), (group) => {
      addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), material(0x98a0a8, 0.4, 0.45)))
    })
  }

  if (sawElectric && !sawChemical) engineKind = 'electric'
  root.userData.dressed = dressed
  root.userData.engineKind = engineKind
  root.userData.aftZ = aftZ - 0.85
  root.userData.signature = config.parts.map((part) => `${part.instanceId}:${part.specId}:${part.fill}:${part.enabled}`).join('|')
  return root
}

function addMesh(group: THREE.Group, mesh: THREE.Mesh) {
  mesh.userData.instanceId = group.userData.instanceId
  group.add(mesh)
  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 28),
    new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.9 }),
  )
  lines.position.copy(mesh.position)
  lines.quaternion.copy(mesh.quaternion)
  lines.scale.copy(mesh.scale).multiplyScalar(1.02)
  lines.userData.kind = 'outline'
  lines.userData.instanceId = group.userData.instanceId
  lines.visible = false
  lines.raycast = () => {}
  group.add(lines)
}

function material(color: number, metalness: number, roughness: number, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive,
    emissiveIntensity,
  })
}

export function disposeCraft(root: THREE.Object3D): void {
  const seen = new Set<THREE.BufferGeometry | THREE.Material>()
  root.traverse((obj) => {
    const drawable = obj as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }
    if (drawable.geometry && !drawable.geometry.userData.keep && !seen.has(drawable.geometry)) {
      seen.add(drawable.geometry)
      drawable.geometry.dispose()
    }
    if (!drawable.material) return
    for (const mat of Array.isArray(drawable.material) ? drawable.material : [drawable.material]) {
      if (mat.userData.keep || seen.has(mat)) continue
      seen.add(mat)
      const mapped = mat as THREE.Material & { map?: THREE.Texture | null }
      if (!mapped.map?.userData.keep) mapped.map?.dispose()
      mat.dispose()
    }
  })
}
