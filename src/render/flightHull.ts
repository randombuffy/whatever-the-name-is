import * as THREE from 'three'
import { modelLoader } from './gltf'

let source: THREE.Object3D | null = null
const pending: ((src: THREE.Object3D) => void)[] = []
let started = false

function keepShared(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.userData.keep = true
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) {
      mat.userData.keep = true
      const mapped = mat as THREE.MeshStandardMaterial
      if (mapped.map) mapped.map.userData.keep = true
    }
  })
}

/** This shuttle file is longest on Z. The nose is the +Z end and the belly is -Y. */
function centerShuttle(model: THREE.Object3D): THREE.Group {
  const holder = new THREE.Group()
  holder.name = 'shuttle'
  holder.add(model)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  model.position.sub(box.getCenter(new THREE.Vector3()))
  // The long axis points the wrong way in the file: +Z is the tail, so the plume was leaving the nose.
  model.rotation.y = Math.PI
  holder.userData.length = box.getSize(new THREE.Vector3()).z
  keepShared(holder)
  return holder
}

function whenShuttle(ready: (src: THREE.Object3D) => void): void {
  if (source) {
    ready(source)
    return
  }
  pending.push(ready)
  if (started) return
  started = true
  modelLoader().load('/vehicles/shuttle.glb', (gltf) => {
    source = centerShuttle(gltf.scene)
    const queue = pending.splice(0)
    for (const fn of queue) fn(source)
  })
}

/**
 * Puts the orbiter on `parent`. Nose is +Z in flight. `stand` pitches the nose up
 * and sits the tail on y = 0, which is how it rests on the pad and on a surface.
 */
export function attachShuttle(parent: THREE.Object3D, length: number, stand: boolean, onReady?: (hull: THREE.Object3D) => void): void {
  whenShuttle((src) => {
    const hull = src.clone(true)
    const native = (src.userData.length as number) || 42
    hull.scale.setScalar(length / Math.max(native, 0.01))
    if (stand) hull.rotation.x = -Math.PI / 2
    hull.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    hull.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(hull)
    hull.position.sub(box.getCenter(new THREE.Vector3()))
    if (stand) {
      hull.updateMatrixWorld(true)
      const seated = new THREE.Box3().setFromObject(hull)
      hull.position.y -= seated.min.y
    }
    parent.add(hull)
    onReady?.(hull)
  })
}

/** Engines sit just ahead of the tail, a little below the centerline. Flight pose only. */
export function enginePoint(length: number): THREE.Vector3 {
  return new THREE.Vector3(0, -length * 0.07, -length * 0.46)
}
