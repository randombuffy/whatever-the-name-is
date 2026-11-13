import * as THREE from 'three'
import type { Subsystem } from '../domain/types'

export const ACCENT: Record<Subsystem, number> = {
  structure: 0xe4dfd4,
  propulsion: 0xc47a62,
  fuel: 0xd4a017,
  power: 0x7dcea0,
  communications: 0x79b0ff,
  science: 0xc9a6ff,
  thermal: 0xe0a36a,
  avionics: 0x9ec0ff,
}

function panelTexture(): THREE.CanvasTexture {
  if (panelMap) return panelMap
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#d7d2c8'
    ctx.fillRect(0, 0, 128, 256)
    ctx.strokeStyle = '#8d887e'
    ctx.lineWidth = 2
    for (let y = 16; y < 256; y += 32) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(128, y)
      ctx.stroke()
    }
    ctx.strokeStyle = '#5c6168'
    for (let x = 8; x < 128; x += 24) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 256)
      ctx.stroke()
    }
    ctx.fillStyle = '#4a4e54'
    for (let y = 16; y < 256; y += 32) {
      for (let x = 8; x < 128; x += 24) {
        ctx.beginPath()
        ctx.arc(x, y, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  panelMap = new THREE.CanvasTexture(canvas)
  panelMap.colorSpace = THREE.SRGBColorSpace
  panelMap.wrapS = THREE.RepeatWrapping
  panelMap.wrapT = THREE.RepeatWrapping
  panelMap.userData.keep = true
  return panelMap
}

let panelMap: THREE.CanvasTexture | null = null

function hashName(name: string): number {
  let h = 2166136261
  const text = name.trim().toLowerCase() || 'unnamed'
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry(seed: number): () => number {
  let a = seed || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeTag(name: string, color: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 256, 64)
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`
    ctx.fillRect(0, 28, 18, 8)
    ctx.fillStyle = '#f4f1ea'
    ctx.font = '24px ui-sans-serif, Segoe UI, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(name.slice(0, 22), 26, 32)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(0.72, 0.18, 1)
  sprite.position.set(0, 0.28, 0)
  sprite.userData.kind = 'tag'
  sprite.visible = false
  return sprite
}

export interface HullHints {
  wings: number
  bells: number
  dishes: number
  sensors: number
}

/**
 * Name-seeded hard-edge hull in the spirit of Shipwright.
 * Shipwright picked one authored chunk from a vertex catalog. This stacks blocks from the same seed
 * so a call sign always rebuilds the same ship, with panel lines left on.
 */
export function sculptHull(root: THREE.Group, name: string, hints: HullHints): void {
  const rand = mulberry(hashName(name))
  const hull = new THREE.Group()
  hull.name = 'shipwright-hull'
  const lines = new THREE.LineBasicMaterial({ color: 0x1c1c1c })
  const panels = panelTexture()
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, map: panels, roughness: 0.62, metalness: 0.18 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.2, metalness: 0.4, emissive: 0x142033, emissiveIntensity: 0.25 })
  const metal = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.4, metalness: 0.7 })
  const groove = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.6, metalness: 0.2 })

  const block = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.userData.kind = 'hull'
    mesh.raycast = () => {}
    hull.add(mesh)
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), lines)
    edges.position.copy(mesh.position)
    edges.scale.setScalar(1.01)
    edges.userData.kind = 'panel'
    edges.raycast = () => {}
    hull.add(edges)
  }

  const length = 2.7 + rand() * 0.8
  const beam = 0.62 + rand() * 0.16
  const deck = 0.38 + rand() * 0.1
  block(0, 0, 0, beam, deck, length, white)
  block(0, deck * 0.42, length * 0.08, beam * 0.78, deck * 0.42, length * 0.62, white)
  block(0, -deck * 0.28, -length * 0.08, beam * 0.7, deck * 0.32, length * 0.55, white)
  block(0, deck * 0.78, length * 0.18, beam * 0.36, deck * 0.22, length * 0.18, glass)
  block(0, deck * 0.2, length * 0.46, beam * 0.42, deck * 0.7, length * 0.16, white)
  block(0, 0.02, length * 0.58, beam * 0.22, deck * 0.36, length * 0.12, white)
  block(0, -deck * 0.05, -length * 0.42, beam * 0.84, deck * 0.5, length * 0.16, white)

  const span = 1.15 + Math.min(1.6, hints.wings * 0.35) + rand() * 0.3
  for (const side of [-1, 1]) {
    block(side * (beam * 0.42 + span * 0.46), -0.02, -length * 0.06, span, 0.045, 0.72 + rand() * 0.2, white)
    block(side * (beam * 0.42 + span * 0.46), 0.02, -length * 0.06, span * 0.78, 0.012, 0.08, groove)
    block(side * (beam * 0.55), deck * 0.2, -length * 0.38, 0.05, 0.34 + rand() * 0.16, 0.28, white)
    block(side * (beam * 0.48), -deck * 0.15, length * 0.12, 0.08, 0.16, 0.22, metal)
  }

  const bells = Math.max(1, Math.min(4, hints.bells))
  for (let i = 0; i < bells; i++) {
    const x = bells === 1 ? 0 : (i - (bells - 1) / 2) * (beam * 0.32)
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.28, 12), metal)
    bell.rotation.x = Math.PI / 2
    bell.position.set(x, -deck * 0.05, -length * 0.56)
    bell.userData.kind = 'hull'
    hull.add(bell)
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 0.08, 12), groove)
    nozzle.rotation.x = Math.PI / 2
    nozzle.position.set(x, -deck * 0.05, -length * 0.68)
    nozzle.userData.kind = 'hull'
    hull.add(nozzle)
  }

  const greebles = 8 + Math.floor(rand() * 8)
  for (let i = 0; i < greebles; i++) {
    const side = rand() > 0.5 ? 1 : -1
    const along = (rand() - 0.5) * length * 0.7
    const lift = (rand() - 0.35) * deck
    const wide = 0.04 + rand() * 0.08
    block(side * (beam * 0.48), lift, along, wide, 0.03 + rand() * 0.05, 0.05 + rand() * 0.12, rand() > 0.7 ? groove : white)
  }

  block(0, deck * 0.7, -length * 0.05, 0.03, 0.22 + hints.dishes * 0.08, 0.03, metal)
  for (let i = 0; i < Math.min(3, hints.sensors); i++) {
    block((i - 1) * 0.12, deck * 0.45, length * 0.38, 0.08, 0.05, 0.1, white)
  }

  hull.userData.kind = 'hull'
  root.add(hull)
}
