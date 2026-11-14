import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import DitherVeil from './DitherVeil'

const DEST_TEXTURES: Record<string, string> = {
  mars: '/planets/mars.jpg',
  europa: '/planets/europa.jpg',
  earth: '/planets/earth.jpg',
  lunar: '/planets/moon.jpg',
  asteroid: '/planets/moon.jpg',
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

    const texPath = DEST_TEXTURES[missionId] ?? DEST_TEXTURES.lunar
    const texture = new THREE.TextureLoader().load(texPath)
    texture.colorSpace = THREE.SRGBColorSpace
    const sphereGeo = missionId === 'asteroid' ? new THREE.IcosahedronGeometry(0.85, 3) : new THREE.SphereGeometry(1, 32, 24)
    const sphereMat = new THREE.MeshStandardMaterial({
      map: missionId === 'asteroid' ? undefined : texture,
      color: missionId === 'asteroid' ? 0x6e675e : 0xffffff,
      roughness: 0.9,
      metalness: 0.04,
    })
    const model = new THREE.Mesh(sphereGeo, sphereMat)
    scene.add(model)

    const loop = () => {
      if (dead) return
      model.rotation.y += 0.007
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
      sphereGeo.dispose()
      sphereMat.dispose()
      texture.dispose()
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
