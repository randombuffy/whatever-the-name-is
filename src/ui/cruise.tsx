import { useEffect, useRef, useState, useMemo } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  Eye,
  EyeOff,
  Flame,
  Gauge,
  House,
  Lock,
  Move3d,
  Pause,
  Play,
  Power,
  Rocket,
  Settings,
  Video,
  RotateCcw,
} from 'lucide-react'
import { AU_M } from '../domain/constants'
import { computeOrbitIntercept } from '../domain/orbit'
import { evaluate } from '../domain/validate'
import { getSpec } from '../domain/catalog'
import { burnSeconds, cruiseOrbit, nodeMagnitude } from '../domain/nodes'
import type { ManoeuvreNode, ScriptItem, SimState, SpacecraftConfig } from '../domain/types'
import { siteOf, sitesFor } from '../domain/campaign'
import { effectiveWarp, sliderToWarp, warpLabel, warpToSlider } from '../domain/time'
import { transferState } from '../domain/transfer'
import { EDU_LIMITS, STORAGE_FLIGHT_GUIDE } from '../domain/brand'
import { FLIGHT_ACTIONS, keyLabel, keyName, loadBinds, saveBinds, type FlightAction, type FlightBinds } from './binds'
import { CruiseWorld, FLIGHT_CAMS, type FlightCam } from '../render/cruiseWorld'
import { useActiveMission, useMission } from '../store/useMission'
import { setBed, setScoreBoost, sting } from './audio'
import { say, sayOnce } from './voice'
import { Mix } from './mix'
import { createEngineTone } from './tone'

const BIND_ICON: Record<FlightAction, typeof Gauge> = {
  pitchUp: ArrowUp,
  pitchDown: ArrowDown,
  yawLeft: ArrowLeft,
  yawRight: ArrowRight,
  rollLeft: Move3d,
  rollRight: Move3d,
  throttleUp: Flame,
  throttleDown: Flame,
  engine: Power,
  stable: Lock,
  level: Crosshair,
  rewind: RotateCcw,
  pause: Pause,
  cameras: Video,
  hud: Eye,
  proceed: Rocket,
}

