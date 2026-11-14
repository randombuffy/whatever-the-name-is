import { useEffect, useRef, useState } from 'react'
import { earthCoast } from '../domain/dynamics'
import { R_EARTH_M } from '../domain/constants'
import { getMission, MISSIONS } from '../domain/missions'
import { BOOSTER, createAscent, stepAscent, ASCENT_TIME_SCALE, type AscentInput, type AscentState } from '../domain/ascent'
import { evaluate } from '../domain/validate'
import type { EngineeringIssue } from '../domain/types'
import { PadWorld, type AscentView, type PadAction, type PadContact } from '../render/padWorld'
import { MissionTitle } from './bits'
import { assetCount, watchAssets } from '../render/gltf'
import { crewReady } from '../domain/crew'
import { useActiveMission, useMission } from '../store/useMission'
import { createEngineTone } from './tone'
import { loopFile, playGroup, playJump, playLand, playStep, setBed, setScoreBoost, sting } from './audio'
import { Mix } from './mix'
import { DestModel, DestStill, destStillUrl } from './DestStill'
import { trackMove } from '../input/moveKeys'
import { resetVoice, say, sayOnce, silence } from './voice'

const CHECKS = ['Flight computer', 'Guidance', 'Power', 'Thermal', 'Communications', 'Propulsion', 'Tanks', 'Weather', 'Payload', 'Hold']

function weatherLine(day: number): string {
  const wind = 3 + (Math.abs(day) % 6)
  const clear = Math.abs(day) % 11 < 8
  return clear ? `Clear, wind ${wind} m/s off the coast` : `Coast cloud, wind ${wind} m/s`
}

const EMPTY: PadContact = {
  prompt: 'WASD or arrows to walk. Shift sprint. Space jump. V camera. Click to look.',
  place: 'Launch complex',
  action: null,
  heading: 0,
}

