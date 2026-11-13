import * as THREE from 'three'
import type { SpacecraftConfig } from '../domain/types'
import { makeFlame } from './exhaust'
import { buildGeneratedShip, recipeFromCraft } from './procShip'

export interface LaunchRig {
  root: THREE.Object3D
  orbiter: THREE.Object3D
  left: THREE.Object3D | null
  right: THREE.Object3D | null
  tank: THREE.Object3D | null
  flames: THREE.Object3D[]
}

function nozzleFlames(at: THREE.Vector3): THREE.Mesh[] {
  const length = 3.4
  const fin = makeFlame(length, 0.72)
  const cross = makeFlame(length, 0.72)
  cross.rotation.y = Math.PI / 2
  fin.position.set(at.x, at.y - length * 0.48, at.z)
  cross.position.copy(fin.position)
  fin.userData.nozzle = true
  cross.userData.nozzle = true
  return [fin, cross]
}

function seat(model: THREE.Object3D, tall: number, stand: boolean): void {
  model.rotation.set(stand ? 0 : Math.PI / 2, 0, 0)
  model.scale.setScalar(1)
  model.position.set(0, 0, 0)
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.y, size.z, 0.01)
  model.scale.setScalar(tall / span)
  model.updateMatrixWorld(true)
  const seated = new THREE.Box3().setFromObject(model)
  model.position.x -= (seated.min.x + seated.max.x) / 2
  model.position.z -= (seated.min.z + seated.max.z) / 2
  model.position.y -= stand ? seated.min.y : (seated.min.y + seated.max.y) / 2
}

function mount(parent: THREE.Object3D, config: SpacecraftConfig | null | undefined, missionId: string, tall: number, stand: boolean): LaunchRig {
  const recipe = config
    ? recipeFromCraft(config, missionId)
    : {
        seed: 11,
        sides: 8,
        segments: 4,
        radius: 0.9,
        length: 0.9,
        stretchX: 1,
        stretchZ: 1.15,
        nozzles: 1,
        wings: 1,
        dishes: 1,
        fins: 0,
        missionId: missionId === 'custom' ? 'mars' : missionId,
        bind: {},
      }
  const root = new THREE.Group()
  root.name = 'launch-stack'
  if (!recipe) {
    parent.add(root)
    return { root, orbiter: root, left: null, right: null, tank: null, flames: [] }
  }
  const ship = buildGeneratedShip(recipe)
  root.add(ship.root)
  parent.add(root)
  seat(root, tall, stand)
  const host = ship.root.getObjectByName('hull') ?? ship.root
  const flames = ship.nozzles.flatMap((at) => {
    const pair = nozzleFlames(at)
    host.add(...pair)
    return pair
  })
  return {
    root,
    orbiter: ship.root,
    left: ship.left,
    right: ship.right,
    tank: null,
    flames,
  }
}

/** The built spacecraft, standing on its nozzles. Nothing is added until the craft has parts. */
export function attachLaunchStack(
  parent: THREE.Object3D,
  onReady: (rig: LaunchRig) => void,
  tall = 26,
  config?: SpacecraftConfig | null,
  missionId = 'lunar',
): void {
  onReady(mount(parent, config, missionId, tall, true))
}

/** Same hull, nose along +Z when `stand` is false so cruise thrust points aft. */
export function attachOrbiter(
  parent: THREE.Object3D,
  length: number,
  stand: boolean,
  onReady?: (hull: THREE.Object3D) => void,
  config?: SpacecraftConfig | null,
  missionId = 'lunar',
): LaunchRig {
  const rig = mount(parent, config, missionId, length, stand)
  for (const flame of rig.flames) flame.visible = false
  onReady?.(rig.orbiter)
  return rig
}
