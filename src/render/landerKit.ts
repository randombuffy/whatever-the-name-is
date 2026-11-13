import * as THREE from 'three'

const shell = new THREE.MeshStandardMaterial({ color: '#e7e3dc', roughness: 0.55, metalness: 0.15 })
const shieldMat = new THREE.MeshStandardMaterial({ color: '#5a3a28', roughness: 0.9, metalness: 0.05, emissive: new THREE.Color('#ff6a2a'), emissiveIntensity: 0 })

function backshell(): THREE.Group {
  const group = new THREE.Group()
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3.2, 2.6, 40, 1, true), shell)
  cone.position.set(0, 0, -1.3)
  cone.rotation.x = -Math.PI / 2
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 32), shell)
  cap.position.set(0, 0, -2.62)
  cap.rotation.x = -Math.PI / 2
  group.add(cone, cap)
  return group
}

/** Heat shield, backshell, and the cruise ring that peels off. +Z is the direction of flight. */
export function makeAeroshell(): { group: THREE.Group; heat: THREE.MeshStandardMaterial; sheath: THREE.Mesh; cruise: THREE.Group } {
  const group = new THREE.Group()
  const shield = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.2, 48), shieldMat)
  shield.position.set(0, 0, 0.6)
  shield.rotation.x = Math.PI / 2
  const back = backshell()
  const cruise = new THREE.Group()
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 0.45, 32),
    new THREE.MeshStandardMaterial({ color: '#c9c4bb', roughness: 0.5, metalness: 0.4 }),
  )
  ring.rotation.x = Math.PI / 2
  cruise.add(ring)
  cruise.position.set(0, 0, -3.2)
  const sheath = new THREE.Mesh(
    new THREE.SphereGeometry(3.9, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.3),
    new THREE.MeshBasicMaterial({ color: '#ffb37a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  )
  sheath.position.set(0, 0, 0.3)
  sheath.rotation.x = Math.PI / 2
  group.add(shield, back, cruise, sheath)
  return { group, heat: shieldMat, sheath, cruise }
}

/** Supersonic parachute and the backshell it hangs from. */
export function makeParachute(): { group: THREE.Group; canopy: THREE.Group } {
  const group = new THREE.Group()
  const back = backshell()
  back.rotation.x = Math.PI / 2
  const canopy = new THREE.Group()
  const geometry = new THREE.SphereGeometry(15, 32, 12, 0, Math.PI * 2, 0, 1.05)
  const colors = new Float32Array(geometry.attributes.position.count * 3)
  const white = new THREE.Color('#f1ece4')
  const orange = new THREE.Color('#d0683a')
  for (let i = 0; i < geometry.attributes.position.count; i += 1) {
    const gore = Math.floor(((Math.atan2(geometry.attributes.position.getZ(i), geometry.attributes.position.getX(i)) + Math.PI) / (Math.PI * 2)) * 20)
    const color = gore % 2 === 0 ? white : orange
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const cloth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }))
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(12.6, 12, 2.6, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: '#e9e2d8', roughness: 0.85, side: THREE.DoubleSide }),
  )
  band.position.y = 5.2
  canopy.add(cloth, band)
  canopy.position.set(0, 24, 0)
  canopy.scale.set(0.15, 0.4, 0.15)
  group.add(back, canopy)
  return { group, canopy }
}

export function makeShieldDrop(): THREE.Group {
  const group = new THREE.Group()
  const shield = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.2, 40), shieldMat.clone())
  group.add(shield)
  return group
}

/** Legged lander. Footpads sit on y = 0. Throttle scales the plumes. */
export function makeLander(): { group: THREE.Group; plumes: THREE.Mesh[]; body: THREE.Group } {
  const group = new THREE.Group()
  const body = new THREE.Group()
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.34, 8), new THREE.MeshStandardMaterial({ color: '#7d7a74', roughness: 0.6, metalness: 0.5 }))
  deck.position.y = 2.1
  const foil = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.05, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#b48a46', roughness: 0.32, metalness: 0.85 }))
  foil.position.y = 3.45
  const cabin = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.85, 2.2, 24), new THREE.MeshStandardMaterial({ color: '#e6e2da', roughness: 0.6, metalness: 0.15 }))
  cabin.position.y = 5.75
  body.add(deck, foil, cabin)
  const plumes: THREE.Mesh[] = []
  const plumeMat = new THREE.MeshBasicMaterial({ color: '#cfdcff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2
    const engine = new THREE.Group()
    engine.position.set(Math.cos(angle) * 1.05, 1.55, Math.sin(angle) * 1.05)
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.46, 0.75, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: '#3a3836', roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide }),
    )
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.62, 3.1, 12, 1, true), plumeMat)
    plume.position.y = -1.9
    engine.add(bell, plume)
    body.add(engine)
    plumes.push(plume)
  }
  group.add(body)
  const strutMat = new THREE.MeshStandardMaterial({ color: '#b7b4ad', roughness: 0.45, metalness: 0.65 })
  for (let i = 0; i < 4; i += 1) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 0.16, 12), new THREE.MeshStandardMaterial({ color: '#8f8b84', metalness: 0.5, roughness: 0.6 }))
    foot.position.set(Math.cos(angle) * 3.7, 0.08, Math.sin(angle) * 3.7)
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), strutMat)
    strut.position.set(Math.cos(angle) * 2.6, 1.5, Math.sin(angle) * 2.6)
    strut.rotation.z = Math.cos(angle) * 0.55
    strut.rotation.x = -Math.sin(angle) * 0.55
    group.add(foot, strut)
  }
  return { group, plumes, body }
}
