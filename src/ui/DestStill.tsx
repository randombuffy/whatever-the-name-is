import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { modelLoader, seatSphere } from '../render/gltf'
import DitherVeil from './DitherVeil'

const DEST_MODEL: Record<string, string> = {
  lunar: '/3d/glb/moon.glb',
  mars: '/3d/glb/Mars.glb',
  europa: '/3d/glb/Europa.glb',
  asteroid: '/3d/glb/moon.glb',
  earth: '/3d/glb/Earth.glb',
}

/** Spinning globe, centered so the whole planet sits in frame. */
export function DestModel({ missionId, className }: { missionId: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return undefined
    const canvas = document.createElement('canvas')
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    el.appendChild(canvas)
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40)
    camera.position.set(0, 0, 3.15)
    camera.lookAt(0, 0, 0)
    scene.add(new THREE.AmbientLight(0xd5deee, 0.78))
    const sun = new THREE.DirectionalLight(0xfff6ea, 2.1)
    sun.position.set(2.4, 1.4, 3.2)
    scene.add(sun)
    let model: THREE.Object3D | null = null
    let frame = 0
    let dead = false
    const fit = () => {
      const width = el.clientWidth || 1
      const height = el.clientHeight || 1
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    fit()
    modelLoader().load(DEST_MODEL[missionId] ?? DEST_MODEL.lunar, (gltf) => {
      if (dead) return
      model = gltf.scene
      seatSphere(model, missionId === 'asteroid' ? 0.95 : 1.15)
      if (missionId === 'asteroid') {
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh
          if (!mesh.isMesh || !(mesh.material instanceof THREE.MeshStandardMaterial)) return
          const mat = mesh.material.clone()
          mat.color.set(0x6e675e)
          mat.roughness = 1
          mesh.material = mat
        })
      }
      scene.add(model)
    })
    const loop = () => {
      if (dead) return
      if (model) model.rotation.y += 0.007
      renderer.render(scene, camera)
      frame = requestAnimationFrame(loop)
    }
    loop()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => {
      dead = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.dispose()
      canvas.remove()
    }
  }, [missionId])
  return <div ref={host} className={className ? `dest-still ${className}` : 'dest-still'} />
}

export const DEST_STILLS: Record<string, string> = {
  lunar: '/dest/moon.jpg',
  mars: '/dest/mars.jpg',
  europa: '/dest/europa.jpg',
  asteroid: '/dest/asteroid.jpg',
}

export function destStillUrl(missionId: string, customBaseId?: string | null): string {
  return DEST_STILLS[missionId] ?? DEST_STILLS[customBaseId ?? 'lunar'] ?? DEST_STILLS.lunar
}

const VEIL = {
  pattern: 'floyd' as const,
  pixelSize: 2,
  levels: 2,
  palette: 'duotone' as const,
  inkColor: '#0c0c0c',
  paperColor: '#ebe8e1',
  contrast: 1.15,
  brightness: 0,
  revealRadius: 160,
  softness: 0.6,
  linger: 1,
  rimColor: '#dadada',
  rim: 0,
  reverse: false,
  clickBurst: true,
}

export function DestStill({
  src,
  className,
  fit = 'cover',
  wander = false,
  revealRadius,
}: {
  src: string
  className?: string
  fit?: 'cover' | 'contain'
  wander?: boolean
  revealRadius?: number
}) {
  return (
    <DitherVeil
      {...VEIL}
      className={className}
      src={src}
      fit={fit}
      wander={wander}
      revealRadius={revealRadius ?? VEIL.revealRadius}
      style={{ background: '#111111' }}
    />
  )
}
