import * as THREE from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { seatSuit } from './suitPose'

export type AstronautClip = 'idle' | 'walk' | 'wave' | 'air'

export interface WalkAstronaut {
  root: THREE.Object3D
  tick: (dt: number) => void
  setClip: (clip: AstronautClip) => void
  setVisible: (visible: boolean) => void
}

function pick(clips: THREE.AnimationClip[], ...names: string[]): THREE.AnimationClip | null {
  const want = names.map((name) => name.toLowerCase())
  return clips.find((clip) => want.some((name) => clip.name.toLowerCase().includes(name))) ?? clips[0] ?? null
}

type SpecGloss = {
  diffuseFactor?: number[]
  diffuseTexture?: { index: number }
  glossinessFactor?: number
  specularFactor?: number[]
  specularGlossinessTexture?: { index: number }
}

/** The file uses KHR specular-glossiness. Three no longer maps those textures by itself. */
function paintSpecGloss(gltf: GLTF): void {
  const parser = (gltf as GLTF & {
    parser?: {
      json: {
        textures?: unknown[]
        meshes?: { primitives?: { material?: number }[] }[]
        materials?: {
          extensions?: { KHR_materials_pbrSpecularGlossiness?: SpecGloss }
          normalTexture?: { index: number }
          occlusionTexture?: { index: number }
        }[]
      }
      getDependency: (type: string, index: number) => Promise<THREE.Texture>
    }
  }).parser
  if (!parser?.json.materials) return
  const count = parser.json.textures?.length ?? 0
  void Promise.all(Array.from({ length: count }, (_, index) => parser.getDependency('texture', index))).then((textures) => {
    const painted = (parser.json.materials ?? []).map((def: {
      extensions?: { KHR_materials_pbrSpecularGlossiness?: SpecGloss }
      normalTexture?: { index: number }
      occlusionTexture?: { index: number }
    }) => {
      const spec = def.extensions?.KHR_materials_pbrSpecularGlossiness
      const diffuse = spec?.diffuseTexture ? textures[spec.diffuseTexture.index] : null
      if (diffuse) diffuse.colorSpace = THREE.SRGBColorSpace
      const gloss = spec?.specularGlossinessTexture ? textures[spec.specularGlossinessTexture.index] : null
      const color = spec?.diffuseFactor
      const shine = spec?.specularFactor ? Math.max(spec.specularFactor[0], spec.specularFactor[1], spec.specularFactor[2]) : 0.12
      return new THREE.MeshStandardMaterial({
        color: color ? new THREE.Color(color[0], color[1], color[2]) : 0xffffff,
        map: diffuse,
        roughnessMap: gloss ?? null,
        roughness: spec ? Math.max(0.18, 1 - (spec.glossinessFactor ?? 0.5)) : 0.55,
        metalness: Math.min(0.72, shine),
        normalMap: def.normalTexture ? textures[def.normalTexture.index] : null,
        aoMap: def.occlusionTexture ? textures[def.occlusionTexture.index] : null,
        side: THREE.DoubleSide,
      })
    })
    let mesh = 0
    gltf.scene.traverse((obj) => {
      const next = obj as THREE.Mesh
      if (!next.isMesh) return
      const matIndex = parser.json.meshes?.[mesh]?.primitives?.[0]?.material ?? mesh
      if (painted[matIndex]) next.material = painted[matIndex]
      next.castShadow = true
      next.frustumCulled = false
      mesh += 1
    })
  })
}

/** The walking_astronaut.glb mixer. Idle, wave, moon_walk, floating. */
export function bindWalkAstronaut(gltf: GLTF, height = 1.85): WalkAstronaut {
  const root = gltf.scene
  seatSuit(root, height)
  paintSpecGloss(gltf)
  const mixer = new THREE.AnimationMixer(root)
  const clips: Record<AstronautClip, THREE.AnimationClip | null> = {
    idle: pick(gltf.animations, 'idle'),
    walk: pick(gltf.animations, 'moon_walk', 'walk', 'walking'),
    wave: pick(gltf.animations, 'wave', 'waving'),
    air: pick(gltf.animations, 'floating', 'float'),
  }
  const actions = {} as Record<AstronautClip, THREE.AnimationAction | null>
  for (const name of Object.keys(clips) as AstronautClip[]) {
    const clip = clips[name]
    if (!clip) {
      actions[name] = null
      continue
    }
    const action = mixer.clipAction(clip)
    action.enabled = true
    action.timeScale = name === 'walk' ? 5.3 : 4.2
    if (name === 'wave') {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity)
    }
    actions[name] = action
  }
  let current: AstronautClip = 'idle'
  let desired: AstronautClip = 'idle'
  let idleFor = 0
  actions.idle?.play()

  mixer.addEventListener('finished', (event) => {
    if (event.action === actions.wave) {
      idleFor = 0
      fade('idle')
    }
  })

  function fade(next: AstronautClip): void {
    if (next === current) return
    const incoming = actions[next] ?? actions.idle
    const outgoing = actions[current]
    if (!incoming) return
    incoming.enabled = true
    incoming.reset().setEffectiveWeight(1).play()
    if (outgoing && outgoing !== incoming) outgoing.crossFadeTo(incoming, 0.18, false)
    current = next
  }

  return {
    root,
    tick(dt) {
      let want = desired
      if (want === 'idle') {
        idleFor += dt
        if (idleFor > 5 && current !== 'wave') want = 'wave'
      } else {
        idleFor = 0
      }
      fade(want)
      mixer.update(dt)
    },
    setClip(clip) {
      desired = clip
    },
    setVisible(visible) {
      root.visible = visible
    },
  }
}
