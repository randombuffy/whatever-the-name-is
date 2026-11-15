import * as THREE from 'three'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'

export interface PetCatTarget {
  x: number
  y: number
  z: number
  yaw: number
  hop?: number
}

export interface PetCatOptions {
  worldType: 'earth' | 'mars'
  initialPos: { x: number; y: number; z: number }
  initialYaw?: number
  scale?: number
}

export interface PetCat {
  root: THREE.Group
  tick: (
    dt: number,
    astronaut: PetCatTarget,
    astronautMoving: boolean,
    groundHeight: (x: number, z: number) => number,
    groundNormal?: (x: number, z: number) => THREE.Vector3,
  ) => void
  setVisible: (visible: boolean) => void
  dispose: () => void
}

const OBJ_URL = '/3d/tripo_convert_668e7d12-a758-4d7f-a2d8-822da2b9c8de/tripo_convert_668e7d12-a758-4d7f-a2d8-822da2b9c8de.obj'
const TEX_URL = '/3d/tripo_convert_668e7d12-a758-4d7f-a2d8-822da2b9c8de/tripo_image_668e7d12-a758-4d7f-a2d8-822da2b9c8de_0_0.jpg'

let cachedCatGroup: THREE.Group | null = null
let cachedTexture: THREE.Texture | null = null
const _tmpForward = new THREE.Vector3()
const _tmpRight = new THREE.Vector3()

function dampAngle(current: number, target: number, rate: number, dt: number): number {
  let delta = target - current
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-rate * dt))
}

