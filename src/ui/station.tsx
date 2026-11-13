import { useEffect, useRef, useState } from 'react'
import { MISSIONS } from '../domain/missions'
import { StationWorld, type StationAction, type StationContact } from '../render/stationWorld'
import { useMission } from '../store/useMission'

const EMPTY: StationContact = {
  prompt: 'Click to look. WASD to translate.',
  place: 'Outside the station',
  speed: 0,
  action: null,
}

export function StationScreen() {
  const mount = useRef<HTMLDivElement>(null)
  const craft = useMission((state) => state.craft)
  const missionId = useMission((state) => state.missionId)
  const assignMission = useMission((state) => state.assignMission)
  const go = useMission((state) => state.go)
  const [hud, setHud] = useState<StationContact>(EMPTY)
  const [panel, setPanel] = useState(false)
  const [note, setNote] = useState('')
  const action = useRef<StationAction | null>(null)
  action.current = hud.action

  useEffect(() => {
    const host = mount.current
    if (!host) return undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'field-canvas'
    host.insertBefore(canvas, host.firstChild)
    const world = new StationWorld(canvas)
    world.resize()
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const contact = world.step(dt, craft?.name ?? 'Surveyor')
      setHud((prev) => (prev.prompt === contact.prompt && prev.place === contact.place && Math.abs(prev.speed - contact.speed) < 0.15 && prev.action === contact.action ? prev : contact))
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'e' || event.repeat) return
      const current = action.current
      if (current === 'mission') setPanel(true)
      if (current === 'engineering') {
        if (!useMission.getState().missionId) {
          setNote('Open mission control in the aft module and accept a campaign first.')
          return
        }
        go('design')
      }
      if (current === 'launch') {
        if (!useMission.getState().missionId) {
          setNote('The stack has no campaign loaded.')
          return
        }
        go('pad')
      }
      if (current === 'observe') setNote('Earth limb below the truss. The same ship you board is the one that leaves this port.')
    }
    window.addEventListener('keydown', onKey)
    const observer = new ResizeObserver(() => world.resize())
    observer.observe(host)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('keydown', onKey)
      world.dispose()
      canvas.remove()
    }
  }, [craft?.name, go])

  return (
    <div className="field-stage" ref={mount}>
      <div className="crosshair" />
      <div className="field-hud">
        <span>{hud.place}</span>
        <span>{hud.speed.toFixed(1)} m/s</span>
        <em>{note || hud.prompt}</em>
        <button type="button" className="word slim" onClick={() => go('pad')}>Pad</button>
        {missionId && <span>Campaign loaded</span>}
      </div>
      {panel && (
        <div className="station-panel">
          <strong>Mission control</strong>
          <p>Accept one campaign. The docked ship, its mass, and its propellant carry from here through landing.</p>
          {MISSIONS.filter((mission) => mission.id === 'mars').map((mission) => (
            <button
              key={mission.id}
              type="button"
              className="word"
              onClick={() => {
                assignMission(mission.id)
                setPanel(false)
                setNote(`${mission.name} is on the ship. Board it at the forward port.`)
              }}
            >
              {mission.name}
            </button>
          ))}
          <button type="button" className="word" onClick={() => setPanel(false)}>Close</button>
        </div>
      )}
    </div>
  )
}
