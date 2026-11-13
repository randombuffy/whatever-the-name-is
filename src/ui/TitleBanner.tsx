import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { MARS_ORBIT_AU } from '../domain/constants'
import { modelLoader, seatSphere } from '../render/gltf'
import { buildGeneratedShip } from '../render/procShip'

/** Full-bleed cruise sky behind Launch mission / Load mission. */
export function TitleBanner() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return undefined
    const canvas = document.createElement('canvas')
    el.appendChild(canvas)
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05070c)
    const camera = new THREE.PerspectiveCamera(55, 1, 0.8, 2800)
    camera.position.set(0, 210, 780)
    scene.add(new THREE.AmbientLight(0xb9c7e4, 0.42))
    const sunLight = new THREE.PointLight(0xffe2a8, 22, 2200, 0.35)
    scene.add(sunLight)
    const stars = makeStars()
    scene.add(stars)
    const sunMap = new THREE.TextureLoader().load('/textures/sun/material_baseColor.jpg')
    sunMap.colorSpace = THREE.SRGBColorSpace
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(28, 48, 32),
      new THREE.MeshBasicMaterial({ map: sunMap, color: 0xfff3c8 }),
    )
    const corona = new THREE.Mesh(
      new THREE.SphereGeometry(30.4, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffc978, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.BackSide }),
    )
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(32.6, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe7b0, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.BackSide }),
    )
    sun.add(corona, bloom)
    scene.add(sun)
    const earthOrbitR = 380
    const marsOrbitR = earthOrbitR * MARS_ORBIT_AU
    const earthOrbit = ring(earthOrbitR, 0x9eb4d4)
    const marsOrbit = ring(marsOrbitR, 0xd7a08a)
    scene.add(earthOrbit, marsOrbit)
    const earth = new THREE.Group()
    const mars = new THREE.Group()
    earth.position.set(earthOrbitR, 0, 0)
    mars.position.set(0, 0, marsOrbitR)
    scene.add(earth, mars)
    modelLoader().load('/3d/glb/Earth.glb', (gltf) => {
      const model = gltf.scene
      seatSphere(model, 10)
      earth.add(model)
    })
    modelLoader().load('/3d/glb/Mars.glb', (gltf) => {
      const model = gltf.scene
      seatSphere(model, 6)
      mars.add(model)
    })
    const ship = buildGeneratedShip({
      seed: (Date.now() % 9000) + 11,
      sides: 8,
      segments: 4,
      radius: 0.9,
      length: 0.9,
      stretchX: 1,
      stretchZ: 1.12,
      nozzles: 1,
      wings: 1,
      dishes: 1,
      fins: 1,
      missionId: 'mars',
      bind: {},
    })
    ship.root.scale.setScalar(9)
    ship.root.rotation.x = Math.PI / 2
    scene.add(ship.root)
    camera.lookAt(0, 0, 0)
    let frame = 0
    let dead = false
    const fit = () => {
      const width = Math.max(1, el.clientWidth)
      const height = Math.max(1, el.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    fit()
    const loop = () => {
      if (dead) return
      const t = performance.now() / 1000
      earth.rotation.y += 0.004
      mars.rotation.y += 0.003
      stars.rotation.y += 0.0008
      const earthAngle = t * 0.05
      const marsAngle = t * 0.032 + 1.1
      earth.position.set(Math.cos(earthAngle) * earthOrbitR, 0, Math.sin(earthAngle) * earthOrbitR)
      mars.position.set(Math.cos(marsAngle) * marsOrbitR, 0, Math.sin(marsAngle) * marsOrbitR)
      const along = (Math.sin(t * 0.11) * 0.5 + 0.5)
      ship.root.position.lerpVectors(earth.position, mars.position, 0.22 + along * 0.45)
      ship.root.position.y = 4
      const heading = mars.position.clone().sub(earth.position).normalize()
      ship.root.lookAt(ship.root.position.clone().add(heading))
      camera.position.set(Math.sin(t * 0.05) * 48, 200 + Math.sin(t * 0.04) * 18, 760 + Math.cos(t * 0.05) * 30)
      camera.lookAt(0, 0, 0)
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
  }, [])
  return <div ref={host} className="title-banner" aria-hidden="true" />
}

function ring(radius: number, color: number): THREE.Line {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= 180; i += 1) {
    const angle = (i / 180) * Math.PI * 2
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
  )
}

function makeStars(): THREE.Points {
  const count = 1400
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    const radius = 400 + Math.random() * 900
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf4f1ea, size: 0.55, sizeAttenuation: true }))
}
