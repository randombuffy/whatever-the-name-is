import * as THREE from 'three'
import { modelLoader } from './gltf'

/** Whole planet, not the square heightfield. */
export function globeUrl(missionId: string): string | null {
  if (missionId === 'lunar') return '/3d/glb/moon.glb'
  if (missionId === 'europa') return '/3d/glb/Europa.glb'
  if (missionId === 'asteroid') return null
  return '/3d/glb/Mars.glb'
}

/** Photographed landing terrain. The thin axis of each file is the relief. */
export function landUrl(missionId: string): string | null {
  if (missionId === 'lunar') return '/3d/moon_land/scene.gltf'
  if (missionId === 'europa') return '/3d/europa_land/scene.gltf'
  if (missionId === 'mars' || missionId === 'custom') return '/3d/mars_land/scene.gltf'
  return null
}

/**
 * Turns the mesh so relief is up, spans `width` metres across, and exaggerates
 * the height just enough that the photographed slopes are walkable.
 * The landing point (the centre) sits at y = 0.
 */
export function standTerrain(model: THREE.Object3D, width: number, relief = 1.45): void {
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const up = size.x <= size.y && size.x <= size.z ? 'x' : size.y <= size.z ? 'y' : 'z'
  if (up === 'x') model.rotation.z = Math.PI / 2
  else if (up === 'z') model.rotation.x = -Math.PI / 2
  model.updateMatrixWorld(true)
  const stood = new THREE.Box3().setFromObject(model)
  const stoodSize = stood.getSize(new THREE.Vector3())
  const horizontal = Math.max(stoodSize.x, stoodSize.z) || 1
  const scale = width / horizontal
  model.scale.set(scale, scale * relief, scale)
  model.updateMatrixWorld(true)
  const placed = new THREE.Box3().setFromObject(model)
  const center = placed.getCenter(new THREE.Vector3())
  model.position.x -= center.x
  model.position.z -= center.z
  model.position.y -= placed.min.y
  model.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 800, 0), new THREE.Vector3(0, -1, 0))
  const hit = ray.intersectObject(model, true)[0]
  if (hit) model.position.y -= hit.point.y
}

export function flattenMeshPad(root: THREE.Object3D, radius = 80): void {
  const pos = new THREE.Vector3()
  root.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 800, 0), new THREE.Vector3(0, -1, 0))
  const hit = ray.intersectObject(root, true)[0]
  const pad = hit?.point.y ?? 0
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const attr = mesh.geometry?.attributes.position
    if (!attr) return
    mesh.updateMatrixWorld(true)
    for (let i = 0; i < attr.count; i += 1) {
      pos.fromBufferAttribute(attr, i)
      mesh.localToWorld(pos)
      const span = Math.hypot(pos.x, pos.z)
      if (span >= radius) continue
      const t = 1 - span / radius
      const k = t * t * (3 - 2 * t)
      pos.y = pos.y * (1 - k) + pad * k
      mesh.worldToLocal(pos)
      attr.setXYZ(i, pos.x, pos.y, pos.z)
    }
    attr.needsUpdate = true
    mesh.geometry.computeVertexNormals()
  })
}

export function flattenPad(grid: HeightGrid, radius = 80): void {
  const pad = heightFromGrid(grid, 0, 0)
  const size = grid.cells + 1
  for (let iz = 0; iz <= grid.cells; iz += 1) {
    for (let ix = 0; ix <= grid.cells; ix += 1) {
      const x = -grid.half + ix * grid.step
      const z = -grid.half + iz * grid.step
      const span = Math.hypot(x, z)
      if (span >= radius) continue
      const t = 1 - span / radius
      const k = t * t * (3 - 2 * t)
      const index = iz * size + ix
      grid.data[index] = grid.data[index] * (1 - k) + pad * k
    }
  }
}

const SITE_SKIN: Record<string, { color: string; normal: string }> = {
  jezero: { color: '/textures/mars/site-jezero-color-2k.jpg', normal: '/textures/mars/site-jezero-normal-2k.jpg' },
  gale: { color: '/textures/mars/site-elysium-color-2k.jpg', normal: '/textures/mars/site-elysium-normal-2k.jpg' },
  utopia: { color: '/textures/mars/site-utopia-color-2k.jpg', normal: '/textures/mars/site-utopia-normal-2k.jpg' },
  meridiani: { color: '/textures/mars/site-jezero-color-2k.jpg', normal: '/textures/mars/site-jezero-normal-2k.jpg' },
  valles: { color: '/textures/mars/site-elysium-color-2k.jpg', normal: '/textures/mars/site-elysium-normal-2k.jpg' },
}

/** Jezero 2021 by default. Gale borrows Elysium’s layered patch; Utopia keeps its own. */
export function siteSkin(siteId?: string): { color: string; normal: string } {
  return SITE_SKIN[siteId ?? ''] ?? SITE_SKIN.jezero
}

