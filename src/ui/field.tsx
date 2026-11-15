import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { fieldSamples, siteOf } from '../domain/campaign'
import type { CampPhase, CampSave } from '../domain/save'
import { getSpec } from '../domain/catalog'
import { landingThrustN } from '../domain/dynamics'
import { massBudget } from '../domain/mass'
import type { SpacecraftConfig } from '../domain/types'
import { DescentWorld, type DescentBody, type DescentReadout } from '../render/descentWorld'
import { SurfaceWorld, type SurfaceHint, type SurfaceReadout } from '../render/surfaceWorld'
import { MARS_LANDING } from '../render/marsGround'
import { useActiveMission, useMission } from '../store/useMission'
import { setBed, setScoreBoost, sting } from './audio'
import { say } from './voice'
import { Mix } from './mix'
import { createFieldTone } from './tone'
import {
  PixelArrowRightIcon,
  PixelBuildingIcon,
  PixelCheckIcon,
  PixelRadioTowerIcon,
  PixelRocketIcon,
  PixelTrophyIcon,
} from './pixelIcons'

function descentBody(missionId: string, craft: SpacecraftConfig, limitKg: number, propellantKg: number): DescentBody {
  const mars = missionId === 'mars' || missionId === 'custom'
  const gravity = missionId === 'lunar' ? 1.62 : missionId === 'europa' ? 1.31 : missionId === 'asteroid' ? 0.05 : 3.71
  const parts = craft.parts.map((part) => {
    const spec = getSpec(part.specId)
    return {
      enabled: part.enabled,
      specId: part.specId,
      thrustN: spec?.thrustN ?? 0,
      propellant: spec?.propellant ?? 'none',
      feedsMainEngine: spec?.feedsMainEngine ?? false,
    }
  })
  return {
    massKg: Math.max(80, massBudget(craft, getSpec, limitKg).totalKg),
    gravity,
    surfaceRho: mars ? 0.02 : 0,
    scaleHeightM: 11_100,
    thrustN: landingThrustN(parts),
    chute: craft.parts.some((part) => part.enabled && part.specId === 'chute'),
    shield: craft.parts.some((part) => part.enabled && part.specId === 'heatshield'),
    legs: craft.parts.some((part) => part.enabled && part.specId === 'legs'),
    propellantKg,
  }
}

