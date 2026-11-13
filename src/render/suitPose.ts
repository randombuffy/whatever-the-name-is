import * as THREE from 'three'

/**
 * Shared walk pose for the suited astronaut on Earth and on Mars.
 * Bones run along local +X. Legs hinge around the suit's right axis.
 * Arms drop from the T-pose onto the sides, then swing opposite the legs.
 * Elbows bend forward so the hands sit at the hips, not through the torso.
 */

export interface SuitLimbs {
  rightThigh: THREE.Object3D
  leftThigh: THREE.Object3D
  rightShin: THREE.Object3D
  leftShin: THREE.Object3D
  rightShoulder: THREE.Object3D
  leftShoulder: THREE.Object3D
  rightArm: THREE.Object3D
  leftArm: THREE.Object3D
  rightElbow: THREE.Object3D | null
  leftElbow: THREE.Object3D | null
  rightWrist: THREE.Object3D | null
  leftWrist: THREE.Object3D | null
  rest: {
    rightThigh: THREE.Quaternion
    leftThigh: THREE.Quaternion
    rightShin: THREE.Quaternion
    leftShin: THREE.Quaternion
    rightShoulder: THREE.Quaternion
    leftShoulder: THREE.Quaternion
    rightArm: THREE.Quaternion
    leftArm: THREE.Quaternion
    rightElbow: THREE.Quaternion
    leftElbow: THREE.Quaternion
    rightWrist: THREE.Quaternion
    leftWrist: THREE.Quaternion
  }
  rig: THREE.Object3D
}

const rigQ = new THREE.Quaternion()
const parentQ = new THREE.Quaternion()
const axis = new THREE.Vector3()
const out = new THREE.Vector3()
const turn = new THREE.Quaternion()
const drop = new THREE.Quaternion()

function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  root.traverse((node) => {
    if (node.name === name) found = node
  })
  return found
}

function capture(bone: THREE.Object3D | null): THREE.Quaternion {
  return bone ? bone.quaternion.clone() : new THREE.Quaternion()
}

export function bindSuit(model: THREE.Object3D): SuitLimbs | null {
  const rightThigh = findBone(model, 'skeleton_joint_n85')
  const leftThigh = findBone(model, 'skeleton_joint_n91')
  const rightShin = findBone(model, 'skeleton_joint_n86')
  const leftShin = findBone(model, 'skeleton_joint_n92')
  const rightShoulder = findBone(model, 'skeleton_joint_n12')
  const leftShoulder = findBone(model, 'skeleton_joint_n46')
  const rightArm = findBone(model, 'skeleton_joint_n13')
  const leftArm = findBone(model, 'skeleton_joint_n47')
  const rightElbow = findBone(model, 'skeleton_joint_n14')
  const leftElbow = findBone(model, 'skeleton_joint_n48')
  if (!rightThigh || !leftThigh || !rightShin || !leftShin || !rightShoulder || !leftShoulder || !rightArm || !leftArm) {
    return null
  }
  const rightWrist = findBone(model, 'skeleton_joint_n15')
  const leftWrist = findBone(model, 'skeleton_joint_n49')
  return {
    rightThigh,
    leftThigh,
    rightShin,
    leftShin,
    rightShoulder,
    leftShoulder,
    rightArm,
    leftArm,
    rightElbow,
    leftElbow,
    rightWrist,
    leftWrist,
    rest: {
      rightThigh: capture(rightThigh),
      leftThigh: capture(leftThigh),
      rightShin: capture(rightShin),
      leftShin: capture(leftShin),
      rightShoulder: capture(rightShoulder),
      leftShoulder: capture(leftShoulder),
      rightArm: capture(rightArm),
      leftArm: capture(leftArm),
      rightElbow: capture(rightElbow),
      leftElbow: capture(leftElbow),
      rightWrist: capture(rightWrist),
      leftWrist: capture(leftWrist),
    },
    rig: model,
  }
}