function drapeSite(root: THREE.Object3D, siteId?: string): void {
  const skin = siteSkin(siteId)
  const loader = new THREE.TextureLoader()
  const color = loader.load(skin.color)
  color.colorSpace = THREE.SRGBColorSpace
  color.anisotropy = 8
  color.wrapS = color.wrapT = THREE.ClampToEdgeWrapping
  const normal = loader.load(skin.normal)
  normal.colorSpace = THREE.NoColorSpace
  normal.anisotropy = 8
  normal.wrapS = normal.wrapT = THREE.ClampToEdgeWrapping
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const min = box.min
  const spanX = Math.max(1e-3, size.x)
  const spanZ = Math.max(1e-3, size.z)
  const world = new THREE.Vector3()
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    const geo = mesh.geometry
    const pos = geo.attributes.position
    const uv = new Float32Array(pos.count * 2)
    mesh.updateMatrixWorld(true)
    for (let i = 0; i < pos.count; i += 1) {
      world.fromBufferAttribute(pos, i)
      mesh.localToWorld(world)
      uv[i * 2] = (world.x - min.x) / spanX
      uv[i * 2 + 1] = 1 - (world.z - min.z) / spanZ
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    mesh.material = new THREE.MeshStandardMaterial({
      map: color,
      normalMap: normal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.94,
      metalness: 0.02,
      color: 0xffffff,
    })
    mesh.castShadow = false
    mesh.receiveShadow = true
  })
}

export function loadTerrain(url: string, width: number, parent: THREE.Object3D, done: (mesh: THREE.Object3D) => void, siteId?: string, skirt = false): void {
  modelLoader().load(url, (gltf) => {
    const model = gltf.scene
    standTerrain(model, width)
    flattenMeshPad(model, 12)
    if (url.includes('mars')) {
      drapeSite(model, siteId)
      if (skirt) addHorizonSkirt(parent, siteId, 2800)
    } else {
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = false
        mesh.receiveShadow = true
      })
    }
    parent.add(model)
    done(model)
  })
}

function addHorizonSkirt(parent: THREE.Object3D, siteId: string | undefined, radius: number): void {
  const skin = siteSkin(siteId)
  const map = new THREE.TextureLoader().load(skin.color)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping
  const geo = new THREE.CircleGeometry(radius, 72)
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0.02,
  }))
  mesh.position.y = -1.2
  mesh.receiveShadow = true
  mesh.name = 'horizon-skirt'
  parent.add(mesh)
}

/** Raycast a height grid so walkers and rocks sit on the photographed mesh. */
export function bakeHeightsRay(root: THREE.Object3D, half = 680, cells = 80): HeightGrid {
  const size = cells + 1
  const data = new Float32Array(size * size)
  const step = (half * 2) / cells
  const ray = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const origin = new THREE.Vector3()
  ray.far = 5000
  root.updateMatrixWorld(true)
  for (let iz = 0; iz <= cells; iz += 1) {
    for (let ix = 0; ix <= cells; ix += 1) {
      origin.set(-half + ix * step, 2200, -half + iz * step)
      ray.set(origin, down)
      const hit = ray.intersectObject(root, true)[0]
      data[iz * size + ix] = hit ? hit.point.y : 0
    }
  }
  return { data, cells, half, step }
}

export interface HeightGrid {
  data: Float32Array
  cells: number
  half: number
  step: number
}

/** Bin the mesh vertices into a grid so walking never raycasts the land. */
export function bakeHeights(root: THREE.Object3D, half = 680, cells = 128): HeightGrid {
  const size = cells + 1
  const data = new Float32Array(size * size)
  data.fill(Number.NEGATIVE_INFINITY)
  const step = (half * 2) / cells
  const pos = new THREE.Vector3()
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const attr = mesh.geometry?.attributes.position
    if (!attr) return
    for (let i = 0; i < attr.count; i += 1) {
      pos.fromBufferAttribute(attr, i)
      mesh.localToWorld(pos)
      const ix = Math.round((pos.x + half) / step)
      const iz = Math.round((pos.z + half) / step)
      if (ix < 0 || iz < 0 || ix > cells || iz > cells) continue
      const index = iz * size + ix
      if (pos.y > data[index]) data[index] = pos.y
    }
  })
  let holes = true
  for (let pass = 0; pass < 14 && holes; pass += 1) {
    holes = false
    const next = new Float32Array(data)
    for (let i = 0; i < data.length; i += 1) {
      if (data[i] !== Number.NEGATIVE_INFINITY) continue
      holes = true
      let sum = 0
      let count = 0
      const x = i % size
      const z = Math.floor(i / size)
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nz < 0 || nx > cells || nz > cells) continue
          const sample = data[nz * size + nx]
          if (sample === Number.NEGATIVE_INFINITY) continue
          sum += sample
          count += 1
        }
      }
      if (count > 0) next[i] = sum / count
    }
    data.set(next)
  }
  for (let i = 0; i < data.length; i += 1) {
    if (data[i] === Number.NEGATIVE_INFINITY) data[i] = 0
  }
  return { data, cells, half, step }
}

export function heightFromGrid(grid: HeightGrid, x: number, z: number): number {
  const u = (x + grid.half) / grid.step
  const v = (z + grid.half) / grid.step
  const x0 = Math.max(0, Math.min(grid.cells - 1, Math.floor(u)))
  const z0 = Math.max(0, Math.min(grid.cells - 1, Math.floor(v)))
  const x1 = Math.min(grid.cells, x0 + 1)
  const z1 = Math.min(grid.cells, z0 + 1)
  const tx = Math.min(1, Math.max(0, u - x0))
  const tz = Math.min(1, Math.max(0, v - z0))
  const size = grid.cells + 1
  const a = grid.data[z0 * size + x0]
  const b = grid.data[z0 * size + x1]
  const c = grid.data[z1 * size + x0]
  const d = grid.data[z1 * size + x1]
  return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz
}
