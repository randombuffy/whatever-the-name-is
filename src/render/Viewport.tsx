import { useEffect, useRef } from 'react'
import { MissionWorld, type ViewState } from './world'

export function Viewport(props: ViewState) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let world: MissionWorld
    try {
      world = new MissionWorld(canvas)
    } catch (error) {
      canvas.insertAdjacentText('afterend', error instanceof Error ? error.message : 'The 3D view could not start.')
      return
    }
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      world.sync(propsRef.current, dt)
      world.render()
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    const observer = new ResizeObserver(() => world.resize())
    observer.observe(canvas)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      world.dispose()
    }
  }, [])

  return <canvas ref={canvasRef} className="viewport" data-view="mission" aria-label="Spacecraft and trajectory view" />
}