/** Swing a limb around the suit's world +X, so a step is forward and back. */
function hinge(bone: THREE.Object3D, rest: THREE.Quaternion, radians: number, rig: THREE.Object3D): void {
  bone.quaternion.copy(rest)
  if (Math.abs(radians) < 0.001 || !bone.parent) return
  bone.parent.updateMatrixWorld(true)
  rig.getWorldQuaternion(rigQ)
  bone.parent.getWorldQuaternion(parentQ)
  parentQ.invert()
  axis.set(1, 0, 0).applyQuaternion(rigQ).applyQuaternion(parentQ)
  if (axis.lengthSq() < 1e-8) return
  axis.normalize()
  turn.setFromAxisAngle(axis, radians)
  bone.quaternion.copy(turn).multiply(rest)
  bone.updateMatrixWorld(true)
}

/**
 * T-pose arms run along local +X. Rotate around the suit's forward so they
 * hang from the shoulder, then swing around the suit's right.
 * `side` is +1 for the right arm, -1 for the left.
 */
function dropArm(bone: THREE.Object3D, rest: THREE.Quaternion, rig: THREE.Object3D, side: number, swing: number): void {
  if (!bone.parent) return
  bone.parent.updateMatrixWorld(true)
  rig.getWorldQuaternion(rigQ)
  bone.parent.getWorldQuaternion(parentQ)
  parentQ.invert()
  axis.set(0, 0, 1).applyQuaternion(rigQ).applyQuaternion(parentQ)
  if (axis.lengthSq() < 1e-8) {
    bone.quaternion.copy(rest)
    return
  }
  axis.normalize()
  drop.setFromAxisAngle(axis, side * -1.12)
  axis.set(1, 0, 0).applyQuaternion(rigQ).applyQuaternion(parentQ)
  if (axis.lengthSq() > 1e-8) {
    axis.normalize()
    turn.setFromAxisAngle(axis, swing)
    bone.quaternion.copy(turn).multiply(drop).multiply(rest)
  } else {
    bone.quaternion.copy(drop).multiply(rest)
  }
  bone.updateMatrixWorld(true)
}

function bendElbow(bone: THREE.Object3D, rest: THREE.Quaternion, radians: number): void {
  out.set(0, 0, 1).applyQuaternion(rest).normalize()
  turn.setFromAxisAngle(out, radians)
  bone.quaternion.copy(turn).multiply(rest)
  bone.updateMatrixWorld(true)
}

export function poseSuitWalk(limbs: SuitLimbs, swing: number): void {
  const rig = limbs.rig
  hinge(limbs.rightThigh, limbs.rest.rightThigh, swing, rig)
  hinge(limbs.leftThigh, limbs.rest.leftThigh, -swing, rig)
  hinge(limbs.rightShin, limbs.rest.rightShin, Math.max(0, swing) * 1.15, rig)
  hinge(limbs.leftShin, limbs.rest.leftShin, Math.max(0, -swing) * 1.15, rig)
  limbs.rightShoulder.quaternion.copy(limbs.rest.rightShoulder)
  limbs.leftShoulder.quaternion.copy(limbs.rest.leftShoulder)
  const arm = Math.max(-0.42, Math.min(0.42, -swing * 0.82))
  dropArm(limbs.rightArm, limbs.rest.rightArm, rig, 1, arm)
  dropArm(limbs.leftArm, limbs.rest.leftArm, rig, -1, -arm)
  if (limbs.rightElbow) bendElbow(limbs.rightElbow, limbs.rest.rightElbow, 0.95 + Math.max(0, arm) * 0.25)
  if (limbs.leftElbow) bendElbow(limbs.leftElbow, limbs.rest.leftElbow, -0.95 - Math.max(0, -arm) * 0.25)
  if (limbs.rightWrist) limbs.rightWrist.quaternion.copy(limbs.rest.rightWrist)
  if (limbs.leftWrist) limbs.leftWrist.quaternion.copy(limbs.rest.leftWrist)
}

export function seatSuit(model: THREE.Object3D, height = 1.85): void {
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  model.scale.setScalar(height / Math.max(size.y, 0.01))
  model.updateMatrixWorld(true)
  model.position.y -= new THREE.Box3().setFromObject(model).min.y
  model.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.frustumCulled = false
    }
  })
}
