import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Camera, Crosshair, Fan, Flag, House, Lock, Plus, Radio, Sun, Video } from 'lucide-react'
import { fieldSamples, siteOf } from '../domain/campaign'
import type { CampPhase, CampSave } from '../domain/save'
import { getSpec } from '../domain/catalog'
import { landingThrustN } from '../domain/dynamics'
import { massBudget } from '../domain/mass'
import type { SpacecraftConfig } from '../domain/types'
import { DescentWorld, type DescentBody, type DescentReadout } from '../render/descentWorld'
import { SurfaceWorld, type SurfaceReadout } from '../render/surfaceWorld'
import { useActiveMission, useMission } from '../store/useMission'
import { setBed, setScoreBoost, sting } from './audio'
import { say } from './voice'
import { Mix } from './mix'
import { createFieldTone } from './tone'

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
  const [pace, setPace] = useState(4)
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
    const world = new DescentWorld(canvas, craft, descentBody(mission.id, craft, mission.maxMassKg, propellant), site.difficulty, mission.id, site.id)
    const savedEntry = useMission.getState().descent
    if (savedEntry) world.restore(savedEntry)
    worldRef.current = world
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
      if (!handed.current && (readout.phase === 'down' || readout.phase === 'hard')) {
        handed.current = true
        handoff.current = window.setTimeout(() => {
          useMission.getState().noteTouchdown(readout.phase === 'hard' ? 'hard' : 'soft', readout.heat, readout.offset)
          bankSurface(readout.phase === 'hard' ? -12 : 8, readout.prompt)
          go('surface')
        }, 2200)
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
            <button type="button" aria-label="Chase" aria-pressed={hud?.view === 'chase'} onClick={() => worldRef.current?.setCamera('chase')}><Video size={16} /></button>
            <button type="button" aria-label="Side" aria-pressed={hud?.view === 'side'} onClick={() => worldRef.current?.setCamera('side')}><Camera size={16} /></button>
            <button type="button" aria-label="Ground" aria-pressed={hud?.view === 'ground'} onClick={() => worldRef.current?.setCamera('ground')}><Crosshair size={16} /></button>
          </div>
          <div className="group">
            {([1, 4, 16] as const).map((rate) => (
              <button key={rate} type="button" aria-pressed={pace === rate} onClick={() => { setPace(rate); worldRef.current?.setPace(rate) }}>{rate}×</button>
            ))}
          </div>
          <Mix />
        </div>
      </div>
      <div className="field-hud">
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
        {hud?.choice && (
          <div className="group">
            <button type="button" className="word" onClick={() => worldRef.current?.choose('divert')}>Divert to clear ground</button>
            <button type="button" className="word" onClick={() => worldRef.current?.choose('hold')}>Hold the target</button>
          </div>
        )}
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
        {hud && hud.phase !== 'fly' && (
          <button type="button" className="word" onClick={() => {
            if (hud.phase === 'down' || hud.phase === 'hard') {
              useMission.getState().noteTouchdown(hud.phase === 'hard' ? 'hard' : 'soft', hud.heat, hud.offset)
              bankSurface(hud.phase === 'hard' ? -12 : 8, hud.prompt)
              go('surface')
            } else finish()
          }}>{hud.phase === 'crash' ? 'Debrief' : 'Get down'}</button>
        )}
        {hud && hud.phase !== 'fly' && hud.phase !== 'crash' && (
          <span className="key-hint"><kbd>F</kbd><span>Get down</span></span>
        )}
        {showConfirmed && (
          <div className="landing-confirmed" role="status">
            <b>Landing confirmed</b>
            <span>Surface operations initialized</span>
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
  const go = useMission((state) => state.go)
  const bankSurface = useMission((state) => state.bankSurface)
  const mount = useRef<HTMLDivElement>(null)
  const worldRef = useRef<SurfaceWorld | null>(null)
  const [hud, setHud] = useState<SurfaceReadout | null>(null)
  const marsSurface = mission?.id === 'mars' || mission?.id === 'custom'
  const [camp, setCamp] = useState<CampSave>(() => readCamp())
  const campRef = useRef(camp)
  campRef.current = camp

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
    const world = new SurfaceWorld(canvas, {
      missionId: mission.id,
      siteId: site.id,
      difficulty: site.difficulty,
      gravity: mission.id === 'lunar' ? 1.62 : mission.id === 'europa' ? 1.31 : mission.id === 'asteroid' ? 0.05 : 3.71,
      air: mission.id === 'mars' || mission.id === 'custom',
      steady: enabled.some((part) => getSpec(part.specId)?.powerScale === 'constant' && (getSpec(part.specId)?.powerGenW ?? 0) > 0),
      roverMassKg: rover ? (getSpec(rover.specId)?.massKg ?? 42) : (mission.id === 'mars' || mission.id === 'custom' ? 42 : null),
      heli: enabled.some((part) => getSpec(part.specId)?.instrument === 'helicopter'),
      craft,
      samples: fieldSamples(site, plan.objectiveId ?? 'water'),
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
    setScoreBoost(false)
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const readout = world.step(dt)
      const sound = useMission.getState().audio
      tone.drive(readout.speed, sound)
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
      setBed(0.012 + readout.dust * 0.03, sound)
      saveTick += dt
      if (saveTick > 2) {
        saveTick = 0
        useMission.getState().noteField({ ...world.snapshot(), camp: campRef.current })
      }
      hudTick += dt
      if (hudTick > 0.15) {
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

  const send = () => {
    if (!hud) return
    const filed = worldRef.current?.report()
    if (!filed) return
    const snap = worldRef.current?.snapshot()
    if (snap) useMission.getState().noteField({ ...snap, camp })
    bankSurface(filed.points, filed.note, filed.bits)
    finish()
  }

  const world = worldRef.current
  return (
    <div className="field-stage" ref={mount}>
      {hud?.mode === 'eva' && <div className="crosshair" />}
      <div className="deck">
        {marsSurface && <CampBar camp={camp} onChange={setCamp} />}
        <div className="deck-top surface-top">
          <div className="group">
            <button type="button" aria-label="Camera" onClick={() => world?.cycleCam()}><Video size={16} /></button>
            {hud?.hasRover && <button type="button" aria-label="Park" aria-pressed={hud.parked} onClick={() => world?.togglePark()}><Lock size={16} /></button>}
            {hud?.hasRover && <button type="button" aria-label="Route" aria-pressed={hud.assist} onClick={() => world?.toggleAssist()}><Crosshair size={16} /></button>}
            {hud?.hasRover && (
              <button type="button" className="board-key" aria-label={hud.mode === 'eva' ? 'Board the rover' : 'Get down'} aria-pressed={hud.mode === 'eva'} onClick={() => world?.toggleEgress()}>
                {hud.mode === 'drive' ? 'Down' : 'Board'}<kbd>F</kbd>
              </button>
            )}
            {hud?.hasHeli && <button type="button" aria-label="Helicopter" aria-pressed={hud.mode === 'scout'} onClick={() => world?.toggleScout()}><Fan size={16} /></button>}
            <button type="button" aria-label="Next sol" onClick={() => world?.nextSol()}><Sun size={16} /></button>
            <Mix />
          </div>
          <p className="deck-note">{hud?.prompt || siteLabel(hud)}</p>
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
            <Read label="Speed (m/s)" value={hud ? hud.speed.toFixed(1) : '0'} />
            <Read label="Grade (°)" value={hud ? hud.slopeDeg.toFixed(0) : '0'} />
            <Read label="Battery (%)" value={hud ? String(Math.round(hud.energy)) : '0'} />
            <Read label="Wheels (%)" value={hud ? String(Math.round(hud.wheels)) : '100'} />
            <Read label="Link" value={hud ? (hud.link ? 'Open' : 'Dark') : '—'} />
            <Read label="Air (%)" value={hud ? String(Math.round(hud.oxygen)) : '0'} />
            <Read label="Sol" value={hud ? String(hud.sol) : '1'} />
            <Read label="Dust" value={hud ? hud.dust.toFixed(2) : '0'} />
            <Read label="Held" value={hud ? String(hud.held) : '0'} />
            <Read label="Sent" value={hud ? String(hud.sent) : '0'} />
            <span className="lamps" title={hud?.label ?? 'Clear'}>
              <i className={hud?.link === false ? 'off' : 'idle'} />
              <i className={hud && (hud.label === 'Dust' || hud.label === 'Flare' || hud.label === 'Fault' || hud.label === 'Wheel') ? 'off' : 'lit'} />
            </span>
          </div>
          <div className="group">
            <button type="button" aria-label="Photograph" onClick={() => world?.capture()}><Camera size={16} /></button>
            <button type="button" aria-label="Sample" onClick={() => world?.sample()}><Crosshair size={16} /></button>
            <button type="button" aria-label="Next finding" onClick={() => world?.cycleHold()}><ArrowRight size={16} /></button>
            <button type="button" aria-label="Transmit" onClick={() => world?.transmit()}><Radio size={16} /></button>
            <button type="button" aria-label="File the return" onClick={send}><Flag size={16} /></button>
            <button type="button" aria-label="Hangar" onClick={() => go('design')}><House size={16} /></button>
          </div>
        </div>
      </div>
      <div className="key-row field-keys">
        <span className="key-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>{hud?.mode === 'drive' ? 'Drive' : 'Walk'}</span></span>
        {hud?.hasRover && <span className="key-hint"><kbd>F</kbd><span>{hud.mode === 'drive' ? 'Get down' : 'Board rover'}</span></span>}
        <span className="key-hint"><kbd>E</kbd><span>Sample</span></span>
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
  ['survival', 'Survival'],
  ['report', 'Report'],
]

const NEXT_CAMP: Record<CampPhase, CampPhase> = {
  landing: 'habitat',
  habitat: 'life',
  life: 'power',
  power: 'food',
  food: 'survival',
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
    case 'survival': return camp.sol >= 4
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

function clampStore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function advanceSol(camp: CampSave): CampSave {
  const arrays = camp.pieces.filter((id) => id.startsWith('solar-')).length
  const made = Math.min(100, arrays * 22 + (hasPiece(camp, 'fission') ? 46 : 0))
  const dust = camp.storm === 'clean' ? 0.9 : camp.storm === 'shelter' ? 0.6 : 1
  const green = hasPiece(camp, 'greenhouse') || hasPiece(camp, 'greenhouse-hybrid')
  return {
    ...camp,
    sol: camp.sol + 1,
    power: clampStore(camp.power * 0.4 + made * dust * 0.6 - 8),
    food: clampStore(camp.food - (green ? 5 : 16)),
    water: clampStore(camp.water - (hasPiece(camp, 'water') ? 6 : 18)),
    air: clampStore(camp.air - (hasPiece(camp, 'life') ? 4 : 14)),
  }
}

function CampBar({ camp, onChange }: { camp: CampSave; onChange: (next: CampSave) => void }) {
  const commit = (next: CampSave) => {
    if (next.phase === 'survival' && next.sol >= 4) {
      onChange({ ...next, phase: 'report' })
      return
    }
    if (!campReady(next) || next.phase === 'report' || next.phase === 'survival') {
      onChange(next)
      return
    }
    const phase = NEXT_CAMP[next.phase]
    const pieces = phase === 'life' && !next.pieces.includes('marker') ? [...next.pieces, 'marker'] : next.pieces
    onChange({ ...next, phase, pieces })
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
      <div className="camp-cards">
        {camp.phase === 'landing' && (
          <CampCard title="Outpost" detail="Open the build, then place the habitat." preview="outpost" on={false} onAdd={() => commit({ ...camp, phase: 'habitat' })} />
        )}
        {camp.phase === 'habitat' && (
          <>
            <CampCard title="Plain habitat" detail="A cabin on the flat ground." preview="habitat" on={hasPiece(camp, 'habitat-plain')} onAdd={() => commit(pickHabitat(camp, 'habitat-plain'))} />
            <CampCard title="Ridge habitat" detail="The same cabin against the ridge." preview="habitat" on={hasPiece(camp, 'habitat-ridge')} onAdd={() => commit(pickHabitat(camp, 'habitat-ridge'))} />
          </>
        )}
        {camp.phase === 'life' && (
          <>
            <CampCard title="Life support" detail="Air for the cabin." preview="life" on={hasPiece(camp, 'life')} onAdd={() => commit(putPiece(camp, 'life', true))} />
            <CampCard title="Water" detail="The tank beside the cabin." preview="water" on={hasPiece(camp, 'water')} onAdd={() => commit(putPiece(camp, 'water', true))} />
          </>
        )}
        {camp.phase === 'power' && (
          <>
            <CampCard title="Battery" detail="Stores what the arrays make. Add this before the source if you want it." preview="battery" on={hasPiece(camp, 'battery')} onAdd={() => commit(putPiece(camp, 'battery', true))} />
            <CampCard title="Solar array" detail="A wing of panels. This step can move on once one source is down." preview="solar" on={camp.pieces.some((id) => id.startsWith('solar-'))} onAdd={() => commit(addArray(camp))} />
            <CampCard title="Reactor" detail="Power that does not care about dust." preview="reactor" on={hasPiece(camp, 'fission')} onAdd={() => commit(putPiece(camp, 'fission', true))} />
          </>
        )}
        {camp.phase === 'food' && (
          <>
            <CampCard title="Stored food" detail="Rations. No greenhouse." preview="food" on={hasPiece(camp, 'food-stored')} onAdd={() => commit(putPiece({ ...camp, pieces: camp.pieces.filter((id) => id !== 'greenhouse' && id !== 'greenhouse-hybrid') }, 'food-stored', true))} />
            <CampCard title="Greenhouse" detail="A planted bay." preview="greenhouse" on={hasPiece(camp, 'greenhouse')} onAdd={() => commit(putPiece({ ...camp, pieces: camp.pieces.filter((id) => id !== 'food-stored' && id !== 'greenhouse-hybrid') }, 'greenhouse', true))} />
            <CampCard title="Hybrid" detail="Rations plus a smaller bay." preview="greenhouse" on={hasPiece(camp, 'greenhouse-hybrid')} onAdd={() => commit(putPiece({ ...camp, pieces: camp.pieces.filter((id) => id !== 'food-stored' && id !== 'greenhouse') }, 'greenhouse-hybrid', true))} />
          </>
        )}
        {camp.phase === 'survival' && (
          <>
            <CampCard title="Berm" detail="A ridge of soil against the flare." preview="berm" on={hasPiece(camp, 'berm')} onAdd={() => commit(putPiece(camp, 'berm', true))} />
            <CampCard title="Next sol" detail={`Sol ${camp.sol}. Air ${camp.air}, water ${camp.water}, food ${camp.food}, power ${camp.power}.`} preview="sol" on={camp.sol >= 4} onAdd={() => commit(advanceSol(camp))} />
            {camp.sol >= 2 && !camp.storm && <CampCard title="Shelter" detail="Ride the storm inside." preview="berm" on={false} onAdd={() => onChange({ ...camp, storm: 'shelter' })} />}
            {camp.sol >= 2 && !camp.storm && <CampCard title="Clean the arrays" detail="Clear the dust. Costs the sol outside." preview="solar" on={false} onAdd={() => onChange({ ...camp, storm: 'clean' })} />}
          </>
        )}
        {camp.phase === 'report' && (
          <p className="camp-stores">Sol {camp.sol} filed. Air {camp.air}, water {camp.water}, food {camp.food}, power {camp.power}. Transmit the return when you are ready.</p>
        )}
      </div>
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

function siteLabel(hud: SurfaceReadout | null): string {
  if (!hud) return ''
  if (hud.held > 0) return hud.label
  if (hud.mode === 'scout') return 'Scout'
  if (hud.assist && hud.target) return hud.target
  if (hud.mode === 'eva') return 'Walk'
  return 'Rover'
}

function Read({ label, value }: { label: string; value: string }) {
  return (
    <div className="meter" title={label}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}
