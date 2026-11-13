import * as THREE from 'three'
import type { ShipFitting, ShipRecipe } from './procShip'

/**
 * Tanks, the chute, the shield and the instruments sit on the hull.
 * Wings, the dish, the radiators and the engine bell are part of the shell.
 */

let plate: THREE.MeshStandardMaterial | null = null

/** Hull plate, foil and tile. The color argument is ignored so a part cannot wash the atlas out to white. */
function paint(color: number, metalness = 0.22, roughness = 0.42, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  if (!plate) return new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity })
  const mat = plate.clone()
  mat.color.setHex(0xffffff)
  mat.metalness = metalness
  mat.roughness = roughness
  mat.emissive.setHex(0x000000)
  mat.emissiveIntensity = 0
  mat.transparent = false
  mat.opacity = 1
  mat.depthWrite = true
  mat.side = THREE.FrontSide
  return mat
}

/** A small accent that should not carry the hull atlas: a lens, a band, a propellant column. */
function ink(color: number, metalness = 0.3, roughness = 0.4, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity })
}

/** A bar that actually runs from one point to the other. */
function strut(group: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, radius: number, color: number): THREE.Mesh {
  const delta = to.clone().sub(from)
  const length = Math.max(0.04, delta.length())
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.82, length, 6), paint(color, 0.35, 0.4))
  mesh.position.copy(from).add(to).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
  group.add(mesh)
  return mesh
}

function tag(obj: THREE.Object3D, id: string): void {
  if (!id) return
  obj.userData.offsetRoot = true
  obj.userData.instanceId = id
  obj.userData.base = obj.position.clone()
}

function station(parent: THREE.Object3D, id: string, at: THREE.Vector3, build: (group: THREE.Group) => void): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(at)
  build(group)
  tag(group, id)
  parent.add(group)
  return group
}

function showcase(recipe: ShipRecipe): ShipFitting[] {
  const made: ShipFitting[] = [
    { instanceId: '', specId: 'tank-160', fill: 0.7, role: 'tank', magnitude: 160, propellant: 'chemical' },
  ]
  if (recipe.nozzles > 0) made.push({ instanceId: '', specId: 'biprop-450', fill: 1, role: 'engine', magnitude: 450, propellant: 'chemical' })
  if (recipe.wings > 0) made.push({ instanceId: '', specId: 'panel-600', fill: 1, role: 'solar', magnitude: 600, propellant: 'none' })
  if (recipe.dishes > 0) made.push({ instanceId: '', specId: 'antenna-hga', fill: 1, role: 'antenna', magnitude: 30, propellant: 'none' })
  if (recipe.fins > 0) made.push({ instanceId: '', specId: 'radiator-s', fill: 1, role: 'radiator', magnitude: 0.6, propellant: 'none' })
  return made
}

export function fitHardware(parent: THREE.Object3D, recipe: ShipRecipe, skin?: THREE.MeshStandardMaterial): { nozzles: THREE.Vector3[] } {
  plate = skin ?? null
  const fittings = recipe.fittings && recipe.fittings.length > 0 ? recipe.fittings : showcase(recipe)
  const r = Math.max(0.42, recipe.radius)
  const span = recipe.length * Math.max(2, recipe.segments)
  const nozzles: THREE.Vector3[] = []
  const seen: Record<string, number> = {}
  const indexOf = (role: string) => {
    const n = seen[role] ?? 0
    seen[role] = n + 1
    return n
  }

  for (const part of fittings) {
    const i = indexOf(part.role)
    if (part.role === 'solar' || part.role === 'antenna' || part.role === 'radiator' || part.role === 'engine') continue
    if (part.role === 'tank') placeTank(parent, part, r, span, i)
    else if (part.role === 'acs') placeAcs(parent, part, r, span)
    else if (part.role === 'battery') placeBattery(parent, part, r, span, i)
    else if (part.role === 'nuclear') placeNuclear(parent, part, r, i)
    else if (part.role === 'radio') placeRadio(parent, part, r, span)
    else if (part.role === 'blanket') placeBlanket(parent, part, r, span)
    else if (part.role === 'heater') placeHeater(parent, part, r, span)
    else if (part.role === 'shield') placeShield(parent, part, r, span)
    else if (part.role === 'chute') placeChute(parent, part, r, span)
    else if (part.role === 'stage') placeStage(parent, part, r)
    else if (part.role === 'legs') placeLegs(parent, part, r)
    else if (part.role === 'rover') placeRover(parent, part, r, span)
    else if (part.role === 'heli') placeHeli(parent, part, r, span)
    else if (part.role === 'arm') placeArm(parent, part, r, span)
    else if (part.role === 'cache') placeCache(parent, part, r, span, i)
    else if (part.role === 'instrument') placeInstrument(parent, part, r, span, i)
    else placeFrame(parent, part, r, span)
  }

  if (nozzles.length === 0) nozzles.push(new THREE.Vector3(0, -r * 0.2, 0))
  return { nozzles }
}

