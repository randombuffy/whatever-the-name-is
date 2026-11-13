import * as THREE from 'three'

/**
 * Deep-space backdrop: spectral starfield, Milky Way band, globular clusters,
 * and nebula billboards. Pattern follows public Three.js sky work
 * (CK42BB/procedural-stars-threejs, pmndrs/drei Stars) — generated here, no extra assets.
 */

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

function blackbody(t: number): THREE.Color {
  const k = Math.max(0, Math.min(1, t))
  if (k < 0.18) return new THREE.Color(0.55, 0.62, 1)
  if (k < 0.38) return new THREE.Color(0.72, 0.82, 1)
  if (k < 0.58) return new THREE.Color(0.95, 0.96, 1)
  if (k < 0.78) return new THREE.Color(1, 0.96, 0.82)
  if (k < 0.9) return new THREE.Color(1, 0.78, 0.52)
  return new THREE.Color(1, 0.55, 0.38)
}

function onSphere(radius: number, theta: number, phi: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

function nebulaTexture(hex: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  const glow = ctx.createRadialGradient(128, 118, 8, 128, 128, 128)
  glow.addColorStop(0, `rgba(${r},${g},${b},0.62)`)
  glow.addColorStop(0.28, `rgba(${r},${g},${b},0.28)`)
  glow.addColorStop(0.62, `rgba(${Math.min(255, r + 40)},${g},${Math.min(255, b + 30)},0.1)`)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function starPoints(count: number, radius: number, band: boolean, seed: number, size: number): THREE.Points {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const at = new THREE.Vector3()
  for (let i = 0; i < count; i += 1) {
    const u = hash(seed + i * 3.1)
    const v = hash(seed + i * 7.7)
    const theta = u * Math.PI * 2
    let phi = Math.acos(2 * v - 1)
    if (band) {
      const lane = (hash(seed + i * 11.3) - 0.5) * 0.42
      phi = Math.PI / 2 + lane + Math.sin(theta * 2.2) * 0.08
    }
    const reach = radius * (0.82 + hash(seed + i * 13.9) * 0.35)
    onSphere(reach, theta, phi, at)
    positions[i * 3] = at.x
    positions[i * 3 + 1] = at.y
    positions[i * 3 + 2] = at.z
    const tint = blackbody(hash(seed + i * 17.1))
    const mag = 0.45 + hash(seed + i * 19.7) ** 2 * 0.55
    colors[i * 3] = tint.r * mag
    colors[i * 3 + 1] = tint.g * mag
    colors[i * 3 + 2] = tint.b * mag
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
}

function cluster(count: number, center: THREE.Vector3, spread: number, seed: number, hue: number): THREE.Points {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const tint = blackbody(hue)
  for (let i = 0; i < count; i += 1) {
    const a = hash(seed + i) * Math.PI * 2
    const b = Math.acos(2 * hash(seed + i + 0.37) - 1)
    const r = spread * Math.pow(hash(seed + i + 0.71), 0.55)
    positions[i * 3] = center.x + r * Math.sin(b) * Math.cos(a)
    positions[i * 3 + 1] = center.y + r * Math.cos(b)
    positions[i * 3 + 2] = center.z + r * Math.sin(b) * Math.sin(a)
    const mag = 0.55 + hash(seed + i + 2.2) * 0.45
    colors[i * 3] = tint.r * mag
    colors[i * 3 + 1] = tint.g * mag
    colors[i * 3 + 2] = tint.b * mag
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1.35,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
}

export function makeStarfield(radius = 900): THREE.Group {
  const root = new THREE.Group()
  root.name = 'starfield'
  root.frustumCulled = false
  const field = starPoints(5200, radius, false, 11, 1.05)
  const milky = starPoints(3800, radius * 0.96, true, 29, 1.2)
  field.frustumCulled = false
  milky.frustumCulled = false
  root.add(field, milky)
  const hubs = [
    { theta: 0.4, phi: 1.15, spread: 48, n: 420, hue: 0.22, hex: 0x7aa7ff },
    { theta: 2.1, phi: 0.85, spread: 36, n: 280, hue: 0.72, hex: 0xff9a6a },
    { theta: 3.6, phi: 1.45, spread: 58, n: 520, hue: 0.12, hex: 0xa8c4ff },
    { theta: 4.8, phi: 0.7, spread: 30, n: 240, hue: 0.88, hex: 0xffc978 },
    { theta: 5.5, phi: 1.9, spread: 44, n: 360, hue: 0.35, hex: 0xd4b8ff },
    { theta: 1.2, phi: 2.2, spread: 26, n: 180, hue: 0.08, hex: 0x9ad4ff },
    { theta: 2.8, phi: 1.05, spread: 70, n: 640, hue: 0.5, hex: 0xffd4a8 },
    { theta: 0.9, phi: 0.55, spread: 22, n: 160, hue: 0.95, hex: 0xff8866 },
    { theta: 4.1, phi: 2.4, spread: 40, n: 300, hue: 0.28, hex: 0xc9e4ff },
    { theta: 5.9, phi: 1.35, spread: 33, n: 220, hue: 0.62, hex: 0xffe6b0 },
  ]
  const at = new THREE.Vector3()
  for (let i = 0; i < hubs.length; i += 1) {
    const hub = hubs[i]
    onSphere(radius * 0.92, hub.theta, hub.phi, at)
    const knots = cluster(hub.n, at, hub.spread, 80 + i * 17, hub.hue)
    knots.frustumCulled = false
    root.add(knots)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebulaTexture(hub.hex),
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }))
    sprite.position.copy(at)
    sprite.scale.setScalar(hub.spread * 3.4)
    sprite.frustumCulled = false
    root.add(sprite)
  }
  return root
}

export function tickStarfield(root: THREE.Group, dt: number, camera?: THREE.Camera): void {
  root.rotation.y += dt * 0.0032
  root.rotation.x += dt * 0.0006
  if (camera) root.position.copy(camera.position)
}
