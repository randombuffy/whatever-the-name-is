import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

THREE.Cache.enabled = true

const draco = new DRACOLoader()
draco.setDecoderPath('/draco/')
const loader = new GLTFLoader()
loader.setDRACOLoader(draco)

const BOOT_ASSETS = [
  '/3d/walking_astronaut.glb',
  '/3d/tesla_bot/scene.gltf',
  '/props/control_station.glb',
  '/3d/low_poly_tree_set.glb',
  '/vehicles/cybertruck.glb',
  '/3d/glb/Earth.glb',
  '/3d/glb/moon.glb',
  '/3d/glb/Mars.glb',
  '/3d/glb/Jupiter.glb',
  '/3d/glb/Europa.glb',
  '/props/jupiter.glb',
  '/props/space.glb',
  '/sfx/bg.mp3',
  '/sfx/manifest.json',
]

function labelOf(url: string): string {
  return url.split('/').pop() ?? url
}

/** Pull every boot file into THREE.Cache (and the HTTP cache) before the pad opens. */
export async function preloadAssets(onProgress: (done: number, total: number, label: string) => void): Promise<void> {
  const total = BOOT_ASSETS.length
  let done = 0
  onProgress(0, total, 'assets')
  for (const url of BOOT_ASSETS) {
    onProgress(done, total, labelOf(url))
    try {
      const response = await fetch(url)
      const bytes = await response.arrayBuffer()
      if (url.endsWith('.glb') || url.endsWith('.json')) THREE.Cache.add(url, bytes)
    } catch {
      /* missing files still count so the gate cannot stick */
    }
    done += 1
    onProgress(done, total, labelOf(url))
  }
}

let assetsDone = 0
let assetsTotal = 0
const assetWatchers = new Set<() => void>()
const loadModel = loader.load.bind(loader)

function trackLoad(url: string, onLoad: (gltf: { scene: THREE.Group }) => void, onError?: (error: unknown) => void): void {
  assetsTotal += 1
  assetWatchers.forEach((fn) => fn())
  loadModel(url, (gltf) => {
    assetsDone += 1
    assetWatchers.forEach((fn) => fn())
    onLoad(gltf)
  }, undefined, (error) => {
    assetsDone += 1
    assetWatchers.forEach((fn) => fn())
    onError?.(error)
  })
}

loader.load = ((url, onLoad, _onProgress, onError) => {
  trackLoad(url, onLoad as (gltf: { scene: THREE.Group }) => void, onError)
}) as typeof loader.load

/** The shared loader. NASA models in this project are Draco-compressed. */
export function modelLoader(): GLTFLoader {
  return loader
}

export function assetCount(): { done: number; total: number } {
  return { done: assetsDone, total: assetsTotal }
}

export function watchAssets(fn: () => void): () => void {
  assetWatchers.add(fn)
  return () => assetWatchers.delete(fn)
}

/** Longest side becomes `span` metres, the long axis stands up, and the base sits on y = 0. */
export function fitModel(model: THREE.Object3D, span: number): void {
  model.updateMatrixWorld(true)
  let size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  if (size.x >= size.y && size.x >= size.z) model.rotation.z = Math.PI / 2
  else if (size.z >= size.y && size.z >= size.x) model.rotation.x = -Math.PI / 2
  model.updateMatrixWorld(true)
  size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const extent = Math.max(size.x, size.y, size.z) || 1
  model.scale.setScalar(span / extent)
  model.updateMatrixWorld(true)
  model.position.y -= new THREE.Box3().setFromObject(model).min.y
}

/** Center a model and scale it so its longest side is `diameter`. Parent scale still applies. */
export function seatSphere(model: THREE.Object3D, diameter: number): void {
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const extent = Math.max(size.x, size.y, size.z) || 1
  const scale = diameter / extent
  const center = box.getCenter(new THREE.Vector3())
  model.scale.setScalar(scale)
  model.position.copy(center).multiplyScalar(-scale)
}

/** Fit a public-domain glTF so its longest side is `span` metres and its base sits on y = 0. */
export function loadFitted(url: string, span: number, parent: THREE.Object3D, at?: THREE.Vector3): void {
  trackLoad(url, (gltf) => {
    const model = gltf.scene
    fitModel(model, span)
    if (at) model.position.add(at)
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3())
      const span = Math.max(size.x, size.y, size.z)
      mesh.castShadow = span > 0.45
      mesh.receiveShadow = true
    })
    parent.add(model)
  })
}