export function LandingScreen() {
  const mission = useActiveMission()
  const craft = useMission((state) => state.craft)
  const plan = useMission((state) => state.plan)
  const go = useMission((state) => state.go)
  const finish = useMission((state) => state.finish)
  const bankSurface = useMission((state) => state.bankSurface)
  const mount = useRef<HTMLDivElement>(null)
  const worldRef = useRef<DescentWorld | null>(null)
  const [hud, setHud] = useState<DescentReadout | null>(null)
  const [pace, setPace] = useState(50)
  const [result, setResult] = useState<'down' | 'hard' | 'crash' | null>(null)
  const [armRewind, setArmRewind] = useState(false)
  const [showConfirmed, setShowConfirmed] = useState(false)
  const settled = useRef<'down' | 'hard' | 'crash' | null>(null)
  const handed = useRef(false)
  const confirmUntil = useRef(0)
  const handoff = useRef(0)

  useEffect(() => {
    const host = mount.current
    if (!host || !mission || !craft || !plan) return undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'field-canvas'
    host.insertBefore(canvas, host.firstChild)
    const site = siteOf(mission, plan)
    const live = useMission.getState().sim
    const propellant = (live?.propellant.chemical ?? 0) + (live?.propellant['cold-gas'] ?? 0)
    const difficultySetting = useMission.getState().difficulty
    const diffMult = difficultySetting === 'commander' ? 1.4 : difficultySetting === 'cadet' ? 0.6 : 1.0
    const scaledDiff = Math.max(0.1, Math.min(1.0, site.difficulty * diffMult))
    const world = new DescentWorld(canvas, craft, descentBody(mission.id, craft, mission.maxMassKg, Math.max(propellant, 180)), scaledDiff, mission.id, site.id)
    const savedEntry = useMission.getState().descent
    if (savedEntry) world.restore(savedEntry)
    worldRef.current = world
    world.setPace(50)
    world.resize()
    let frame = 0
    let last = performance.now()
    const heat = { current: 0 }
    const offset = { current: 0 }
    let warned = ''
    let said = ''
    let saveTick = 0
    setScoreBoost(true)
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const readout = world.step(dt)
      if (readout.phase !== 'fly') settled.current = readout.phase
      heat.current = readout.heat
      offset.current = readout.offset
      saveTick += dt
      if (readout.phase === 'fly' && saveTick > 1) {
        saveTick = 0
        useMission.getState().noteDescent(world.snapshot())
      }
      const flags = [readout.warnSink, readout.warnSide, readout.warnFuel, readout.warnHeat, readout.warnOffset].map((flag) => (flag ? '1' : '0')).join('')
      if (flags.includes('1') && flags !== warned) sting('warn', useMission.getState().audio)
      warned = flags
      if (readout.prompt && readout.prompt !== said) {
        said = readout.prompt
        say(readout.prompt, useMission.getState().audio)
      }
      if ((readout.phase === 'down' || readout.phase === 'hard') && confirmUntil.current === 0) {
        confirmUntil.current = performance.now() + 5000
        setShowConfirmed(true)
      }
      if (confirmUntil.current && performance.now() > confirmUntil.current) setShowConfirmed(false)
      if (!handed.current && readout.phase !== 'fly') {
        handed.current = true
        setResult(readout.phase)
      }
      setHud((prev) => (prev && prev.prompt === readout.prompt && Math.abs(prev.altitude - readout.altitude) < 8 && prev.phase === readout.phase && prev.warnSink === readout.warnSink && prev.warnSide === readout.warnSide && prev.warnFuel === readout.warnFuel && prev.warnHeat === readout.warnHeat && prev.warnOffset === readout.warnOffset && prev.assist === readout.assist ? prev : readout))
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (event.repeat || (key !== 'e' && key !== 'f') || !settled.current) return
      const siteName = siteOf(mission, plan).name
      if (settled.current === 'down' || settled.current === 'hard') {
        const hard = settled.current === 'hard'
        useMission.getState().noteTouchdown(hard ? 'hard' : 'soft', heat.current, offset.current)
        bankSurface(hard ? -12 : 8, `${siteName}: ${hard ? 'hard touchdown, gear held' : 'soft touchdown'}.`)
        go('surface')
      } else {
        bankSurface(0, `${siteName}: the landing was too hard. Sink, side speed, or heat ended it.`)
        finish()
      }
    }
    window.addEventListener('keydown', onKey)
    const observer = new ResizeObserver(() => world.resize())
    observer.observe(host)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(handoff.current)
      observer.disconnect()
      window.removeEventListener('keydown', onKey)
      world.dispose()
      setScoreBoost(false)
      worldRef.current = null
      canvas.remove()
    }
  }, [mission, craft, plan, bankSurface, finish, go])

  return (
    <div className="field-stage" ref={mount}>
      <div className="deck">
        <div className="deck-top">
          <div className="group">
            <button type="button" aria-pressed={hud?.view === 'chase'} onClick={() => worldRef.current?.setCamera('chase')}>Chase</button>
            <button type="button" aria-pressed={hud?.view === 'side'} onClick={() => worldRef.current?.setCamera('side')}>Side</button>
            <button type="button" aria-pressed={hud?.view === 'ground'} onClick={() => worldRef.current?.setCamera('ground')}>Ground</button>
          </div>
          <div className="group">
            {([1, 4, 16, 50] as const).map((rate) => (
              <button key={rate} type="button" aria-pressed={pace === rate} onClick={() => { setPace(rate); worldRef.current?.setPace(rate) }}>{rate}×</button>
            ))}
          </div>
          <Mix />
        </div>
      </div>
      <div className="field-hud landing-hud">
        <span>{hud ? `${Math.round(hud.altitude)} m · ${hud.sink.toFixed(1)} ↓ · ${hud.lateral.toFixed(1)} → · ${Math.abs(hud.offset).toFixed(0)} m off` : 'Entry'}</span>
        <span>{hud ? `${Math.round(hud.throttle * 100)}% · ${hud.fuel.toFixed(0)} kg · heat ${(hud.heat * 100).toFixed(0)}` : ''}</span>
        <span className="lamps">
          <i className={hud?.warnSink ? 'off' : 'lit'} title="Sink rate" />
          <i className={hud?.warnSide ? 'off' : 'lit'} title="Side speed" />
          <i className={hud?.warnFuel ? 'off' : 'lit'} title="Fuel" />
          <i className={hud?.warnHeat ? 'off' : 'lit'} title="Heat" />
          <i className={hud?.warnOffset ? 'off' : 'lit'} title="Offset" />
          <i className={hud?.assist ? 'idle' : 'off'} title="Guidance" />
        </span>
        <em>{hud?.prompt ?? 'Flying the entry.'}</em>
        {hud?.choice && !result && (
          <div className="edl-choice" role="group" aria-label="Landing trajectory">
            <button type="button" className="word" onClick={() => worldRef.current?.choose('divert')}>Divert to clear ground</button>
            <button type="button" className="word" onClick={() => worldRef.current?.choose('hold')}>Hold the target</button>
          </div>
        )}
        <div className="edl-actions">
          <Mix />
          <button type="button" className="word slim" onClick={() => {
            if (!armRewind) {
              setArmRewind(true)
              return
            }
            worldRef.current?.rewind()
            useMission.getState().noteRewind()
            setArmRewind(false)
          }}>{armRewind ? 'Restore' : 'Rewind'}</button>
          {armRewind && <button type="button" className="word slim" onClick={() => setArmRewind(false)}>Cancel</button>}
        </div>
        {showConfirmed && !result && (
          <div className="landing-confirmed" role="status">
            <b>Landing confirmed</b>
            <span>Surface operations initialized</span>
          </div>
        )}
        {result && (
          <div className={`result-overlay ${result === 'crash' ? 'is-lose' : 'is-win'}`} role="alertdialog">
            <b>{result === 'crash' ? 'You lost' : 'You landed'}</b>
            <p>{hud?.prompt ?? (result === 'crash' ? 'The landing was too hard.' : 'The gear is down.')}</p>
            <p className="muted">Educational limits, not NASA specifications.</p>
            <div className="result-actions">
              {result === 'crash' ? (
                <button type="button" className="word fill" onClick={() => finish()}>See result</button>
              ) : (
                <>
                  <button type="button" className="word fill" onClick={() => {
                    useMission.getState().noteTouchdown(result === 'hard' ? 'hard' : 'soft', hud?.heat ?? 0, hud?.offset ?? 0)
                    bankSurface(result === 'hard' ? -12 : 8, hud?.prompt ?? 'Touchdown')
                    go('surface')
                  }}>Walk the surface</button>
                  <button type="button" className="word slim" onClick={() => {
                    useMission.getState().noteTouchdown(result === 'hard' ? 'hard' : 'soft', hud?.heat ?? 0, hud?.offset ?? 0)
                    bankSurface(result === 'hard' ? -12 : 8, hud?.prompt ?? 'Touchdown')
                    finish()
                  }}>See score</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function SurfaceScreen() {
  const mission = useActiveMission()
  const craft = useMission((state) => state.craft)
  const plan = useMission((state) => state.plan)
  const finish = useMission((state) => state.finish)
  const bankSurface = useMission((state) => state.bankSurface)
  const mount = useRef<HTMLDivElement>(null)
  const worldRef = useRef<SurfaceWorld | null>(null)
  const [hud, setHud] = useState<SurfaceReadout | null>(null)
  const marsSurface = mission?.id === 'mars' || mission?.id === 'custom'
  const [camp, setCamp] = useState<CampSave>(() => readCamp())
  const [moreHud, setMoreHud] = useState(false)
  const [returnWarning, setReturnWarning] = useState<string | null>(null)
  const campRef = useRef(camp)
  campRef.current = camp

  const totalSamples = hud?.total ?? 5
  const samplesFound = hud?.found ?? 0
  const samplesComplete = Boolean(hud && samplesFound >= totalSamples)
  const allSamplesSent = Boolean(samplesComplete && (hud?.sent ?? 0) >= totalSamples)
  const sampleSurveyAnnounced = useRef(false)
  const allSentAnnounced = useRef(false)

  useEffect(() => {
    if (samplesComplete && !allSamplesSent && !sampleSurveyAnnounced.current) {
      sampleSurveyAnnounced.current = true
      sting('radio', useMission.getState().audio)
      say('All surface samples collected. Transmit science telemetry to Earth.', useMission.getState().audio)
    }
    if (allSamplesSent && !allSentAnnounced.current) {
      allSentAnnounced.current = true
      sting('radio', useMission.getState().audio)
      say('All science findings transmitted to Earth. Outpost colonization authorized.', useMission.getState().audio)
    }
  }, [samplesComplete, allSamplesSent])

  useEffect(() => {
    if (!returnWarning) return undefined
    const timer = window.setTimeout(() => setReturnWarning(null), 6000)
    return () => window.clearTimeout(timer)
  }, [returnWarning])

  useEffect(() => {
    const host = mount.current
    if (!host || !mission || !craft || !plan) return undefined
    const site = siteOf(mission, plan)
    const canvas = document.createElement('canvas')
    canvas.className = 'field-canvas'
    host.insertBefore(canvas, host.firstChild)
    const enabled = craft.parts.filter((part) => part.enabled)
    const rover = enabled.find((part) => getSpec(part.specId)?.instrument === 'rover')
    const instruments = enabled.map((part) => getSpec(part.specId)?.instrument).filter((name): name is string => Boolean(name))
    const difficultySetting = useMission.getState().difficulty
    const diffMult = difficultySetting === 'commander' ? 1.4 : difficultySetting === 'cadet' ? 0.6 : 1.0
    const scaledDiff = Math.max(0.1, Math.min(1.0, site.difficulty * diffMult))
    const onMars = mission.id === 'mars' || mission.id === 'custom'
    const world = new SurfaceWorld(canvas, {
      missionId: mission.id,
      siteId: site.id,
      difficulty: scaledDiff,
      gravity: mission.id === 'lunar' ? 1.62 : mission.id === 'europa' ? 1.31 : mission.id === 'asteroid' ? 0.05 : 3.71,
      air: mission.id === 'mars' || mission.id === 'custom',
      steady: enabled.some((part) => getSpec(part.specId)?.powerScale === 'constant' && (getSpec(part.specId)?.powerGenW ?? 0) > 0),
      roverMassKg: rover ? (getSpec(rover.specId)?.massKg ?? 42) : (mission.id === 'mars' || mission.id === 'custom' ? 42 : null),
      heli: enabled.some((part) => getSpec(part.specId)?.instrument === 'helicopter'),
      craft,
      samples: fieldSamples(site, plan.objectiveId ?? 'water', onMars ? MARS_LANDING : [0, 0]),
      instruments,
      storageBits: Math.max(512e6, enabled.reduce((sum, part) => sum + (getSpec(part.specId)?.storageBits ?? 0), 0)),
      uplinkBps: Math.max(40_000, enabled.reduce((best, part) => Math.max(best, getSpec(part.specId)?.dataRateBps ?? 0), 0)),
      objectiveId: plan.objectiveId ?? 'water',
      damaged: useMission.getState().touchdown?.grade === 'hard',
      entryFault: (useMission.getState().touchdown?.heat ?? 0) > 0.72,
      resume: useMission.getState().field ?? undefined,
    })
    worldRef.current = world
    world.setCamp(campRef.current.pieces)
    world.resize()
    const tone = createFieldTone()
    let frame = 0
    let last = performance.now()
    let hudTick = 0
    let saveTick = 0
    let heard = ''
    let said = ''
    let lastToast = ''
    setScoreBoost(false)
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const readout = world.step(dt)
      const sound = useMission.getState().audio
      if (readout.mode === 'drive') {
        tone.drive(readout.speed, sound)
        setScoreBoost(false)
        setBed(0.012 + readout.dust * 0.03, sound)
      } else {
        // EVA astronaut walking: silence rover motor sound; boost interstellar score in near-vacuum atmosphere
        tone.drive(0, false)
        setScoreBoost(true)
        setBed(0, false)
      }
      if (readout.cue && readout.cue !== heard) {
        heard = readout.cue
        const alarm = readout.cue === 'blackout' || readout.cue === 'storm'
        if (alarm) sting('warn', sound)
        else tone.blip(readout.cue === 'send' ? 880 : 640, sound)
      }
      if (!readout.cue) heard = ''
      if (readout.prompt && readout.prompt !== said && readout.prompt.length > 16) {
        said = readout.prompt
        say(readout.prompt, sound)
      }
      saveTick += dt
      if (saveTick > 2) {
        saveTick = 0
        useMission.getState().noteField({ ...world.snapshot(), camp: campRef.current })
      }
      hudTick += dt
      if (hudTick > 0.15 || readout.toast !== lastToast) {
        lastToast = readout.toast
        hudTick = 0
        setHud(readout)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    const observer = new ResizeObserver(() => world.resize())
    observer.observe(host)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      useMission.getState().noteField({ ...world.snapshot(), camp: campRef.current })
      world.dispose()
      tone.stop()
      setBed(0, false)
      worldRef.current = null
      canvas.remove()
    }
  }, [mission, craft, plan])

  useEffect(() => {
    worldRef.current?.setCamp(camp.pieces)
  }, [camp.pieces])

  const tryFileReturn = () => {
    if (!hud) return
    const total = hud.total ?? 5
    const found = hud.found ?? 0

    // 1. Check samples
    if (found < total) {
      const msg = `Mission Incomplete: Collect all ${total} geological samples first (${found}/${total} secured).`
      setReturnWarning(msg)
      sting('warn', useMission.getState().audio)
      say('Sample collection incomplete. Mission finish blocked.', useMission.getState().audio)
      return
    }

    // 1b. Check sample telemetry transmission
    const sent = hud.sent ?? 0
    if (sent < total) {
      const msg = `Telemetry Pending: Transmit all ${total} collected samples to Earth first (${sent}/${total} sent). Click 'Send [T]'.`
      setReturnWarning(msg)
      sting('warn', useMission.getState().audio)
      say('Sample telemetry unsent. Transmit findings to Earth before finishing mission.', useMission.getState().audio)
      return
    }

    setReturnWarning(null)
    const filed = worldRef.current?.report()
    if (!filed) return
    const snap = worldRef.current?.snapshot()
    if (snap) useMission.getState().noteField({ ...snap, camp: campRef.current })
    const colonizeBonus = marsSurface ? (camp.phase === 'report' ? 50 : camp.pieces.length > 2 ? 35 : camp.pieces.length > 0 ? 20 : 0) : 0
    bankSurface(
      filed.points + colonizeBonus,
      `${filed.note}${colonizeBonus > 0 ? ` Mars Outpost commissioned (+${colonizeBonus} bonus pts).` : ''}`,
      filed.bits
    )
    finish()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key !== 'Enter' && event.key.toLowerCase() !== 'y') return
      event.preventDefault()
      tryFileReturn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tryFileReturn])

  const world = worldRef.current
  const sky = hud?.sky ?? 'Clear'
  const livePrompt = hud?.prompt && !/^(WASD |Parked\.|On the surface\.|On Jezero)/.test(hud.prompt)
    ? hud.prompt
    : ''

  return (
    <div className={`field-stage${sky === 'Dust' ? ' is-dust' : sky === 'Flare' ? ' is-flare' : ''}`} ref={mount}>
      {hud?.mode === 'eva' && <div className="crosshair" />}
      {hud?.hint && <HuntArrow hint={hud.hint} />}
      {hud?.toast && <div className="field-toast" role="status">{hud.toast}</div>}
      <div className="deck">
        {marsSurface && moreHud && (
          <CampBar
            camp={camp}
            onChange={(next) => setCamp(next)}
          />
        )}
        <div className="deck-top surface-top">
          <div className="hunt-card">
            <div className="hunt-head">
              <span className={`hunt-phase-badge${samplesComplete ? ' is-complete' : ''}`}>
                {allSamplesSent ? (
                  <>
                    <PixelCheckIcon size={12} /> Science Downlinked
                  </>
                ) : samplesComplete ? (
                  <>
                    <PixelCheckIcon size={12} /> Phase 1 Secured
                  </>
                ) : (
                  'Phase 1: Reconnaissance'
                )}
              </span>
              <span className="hunt-sol-pill">Sol {hud?.sol ?? 1}</span>
            </div>
            <strong>Collect {totalSamples} Samples</strong>
            <div className="hunt-progress-bar" role="progressbar" aria-valuenow={samplesFound} aria-valuemin={0} aria-valuemax={totalSamples}>
              <div
                className={`hunt-progress-fill${samplesComplete ? ' is-complete' : ''}`}
                style={{ width: `${Math.min(100, Math.max(8, (samplesFound / Math.max(1, totalSamples)) * 100))}%` }}
              />
            </div>
            <div className="hunt-stats">
              <span><b>{samplesFound}</b> of <b>{totalSamples}</b> collected</span>
              <span>·</span>
              <span><b>{hud?.sent ?? 0}</b> sent to Earth</span>
            </div>
            {allSamplesSent ? (
              <div className="hunt-unlocked-note">
                <PixelRocketIcon size={14} />
                <span>Science downlinked! Start colonizing or head to lander.</span>
              </div>
            ) : samplesComplete ? (
              <div className="hunt-unlocked-note">
                <PixelRadioTowerIcon size={14} />
                <span>Samples secured! Click Send [T] to downlink to Earth.</span>
              </div>
            ) : (
              <em className="hunt-subtext">Follow compass marker · Press <kbd>E</kbd> to sample</em>
            )}
          </div>

          {livePrompt && <p className="deck-note">{livePrompt}</p>}
          {sky !== 'Clear' && (
            <div className={`hazard-chip sky-${sky.toLowerCase()}`}>
              <AlertTriangle size={13} />
              <span>
                {sky === 'Dust' && 'Dust storm active. Solar arrays degraded. Driving and walking crawl until storm clears.'}
                {sky === 'Flare' && 'Solar flare. Particle flux is high. Stay near the lander.'}
                {sky === 'Blackout' && 'Relay blackout. No line to Earth until the orbiter returns.'}
                {sky === 'Fault' && 'Transceiver glitch. Switching the redundant bus.'}
                {sky === 'Wheel' && 'Heavy regolith. Drivetrain drag is up.'}
              </span>
            </div>
          )}
          {hud?.crisis === 'power' && (
            <div className="group">
              <button type="button" className="word slim" onClick={() => {
                if (worldRef.current?.chooseCrisis('push') === 'dead') bankSurface(-50, 'Kept exploring under 15%. The rover froze.')
              }}>Keep exploring</button>
              <button type="button" className="word slim" onClick={() => worldRef.current?.chooseCrisis('sleep')}>Deep sleep</button>
            </div>
          )}
          {hud?.crisis === 'comm' && (
            <div className="group">
              <button type="button" className="word slim" onClick={() => worldRef.current?.chooseCrisis('blast')}>Transmit now</button>
              <button type="button" className="word slim" onClick={() => {
                if (worldRef.current?.chooseCrisis('wait') === 'relay') bankSurface(30, 'Waited for the orbiter. The relay took the data.')
              }}>Wait for the orbiter</button>
            </div>
          )}
        </div>
        <div className="deck-bottom">
          <div className="cluster">
            <Read label="Speed" value={hud ? hud.speed.toFixed(1) : '0'} />
            <Read label="Battery" value={hud ? `${Math.round(hud.energy)}%` : '0'} />
            <Read label="Radio" value={hud ? (hud.link ? 'Open' : 'Dark') : '—'} />
          </div>
          <div className="group field-actions">
            {!allSamplesSent ? (
              <>
                <button type="button" className="act-sample" onClick={() => world?.sample()}>Sample <kbd>E</kbd></button>
                <div className="act-send-wrapper">
                  {samplesComplete && !allSamplesSent && (
                    <div className="send-guide-callout" role="tooltip">
                      <span className="send-guide-badge">
                        <PixelRadioTowerIcon size={12} /> Uplink Science
                      </span>
                      <strong>All Samples Collected!</strong>
                      <p>Click <b>Send [T]</b> to downlink findings to Earth.</p>
                    </div>
                  )}
                  <button
                    type="button"
                    className={`act-send${hud && hud.held > 0 ? ' is-ready' : ''}${samplesComplete && !allSamplesSent ? ' is-urgent-callout' : ''}`}
                    onClick={() => world?.transmit(true)}
                  >
                    Send <kbd>T</kbd>
                  </button>
                </div>
              </>
            ) : (
              <div className="field-actions-centered">
                {marsSurface && (
                  <button
                    type="button"
                    className={`act-colonize-btn${moreHud ? ' is-active' : ''}`}
                    onClick={() => {
                      setMoreHud((on) => !on)
                      if (camp.phase === 'landing') {
                        setCamp((c) => ({ ...c, phase: 'habitat' }))
                      }
                    }}
                  >
                    <PixelBuildingIcon size={15} />
                    <span>{camp.phase === 'landing' ? 'Start Colonizing Mars (Phase 2)' : moreHud ? 'Close Outpost Planner' : 'Open Outpost Planner'}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="act-return act-finish-game"
                  onClick={tryFileReturn}
                >
                  <PixelRocketIcon size={15} />
                  <span>Finish Game <kbd>Y</kbd></span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {returnWarning && (
        <div className="return-warning-banner" role="alert">
          <AlertTriangle size={18} />
          <span>{returnWarning}</span>
          <button type="button" onClick={() => setReturnWarning(null)}>Dismiss</button>
        </div>
      )}
      <div className="key-row field-keys">
        <span className="key-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>{hud?.mode === 'drive' ? 'Drive' : 'Walk'}</span></span>
        {hud?.hasRover && (
          <button
            type="button"
            className="key-hint key-btn-action"
            title="Press F or click to board/exit rover"
            onClick={() => world?.toggleEgress()}
          >
            <kbd>F</kbd>
            <span>{hud.mode === 'drive' ? 'Exit Rover' : 'Board Rover'}</span>
          </button>
        )}
        <span className="key-hint"><kbd>Click</kbd><span>Look</span></span>
      </div>
    </div>
  )
}

const CAMP_PHASES: [CampPhase, string][] = [
  ['landing', 'Landing'],
  ['habitat', 'Habitat'],
  ['life', 'Life support'],
  ['power', 'Power'],
  ['food', 'Food'],
  ['report', 'Commissioned'],
]

const NEXT_CAMP: Record<CampPhase, CampPhase> = {
  landing: 'habitat',
  habitat: 'life',
  life: 'power',
  power: 'food',
  food: 'report',
  survival: 'report',
  report: 'report',
}

function readCamp(): CampSave {
  const saved = useMission.getState().field?.camp
  if (!saved) return { phase: 'landing', pieces: [], sol: 0, air: 92, water: 80, food: 64, power: 48, storm: null }
  return saved
}

function hasPiece(camp: CampSave, id: string): boolean {
  return camp.pieces.includes(id)
}

function campReady(camp: CampSave): boolean {
  switch (camp.phase) {
    case 'landing': return true
    case 'habitat': return hasPiece(camp, 'habitat-plain') || hasPiece(camp, 'habitat-ridge')
    case 'life': return hasPiece(camp, 'life') && hasPiece(camp, 'water')
    case 'power': return camp.pieces.some((id) => id.startsWith('solar-') || id === 'fission')
    case 'food': return hasPiece(camp, 'food-stored') || hasPiece(camp, 'greenhouse') || hasPiece(camp, 'greenhouse-hybrid')
    case 'survival': return true
    case 'report': return true
  }
}

function putPiece(camp: CampSave, id: string, on: boolean): CampSave {
  const pieces = camp.pieces.filter((item) => item !== id)
  if (on) pieces.push(id)
  return { ...camp, pieces }
}

function pickHabitat(camp: CampSave, id: 'habitat-plain' | 'habitat-ridge'): CampSave {
  const pieces = camp.pieces.filter((item) => item !== 'habitat-plain' && item !== 'habitat-ridge')
  pieces.push(id)
  return { ...camp, pieces }
}

function addArray(camp: CampSave): CampSave {
  const count = camp.pieces.filter((id) => id.startsWith('solar-')).length
  if (count >= 4) return camp
  return putPiece(camp, `solar-${count}`, true)
}

function CampBar({
  camp,
  onChange,
}: {
  camp: CampSave
  onChange: (next: CampSave) => void
}) {
  const isReady = campReady(camp)
  const canAdvance = isReady && camp.phase !== 'report' && camp.phase !== 'landing'

  const handleNextPhase = () => {
    const nextPhase = NEXT_CAMP[camp.phase]
    const pieces = nextPhase === 'life' && !camp.pieces.includes('marker') ? [...camp.pieces, 'marker'] : camp.pieces
    onChange({ ...camp, phase: nextPhase, pieces })
    sting('radio', useMission.getState().audio)
    say(`Phase complete. Proceeding to ${CAMP_PHASES.find((p) => p[0] === nextPhase)?.[1]} phase.`, useMission.getState().audio)
  }

  return (
    <div className="camp-bar">
      <ol>
        {CAMP_PHASES.map(([id, label], index) => {
          const current = CAMP_PHASES.findIndex((row) => row[0] === camp.phase)
          const state = index < current ? 'is-done' : index === current ? 'is-current' : ''
          return <li key={id} className={state}>{label}</li>
        })}
      </ol>
      {camp.phase === 'landing' && (
        <button
          type="button"
          className="word fill colonize-start"
          onClick={() => onChange({ ...camp, phase: 'habitat' })}
        >
          <PixelBuildingIcon size={15} />
          <span>Begin Outpost Construction</span>
        </button>
      )}
      <div className="camp-cards">
        {camp.phase === 'habitat' && (
          <>
            <CampCard
              title="Inflatable Pressurized Dome"
              detail="Multilayer Kevlar dome with central airlock and command quarters."
              preview="habitat"
              on={hasPiece(camp, 'habitat-plain')}
              onAdd={() => onChange(pickHabitat(camp, 'habitat-plain'))}
            />
            <CampCard
              title="Regolith-Shielded Bunker"
              detail="Rigid habitat module sheltered by a 2-meter compacted Martian regolith radiation berm."
              preview="habitat"
              on={hasPiece(camp, 'habitat-ridge')}
              onAdd={() => onChange(pickHabitat(camp, 'habitat-ridge'))}
            />
          </>
        )}
        {camp.phase === 'life' && (
          <>
            <CampCard
              title="Oxygen Generation System"
              detail="Electrolysis & Sabatier CO₂ scrubber providing 98% closed-loop breathable O₂."
              preview="life"
              on={hasPiece(camp, 'life')}
              onAdd={() => onChange(putPiece(camp, 'life', !hasPiece(camp, 'life')))}
            />
            <CampCard
              title="Permafrost Water Extractor"
              detail="Automated subsurface thermal drill melting glacial regolith ice into potable water."
              preview="water"
              on={hasPiece(camp, 'water')}
              onAdd={() => onChange(putPiece(camp, 'water', !hasPiece(camp, 'water')))}
            />
          </>
        )}
        {camp.phase === 'power' && (
          <>
            <CampCard
              title="Dual Solar Array Wings"
              detail="Deploy high-efficiency photovoltaic wings. Clean daily power."
              preview="solar"
              on={camp.pieces.some((id) => id.startsWith('solar-'))}
              onAdd={() => onChange(addArray(camp))}
            />
            <CampCard
              title="Kilopower Fission Reactor"
              detail="10 kW Stirling nuclear generator; reliable power unaffected by dust storms."
              preview="reactor"
              on={hasPiece(camp, 'fission')}
              onAdd={() => onChange(putPiece(camp, 'fission', !hasPiece(camp, 'fission')))}
            />
            <CampCard
              title="Lithium-Ion Energy Storage"
              detail="High-density battery bank buffering overnight power drops."
              preview="battery"
              on={hasPiece(camp, 'battery')}
              onAdd={() => onChange(putPiece(camp, 'battery', !hasPiece(camp, 'battery')))}
            />
          </>
        )}
        {camp.phase === 'food' && (
          <>
            <CampCard
              title="Hydroponic Greenhouse"
              detail="Automated aeroponic crop trays for fresh greens and supplemental O₂."
              preview="greenhouse"
              on={hasPiece(camp, 'greenhouse')}
              onAdd={() => onChange(putPiece({ ...camp, pieces: camp.pieces.filter((id) => id !== 'food-stored' && id !== 'greenhouse-hybrid') }, 'greenhouse', true))}
            />
            <CampCard
              title="Freeze-Dried Rations Depot"
              detail="Hermetically sealed 500-day shelf-life emergency rations from Earth."
              preview="food"
              on={hasPiece(camp, 'food-stored')}
              onAdd={() => onChange(putPiece({ ...camp, pieces: camp.pieces.filter((id) => id !== 'greenhouse' && id !== 'greenhouse-hybrid') }, 'food-stored', true))}
            />
            <CampCard
              title="Closed-Loop Biosphere (Hybrid)"
              detail="Combined hydroponics plus stored baseline rations for optimal nutrition redundancy."
              preview="greenhouse"
              on={hasPiece(camp, 'greenhouse-hybrid')}
              onAdd={() => onChange(putPiece({ ...camp, pieces: camp.pieces.filter((id) => id !== 'food-stored' && id !== 'greenhouse') }, 'greenhouse-hybrid', true))}
            />
          </>
        )}
        {camp.phase === 'report' && (
          <div className="camp-report-banner">
            <strong>
              <PixelTrophyIcon size={16} />
              <span>Mars Outpost Alpha Successfully Commissioned!</span>
            </strong>
            <p>Outpost established and life support loops closed. Air {camp.air}%, Water {camp.water}%, Food {camp.food}%, Power {camp.power}%. Outpost telemetry logged. Head to the Ascent Lander to Finish Game.</p>
          </div>
        )}
      </div>

      {canAdvance && (
        <div className="camp-phase-advance">
          <button
            type="button"
            className="camp-advance-btn"
            onClick={handleNextPhase}
          >
            <span>Confirm Selection & Proceed to {CAMP_PHASES.find((p) => p[0] === NEXT_CAMP[camp.phase])?.[1]}</span>
            <PixelArrowRightIcon size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

function CampCard({ title, detail, preview, on, onAdd }: { title: string; detail: string; preview: string; on: boolean; onAdd: () => void }) {
  return (
    <div className={on ? 'camp-card on' : 'camp-card'}>
      <CampPreview kind={preview} />
      <span>
        <strong>{title}</strong>
        <em>{detail}</em>
      </span>
      <button type="button" className="icon plus" aria-label={`Add ${title}`} onClick={onAdd}><Plus size={14} /></button>
    </div>
  )
}

function CampPreview({ kind }: { kind: string }) {
  const body = kind === 'habitat' || kind === 'outpost'
    ? <><rect x="18" y="22" width="52" height="22" fill="#e7d7c4" /><polygon points="14,22 44,8 74,22" fill="#c47a4a" /><rect x="38" y="30" width="12" height="14" fill="#8a5a3c" /></>
    : kind === 'life'
      ? <><rect x="16" y="16" width="22" height="26" rx="4" fill="#d7e4ea" /><rect x="42" y="20" width="28" height="8" fill="#7ec8c4" /><rect x="42" y="32" width="28" height="8" fill="#c9a227" /></>
      : kind === 'water'
        ? <><rect x="34" y="10" width="20" height="32" rx="8" fill="#8ec8e4" /><rect x="34" y="24" width="20" height="6" fill="#e7eef2" /></>
        : kind === 'solar'
          ? <><rect x="8" y="18" width="30" height="16" fill="#3c92c4" stroke="#e7f3fb" /><rect x="50" y="18" width="30" height="16" fill="#3c92c4" stroke="#e7f3fb" /><rect x="38" y="22" width="12" height="8" fill="#e7e2d6" /></>
          : kind === 'battery'
            ? <rect x="24" y="14" width="40" height="24" rx="3" fill="#f4f1ea" />
            : kind === 'reactor'
              ? <><rect x="34" y="12" width="20" height="28" fill="#e2c56a" /><rect x="22" y="16" width="8" height="20" fill="#f7f4ee" /><rect x="58" y="16" width="8" height="20" fill="#f7f4ee" /></>
              : kind === 'greenhouse'
                ? <><polygon points="16,34 44,12 72,34" fill="#8fbf7a" /><rect x="28" y="34" width="32" height="8" fill="#e7d7c4" /></>
                : kind === 'food'
                  ? <><rect x="22" y="16" width="18" height="22" fill="#e7d2b0" /><rect x="46" y="16" width="18" height="22" fill="#c47a4a" /></>
                  : kind === 'berm'
                    ? <polygon points="8,38 28,16 48,38 68,20 84,38" fill="#c4a07a" />
                    : <><circle cx="44" cy="26" r="12" fill="#e2b84a" /><rect x="42" y="8" width="4" height="8" fill="#f4f1ea" /></>
  return <svg className="camp-preview" viewBox="0 0 88 52" aria-hidden>{body}</svg>
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="meter" title={label}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function HuntArrow({ hint }: { hint: SurfaceHint }) {
  const x = Math.min(0.92, Math.max(0.08, (hint.nx + 1) / 2))
  const y = Math.min(0.84, Math.max(0.1, (1 - hint.ny) / 2))
  const rot = (Math.atan2(hint.nx, hint.ny) * 180) / Math.PI
  const isLander = hint.kind === 'lander'
  const dist = Math.round(hint.distM ?? 0)
  return (
    <div className={`hunt-arrow${isLander ? ' is-lander' : ''}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <i style={{ transform: hint.onScreen ? 'none' : `rotate(${rot}deg)` }} />
      <div className="hunt-arrow-pill">
        <b>{hint.name}</b>
        {dist > 0 && <span className="hunt-arrow-dist">{dist} m</span>}
      </div>
    </div>
  )
}