export function CruiseScreen() {
  const mount = useRef<HTMLDivElement>(null)
  const worldRef = useRef<CruiseWorld | null>(null)
  const sim = useMission((state) => state.sim)
  const craft = useMission((state) => state.craft)
  const mission = useActiveMission()
  const plan = useMission((state) => state.plan)
  const paused = useMission((state) => state.paused)
  const rate = useMission((state) => state.rate)
  const setPaused = useMission((state) => state.setPaused)
  const setRate = useMission((state) => state.setRate)
  const decide = useMission((state) => state.decide)
  const finish = useMission((state) => state.finish)
  const go = useMission((state) => state.go)
  const setPlan = useMission((state) => state.setPlan)
  const checkpoints = useMission((state) => state.checkpoints)
  const restoreCheckpoint = useMission((state) => state.restoreCheckpoint)
  const ascentFuelFrac = useMission((state) => state.ascentFuelFrac)

  const [camera, setCamera] = useState<FlightCam>('free')
  const [details, setDetails] = useState(false)
  const [throttle, setThrottle] = useState(1)
  const [engines, setEngines] = useState(true)
  const [stable, setStable] = useState(true)
  const [hudOn, setHudOn] = useState(true)
  const [bindsOpen, setBindsOpen] = useState(false)
  const [timeline, setTimeline] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [guide, setGuide] = useState(false)
  const [lagNote, setLagNote] = useState('')
  const difficulty = useMission((state) => state.difficulty)
  const [binds, setBinds] = useState<FlightBinds>(() => loadBinds())
  const [capture, setCapture] = useState<FlightAction | null>(null)
  const [pose, setPose] = useState({ pitch: 0, yaw: 0, roll: 0 })
  const decisionId = sim?.decision?.id ?? ''
  const failed = Boolean(sim?.failed)

  useEffect(() => {
    if (!decisionId) return
    const decision = useMission.getState().sim?.decision
    sting('radio', useMission.getState().audio)
    if (!decision) return
    const options = decision.options.map((option, index) => `${index + 1}, ${option.label}`).join('. ')
    say(`${decision.title}. ${decision.detail} ${options}`, useMission.getState().audio)
  }, [decisionId])

  useEffect(() => {
    if (!failed) return
    sting('warn', useMission.getState().audio)
  }, [failed])

  const [transitioning, setTransitioning] = useState(false)
  const [arrivalReady, setArrivalReady] = useState(false)

  const intercept = useMemo(() => {
    if (!sim || !mission) return null
    const hopSec = mission.burns[0]?.coastAfterSec ?? mission.durationDays * 86400
    const track = transferState(mission.id, mission.destinationAu, sim.distanceFraction, sim.tSec)
    return computeOrbitIntercept(
      mission.id,
      mission.destinationAu,
      sim.distanceFraction,
      hopSec,
      track.rangeDestM,
      track.rangeEarthM,
      track.speed
    )
  }, [mission, sim])

  const arrival = Boolean(sim && !sim.failed && (sim.status === 'complete' || sim.distanceFraction >= 0.99))
  useEffect(() => {
    if (!arrival || !mission) {
      setArrivalReady(false)
      return undefined
    }
    setArrivalReady(true)
    useMission.getState().setRate(1)
    sting('radio', useMission.getState().audio)
    sayOnce('mars-entry-ready', `${mission.destination} arrival confirmed. Orbit intercept locked. Standing by for entry interface.`, useMission.getState().audio)
  }, [arrival, mission])

  const initiateLanding = () => {
    setTransitioning(true)
    sting('separate', useMission.getState().audio)
    sayOnce('entry-burn', 'De-orbit burn complete. Mars entry interface in three, two, one.', useMission.getState().audio)
    window.setTimeout(() => {
      go('landing')
    }, 1600)
  }

  const keys = useRef(new Set<string>())
  const cameraRef = useRef(camera)
  const throttleRef = useRef(throttle)
  const enginesRef = useRef(engines)
  const stableRef = useRef(stable)
  const levelRef = useRef(false)
  const bindsRef = useRef(binds)
  const captureRef = useRef(capture)
  const engineHeld = useRef(false)
  const manualHold = useRef(false)
  cameraRef.current = camera
  throttleRef.current = throttle
  enginesRef.current = engines
  stableRef.current = stable
  bindsRef.current = binds
  captureRef.current = capture
  const missionRef = useRef(mission)
  const planRef = useRef(plan)
  missionRef.current = mission
  planRef.current = plan

  useEffect(() => {
    const host = mount.current
    if (!host || !craft) return undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'field-canvas'
    host.insertBefore(canvas, host.firstChild)
    const world = new CruiseWorld(canvas)
    const engine = createEngineTone()
    worldRef.current = world
    world.resize()
    let frame = 0
    let last = performance.now()
    let carry = 0
    let painted = 0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const down = keys.current
      const map = bindsRef.current
      const stickPitch = (down.has(map.pitchDown) || down.has('s') ? 1 : 0) - (down.has(map.pitchUp) || down.has('w') ? 1 : 0)
      const stickYaw = (down.has(map.yawRight) || down.has('d') ? 1 : 0) - (down.has(map.yawLeft) || down.has('a') ? 1 : 0)
      const stickRoll = (down.has(map.rollRight) ? 1 : 0) - (down.has(map.rollLeft) ? 1 : 0)
      if (down.has(map.throttleUp)) throttleRef.current = Math.min(1, throttleRef.current + dt * 0.45)
      if (down.has(map.throttleDown)) throttleRef.current = Math.max(0, throttleRef.current - dt * 0.45)
      const state = useMission.getState()
      const burning = Boolean(state.sim?.burning)
      const thrust = burning && enginesRef.current ? throttleRef.current : 0
      engine.roar(thrust, state.audio)
      setScoreBoost(true)
      setBed(burning ? 0.004 : 0.006, state.audio)
      const fraction = state.sim?.distanceFraction ?? 0
      const missionId = state.missionId ?? 'mars'
      const lunar = missionId === 'lunar'
      const track = state.sim ? transferState(missionId, missionRef.current?.destinationAu ?? 1.52, fraction, state.sim.tSec) : null
      const speedLine = track ? `${(track.speed / 1000).toFixed(1)} kilometres per second, ${Math.round(track.speed * 3.6).toLocaleString()} kilometres per hour` : ''
      if (fraction > 0.008) sayOnce('coast-clear', lunar ? 'Clear of Earth orbit. Trans-lunar injection is complete.' : 'Clear of Earth orbit. The transfer burn is in. We are on the heliocentric coast.', state.audio)
      if (fraction > 0.03) sayOnce('coast-out', lunar ? `Trans-lunar coast. Speed is ${speedLine}, relative to Earth. About three days to the Moon.` : `Earth departure. Heliocentric speed is ${speedLine}. Mars is seven to ten months out on this transfer.`, state.audio)
      if (fraction > 0.12) sayOnce('coast-soi', lunar ? 'Leaving the deep cislunar field. The Moon is the target.' : 'Leaving Earth\'s sphere of influence. The Sun is the gravity that matters now.', state.audio)
      if (fraction > 0.28) sayOnce('coast-quarter', lunar ? `A quarter of the way. Still ${speedLine}, relative to Earth.` : `A quarter of the cruise. Heliocentric speed ${speedLine}.`, state.audio)
      if (fraction > 0.5) sayOnce('coast-half', lunar ? 'Halfway to the Moon. The crew is in the cabin.' : `Halfway. Heliocentric speed ${speedLine}. This is the slow part of the ellipse, near apoapsis.`, state.audio)
      if (fraction > 0.62) sayOnce('coast-cabin', lunar ? 'Cabin checks. Suit pressure is nominal.' : 'Cabin checks. Heat shield, legs, and the rover are still stowed for arrival.', state.audio)
      if (fraction > 0.75) sayOnce('coast-late', lunar ? 'The Moon is in the forward windows.' : 'Mars is growing ahead. The landing site can be confirmed on the way in. The cruise does not stop for it.', state.audio)
      if (fraction > 0.88) sayOnce('coast-prep', lunar ? 'Lunar approach. Powering the descent cameras.' : 'Mars approach. Powering the heat shield and the landing radar.', state.audio)
      if (fraction > 0.92) sayOnce('coast-arrive', lunar ? 'Lunar approach. Beginning the descent picture.' : 'Mars approach. The ship will come around the planet and fly the entry. No jump to the surface.', state.audio)
      const attitudeNow = world.attitude()
      useMission.getState().noteFlight(throttleRef.current, Math.hypot(attitudeNow.pitch, attitudeNow.yaw))
      const idle = burning && (!enginesRef.current || throttleRef.current < 0.12)
      if (idle && !engineHeld.current) {
        engineHeld.current = true
        if (!state.paused) setPaused(true)
      } else if (!idle && engineHeld.current) {
        engineHeld.current = false
        if (!manualHold.current) setPaused(false)
      }
      const simNow = state.sim
      if (state.phase === 'flight' && simNow && simNow.status === 'running' && !useMission.getState().paused) {
        carry += dt * effectiveWarp(state.rate, simNow)
        let guard = 0
        while (carry > 1 && guard < 48) {
          const live = useMission.getState()
          if (!live.sim || live.sim.status !== 'running' || live.paused) break
          const before = live.sim.tSec
          live.tick(carry)
          const after = useMission.getState().sim?.tSec ?? before
          const used = after - before
          if (used <= 0) break
          carry -= used
          guard += 1
        }
      }
      const live = useMission.getState()
      const flown = missionRef.current
      const chosen = planRef.current
      const sites = sitesFor(live.missionId === 'custom' ? 'mars' : (live.missionId ?? 'mars'))
      const site = sites.find((item) => item.id === chosen?.siteId) ?? sites[0]
      if (live.craft) {
        world.step(dt, {
          burning: Boolean(live.sim?.burning),
          thrust: live.sim?.thrustFraction ?? 0,
          fraction: live.sim?.distanceFraction ?? 0,
          missionId: live.missionId ?? 'mars',
          destAu: flown?.destinationAu ?? 1.52,
          tSec: live.sim?.tSec ?? 0,
          lat: site?.lat,
          lon: site?.lon,
          craft: live.craft,
          stick: {
            pitch: stickPitch,
            yaw: stickYaw,
            roll: stickRoll,
            stable: stableRef.current,
            level: levelRef.current,
            throttle: throttleRef.current,
            engines: enginesRef.current,
            camera: cameraRef.current,
          },
        })
      }
      if (now - painted > 140) {
        painted = now
        const attitude = world.attitude()
        setPose(attitude)
        setThrottle(throttleRef.current)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    const observer = new ResizeObserver(() => world.resize())
    observer.observe(host)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      world.dispose()
      engine.stop()
      setScoreBoost(false)
      setBed(0, false)
      worldRef.current = null
      canvas.remove()
    }
  }, [craft, setPaused])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const name = keyName(event)
      if (captureRef.current && event.type === 'keydown' && !event.repeat) {
        event.preventDefault()
        const action = captureRef.current
        setBinds((current) => {
          const taken = FLIGHT_ACTIONS.find((item) => item !== action && current[item] === name)
          if (taken) return current
          const next = { ...current, [action]: name }
          saveBinds(next)
          return next
        })
        setCapture(null)
        return
      }
      if (event.type === 'keydown') keys.current.add(name)
      else keys.current.delete(name)
      if (event.type !== 'keydown' || event.repeat) return
      const map = bindsRef.current
      if (name === map.hud) {
        event.preventDefault()
        setHudOn((value) => !value)
      }
      if (name === map.pause) {
        const next = !useMission.getState().paused
        manualHold.current = next
        setPaused(next)
      }
      if (name === map.engine) setEngines((value) => !value)
      if (name === map.stable) setStable((value) => !value)
      if (name === map.level) levelRef.current = true
      if (name === map.rewind) setTimeline((value) => !value)
      if (name === map.cameras) {
        setCamera((value) => FLIGHT_CAMS[(FLIGHT_CAMS.indexOf(value) + 1) % FLIGHT_CAMS.length])
      }
      const state = useMission.getState()
      if (name === map.proceed && state.sim && (state.sim.status === 'complete' || state.sim.status === 'failed')) {
        event.preventDefault()
        if (state.sim.failed) finish()
        else go('landing')
      }
      const choice = Number(name)
      const decision = state.sim?.decision
      if (decision && choice >= 1 && choice <= decision.options.length) decide(decision.options[choice - 1].id)
    }
    const onUp = (event: KeyboardEvent) => {
      const name = keyName(event)
      keys.current.delete(name)
      if (name === bindsRef.current.level) levelRef.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  }, [decide, finish, go, setPaused])

  const queueCommand = (fn: () => void) => {
    const lag = difficulty === 'commander' ? Math.min(2.4, Math.max(0.7, ((intercept?.owltSec ?? 240) / 180))) : 0
    if (lag <= 0) {
      fn()
      return
    }
    setLagNote('Command in transit')
    window.setTimeout(() => {
      fn()
      setLagNote('')
    }, lag * 1000)
  }

  if (!sim || !craft || !mission || !plan) return null
  const report = evaluate(craft, mission, plan)
  const propNow = sim.propellant.chemical + sim.propellant.electric + sim.propellant['cold-gas']
  const massNow = report.mass.dryKg + propNow
  const numbers = instruments(sim, craft, massNow, report.mass.propellantKg, report.propulsion.dvMps, pose, throttle, engines, mission.id, mission.destinationAu, ascentFuelFrac)
  const engine = mainEngine(craft)
  const done = sim.status === 'complete' || sim.status === 'failed'
  const site = siteOf(mission, plan)
  const leg = sim.distanceFraction < 0.08 ? 'Leaving Earth' : sim.distanceFraction < 0.82 ? 'Coasting' : 'Arrival'
  const fuelPct = Math.max(0, Math.min(100, Math.round(numbers.fuelRatio * 100)))
  const destRange = rangeText(numbers.rangeDestM)
  const earthRange = rangeText(numbers.rangeEarthM)
  const cruiseCall = sim.failed
    ? (sim.failReason || 'The transfer stopped.')
    : sim.decision
      ? sim.decision.title
      : done
        ? `Arrival. ${site.name} is the landing.`
        : sim.burning
          ? 'Burning. Hold the nose on the path.'
          : leg === 'Leaving Earth'
            ? 'Leaving Earth. The transfer is opening.'
            : leg === 'Arrival'
              ? 'Mars is ahead. Confirm the landing site when you are ready.'
              : 'Coasting. The yellow path is the transfer.'

  return (
    <div className="field-stage" ref={mount}>
      <div className="deck">
        <div className="ascent-layer">
          <b>Cruise</b>
          <span>{leg} · {mission.name}</span>
          <span>{destRange} to {mission.destination} · {earthRange} from Earth</span>
          <span>{etaLine(sim, effectiveWarp(rate, sim))}</span>
          <div className="journey-track" aria-label="Transfer progress">
            <i style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, sim.distanceFraction))})` }} />
          </div>
        </div>
        <div className="ascent-tools">
          <div className="chip-row warp-row">
            <span>Time</span>
            <label className="warp-slider" title="Flight clock from 1× to 1,000,000×">
              <span>{warpLabel(effectiveWarp(rate, sim))}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={warpToSlider(rate)}
                aria-label="Sim speed"
                onChange={(event) => setRate(sliderToWarp(Number(event.target.value)))}
              />
            </label>
            {([1, 1_000, 100_000, 1_000_000] as const).map((step) => (
              <button
                key={step}
                type="button"
                className="hud-chip"
                aria-pressed={Math.abs(rate - step) / step < 0.08}
                onClick={() => setRate(step)}
              >
                {warpLabel(step)}
              </button>
            ))}
          </div>
          <div className="chip-row">
            <span>Camera</span>
            {FLIGHT_CAMS.map((mode) => (
              <button
                key={mode}
                type="button"
                className="hud-chip"
                aria-pressed={camera === mode}
                onClick={() => setCamera(mode)}
              >
                {mode === 'cockpit' ? 'Nose' : mode === 'free' ? 'Wide' : mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <div className="chip-row">
            <button type="button" className="hud-chip" aria-pressed={paused} onClick={() => {
              const next = !paused
              manualHold.current = next
              setPaused(next)
            }}>{paused ? 'Run' : 'Hold'}</button>
            <button type="button" className="hud-chip" aria-pressed={engines} onClick={() => queueCommand(() => setEngines((value) => !value))}>Engines</button>
            <Mix />
          </div>
        </div>
        <aside className="ascent-fuel">
          <em>Fuel</em>
          <div className="fuel-track" aria-label="Fuel remaining">
            <i style={{ height: `${fuelPct}%` }} />
          </div>
          <b>{fuelPct}%</b>
          <span>{numbers.fuel} kg</span>
          <span>Throttle {Math.round(throttle * 100)}%</span>
        </aside>
        {hudOn && details && (
          <aside className="ascent-side left cruise-details">
            <span>Q {numbers.q} Pa</span>
            <span>Accel {numbers.accel} m/s²</span>
            <span>Propellant {numbers.fuel} kg</span>
            <span>Mass {numbers.mass} kg</span>
            <span>Δv {numbers.dv} m/s</span>
            <span>Apo {numbers.apo}</span>
            <span>Peri {numbers.peri}</span>
            <span>Earth {earthRange}</span>
            <span>{mission.destination} {destRange}</span>
            <span>Light {numbers.delay}</span>
            {intercept && (
              <>
                <span>{intercept.inSoi ? 'Captured' : 'Transfer coast'}</span>
                <span>Rel {(intercept.relativeSpeedMps / 1000).toFixed(2)} km/s</span>
              </>
            )}
            <div className="throttle">
              <Flame size={14} />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={throttle}
                aria-label="Throttle"
                onChange={(event) => {
                  const value = Number(event.target.value)
                  throttleRef.current = value
                  setThrottle(value)
                }}
              />
            </div>
            <div className="group">
              <button type="button" aria-label={paused ? 'Run' : 'Hold'} aria-pressed={paused} onClick={() => {
                const next = !paused
                manualHold.current = next
                setPaused(next)
              }}>
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button type="button" aria-label="Engines" aria-pressed={engines} onClick={() => setEngines((value) => !value)}>
                <Power size={16} />
              </button>
              <button type="button" aria-label="Stability" aria-pressed={stable} onClick={() => setStable((value) => !value)}>
                <Lock size={16} />
              </button>
              <button type="button" aria-label="Bindings" aria-pressed={bindsOpen} onClick={() => { setBindsOpen((value) => !value); setCapture(null) }}>
                <Settings size={16} />
              </button>
              <button type="button" aria-label="Timeline" aria-pressed={timeline} onClick={() => setTimeline((value) => !value)}>
                <RotateCcw size={16} />
              </button>
              <button type="button" aria-label="Center" onClick={() => go('pad')}>
                <House size={16} />
              </button>
            </div>
            <Mix />
          </aside>
        )}
        <div className="ascent-read">
          <div><span>Time</span><b>T+ {clock(sim.tSec)}</b></div>
          <div><span>Range</span><b>{destRange}</b></div>
          <div><span>Earth delay</span><b>{numbers.delay}</b></div>
        </div>
        <div className="ascent-call">
          {lagNote || cruiseCall}
          {difficulty === 'commander' && <small> Light-time lag is on. {EDU_LIMITS}</small>}
        </div>
        <button type="button" className="ascent-details" aria-pressed={details} onClick={() => setDetails((on) => !on)}>
          Details {details ? 'On' : 'Off'}
        </button>
        {hudOn && (
          <NodeBar
            sim={sim}
            missionId={mission.id}
            destAu={mission.destinationAu}
            massKg={massNow}
            thrustN={engine?.thrustN ?? 0}
            ispS={engine?.ispS ?? 0}
          />
        )}
        {done && (
          <button type="button" className="deck-go" aria-label={sim.failed ? 'Debrief' : 'Entry'} onClick={() => (sim.failed ? finish() : go('landing'))}>
            {sim.failed ? <House size={18} /> : <Rocket size={18} />}
          </button>
        )}
        {(sim.distanceFraction > 0.88 || (done && !sim.failed) || arrivalReady) && !sim.failed && !sim.decision && (
          <div className="deck-choice arrival-card">
            <strong>Landing site</strong>
            <div>
              {sitesFor(mission.id === 'custom' ? 'mars' : mission.id).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  aria-pressed={(plan.siteId ?? sitesFor(mission.id === 'custom' ? 'mars' : mission.id)[0]?.id) === row.id}
                  title={row.note}
                  onClick={() => setPlan({ siteId: row.id })}
                >
                  {row.name}
                </button>
              ))}
              <button type="button" className="word fill" onClick={initiateLanding}>
                Enter at {siteOf(mission, plan).name}
              </button>
            </div>
          </div>
        )}
        {timeline && (
          <div className="deck-bind">
            {[...checkpoints].reverse().map((mark) => (
              <div key={mark.id}>
                <button type="button" aria-pressed={pending === mark.id} onClick={() => setPending(mark.id)}>
                  <RotateCcw size={14} />
                  <kbd>{clock(mark.tSec)} {mark.label} · {Math.round(mark.sim.propellant.chemical + mark.sim.propellant.electric + mark.sim.propellant['cold-gas'])} kg</kbd>
                </button>
                {pending === mark.id && (
                  <>
                    <button type="button" onClick={() => { restoreCheckpoint(mark.id); setTimeline(false); setPending(null) }}>
                      <Play size={14} />
                    </button>
                    <button type="button" onClick={() => setPending(null)}>
                      <EyeOff size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {sim.burning && Math.abs(sim.pointingRad) > 0.55 && !sim.decision && (
          <div className="deck-choice">
            <strong>Off the departure</strong>
            <div>
              <span>The nose left the burn. Thrust is missing the path.</span>
              <button type="button" onClick={() => {
                worldRef.current?.level()
                const mark = checkpoints[checkpoints.length - 1]
                if (mark) restoreCheckpoint(mark.id)
              }}>
                <RotateCcw size={14} />
                Rewind
              </button>
            </div>
          </div>
        )}
        {sim.extraArrivalDv > 0 && !sim.decision && (
          <div className="deck-choice">
            <strong>Drift accepted</strong>
            <div><span>Capture now needs an extra {Math.round(sim.extraArrivalDv)} m/s. Science is reduced.</span></div>
          </div>
        )}
        {sim.decision && (
          <div className="deck-choice">
            <strong title={sim.decision.detail}>{sim.decision.title}</strong>
            <div>
              {sim.decision.options.map((option, index) => (
                <button key={option.id} type="button" title={option.detail} onClick={() => queueCommand(() => decide(option.id))}>
                  <em>{index + 1}</em>
                  <span>{option.label}<small>{option.detail}</small></span>
                </button>
              ))}
            </div>
          </div>
        )}
        {guide && !done && (
          <div className="deck-guide">
            {(['pitchUp', 'throttleUp', 'engine', 'stable', 'level', 'rewind', 'cameras', 'pause'] as FlightAction[]).map((action) => {
              const Icon = BIND_ICON[action]
              return (
                <span key={action} title={action}>
                  <Icon size={14} />
                  <kbd>{keyLabel(binds[action])}</kbd>
                </span>
              )
            })}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                localStorage.setItem(STORAGE_FLIGHT_GUIDE, '1')
                setGuide(false)
              }}
            >
              <EyeOff size={14} />
            </button>
          </div>
        )}
        {bindsOpen && (
          <div className="deck-bind">
            {FLIGHT_ACTIONS.map((action) => {
              const Icon = BIND_ICON[action]
              return (
                <button key={action} type="button" aria-pressed={capture === action} onClick={() => setCapture(action)}>
                  <Icon size={14} />
                  <kbd>{keyLabel(binds[action])}</kbd>
                </button>
              )
            })}
          </div>
        )}
        {sim.failed && (
          <div className="result-overlay is-lose" role="alertdialog">
            <b>You lost</b>
            <p>{sim.failReason || 'The transfer stopped before arrival.'}</p>
            <p className="muted">{EDU_LIMITS}</p>
            <div className="result-actions">
              <button type="button" className="word fill" onClick={() => finish()}>See result</button>
            </div>
          </div>
        )}
        {transitioning && (
          <div className="entry-transition-overlay" role="status" aria-live="polite">
            <div className="entry-kicker">Entry</div>
            <h2>{mission.destination}</h2>
            <p>De-orbit burn complete. Educational limits, not NASA specifications.</p>
            <div className="entry-progress"><i /></div>
          </div>
        )}
      </div>
    </div>
  )
}

function etaLine(sim: SimState, warp: number): string {
  let left = 0
  sim.script.forEach((item, index) => {
    if (index < sim.index) return
    const spent = index === sim.index ? sim.segmentElapsed : 0
    if (item.type === 'coast' || item.type === 'science') left += Math.max(0, item.sec - spent)
    else if (item.type === 'burn') left += Math.max(30, item.windowSec * 0.4 - spent)
  })
  const real = left / Math.max(1, warp)
  return `${spanTime(left)} of flight left · ${spanTime(real)} on the clock at ${warpLabel(warp)}`
}

function spanTime(sec: number): string {
  const whole = Math.max(0, Math.round(sec))
  const days = Math.floor(whole / 86400)
  const hours = Math.floor((whole % 86400) / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = whole % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  return `${seconds}s`
}

function clock(sec: number): string {
  const days = Math.floor(sec / 86400)
  const hours = Math.floor((sec % 86400) / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  const seconds = Math.floor(sec % 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function instruments(
  sim: SimState,
  craft: SpacecraftConfig,
  massKg: number,
  propellantKg: number,
  dvBudget: number,
  attitude: { pitch: number; yaw: number; roll: number },
  throttle: number,
  engines: boolean,
  missionId: string,
  destAu: number,
  ascentFuelFrac = 1,
) {
  const track = transferState(missionId, destAu, sim.distanceFraction, sim.tSec)
  const lunar = missionId === 'lunar'
  const frame = lunar ? 'relative to Earth' : 'heliocentric'
  const kmh = Math.round(track.speed * 3.6)
  const prop = sim.propellant.chemical + sim.propellant.electric + sim.propellant['cold-gas']
  const fitted = craft.parts.reduce((sum, part) => {
    if (!part.enabled) return sum
    const spec = getSpec(part.specId)
    if (!spec?.feedsMainEngine) return sum
    return sum + spec.thrustN
  }, 0)
  const thrust = engines && sim.burning ? fitted * throttle : 0
  const tank = Math.max(propellantKg, 1)
  const cruiseRatio = Math.min(1, Math.max(0, prop / tank))
  const launchFrac = Math.min(1, Math.max(0.02, ascentFuelFrac))
  const accel = massKg > 0 ? thrust / massKg : 0
  const delay = track.lightSec >= 90 ? `${(track.lightSec / 60).toFixed(1)}m` : `${track.lightSec.toFixed(0)}s`
  return {
    speed: `${(track.speed / 1000).toFixed(2)} km/s`,
    speedMs: track.speed,
    speedTitle: `${frame} speed at this point on the transfer. ${Math.round(track.speed).toLocaleString()} m/s, ${kmh.toLocaleString()} km/h. Not an average, and not miles.`,
    frame,
    vertical: `${(track.radial / 1000).toFixed(2)} km/s`,
    horizontal: `${(track.horizontal / 1000).toFixed(2)} km/s`,
    altitude: span(track.altitudeM),
    apo: span(track.apoM),
    peri: span(track.periM),
    aoa: `${(Math.hypot(attitude.pitch, attitude.yaw) * 180 / Math.PI).toFixed(1)}°`,
    accel: accel.toFixed(2),
    q: track.qPa >= 1000 ? `${(track.qPa / 1000).toFixed(1)}` : track.qPa.toFixed(0),
    fuel: `${prop.toFixed(0)}`,
    fuelRatio: Math.min(1, cruiseRatio * launchFrac),
    mass: `${Math.round(massKg)}`,
    power: `${Math.round(sim.powerGenW - sim.powerLoadW)}`,
    dv: `${Math.max(0, Math.round(dvBudget - sim.dvUsedMps))}`,
    engine: !engines ? 'off' : sim.burning && throttle >= 0.12 ? 'lit' : 'idle',
    nav: `${sim.commsMarginDb.toFixed(0)}`,
    delay,
    temp: `${Math.round(sim.temperatureK)}`,
    approach: `${(track.speed / 1000).toFixed(2)} km/s · ${span(track.altitudeM)}`,
    rangeDestM: track.rangeDestM,
    rangeEarthM: track.rangeEarthM,
  }
}

function mainEngine(craft: SpacecraftConfig): { thrustN: number; ispS: number } | null {
  let best: { thrustN: number; ispS: number } | null = null
  for (const part of craft.parts) {
    if (!part.enabled) continue
    const spec = getSpec(part.specId)
    if (!spec?.feedsMainEngine || !(spec.thrustN > 0)) continue
    if (!best || spec.thrustN > best.thrustN) best = { thrustN: spec.thrustN, ispS: spec.ispS }
  }
  return best
}

function upcomingBurn(sim: SimState): Extract<ScriptItem, { type: 'burn' }> | null {
  const item = sim.script.slice(sim.index).find((entry) => entry.type === 'burn')
  return item && item.type === 'burn' ? item : null
}

function NodeBar({
  sim,
  missionId,
  destAu,
  massKg,
  thrustN,
  ispS,
}: {
  sim: SimState
  missionId: string
  destAu: number
  massKg: number
  thrustN: number
  ispS: number
}) {
  const setNode = useMission((state) => state.setNode)
  const burn = upcomingBurn(sim)
  if (!burn || sim.status === 'complete' || sim.status === 'failed') return null
  const armed = sim.node && sim.node.burnId === burn.id ? sim.node : null
  const axes: ManoeuvreNode = armed ?? { burnId: burn.id, prograde: burn.dv, radial: 0, normal: 0 }
  const picture = cruiseOrbit(missionId, destAu, sim.distanceFraction, sim.tSec, axes)
  const seconds = burnSeconds(ispS, thrustN, massKg, nodeMagnitude(axes))
  const nudge = (axis: 'prograde' | 'radial' | 'normal', delta: number) => {
    setNode({ ...axes, burnId: burn.id, [axis]: Math.round(axes[axis] + delta) })
  }
  const predicted = picture?.predicted
  return (
    <div className="node-bar" aria-label="Manoeuvre node">
      <b>{armed ? 'Armed' : 'Planned'} · {burn.label}</b>
      <Axis label="Prograde" value={axes.prograde} step={50} onStep={(delta) => nudge('prograde', delta)} />
      <Axis label="Radial" value={axes.radial} step={25} onStep={(delta) => nudge('radial', delta)} />
      <Axis label="Normal" value={axes.normal} step={25} onStep={(delta) => nudge('normal', delta)} />
      <button type="button" onClick={() => setNode(null)}>Reset</button>
      {predicted && (
        <span title="Elements if this burn is made at the current point">
          Apo {span(predicted.apoM)} · Peri {span(predicted.periM)} · i {(predicted.incRad * 180 / Math.PI).toFixed(2)}°
          {Number.isFinite(predicted.periodSec) ? ` · ${(predicted.periodSec / 86400).toFixed(1)} d` : ' · escape'}
          {seconds !== null ? ` · burn ${(seconds / 60).toFixed(0)} min` : ''}
        </span>
      )}
    </div>
  )
}

function Axis({ label, value, step, onStep }: { label: string; value: number; step: number; onStep: (delta: number) => void }) {
  return (
    <span className="node-axis">
      <button type="button" aria-label={`${label} down`} onClick={() => onStep(-step)}>-</button>
      <em title={label}>{label.slice(0, 3)} {Math.round(value)}</em>
      <button type="button" aria-label={`${label} up`} onClick={() => onStep(step)}>+</button>
    </span>
  )
}

function span(metres: number): string {
  if (!Number.isFinite(metres)) return 'escape'
  const size = Math.abs(metres)
  if (size >= AU_M * 0.05) return `${(metres / AU_M).toFixed(2)}`
  if (size >= 100_000) return `${Math.round(metres / 1000)}`
  if (size >= 1000) return `${(metres / 1000).toFixed(1)}`
  return `${Math.round(metres)}`
}

function rangeText(metres: number): string {
  if (!Number.isFinite(metres)) return '—'
  const size = Math.abs(metres)
  if (size >= AU_M * 0.05) return `${(metres / AU_M).toFixed(2)} AU`
  if (size >= 100_000) return `${Math.round(metres / 1000).toLocaleString()} km`
  if (size >= 1000) return `${(metres / 1000).toFixed(1)} km`
  return `${Math.round(metres)} m`
}