function placeTank(parent: THREE.Object3D, part: ShipFitting, r: number, span: number, i: number): void {
  const side = i % 2 === 0 ? 1 : -1
  const row = Math.floor(i / 2)
  const xenon = part.propellant === 'electric'
  const rad = Math.min(r * 0.26, r * (0.16 + Math.cbrt(Math.max(8, part.magnitude)) * 0.012))
  const len = Math.min(span * 0.34, r * (0.7 + Math.cbrt(Math.max(8, part.magnitude)) * 0.05))
  const y = Math.min(span * 0.62, span * 0.28 + row * (len * 0.92))
  station(parent, part.instanceId, new THREE.Vector3(side * r * 0.28, y, 0), (group) => {
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 18), paint(0xffffff, 0.34, 0.38))
    group.add(wall)
    const capMat = paint(0xffffff, 0.34, 0.38)
    for (const end of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(rad, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat)
      cap.scale.y = 0.42
      cap.position.y = (end * len) / 2
      if (end < 0) cap.rotation.x = Math.PI
      group.add(cap)
    }
    for (const t of [0.18, 0.5, 0.82]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(rad * 1.04, Math.max(0.012, rad * 0.07), 6, 16), ink(0xc45a28, 0.25, 0.42))
      band.rotation.x = Math.PI / 2
      band.position.y = -len / 2 + len * t
      group.add(band)
    }
    if (part.fill > 0.04) {
      const h = Math.max(rad * 0.22, len * Math.min(1, part.fill) * 0.82)
      const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(rad * 0.86, rad * 0.86, h, 16),
        ink(xenon ? 0x2a6a90 : 0xc45a28, 0.06, 0.38, xenon ? 0x1a6090 : 0x6a3010, 0.2),
      )
      liquid.position.y = -len / 2 + h / 2 + rad * 0.04
      group.add(liquid)
    }
  })
}

function placeAcs(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  station(parent, part.instanceId, new THREE.Vector3(0, span * 0.48, 0), (group) => {
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(r * 0.16, r * 0.12, r * 0.22), paint(0xe7eef4, 0.45, 0.35))
      pod.position.set(x * r * 0.62, 0, z * r * 0.62)
      group.add(pod)
      const tip = new THREE.Mesh(new THREE.BoxGeometry(r * 0.05, r * 0.05, r * 0.08), ink(0xc45a28, 0.3, 0.4, 0x8a3010, 0.2))
      tip.position.set(x * r * 0.72, 0, z * r * 0.72)
      group.add(tip)
    }
  })
}

function placeBattery(parent: THREE.Object3D, part: ShipFitting, r: number, span: number, i: number): void {
  const bulk = Math.min(r * 0.55, r * (0.22 + Math.cbrt(Math.max(part.magnitude, 20)) * 0.012))
  station(parent, part.instanceId, new THREE.Vector3(0, span * 0.28 + i * (bulk + r * 0.08), -r * 0.32), (group) => {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(bulk * 1.3, bulk * 0.7, bulk), paint(0xf7f4ee, 0.15, 0.45, 0x3a4a38, 0.08)))
    const mark = new THREE.Mesh(new THREE.BoxGeometry(bulk * 0.7, bulk * 0.12, bulk * 0.08), ink(0x3d8a4a, 0.1, 0.45, 0x1a5a28, 0.2))
    mark.position.z = bulk * 0.5
    group.add(mark)
  })
}

function placeNuclear(parent: THREE.Object3D, part: ShipFitting, r: number, i: number): void {
  const bulk = Math.min(r * 0.7, r * (0.28 + Math.cbrt(part.magnitude) * 0.02))
  station(parent, part.instanceId, new THREE.Vector3((i % 2 === 0 ? 1 : -1) * r * 0.15, r * 0.2, r * 0.42), (group) => {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(bulk * 0.45, bulk * 0.45, bulk * 1.1, 12), paint(0xf0d78a, 0.25, 0.4, 0x8a6a20, 0.16)))
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(bulk * 0.08, bulk * 0.9, bulk * 0.7), paint(0xf7f4ee, 0.2, 0.4))
      fin.position.x = side * bulk * 0.5
      group.add(fin)
    }
  })
}

function placeRadio(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  station(parent, part.instanceId, new THREE.Vector3(-r * 0.2, span * 0.66, r * 0.38), (group) => {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.32, r * 0.2, r * 0.24), paint(0xdfe6ee, 0.4, 0.38)))
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.015, r * 0.015, r * 0.45, 6), paint(0xf7f4ee, 0.5, 0.3))
    whip.position.y = r * 0.28
    group.add(whip)
  })
}