export function createPetCat(options: PetCatOptions): PetCat {
  const { worldType, initialPos, initialYaw = 0, scale = 0.85 } = options

  const root = new THREE.Group()
  root.position.set(initialPos.x, initialPos.y, initialPos.z)
  root.rotation.y = initialYaw

  // Center of mass offsets for natural quadruped rotation without ground clipping
  const pivotY = 0.46 * scale
  const pivotZ = 0.14 * scale

  // Hierarchical animation rig
  // root (ground level position & yaw)
  //   -> bobNode (smooth vertical stride bounce)
  //     -> pitchPivot (located at body center of mass)
  //       -> pitchNode (fore-aft cadence tilt)
  //         -> swayNode (side-to-side waddle roll & spine yaw)
  //           -> squashNode (step compression & stretch)
  //             -> modelAnchor (offset back by -pivotY, -pivotZ so paws rest at y=0)
  const bobNode = new THREE.Group()
  const pitchPivot = new THREE.Group()
  const pitchNode = new THREE.Group()
  const swayNode = new THREE.Group()
  const squashNode = new THREE.Group()
  const modelAnchor = new THREE.Group()

  root.add(bobNode)
  bobNode.add(pitchPivot)
  pitchPivot.position.set(0, pivotY, pivotZ)
  pitchPivot.add(pitchNode)
  pitchNode.add(swayNode)
  swayNode.add(squashNode)
  squashNode.add(modelAnchor)
  modelAnchor.position.set(0, -pivotY, -pivotZ)

  // Ground contact shadow blob sized for 0.85m companion
  const shadowBlob = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({
      color: worldType === 'mars' ? 0x221008 : 0x0a1014,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  )
  shadowBlob.rotation.x = -Math.PI / 2
  shadowBlob.position.y = 0.02
  shadowBlob.renderOrder = 2
  root.add(shadowBlob)

  // Space accessories for Mars
  let telemetryLed: THREE.PointLight | null = null
  let spaceGearGroup: THREE.Group | null = null

  if (worldType === 'mars') {
    spaceGearGroup = new THREE.Group()

    // Transparent bubble helmet fitted to scaled head (head center: y ~ 0.69m, z ~ 0.15m)
    const helmetGeo = new THREE.SphereGeometry(0.28, 28, 24)
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0xebf5ff,
      roughness: 0.06,
      metalness: 0.12,
      transparent: true,
      opacity: 0.42,
      side: THREE.FrontSide,
    })
    const helmet = new THREE.Mesh(helmetGeo, helmetMat)
    helmet.position.set(0, 0.69, 0.15)

    // Golden neck seal ring
    const ringGeo = new THREE.TorusGeometry(0.24, 0.026, 14, 36)
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xffb833,
      metalness: 0.88,
      roughness: 0.15,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, 0.48, 0.15)

    // Mini EVA life-support backpack
    const packGeo = new THREE.BoxGeometry(0.32, 0.17, 0.28)
    const packMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.38,
      metalness: 0.1,
    })
    const pack = new THREE.Mesh(packGeo, packMat)
    pack.position.set(0, 0.50, -0.05)
    pack.castShadow = true

    // Dual mini oxygen cylinders
    const tankGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.24, 14)
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xe8e8e8,
      metalness: 0.75,
      roughness: 0.25,
    })
    const leftTank = new THREE.Mesh(tankGeo, tankMat)
    leftTank.rotation.x = Math.PI / 2
    leftTank.position.set(-0.11, 0.56, -0.05)
    leftTank.castShadow = true

    const rightTank = new THREE.Mesh(tankGeo, tankMat)
    rightTank.rotation.x = Math.PI / 2
    rightTank.position.set(0.11, 0.56, -0.05)
    rightTank.castShadow = true

    // Telemetry indicator light (optimized, no shadow casting)
    telemetryLed = new THREE.PointLight(0x38ef7d, 0.45, 1.2, 2.0)
    telemetryLed.castShadow = false
    telemetryLed.position.set(0, 0.58, -0.20)

    spaceGearGroup.add(helmet, ring, pack, leftTank, rightTank, telemetryLed)
    modelAnchor.add(spaceGearGroup)
  }

  // Load cat model
  let catMeshContainer: THREE.Group | null = null

  function applyMaterialsAndShadows(group: THREE.Group, tex: THREE.Texture) {
    group.scale.setScalar(scale)
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.material = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.65,
          metalness: 0.04,
        })
        mesh.material.needsUpdate = true
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
  }

  function attachCatMesh(group: THREE.Group, tex: THREE.Texture) {
    catMeshContainer = group.clone(true)
    applyMaterialsAndShadows(catMeshContainer, tex)
    modelAnchor.add(catMeshContainer)
  }

  function getOrLoadTexture(onReady: (tex: THREE.Texture) => void) {
    if (cachedTexture) {
      onReady(cachedTexture)
      return
    }
    const texLoader = new THREE.TextureLoader()
    texLoader.load(TEX_URL, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.needsUpdate = true
      cachedTexture = tex
      onReady(tex)
    })
  }

  getOrLoadTexture((tex) => {
    if (cachedCatGroup) {
      if (!catMeshContainer) {
        attachCatMesh(cachedCatGroup, tex)
      } else {
        applyMaterialsAndShadows(catMeshContainer, tex)
      }
    } else {
      const objLoader = new OBJLoader()
      objLoader.load(OBJ_URL, (obj) => {
        cachedCatGroup = obj
        if (!catMeshContainer) {
          attachCatMesh(obj, tex)
        }
      })
    }
  })

  // AI & follow state
  let currentX = initialPos.x
  let currentY = initialPos.y
  let currentZ = initialPos.z
  let currentYaw = initialYaw
  let currentSpeed = 0
  let walkPhase = 0
  let idleClock = 0
  const basisMatrix = new THREE.Matrix4()

  const FLANK_DISTANCE = 1.65
  const FLANK_ANGLE_OFFSET = 1.05 // ~60 degrees to astronaut's side
  const STOP_DISTANCE = 0.55
  const NORMAL_WALK_SPEED = 2.9
  const SPRINT_CATCHUP_SPEED = 6.2

  function tick(
    dt: number,
    astronaut: PetCatTarget,
    astronautMoving: boolean,
    groundHeight: (x: number, z: number) => number,
    groundNormal?: (x: number, z: number) => THREE.Vector3,
  ): void {
    if (dt <= 0) return

    // Target companion spot: flanking beside astronaut in comfortable peripheral vision
    const flankAngle = astronaut.yaw + FLANK_ANGLE_OFFSET
    const targetX = astronaut.x + Math.sin(flankAngle) * FLANK_DISTANCE
    const targetZ = astronaut.z + Math.cos(flankAngle) * FLANK_DISTANCE

    const dx = targetX - currentX
    const dz = targetZ - currentZ
    const distToTarget = Math.hypot(dx, dz)
    const distToAstronaut = Math.hypot(astronaut.x - currentX, astronaut.z - currentZ)

    // Smooth teleport catchup if player teleported / respawned far away (> 28m)
    if (distToAstronaut > 28) {
      currentX = targetX
      currentZ = targetZ
      currentY = groundHeight(currentX, currentZ)
      currentSpeed = 0
    }

    // Determine target speed based on distance and human motion
    let desiredSpeed = 0
    const needsCatchUp = distToTarget > 2.4 || (distToAstronaut > 2.8 && astronautMoving)
    const isCloseEnough = distToTarget < STOP_DISTANCE || (distToAstronaut < 1.4 && !astronautMoving)

    if (isCloseEnough && !astronautMoving) {
      desiredSpeed = 0
    } else if (needsCatchUp) {
      desiredSpeed = Math.min(SPRINT_CATCHUP_SPEED, 3.6 + distToTarget * 0.95)
    } else if (astronautMoving || distToTarget > STOP_DISTANCE) {
      desiredSpeed = Math.min(NORMAL_WALK_SPEED, Math.max(1.6, distToTarget * 2.0))
    }

    // Smooth, organic acceleration & braking
    const accelRate = desiredSpeed > currentSpeed ? 5.5 : 7.5
    currentSpeed = THREE.MathUtils.damp(currentSpeed, desiredSpeed, accelRate, dt)
    if (currentSpeed < 0.04) currentSpeed = 0

    const isWalking = currentSpeed > 0.08

    // Steering yaw
    if (isWalking && distToTarget > 0.05) {
      const moveAngle = Math.atan2(dx, dz)
      currentYaw = dampAngle(currentYaw, moveAngle, 8.0, dt)
      const stepDist = currentSpeed * dt
      currentX += Math.sin(currentYaw) * stepDist
      currentZ += Math.cos(currentYaw) * stepDist
    } else {
      // Stopped: look affectionately towards the astronaut
      const angleToHuman = Math.atan2(astronaut.x - currentX, astronaut.z - currentZ)
      currentYaw = dampAngle(currentYaw, angleToHuman, 3.5, dt)
    }

    // Ground elevation
    const targetGroundY = groundHeight(currentX, currentZ)
    currentY = THREE.MathUtils.damp(currentY, targetGroundY, 14, dt)

    // Low gravity astronaut hop matching
    const astronautHop = astronaut.hop && astronaut.hop > 0.03 ? astronaut.hop * 0.85 : 0

    // Position and orientation
    root.position.set(currentX, currentY + astronautHop, currentZ)

    if (groundNormal) {
      const norm = groundNormal(currentX, currentZ)
      _tmpForward.set(Math.sin(currentYaw), 0, Math.cos(currentYaw))
      _tmpForward.addScaledVector(norm, -_tmpForward.dot(norm))
      if (_tmpForward.lengthSq() < 1e-5) _tmpForward.set(0, 0, 1)
      _tmpForward.normalize()
      _tmpRight.crossVectors(norm, _tmpForward).normalize()
      basisMatrix.makeBasis(_tmpRight, norm, _tmpForward)
      root.quaternion.setFromRotationMatrix(basisMatrix)
    } else {
      root.rotation.set(0, currentYaw, 0)
    }

    // High quality procedural locomotion & idle animations
    if (isWalking) {
      idleClock = 0

      // Natural, pleasant quadruped stride cadence (1.6 - 1.8 strides/sec)
      const cadence = 5.8 + currentSpeed * 1.6
      walkPhase += cadence * dt

      const phase2 = walkPhase * 2
      const hopNorm = Math.max(0, Math.sin(phase2))

      // Smooth parabolic vertical trot bounce: paws land gently on groundY (zero ground-penetration)
      const bounceIntensity = (worldType === 'mars' ? 0.055 : 0.038) * Math.min(1.2, currentSpeed / 1.5)
      bobNode.position.y = hopNorm * hopNorm * bounceIntensity

      // Fore-aft pitch: slight athletic forward lean + soft stride rocking around center of mass
      const forwardLean = -Math.min(0.065, currentSpeed * 0.016)
      const pitchRock = Math.sin(phase2) * 0.018
      pitchNode.rotation.x = forwardLean + pitchRock
      pitchNode.rotation.y = 0
      pitchNode.rotation.z = 0

      // Side-to-side roll and spine yaw: soft, gentle waddle (alternating paws)
      swayNode.rotation.z = Math.sin(walkPhase) * 0.036
      swayNode.rotation.y = Math.cos(walkPhase) * 0.022

      // Springy step squash & stretch (elastic organic motion)
      const bounceSpring = Math.sin(phase2)
      squashNode.scale.set(
        1.0 - bounceSpring * 0.018,
        1.0 + bounceSpring * 0.028,
        1.0 - bounceSpring * 0.014,
      )
    } else {
      idleClock += dt
      walkPhase = 0

      // Smoothly settle locomotion offsets toward zero without abrupt snap
      pitchNode.rotation.x = THREE.MathUtils.damp(pitchNode.rotation.x, 0, 7.0, dt)
      swayNode.rotation.z = THREE.MathUtils.damp(swayNode.rotation.z, 0, 7.0, dt)
      swayNode.rotation.y = THREE.MathUtils.damp(swayNode.rotation.y, 0, 7.0, dt)
      bobNode.position.y = THREE.MathUtils.damp(bobNode.position.y, 0, 8.0, dt)

      // Gentle rhythmic breathing
      const breath = Math.sin(idleClock * 2.4) * 0.008
      squashNode.scale.set(
        1.0 - breath * 0.6,
        1.0 + breath * 1.2,
        1.0 - breath * 0.6,
      )

      // Curious companion gestures: playful head tilt and looking up toward astronaut
      const lookCycle = Math.sin(idleClock * 0.65)
      if (lookCycle > 0.3) {
        const tilt = (lookCycle - 0.3) * 0.16
        swayNode.rotation.z = tilt
        pitchNode.rotation.x = -tilt * 0.55 // tilts head upwards toward the astronaut's visor!
      }
    }

    // Telemetry LED pulse for space gear
    if (telemetryLed) {
      telemetryLed.intensity = 0.6 + Math.sin(idleClock * 4.0 + walkPhase) * 0.3
    }
  }

  function setVisible(visible: boolean): void {
    root.visible = visible
  }

  function dispose(): void {
    shadowBlob.geometry.dispose()
    ;(shadowBlob.material as THREE.Material).dispose()
    if (spaceGearGroup) {
      spaceGearGroup.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry.dispose()
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => mat.dispose())
          } else {
            mesh.material.dispose()
          }
        }
      })
    }
  }

  return {
    root,
    tick,
    setVisible,
    dispose,
  }
}
