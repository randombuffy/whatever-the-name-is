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
  return clips.find((clip) => want.some((name) => clip.name.toLowerCase().includes(name))) ?? null
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
      name?: string
      extensions?: { KHR_materials_pbrSpecularGlossiness?: SpecGloss }
      normalTexture?: { index: number }
      occlusionTexture?: { index: number }
    }, index: number) => {
      const spec = def.extensions?.KHR_materials_pbrSpecularGlossiness
      const diffuse = spec?.diffuseTexture ? textures[spec.diffuseTexture.index] : null
      if (diffuse) diffuse.colorSpace = THREE.SRGBColorSpace
      const gloss = spec?.specularGlossinessTexture ? textures[spec.specularGlossinessTexture.index] : null

      const isVisor = index === 1 || def.name === 'material_1'
      if (isVisor) {
        // Vibrant gold/amber reflective astronaut visor
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color(0xffb833),
          metalness: 0.88,
          roughness: 0.12,
          emissive: new THREE.Color(0x3a2004),
          side: THREE.DoubleSide,
        })
      }

      // Bright, vibrant clean white EVA space suit fabric (low metalness to avoid absorbing 72% light)
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xffffff),
        map: diffuse,
        roughnessMap: gloss ?? null,
        roughness: 0.42,
        metalness: 0.05,
        emissive: new THREE.Color(0x1a1816),
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
    action.timeScale = name === 'walk' ? 6.2 : 4.2
    action.setLoop(THREE.LoopRepeat, Infinity)
    actions[name] = action
  }
  let current: AstronautClip = 'idle'
  let desired: AstronautClip = 'idle'
  actions.idle?.play()

  function fade(next: AstronautClip): void {
    const clip = next === 'wave' ? 'idle' : next
    if (clip === current) return
    const incoming = actions[clip] ?? actions.idle
    const outgoing = actions[current]
    if (!incoming) return
    incoming.enabled = true
    incoming.reset().setEffectiveWeight(1).play()
    if (outgoing && outgoing !== incoming) outgoing.crossFadeTo(incoming, 0.18, false)
    current = clip
  }

  return {
    root,
    tick(dt) {
      fade(desired === 'wave' ? 'idle' : desired)
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