function placeBlanket(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  station(parent, part.instanceId, new THREE.Vector3(0, span * 0.5, r * 0.38), (group) => {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, span * 0.28, r * 0.06), paint(0xe2b84a, 0.45, 0.32, 0x8a6a18, 0.12)))
  })
}

function placeHeater(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  station(parent, part.instanceId, new THREE.Vector3(r * 0.2, span * 0.5, -r * 0.7), (group) => {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.55, r * 0.08, r * 0.16), paint(0xe08a4a, 0.25, 0.42, 0x8a4010, 0.22)))
  })
}

function placeShield(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  station(parent, part.instanceId, new THREE.Vector3(0, span + r * 0.05, 0), (group) => {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 0.82, r * 0.14, 24), paint(0xd4894a, 0.12, 0.7, 0x6a3818, 0.12)))
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, r * 0.035, 6, 24), paint(0xf0d2b0, 0.1, 0.55))
    ring.rotation.x = Math.PI / 2
    group.add(ring)
  })
}

function placeChute(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  station(parent, part.instanceId, new THREE.Vector3(0, span * 0.9, r * 0.15), (group) => {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, r * 0.8, 14), paint(0xf7f4ee, 0.1, 0.48)))
    for (let n = 0; n < 4; n += 1) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.055, 14), paint(0xe25b2a, 0.15, 0.42, 0x8a3010, 0.14))
      stripe.position.y = -r * 0.26 + n * r * 0.16
      group.add(stripe)
    }
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(r * 0.42, r * 0.2, 16, 1, true), paint(0xf7f3ea, 0.05, 0.5, 0xc45a28, 0.1))
    ;(canopy.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    canopy.position.y = r * 0.58
    group.add(canopy)
    for (let n = 0; n < 6; n += 1) {
      const a = (n / 6) * Math.PI * 2
      const from = new THREE.Vector3(Math.cos(a) * r * 0.2, r * 0.36, Math.sin(a) * r * 0.2)
      const to = new THREE.Vector3(Math.cos(a) * r * 0.4, r * 0.5, Math.sin(a) * r * 0.4)
      strut(group, from, to, Math.max(0.008, r * 0.012), 0xf7f4ee)
    }
  })
}

function placeStage(parent: THREE.Object3D, part: ShipFitting, r: number): void {
  station(parent, part.instanceId, new THREE.Vector3(0, -r * 0.02, 0), (group) => {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.45, r * 0.38, 16, 1, true), paint(0xe7c07a, 0.3, 0.4, 0x6a4010, 0.1)))
  })
}

function placeLegs(parent: THREE.Object3D, part: ShipFitting, r: number): void {
  station(parent, part.instanceId, new THREE.Vector3(0, 0, 0), (group) => {
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const top = new THREE.Vector3(x * r * 0.58, r * 0.04, z * r * 0.58)
      const footH = r * 0.08
      const pad = new THREE.Vector3(x * r * 1.2, -r * 0.92, z * r * 1.2)
      const socket = new THREE.Mesh(new THREE.SphereGeometry(r * 0.075, 8, 6), paint(0xf4f1ea, 0.35, 0.4))
      socket.position.copy(top)
      group.add(socket)
      strut(group, top, pad, r * 0.048, 0xf4f1ea)
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.22, footH, 8), paint(0xe7e2d6, 0.25, 0.48))
      foot.position.set(pad.x, pad.y - footH / 2, pad.z)
      group.add(foot)
    }
  })
}

function placeRover(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  const bulk = Math.min(1.5, 0.75 + part.magnitude / 480)
  station(parent, part.instanceId, new THREE.Vector3(r * 0.2, span * 0.18, r * 0.15), (group) => {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.7 * bulk, r * 0.24 * bulk, r * 0.95 * bulk), paint(0xf3efe6, 0.18, 0.45)))
    const mast = new THREE.Mesh(new THREE.BoxGeometry(r * 0.06, r * 0.38, r * 0.06), paint(0xe7eef4, 0.4, 0.35))
    mast.position.set(0, r * 0.28, r * 0.15)
    group.add(mast)
    const head = new THREE.Mesh(new THREE.BoxGeometry(r * 0.18, r * 0.1, r * 0.12), paint(0x3d8ec4, 0.4, 0.28, 0x1a5080, 0.3))
    head.position.set(0, r * 0.46, r * 0.2)
    group.add(head)
    for (const [x, z] of [[-1, 0.7], [1, 0.7], [-1, 0], [1, 0], [-1, -0.7], [1, -0.7]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.13, r * 0.13, r * 0.08, 10), paint(0x8a98a6, 0.3, 0.48, 0x2a3848, 0.14))
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x * r * 0.4 * bulk, -r * 0.2, z * r * 0.34 * bulk)
      group.add(wheel)
    }
  })
}