export function PadScreen() {
  const mount = useRef<HTMLDivElement>(null)
  const craft = useMission((state) => state.craft)
  const plan = useMission((state) => state.plan)
  const mission = useActiveMission()
  const go = useMission((state) => state.go)
  const autoFix = useMission((state) => state.autoFix)
  const assignMission = useMission((state) => state.assignMission)
  const chooseMission = useMission((state) => state.chooseMission)
  const launchReady = useMission((state) => state.launchReady)
  const launchRequest = useMission((state) => state.launchRequest)
  const crew = useMission((state) => state.crew)
  const crewSize = useMission((state) => state.crewSize)
  const clearLaunchRequest = useMission((state) => state.clearLaunchRequest)
  const commit = useMission((state) => state.commitLaunch)
  const [hud, setHud] = useState<PadContact>(EMPTY)
  const [count, setCount] = useState<number | null>(null)
  const [panel, setPanel] = useState(false)
  const [readout, setReadout] = useState<AscentState | null>(null)
  const [hold, setHold] = useState<EngineeringIssue[] | null>(null)
  const [models, setModels] = useState(assetCount)
  const action = useRef<PadAction | null>(null)
  const ascent = useRef<AscentState | null>(null)
  const input = useRef<AscentInput>({ throttle: 1, pitch: 0, yaw: 0, abort: false })
  const countRef = useRef<number | null>(null)
  const keys = useRef(new Set<string>())
  const orbitHold = useRef(0)
  const worldRef = useRef<PadWorld | null>(null)
  const warpRef = useRef(1)
  const [warp, setWarp] = useState(1)
  const [view, setView] = useState<AscentView>('chase')
  const [details, setDetails] = useState(false)
  const [missionsOpen, setMissionsOpen] = useState(false)
  const [nextStep, setNextStep] = useState(false)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const craftRef = useRef(craft)
  const missionRef = useRef(mission)
  const planRef = useRef(plan)
  craftRef.current = craft
  missionRef.current = mission
  planRef.current = plan
  const menuRef = useRef(false)
  menuRef.current = missionsOpen || nextStep || Boolean(hold) || panel
  const report = mission && craft && plan ? evaluate(craft, mission, plan) : null
  action.current = hud.action
  countRef.current = count

  useEffect(() => watchAssets(() => setModels(assetCount())), [])

  useEffect(() => {
    if (count === null || count <= 0) return undefined
    playGroup('UIAlert_MusicTone', 0.1)
    say(`${CHECKS[10 - count] ?? 'Commit'}.`, useMission.getState().audio, 0.92)
    const id = window.setTimeout(() => setCount((value) => (value === null ? value : value - 1)), 1800)
    return () => window.clearTimeout(id)
  }, [count])

  useEffect(() => {
    const host = mount.current
    if (!host) return undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'field-canvas'
    host.insertBefore(canvas, host.firstChild)
    const world = new PadWorld(canvas)
    worldRef.current = world
    world.resize()
    const livePayload = () => {
      const liveCraft = craftRef.current
      const liveMission = missionRef.current
      const livePlan = planRef.current
      if (!liveCraft || !liveMission || !livePlan) return 800
      return evaluate(liveCraft, liveMission, livePlan).mass.totalKg
    }
    const engine = createEngineTone()
    let last = performance.now()
    let stage = ''
    let frame = 0
    let heard = ''
    let place = 'Launch complex'
    let stepClock = 0
    let spaceDown = false
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const flying = ascent.current
      setScoreBoost(Boolean(flying))
      if (flying) {
        input.current.pitch = (keys.current.has('arrowup') ? 1 : 0) - (keys.current.has('arrowdown') ? 1 : 0)
        input.current.yaw = (keys.current.has('arrowleft') ? 0.8 : 0) - (keys.current.has('arrowright') ? 0.8 : 0)
        if (keys.current.has('shift')) input.current.throttle = Math.min(1, input.current.throttle + dt * 0.35)
        if (keys.current.has('control')) input.current.throttle = Math.max(0.4, input.current.throttle - dt * 0.35)
        if (keys.current.has('x')) input.current.abort = true
        ascent.current = stepAscent(flying, input.current, dt * warpRef.current * ASCENT_TIME_SCALE, livePayload())
        if (ascent.current.callout && ascent.current.callout !== heard) {
          heard = ascent.current.callout
          sting('radio', useMission.getState().audio)
          say(ascent.current.callout, useMission.getState().audio)
        }
        const liveCall = ascent.current
        const audioOn = useMission.getState().audio
        if (liveCall.altitudeM > 1000) sayOnce('ascent-1k', 'The stack is clear of the tower.', audioOn)
        if (liveCall.altitudeM > 10000) sayOnce('ascent-10k', 'Through the thick air.', audioOn)
        if (liveCall.altitudeM > 12_000) sayOnce('layer-strato', 'Leaving the troposphere. Entering the stratosphere.', audioOn)
        if (liveCall.altitudeM > 50_000) sayOnce('layer-meso', 'Stratosphere behind us. Mesosphere. The air is too thin to hear.', audioOn)
        if (liveCall.altitudeM > 85_000) sayOnce('layer-thermo', 'Mesosphere complete. Thermosphere. The sky is going black.', audioOn)
        if (liveCall.altitudeM > 100_000) sayOnce('space-karman', 'Crossing the Kármán line. We are in space.', audioOn)
        if (liveCall.altitudeM > 200_000) sayOnce('layer-exo', 'Thermosphere fading. Exosphere. The stack is on the edge of the well.', audioOn)
        if (liveCall.velocityMps > 7000) sayOnce('ascent-orbital', 'Approaching orbital speed.', audioOn)
        if ((ascent.current.phase === 'fairing' || ascent.current.phase === 'booster') && ascent.current.phase !== stage) {
          sting('separate', useMission.getState().audio)
        }
        if (ascent.current.phase === 'abort' && stage !== 'abort') sting('warn', useMission.getState().audio)
        stage = ascent.current.phase
        setReadout(ascent.current)
        const live = ascent.current
        const roaring = live.phase !== 'orbit' && live.phase !== 'abort' && !live.aborted
        engine.roar(roaring ? live.throttle : 0, useMission.getState().audio)
        if (ascent.current.aborted) {
          setScoreBoost(false)
          silence()
          ascent.current = null
          input.current = { throttle: 1, pitch: 0, yaw: 0, abort: false }
          setReadout(null)
          setCount(null)
          orbitHold.current = 0
        }
      } else if (countRef.current === 0) {
        setScoreBoost(true)
        playGroup('WHSH_WhooshMedium', 0.28)
        playGroup('LASRGun_Laser', 0.16)
        resetVoice()
        say('Ignition.', useMission.getState().audio)
        orbitHold.current = 0
        ascent.current = { ...createAscent(livePayload()), throttle: 1, phase: 'ignition' }
        countRef.current = null
        setCount(null)
      }
      world.setCrewStowed(countRef.current !== null || Boolean(ascent.current))
      world.setLookEnabled(!menuRef.current)
      const contact = world.step(dt, craftRef.current, ascent.current, useMission.getState().launchReady)
      const map = mapRef.current
      if (map && !ascent.current) drawMap(map, world.mapBlip())
      place = contact.place
      const walking = !ascent.current && contact.place !== 'Transport' && contact.place !== 'Ascent'
      const stride = keys.current.has('w') || keys.current.has('a') || keys.current.has('s') || keys.current.has('d')
      if (walking && stride && useMission.getState().audio) {
        stepClock += dt
        if (stepClock > (keys.current.has('shift') ? 0.32 : 0.5)) {
          stepClock = 0
          playStep(place, keys.current.has('shift'))
        }
      } else stepClock = 0
      const space = keys.current.has(' ')
      if (walking && space && !spaceDown) playJump()
      if (walking && !space && spaceDown) playLand(place)
      spaceDown = space
      const indoors = /Assembly|Hangar|Mission|tower/i.test(contact.place)
      setBed(ascent.current ? 0 : indoors ? 0.05 : 0.02, useMission.getState().audio)
      setHud((prev) => {
        const turn = Math.abs(prev.heading - contact.heading)
        const wrapped = Math.min(turn, 360 - turn)
        const same = prev.prompt === contact.prompt && prev.place === contact.place && prev.action === contact.action && wrapped < 2
        return same ? prev : contact
      })
      if (ascent.current?.phase === 'orbit') {
        orbitHold.current += dt
        if (orbitHold.current > 1.15) {
          commit(ascent.current.propellantKg / Math.max(1, BOOSTER.propellantKg))
          return
        }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    const observer = new ResizeObserver(() => world.resize())
    observer.observe(host)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      worldRef.current = null
      world.dispose()
      engine.stop()
      loopFile('truck', null, 0)
      setBed(0, false)
      canvas.remove()
    }
  }, [commit])

  useEffect(() => {
    if (!launchRequest) return undefined
    clearLaunchRequest()
    if (ascent.current) return undefined
    const state = useMission.getState()
    const active = state.missionId === 'custom' ? state.custom : getMission(state.missionId ?? '')
    if (!state.craft || !active || !state.plan) return undefined
    const report = evaluate(state.craft, active, state.plan)
    const blocked = report.issues.filter((issue) => issue.severity === 'hard')
    if (blocked.length > 0) {
      setHold(blocked)
      setMissionsOpen(false)
      say('No go.', state.audio)
      return undefined
    }
    setHold(null)
    setMissionsOpen(false)
    setCount(10)
    return undefined
  }, [launchRequest, clearLaunchRequest])

  const beginCountdown = () => {
    const state = useMission.getState()
    const active = state.missionId === 'custom' ? state.custom : getMission(state.missionId ?? '')
    if (!state.craft || !active || !state.plan) {
      setMissionsOpen(true)
      return
    }
    const report = evaluate(state.craft, active, state.plan)
    const blocked = report.issues.filter((issue) => issue.severity === 'hard')
    if (blocked.length > 0) {
      setHold(blocked)
      say('No go. Clear the engineering holds first.', state.audio)
      return
    }
    if (state.crewSize > 1 && !crewReady(state.crew)) {
      say('No go. Every seat signs the stack first.', state.audio)
      return
    }
    useMission.getState().armLaunch()
    setHold(null)
    setMissionsOpen(false)
    setCount(10)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = trackMove(keys.current, event)
      if (event.type !== 'keydown' || event.repeat) return
      if (key === 'escape' && countRef.current !== null && !ascent.current) {
        setCount(null)
        say('Hold. Countdown stopped.', useMission.getState().audio)
        return
      }
      const closeStation = () => {
        setMissionsOpen(false)
        setNextStep(false)
        setPanel(false)
        setHold(null)
      }
      if (key === 'escape' && menuRef.current) {
        closeStation()
        return
      }
      if (key !== 'e') return
      if (ascent.current || countRef.current !== null) return
      if (menuRef.current) {
        closeStation()
        return
      }
      const current = action.current
      if (current === 'destination') {
        document.exitPointerLock()
        setMissionsOpen(true)
        setNextStep(false)
        return
      }
      if (current === 'countdown') beginCountdown()
      if (current === 'engineering') go('design')
      if (current === 'mission') setPanel(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [go])

  useEffect(() => {
    if (missionsOpen || nextStep || hold || panel) document.exitPointerLock()
  }, [missionsOpen, nextStep, hold, panel])

  const fuelPct = readout ? Math.max(0, Math.min(100, Math.round((readout.propellantKg / Math.max(1, BOOSTER.propellantKg)) * 100))) : 0
  const layer = readout ? atmosphereLayer(readout.altitudeM) : null

  return (
    <div className="field-stage" ref={mount}>
      <canvas ref={mapRef} className={`pad-map ${readout ? 'is-hidden' : ''}`} width={168} height={168} aria-label="Grounds map" />
      {count === null && !readout && <div className="crosshair" />}
      {!readout && (
      <div className="field-hud">
        <span title="World heading. North is +Z on the grounds.">{rose(hud.heading)} {String(hud.heading).padStart(3, '0')}°</span>
        <span>{hud.place}</span>
        {models.total > 0 && models.done < models.total && <span>Models {models.done}/{models.total}</span>}
        {hud.action !== 'countdown' && hud.action !== 'briefing' && count === null && !missionsOpen && <Keys prompt={hud.prompt} />}
        {missionsOpen && count === null && <Keys prompt="E — Close" />}
        {mission && launchReady && <span>Cleared</span>}
        {mission && <span>{mission.name}</span>}
        {crewSize > 1 && (
          <span>{crewReady(crew) ? 'Crew signed' : 'Crew must sign'}</span>
        )}
        {count === null && (
          <span className="hud-row">
            <Mix />
          </span>
        )}
        {count !== null && count > 0 && craft && plan && report && (
          <span>
            {craft.name} · {Math.round(report.mass.totalKg)} kg on the booster · {Math.round(report.propulsion.dvMps)} m/s aboard · {weatherLine(plan.launchDay ?? 0)}
          </span>
        )}
      </div>
      )}
      {!readout && count === null && mission && report && (
        <div className="budget-float">
          <span>Budget</span>
          <i><b style={{ transform: `scaleX(${Math.max(0, Math.min(1, report.cost.totalUsd / mission.budgetUsd))})` }} className={report.cost.marginUsd < 0 ? 'over' : ''} /></i>
          <div className="budget-nums"><em>{money(report.cost.totalUsd)}</em><em>{money(mission.budgetUsd)}</em></div>
        </div>
      )}
      {(hud.action === 'countdown' || hud.action === 'destination') && count === null && !readout && !missionsOpen && (
        <button type="button" className="key-banner" onClick={() => (hud.action === 'countdown' ? beginCountdown() : setMissionsOpen(true))}>
          <kbd>E</kbd>
          <span>{hud.action === 'countdown' ? 'Begin the countdown' : mission ? 'Flight Control' : 'Mars Destination'}</span>
        </button>
      )}
      {count !== null && count > 0 && (
        <div className="count-banner">
          <MissionTitle text={String(count)} variant="hero" />
          <p>{CHECKS[10 - count] ?? 'Commit'}</p>
          <button type="button" className="count-skip" onClick={() => setCount(0)}>
            Ignite &amp; liftoff now
          </button>
        </div>
      )}
      {hud.action === 'briefing' && !readout && count === null && !missionsOpen && (
        <div className="director">
          <strong>Flight director</strong>
          <p>The destination is chosen at launch control, not on the pad. Press E there, then brief, build, and plan. Come back to the pad only to count it down.</p>
          <button type="button" className="word" onClick={() => setMissionsOpen(true)}>Choose a destination</button>
        </div>
      )}
      {missionsOpen && (
        <div className="director missions mars-gate">
          <div className="mars-gate-stage">
            <DestStill src={destStillUrl('mars')} className="mars-gate-bg" />
            <DestModel missionId="mars" className="mars-gate-globe" />
          </div>
          <strong>{mission ? `${mission.name} Flight Control` : 'Mars Campaign'}</strong>
          <p>
            {mission && craft
              ? `${craft.name} is manifested. You can commence launch countdown, or revise the spacecraft in the hangar.`
              : 'The transfer window is open. Select Mars, build your spacecraft, and bring the stack to the pad.'}
          </p>
          <div className="hud-row brief-actions">
            <button type="button" className="word slim" title="Esc" onClick={() => setMissionsOpen(false)}>Close</button>
            {mission && craft ? (
              <>
                <button
                  type="button"
                  className="word"
                  onClick={() => {
                    setMissionsOpen(false)
                    document.exitPointerLock()
                    go('design')
                  }}
                >
                  Hangar
                </button>
                <button
                  type="button"
                  className="word fill"
                  style={{ background: '#0284c7', borderColor: '#38bdf8' }}
                  onClick={() => {
                    setMissionsOpen(false)
                    document.exitPointerLock()
                    beginCountdown()
                  }}
                >
                  🚀 Launch Mission
                </button>
              </>
            ) : (
              <button
                type="button"
                className="word fill"
                onClick={() => {
                  chooseMission('mars')
                  setMissionsOpen(false)
                  document.exitPointerLock()
                  go('brief')
                }}
              >
                Select Mars
              </button>
            )}
          </div>
        </div>
      )}
      {nextStep && mission && (
        <div className="director missions">
          <strong>{mission.name}</strong>
          <p>The ship stays off the pad until you build it. The cursor stays free.</p>
          <div className="hud-row brief-actions">
            <button type="button" className="word slim" onClick={() => setNextStep(false)}>Close</button>
            <button type="button" className="word fill" onClick={() => { setNextStep(false); go('brief') }}>Start mission</button>
          </div>
        </div>
      )}
      {readout && layer && (
        <>
          <div className="ascent-layer" key={layer.id}>
            <b>Ascent</b>
            <span>{layer.name} · {layer.band} · {mission?.name ?? craft?.name ?? 'Mars pathfinder'}</span>
          </div>
          <div className="ascent-tools">
            <div className="chip-row">
              <span>Time</span>
              {([1, 2, 5, 10, 100] as const).map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className="hud-chip"
                  aria-pressed={warp === rate}
                  title={rate === 1 ? 'Real time' : `${rate} times faster`}
                  onClick={() => { warpRef.current = rate; setWarp(rate) }}
                >
                  {rate === 1 ? 'Real' : `${rate}x`}
                </button>
              ))}
            </div>
            <div className="chip-row">
              <span>Camera</span>
              {(['chase', 'side', 'tower', 'nose', 'cinematic'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="hud-chip"
                  aria-pressed={view === mode}
                  onClick={() => { setView(mode); worldRef.current?.setAscentView(mode) }}
                >
                  {mode === 'cinematic' ? 'Wide' : mode[0].toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <aside className="ascent-fuel">
            <em>Fuel</em>
            <div className="fuel-track" aria-label="Fuel remaining">
              <i style={{ height: `${fuelPct}%` }} />
            </div>
            <b>{fuelPct}%</b>
            <span>Nominal</span>
            <span>Throttle {Math.round(readout.throttle * 100)}%</span>
            <span>TWR {readout.twr.toFixed(2)}</span>
            {details && (
              <>
                <span>Q {Math.round(readout.qPa)}</span>
                <span>Mach {readout.mach.toFixed(2)}</span>
                <span>Mass {(readout.massKg / 1000).toFixed(1)} t</span>
              </>
            )}
          </aside>
          <div className="ascent-read">
            <div><span>Time</span><b>T+ {clock(readout.tSec)}</b></div>
            <div><span>Altitude</span><b>{(readout.altitudeM / 1000).toFixed(1)} km</b></div>
            <div><span>Speed</span><b>{Math.round(readout.velocityMps)} m/s</b></div>
          </div>
          <div className="ascent-call" title={details ? coastLine(readout) : undefined}>{climbStatus(readout)}</div>
          <div className="radar radar-corner" title="Flight-path radar">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" />
              <circle cx="60" cy="60" r="34" />
              <circle cx="60" cy="60" r="16" />
              <path d="M60 8 V112 M8 60 H112" />
              <g className="journey">
                {Array.from({ length: 9 }, (_, i) => (
                  <circle key={i} cx="60" cy={108 - i * 11} r={i === Math.min(8, Math.floor(readout.altitudeM / 20000)) ? 3.2 : 1.15} className={i === Math.min(8, Math.floor(readout.altitudeM / 20000)) ? 'blip' : 'tick'} />
                ))}
              </g>
              <circle
                cx={60 + Math.cos(readout.flightPathRad) * Math.min(48, readout.velocityMps / 200)}
                cy={60 - Math.sin(readout.flightPathRad) * Math.min(48, readout.velocityMps / 200)}
                r="3.5"
                className="blip"
              />
            </svg>
          </div>
          <button type="button" className="ascent-details" aria-pressed={details} onClick={() => setDetails((on) => !on)}>
            Details {details ? 'On' : 'Off'}
          </button>
        </>
      )}
      {hold && (
        <div className="station-panel">
          <strong>No-go</strong>
          <p>The stack stays on the pad until these are closed. Escape also holds a countdown that has already started.</p>
          {hold.map((issue) => (
            <p key={issue.id}><strong>{issue.what}</strong> {issue.why} {issue.change}</p>
          ))}
          <button type="button" className="word autofix" onClick={() => {
            autoFix()
            const state = useMission.getState()
            const active = state.missionId === 'custom' ? state.custom : getMission(state.missionId ?? '')
            if (!state.craft || !active || !state.plan) return
            const next = evaluate(state.craft, active, state.plan).issues.filter((issue) => issue.severity === 'hard')
            if (next.length > 0) {
              setHold(next)
              say('Still no-go. The remaining holds are listed.', state.audio, 0.92)
              return
            }
            setHold(null)
            say('Auto-fix closed the holds. The spacecraft is ready to launch.', state.audio, 0.92)
          }}>Auto-fix</button>
          <button type="button" className="word" onClick={() => { setHold(null); go('design') }}>Engineering</button>
          <button type="button" className="word" onClick={() => setHold(null)}>Close</button>
        </div>
      )}
      {panel && (
        <div className="station-panel">
          <strong>Mission console</strong>
          <p>Load a campaign onto the rocket on the pad. The same craft is the one that flies.</p>
          {MISSIONS.filter((item) => item.id === 'mars').map((item) => (
            <button
              key={item.id}
              type="button"
              className="word"
              onClick={() => {
                assignMission(item.id)
                setPanel(false)
              }}
            >
              {item.name}
            </button>
          ))}
          <button type="button" className="word" onClick={() => { setPanel(false); go('plan') }}>Flight plan</button>
          <button type="button" className="word" onClick={() => setPanel(false)}>Close</button>
        </div>
      )}
    </div>
  )
}

function drawMap(canvas: HTMLCanvasElement, blip: { x: number; z: number; yaw: number }): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const size = canvas.width
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#1a2a1c'
  ctx.fillRect(0, 0, size, size)
  const span = 520
  const toX = (x: number) => ((x + span / 2) / span) * size
  const toY = (z: number) => size - ((z + span / 2) / span) * size
  const road = (x: number, z: number, w: number, h: number) => {
    ctx.fillStyle = '#3a3e44'
    ctx.fillRect(toX(x - w / 2), toY(z + h / 2), (w / span) * size, (h / span) * size)
  }
  road(-26, 0, 52, 7)
  road(20, 22, 7, 40)
  road(20, 130, 7, 150)
  road(100, 70, 160, 7)
  road(-120, 40, 7, 120)
  road(-40, 120, 180, 7)
  ctx.fillStyle = '#6d7278'
  ctx.fillRect(toX(-12), toY(12), (24 / span) * size, (24 / span) * size)
  ctx.fillStyle = '#f2c14e'
  ctx.beginPath()
  ctx.arc(toX(-32), toY(46), 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.translate(toX(blip.x), toY(blip.z))
  ctx.rotate(-blip.yaw)
  ctx.fillStyle = '#f4f1ea'
  ctx.beginPath()
  ctx.moveTo(0, -7)
  ctx.lineTo(5, 6)
  ctx.lineTo(0, 3)
  ctx.lineTo(-5, 6)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = 'rgba(244,241,234,0.35)'
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1)
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

function atmosphereLayer(altitudeM: number): { id: string; name: string; band: string } {
  if (altitudeM < 12_000) return { id: 'troposphere', name: 'Troposphere', band: '0–12 km' }
  if (altitudeM < 50_000) return { id: 'stratosphere', name: 'Stratosphere', band: '12–50 km' }
  if (altitudeM < 85_000) return { id: 'mesosphere', name: 'Mesosphere', band: '50–85 km' }
  if (altitudeM < 600_000) return { id: 'thermosphere', name: 'Thermosphere', band: '85–600 km' }
  return { id: 'exosphere', name: 'Exosphere', band: 'Above 600 km' }
}

function climbStatus(state: AscentState): string {
  if (state.aborted) return state.callout ?? 'Abort. The stack is coming back.'
  if (state.callout) return state.callout
  if (state.phase === 'orbit') return 'Orbit insertion. Hold the attitude.'
  if (state.phase === 'ignition') return 'Ignition. Throttle is coming up.'
  if (state.altitudeM < 250) return 'Liftoff. Tower clear shortly.'
  if (state.qPa > 12_000 && state.qPa > state.qPeak * 0.72) return 'Climbing normally. Hold throttle through Max-Q.'
  if (state.altitudeM < 12_000) return 'Climbing normally. Hold throttle through Max-Q.'
  if (state.altitudeM < 50_000) return 'Through the thick air. Pitching over.'
  if (state.altitudeM < 100_000) return 'The sky is going black. Fairing soon.'
  if (state.boosterGone) return 'Upper stage. Pushing to insertion.'
  return 'Climbing. The booster is still burning.'
}

function coastLine(state: AscentState): string {
  if (state.altitudeM < 20_000 || state.velocityMps < 200) return 'Coast apoapsis appears once the stack is supersonic.'
  const coast = earthCoast(state.altitudeM, state.velocityMps, state.flightPathRad)
  if (!coast) return 'Coast apoapsis is not defined yet.'
  if (!Number.isFinite(coast.apoM)) return 'Energy is positive. This coast escapes.'
  const apo = Math.round((coast.apoM - R_EARTH_M) / 1000)
  const peri = Math.round((coast.periM - R_EARTH_M) / 1000)
  return `If engines cut now: ${apo} km apoapsis · ${peri} km periapsis`
}

function Keys({ prompt }: { prompt: string }) {
  const keyed = prompt.match(/^(Shift|Space|Ctrl|Click|[A-Z])\s+[—-]\s+(.+)$/)
  if (prompt.startsWith('WASD')) {
    return (
      <span className="key-row">
        <span className="key-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Walk</span></span>
        <span className="key-hint"><kbd>Shift</kbd><span>Sprint</span></span>
        <span className="key-hint"><kbd>Space</kbd><span>Jump</span></span>
        <span className="key-hint"><kbd>V</kbd><span>Camera</span></span>
        <span className="key-hint"><kbd>Click</kbd><span>Look</span></span>
      </span>
    )
  }
  if (keyed) {
    return (
      <span className="key-hint">
        <kbd>{keyed[1]}</kbd>
        <span>{keyed[2]}</span>
      </span>
    )
  }
  return <em>{prompt}</em>
}

function money(usd: number): string {
  const abs = Math.abs(usd)
  const sign = usd < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}$${Math.round(abs / 1e6)}M`
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`
  return `${sign}$${Math.round(abs)}`
}

function rose(heading: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return names[Math.round(heading / 45) % 8] ?? 'N'
}