function placeHeli(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  station(parent, part.instanceId, new THREE.Vector3(0, span * 0.7, r * 0.35), (group) => {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.28, r * 0.12, r * 0.4), paint(0xf7f4ee, 0.2, 0.42)))
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 0.02, r * 0.08), paint(0xdfe6ee, 0.4, 0.35))
    rotor.position.y = r * 0.14
    group.add(rotor)
    const rotor2 = rotor.clone()
    rotor2.rotation.y = Math.PI / 2
    group.add(rotor2)
  })
}

function placeArm(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  station(parent, part.instanceId, new THREE.Vector3(r * 0.4, span * 0.72, r * 0.4), (group) => {
    const boom = new THREE.Mesh(new THREE.BoxGeometry(r * 0.08, r * 0.08, r * 0.7), paint(0xe7eef4, 0.45, 0.35))
    boom.position.z = r * 0.2
    group.add(boom)
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 8), paint(0xe07a3d, 0.3, 0.4))
    elbow.position.z = r * 0.52
    group.add(elbow)
  })
}

function placeCache(parent: THREE.Object3D, part: ShipFitting, r: number, span: number, i: number): void {
  station(parent, part.instanceId, new THREE.Vector3(-r * 0.7, span * 0.3 + i * r * 0.3, -r * 0.4), (group) => {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 0.4, 12), paint(0xf4f1ea, 0.25, 0.4)))
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.18, r * 0.06, 12), paint(0xe07a3d, 0.25, 0.4))
    lid.position.y = r * 0.2
    group.add(lid)
  })
}

function placeInstrument(parent: THREE.Object3D, part: ShipFitting, r: number, span: number, i: number): void {
  const col = i % 4
  const row = Math.floor(i / 4)
  station(parent, part.instanceId, new THREE.Vector3(-r * 0.7 + col * r * 0.42, span * 0.8 - row * r * 0.28, r * 0.78), (group) => {
    const body = paint(0xf4f1ea, 0.2, 0.42)
    const lens = ink(0x1a5080, 0.55, 0.16, 0x1a5080, 0.35)
    if (part.specId === 'camera' || part.specId === 'spectrometer') {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.34, r * 0.26, r * (part.specId === 'spectrometer' ? 0.58 : 0.4)), body))
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.11, r * 0.14, 12), lens)
      eye.rotation.x = Math.PI / 2
      eye.position.z = r * 0.26
      group.add(eye)
    } else if (part.specId === 'magnetometer') {
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.03, r * 0.03, r * 1.05, 6), paint(0xe7eef4, 0.4, 0.35))
      boom.rotation.z = Math.PI / 2
      boom.position.x = r * 0.35
      group.add(boom)
      const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 10, 8), lens)
      head.position.x = r * 0.9
      group.add(head)
    } else if (part.specId === 'radar') {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.95, r * 0.07, r * 0.55), paint(0xf7f4ee, 0.3, 0.4, 0x2a6090, 0.12)))
    } else if (part.specId === 'weather') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.03, r * 0.03, r * 0.7, 6), paint(0xf4f1ea, 0.3, 0.4))
      group.add(mast)
      for (let n = 0; n < 3; n += 1) {
        const cup = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 6), paint(0xe07a3d, 0.2, 0.45, 0x8a3010, 0.12))
        const a = (n / 3) * Math.PI * 2
        cup.position.set(Math.cos(a) * r * 0.2, r * 0.38, Math.sin(a) * r * 0.2)
        group.add(cup)
      }
    } else if (part.specId === 'drill') {
      const bit = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.045, r * 0.02, r * 0.65, 8), paint(0xdfe6ee, 0.55, 0.3))
      bit.position.y = -r * 0.15
      group.add(bit)
      const housing = new THREE.Mesh(new THREE.BoxGeometry(r * 0.28, r * 0.22, r * 0.28), body)
      housing.position.y = r * 0.16
      group.add(housing)
    } else if (part.specId === 'particle' || part.specId === 'radiation') {
      group.add(new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.16, 12, 10),
        part.specId === 'radiation' ? paint(0xf0d878, 0.2, 0.4, 0x8a6a10, 0.28) : lens,
      ))
    } else {
      group.add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.4, r * 0.26, r * 0.34), body))
      const port = new THREE.Mesh(new THREE.BoxGeometry(r * 0.12, r * 0.1, r * 0.05), lens)
      port.position.z = r * 0.18
      group.add(port)
    }
  })
}

function placeFrame(parent: THREE.Object3D, part: ShipFitting, r: number, span: number): void {
  station(parent, part.instanceId, new THREE.Vector3(0, span * 0.4, 0), (group) => {
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(r * 0.06, span * 0.45, r * 0.06), paint(0xf4f1ea, 0.35, 0.4))
      rib.position.set(x * r * 0.9, 0, z * r * 0.9)
      group.add(rib)
    }
  })
}
