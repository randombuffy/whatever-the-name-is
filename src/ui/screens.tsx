import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Battery,
  Boxes,
  ChevronsDown,
  ChevronsUp,
  CircleAlert,
  CircleCheck,
  Clock,
  Crosshair,
  Eye,
  EyeOff,
  Droplets,
  Gauge,
  Info,
  List,
  Maximize2,
  Move3d,
  Orbit,
  Pause,
  Flag,
  PenLine,
  Play,
  Plus,
  Radio,
  Redo2,
  Rocket,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
  Zap,
} from 'lucide-react'
import { CATALOG, getSpec } from '../domain/catalog'
import { CREW_ROLES, crewReady, type CrewSize } from '../domain/crew'
import { OBJECTIVES, kitCoverage, objectiveKit, objectiveOf, siteOf, sitesFor, suggestedSite, windowExtraDv } from '../domain/campaign'
import { bits, clock, db, kelvin, kg, money, mps, watts } from '../domain/format'
import { lunarTransfer, marsTransfer, solarTransfer } from '../domain/orbit'
import { sliderToWarp, warpLabel, warpToSlider } from '../domain/time'
import { evaluate, requiredBurns } from '../domain/validate'
import type { ComponentSpec, EngineeringIssue, EngineeringReport, MissionDef, MissionOutcome, MissionPlan, SpacecraftConfig, Subsystem } from '../domain/types'
import { loadMarsPhoto, loadNasa, loadSolarNote, type MarsFrame, type NasaContext, type SolarNote } from '../nasa/client'
import { useActiveMission, useMission } from '../store/useMission'
import { DifficultyCadetIcon, DifficultyCommanderIcon, DifficultySpecialistIcon } from './pixelIcons'
import { graphicsLabel } from '../render/world'
import { createAscent, stepAscent, ASCENT_TIME_SCALE, type AscentState } from '../domain/ascent'
import { say, silence } from './voice'
import { Dock, Glass, Meter, MissionTitle, Sheet, SpotButton } from './bits'
import { PartPreview } from './partPreview'
import { DestModel } from './DestStill'
import { TitleBanner } from './TitleBanner'
import { FAMILIES, SECTIONS, familyOf } from './families'
import { startPlanTutorial, startDesignTutorial } from './tutorial'
import { SiDesk } from './siDesk'
import { APP_NAME, EDU_LIMITS } from '../domain/brand'
import { debriefVerdict } from '../domain/score'
import SplitFlapText from './SplitFlapText'
import { MissionRankingTable } from './MissionRankingTable'

const FILTERS: { id: Subsystem | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'structure', label: 'Bus' },
  { id: 'propulsion', label: 'Engine' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'power', label: 'Power' },
  { id: 'communications', label: 'Comms' },
  { id: 'science', label: 'Science' },
  { id: 'thermal', label: 'Thermal' },
]

const EXTRA_PARTS = new Set(['magnetometer', 'particle', 'payload', 'soil', 'rock', 'radiation', 'arm', 'cache'])

const SHORT: Record<string, string> = {
  lunar: 'Moon',
  mars: 'Mars',
  europa: 'Europa',
  asteroid: 'Asteroid',
}

function shortMoney(usd: number): string {
  const sign = usd < 0 ? '-' : ''
  const abs = Math.abs(usd)
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}$${Math.round(abs / 1e6)}M`
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`
  return `${sign}$${Math.round(abs)}`
}

function headline(spec: ComponentSpec): string {
  if (spec.thrustN > 0) return `${mps(spec.thrustN)} ${spec.ispS}s`
  if (spec.tankCapacityKg > 0) return `${kg(spec.tankCapacityKg)}`
  if (spec.powerGenW > 0) return `${watts(spec.powerGenW)}`
  if (spec.powerDrawW > 0) return `-${watts(spec.powerDrawW)}`
  if (spec.radiatorM2 > 0) return `${spec.radiatorM2} m²`
  if (spec.antennaGainDbi > 0) return `${db(spec.antennaGainDbi)}`
  return `${kg(spec.massKg)}`
}

function withoutLine(craft: SpacecraftConfig, mission: MissionDef, plan: MissionPlan, instanceId: string, report: EngineeringReport): string {
  const alt = evaluate({ ...craft, parts: craft.parts.filter((part) => part.instanceId !== instanceId) }, mission, plan)
  const mass = report.mass.totalKg - alt.mass.totalKg
  const dv = alt.propulsion.dvMps - report.propulsion.dvMps
  const massText = `${Math.abs(mass).toFixed(0)} kg ${mass >= 0 ? 'lighter' : 'heavier'}`
  const dvText = `${Math.abs(dv).toFixed(0)} m/s ${dv >= 0 ? 'more' : 'less'} delta-v`
  return `Without this part the ship is ${massText} and has ${dvText}.`
}

function facts(spec: ComponentSpec): { label: string; value: string }[] {
  const rows: [string, string][] = [
    ['Mass', kg(spec.massKg, 1)],
    ['Cost', money(spec.costUsd)],
  ]
  if (spec.thrustN > 0) rows.push(['Thrust', `${spec.thrustN} N`], ['Isp', `${spec.ispS} s`])
  if (spec.tankCapacityKg > 0) rows.push(['Tank', kg(spec.tankCapacityKg)])
  if (spec.powerGenW > 0) rows.push(['Power', watts(spec.powerGenW)])
  if (spec.powerDrawW > 0) rows.push(['Draw', watts(spec.powerDrawW)])
  if (spec.energyWh > 0) rows.push(['Energy', `${spec.energyWh} Wh`])
  if (spec.antennaGainDbi > 0) rows.push(['Gain', `${spec.antennaGainDbi} dBi`])
  if (spec.radiatorM2 > 0) rows.push(['Radiator', `${spec.radiatorM2} m²`])
  if (spec.instrument) rows.push(['Instrument', spec.instrument])
  return rows.map(([label, value]) => ({ label, value }))
}

function Setting({ ids, value, label, onChange }: { ids: string[]; value: string; label: string; onChange: (id: string) => void }) {
  if (ids.length < 2) return null
  const index = Math.max(0, ids.indexOf(value))
  return (
    <input
      className="fill"
      type="range"
      min={0}
      max={ids.length - 1}
      step={1}
      value={index}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const next = ids[Number(event.target.value)]
        if (next) onChange(next)
      }}
    />
  )
}

function MissionTrack({ fraction }: { fraction: number }) {
  const t = Math.min(1, Math.max(0, fraction))
  return (
    <div className="resume-track">
      <div className="resume-end">
        <DestModel missionId="earth" />
        <em>Earth</em>
      </div>
      <div className="resume-rail">
        <i style={{ left: `${t * 100}%` }} />
      </div>
      <div className="resume-end">
        <DestModel missionId="mars" />
        <em>Mars</em>
      </div>
    </div>
  )
}

const DIFFICULTY = [
  { id: 'cadet' as const, label: 'Cadet', Icon: DifficultyCadetIcon },
  { id: 'specialist' as const, label: 'Specialist', Icon: DifficultySpecialistIcon },
  { id: 'commander' as const, label: 'Commander', Icon: DifficultyCommanderIcon },
]

const DIFFICULTY_BLURB = {
  cadet: 'Easier landing · extra budget',
  specialist: 'Usual game margins',
  commander: 'Light-time lag on commands · tighter budget · heavier storms',
} as const

export function CrewPanel() {
  const crewSize = useMission((state) => state.crewSize)
  const crew = useMission((state) => state.crew)
  const setCrewSize = useMission((state) => state.setCrewSize)
  const setCrewName = useMission((state) => state.setCrewName)
  return (
    <div className="crew-panel">
      <div className="diff-panel-head">
        <b>Flight crew</b>
        <span>{crewSize === 1 ? 'Solo. You cover every desk.' : `${crewSize} seats. Pass the machine; each role owns a trade-off.`}</span>
      </div>
      <div className="crew-size" role="group" aria-label="Crew size">
        {([1, 2, 3, 4] as CrewSize[]).map((size) => (
          <button key={size} type="button" aria-pressed={crewSize === size} onClick={() => setCrewSize(size)}>
            {size === 1 ? 'Solo' : `${size}`}
          </button>
        ))}
      </div>
      {crewSize > 1 && (
        <ol className="crew-seats">
          {crew.map((seat, index) => {
            const role = CREW_ROLES.find((row) => row.id === seat.role)
            return (
              <li key={seat.role}>
                <label>
                  <b>{role?.title}</b>
                  <span>{role?.duty}</span>
                  <input
                    type="text"
                    maxLength={24}
                    value={seat.name}
                    aria-label={`${role?.title} name`}
                    onChange={(event) => setCrewName(index, event.target.value)}
                  />
                </label>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

export function CrewBar() {
  const crew = useMission((state) => state.crew)
  const crewSize = useMission((state) => state.crewSize)
  const toggleCrewReady = useMission((state) => state.toggleCrewReady)
  const phase = useMission((state) => state.phase)
  if (crewSize < 2) return null
  const focus = phase === 'plan' ? 'commander' : phase === 'flight' || phase === 'landing' ? 'capcom' : 'engineer'
  return (
    <div className="crew-bar" role="group" aria-label="Flight crew">
      {crew.map((seat, index) => {
        const role = CREW_ROLES.find((row) => row.id === seat.role)
        const lead = seat.role === focus || (focus === 'engineer' && seat.role === 'scientist' && phase === 'design')
        return (
          <button
            key={seat.role}
            type="button"
            className={`crew-chip${lead ? ' is-lead' : ''}${seat.ready ? ' is-ready' : ''}`}
            aria-pressed={seat.ready}
            title={role?.duty}
            onClick={() => toggleCrewReady(index)}
          >
            <em>{role?.title}</em>
            <span>{seat.name}</span>
            <small>{seat.ready ? 'Signed' : 'Stand by'}</small>
          </button>
        )
      })}
      <span className="crew-status">{crewReady(crew) ? 'Stack signed' : 'Every seat signs before countdown'}</span>
    </div>
  )
}

export function DifficultyPanel({ compact = false }: { compact?: boolean }) {
  const difficulty = useMission((state) => state.difficulty)
  const setDifficulty = useMission((state) => state.setDifficulty)
  return (
    <div className={`diff-panel${compact ? ' is-compact' : ' is-gate'}`}>
      <p className="diff-panel-blurb">{DIFFICULTY_BLURB[difficulty]}</p>
      <div className="diff-grid" role="group" aria-label="Flight difficulty">
        {DIFFICULTY.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="diff-tile"
            aria-pressed={difficulty === id}
            onClick={() => setDifficulty(id)}
          >
            <span className="diff-tile-icon">
              <Icon />
            </span>
            <b>{label}</b>
          </button>
        ))}
      </div>
    </div>
  )
}

export function SelectScreen({ onLaunch }: { onLaunch?: () => void }) {
  const startFresh = useMission((state) => state.startFresh)
  const loadSave = useMission((state) => state.loadSave)
  const snapshotSave = useMission((state) => state.snapshotSave)
  const createCustom = useMission((state) => state.createCustom)
  const saves = useMission((state) => state.saves)
  const [loadOpen, setLoadOpen] = useState(false)
  return (
    <div className="center-stage">
      <TitleBanner />
      <div className="title-gate">
        <MissionTitle text={APP_NAME} variant="hero" />
        <p>Design the spacecraft, fly the same numbers, and see every trade-off land on the pad.</p>
        <DifficultyPanel />
        <CrewPanel />
        <div className="title-actions">
          <button type="button" className="word" onClick={() => { startFresh(); onLaunch?.() }}>
            <svg className="btn-mark" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M8 1.15 11.15 6.05H4.85L8 1.15ZM5.35 6.35h5.3V11H5.35V6.35ZM5.35 9.15 1.9 13.2l3.45-.85V9.15ZM10.65 9.15 14.1 13.2l-3.45-.85V9.15ZM6.55 11.15h2.9L8 14.55l-1.45-3.4ZM8 9.2a1.12 1.12 0 1 0 0-2.24A1.12 1.12 0 0 0 8 9.2Z"
              />
            </svg>
            Launch mission
          </button>
          <button type="button" className="word slim" onClick={() => { snapshotSave(); setLoadOpen(true) }}>Load mission</button>
          <button
            type="button"
            className="word slim"
            title="Open mass and budget limits without a scripted campaign"
            onClick={() => { createCustom('mars', 'Sandbox', 3200, 5e8); onLaunch?.() }}
          >
            Sandbox
          </button>
        </div>
      </div>
      {loadOpen && (
        <aside className="load-pop">
          <strong>Ongoing missions</strong>
          {saves.length === 0 && <p>Nothing in progress.</p>}
          {saves.map((save) => (
            <button
              key={save.id}
              type="button"
              className="load-item"
              onClick={() => {
                loadSave(save.id)
                setLoadOpen(false)
                onLaunch?.()
              }}
            >
              <span>{save.name}</span>
              <MissionTrack fraction={save.distanceFraction} />
            </button>
          ))}
          <button type="button" className="word slim" onClick={() => setLoadOpen(false)}>Close</button>
        </aside>
      )}
    </div>
  )
}

export function BriefScreen() {
  const mission = useActiveMission()
  const customBaseId = useMission((state) => state.customBaseId)
  const go = useMission((state) => state.go)
  const [nasa, setNasa] = useState<NasaContext | null>(null)
  const [photo, setPhoto] = useState<MarsFrame | null>(null)
  const [solar, setSolar] = useState<SolarNote | null>(null)
  const [info, setInfo] = useState(false)
  useEffect(() => {
    if (!mission) return
    let cancel = false
    setNasa(null)
    setPhoto(null)
    setSolar(null)
    void loadNasa(mission.nasaQuery, mission.name, mission.scienceContext, mission.id === 'asteroid').then((result) => {
      if (!cancel) setNasa(result)
    })
    if (mission.id === 'mars' || mission.id === 'custom') {
      void loadMarsPhoto().then((frame) => {
        if (!cancel) setPhoto(frame)
      })
    }
    void loadSolarNote().then((note) => {
      if (!cancel) setSolar(note)
    })
    return () => { cancel = true }
  }, [mission?.id])
  if (!mission) return null
  const stillId = mission.id === 'custom' ? (customBaseId ?? 'lunar') : mission.id
  const tag = mission.id === 'custom' ? (SHORT[stillId] ?? mission.name) : (SHORT[mission.id] ?? mission.name)
  return (
    <>
      <div className="world-card brief-card">
        <MissionTitle text={tag} variant="brief" />
        <strong>{mission.name}</strong>
        <p>{mission.summary}</p>
        <div className="card-actions brief-actions">
          <button type="button" className="word" onClick={() => go('design')}><Boxes size={16} /> Build</button>
          <button type="button" className="word slim" onClick={() => go('pad')}>Close</button>
        </div>
      </div>
      <aside className="side right">
        <Glass className="pad-card">
          <div className="card-head">
            <div>
              <strong>{mission.name}</strong>
              <p>{mission.summary}</p>
            </div>
            <button type="button" className="icon" aria-label="Briefing notes" onClick={() => setInfo(true)}><Info size={16} /></button>
          </div>
          <div className="statgrid">
            <div className="statblock"><b>{mission.durationDays}</b><span>days</span></div>
            <div className="statblock"><b>{mission.maxMassKg}</b><span>kg</span></div>
            <div className="statblock"><b>{shortMoney(mission.budgetUsd)}</b><span>budget</span></div>
            <div className="statblock"><b>{mission.requiredInstruments.length}</b><span>instruments</span></div>
          </div>
          <div className="chips">
            {mission.requiredInstruments.map((name) => <span key={name} className="chip on">{name}</span>)}
            {mission.optionalInstruments.map((name) => <span key={name} className="chip">{name}</span>)}
          </div>
          {nasa?.imageUrl && (
            <figure className="nasa-still">
              <img src={nasa.imageUrl} alt={nasa.title} />
              <figcaption>{nasa.title}. NASA Image and Video Library. A catalogued still, not this flight.</figcaption>
            </figure>
          )}
          {photo && (
            <figure className="nasa-still">
              <img src={photo.imageUrl} alt={`${photo.rover} ${photo.camera}`} />
              <figcaption>{photo.rover} sol {photo.sol} · {photo.camera} · {photo.earthDate}. NASA/JPL Mars 2020 raw images. Not this landing.</figcaption>
            </figure>
          )}
          {solar && <p className="muted">DONKI lists a {solar.classType} flare issued {solar.begin.slice(0, 10)}. Catalogued space weather. It does not change this flight.</p>}
          {nasa?.status === 'error' && <p className="muted">The image library did not answer. The mission text above is the fallback.</p>}
          <p className="edu-note">{EDU_LIMITS}</p>
        </Glass>
      </aside>
      {info && (
        <Sheet title={mission.name} onClose={() => setInfo(false)}>
          <p>{mission.scienceContext}</p>
          {nasa?.title && <p><strong>{nasa.title}</strong></p>}
          {nasa?.text && <p className="muted">{nasa.text.slice(0, 700)}</p>}
          {nasa?.source === 'nasa-images' && <p className="muted">NASA Image and Video Library{nasa.retrievedAt ? ` · ${nasa.retrievedAt}` : ''}</p>}
          {typeof nasa?.neoCount === 'number' && <p className="mono">NEO count {nasa.neoCount}</p>}
          <div className="note-list">
            {mission.assumptions.map((line) => <p key={line}>{line}</p>)}
          </div>
        </Sheet>
      )}
    </>
  )
}

export function DesignScreen() {
  const craft = useMission((state) => state.craft)
  const plan = useMission((state) => state.plan)
  const mission = useActiveMission()
  const selectedId = useMission((state) => state.selectedId)
  const selectedInstanceId = useMission((state) => state.selectedInstanceId)
  const addPart = useMission((state) => state.addPart)
  const removePart = useMission((state) => state.removePart)
  const setFill = useMission((state) => state.setFill)
  const setSpec = useMission((state) => state.setSpec)
  const selectPart = useMission((state) => state.selectPart)
  const selectInstance = useMission((state) => state.selectInstance)
  const nudgePart = useMission((state) => state.nudgePart)
  const resetOffset = useMission((state) => state.resetOffset)
  const togglePart = useMission((state) => state.togglePart)
  const generate = useMission((state) => state.generate)
  const autoFix = useMission((state) => state.autoFix)
  const undo = useMission((state) => state.undo)
  const redo = useMission((state) => state.redo)
  const canUndo = useMission((state) => (state.craftPast?.length ?? 0) > 0)
  const canRedo = useMission((state) => (state.craftFuture?.length ?? 0) > 0)
  const rename = useMission((state) => state.rename)
  const go = useMission((state) => state.go)
  const [filter, setFilter] = useState<Subsystem | 'all'>('all')
  const [pick, setPick] = useState<Record<string, number>>({})
  const [callSign, setCallSign] = useState(craft?.name ?? 'Surveyor')
  const [specId, setSpecId] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [moreParts, setMoreParts] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) useMission.getState().redo()
        else useMission.getState().undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        useMission.getState().redo()
        return
      }
      const id = useMission.getState().selectedInstanceId
      if (!id) return
      const step = event.shiftKey ? 0.28 : 0.12
      const nudge = useMission.getState().nudgePart
      if (event.key === 'ArrowUp') nudge(id, 0, step, 0)
      else if (event.key === 'ArrowDown') nudge(id, 0, -step, 0)
      else if (event.key === 'ArrowLeft') nudge(id, -step, 0, 0)
      else if (event.key === 'ArrowRight') nudge(id, step, 0, 0)
      else if (event.key === 'q' || event.key === 'Q') nudge(id, 0, 0, step)
      else if (event.key === 'e' || event.key === 'E') nudge(id, 0, 0, -step)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!craft || !mission || !plan) return null
  const report = evaluate(craft, mission, plan)
  const show = (subsystem: Subsystem) => filter === 'all' || filter === subsystem
  const sections = SECTIONS.map((section) => ({
    label: section.label,
    families: section.familyIds
      .map((id) => FAMILIES.find((family) => family.id === id))
      .filter((family): family is NonNullable<typeof family> => Boolean(family && show(family.subsystem))),
    singles: section.singleIds
      .map((id) => CATALOG.find((item) => item.id === id))
      .filter((item): item is ComponentSpec => Boolean(item && show(item.subsystem) && (moreParts || !EXTRA_PARTS.has(item.id)))),
  })).filter((section) => section.families.length > 0 || section.singles.length > 0)
  const spec = CATALOG.find((item) => item.id === specId) ?? null
  const hard = report.issues.filter((issue) => issue.severity === 'hard').length
  const generation = report.power.constantGenerationW + report.power.generationAt1AuW / (mission.destinationAu ** 2)
  const selected = craft.parts.find((part) => part.instanceId === selectedInstanceId)
  const fitOrSelect = (specId: string) => {
    const fitted = craft.parts.find((part) => part.specId === specId && part.enabled) ?? craft.parts.find((part) => part.specId === specId)
    if (fitted) {
      if (!fitted.enabled) togglePart(fitted.instanceId)
      selectInstance(fitted.instanceId)
      return
    }
    addPart(specId)
  }

  return (
    <>
      <FixBar show={hard > 0} onFix={autoFix} />
      <aside className="side left catalog">
        <Glass className="stack-card">
          <div className="filters" role="toolbar" aria-label="Parts">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" className="filter-chip" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="part-list">
            {sections.map((section) => (
              <div key={section.label}>
                <h2 className="section-label">{section.label}</h2>
                {section.families.map((family) => {
                  const index = Math.min(pick[family.id] ?? 0, family.ids.length - 1)
                  const item = CATALOG.find((entry) => entry.id === family.ids[index])
                  if (!item) return null
                  return (
                    <div key={family.id} className={selectedId === item.id ? 'part-tile on' : 'part-tile'} onClick={() => fitOrSelect(item.id)}>
                      <PartPreview specId={item.id} />
                      <span>
                        <strong>{item.name}</strong>
                        <em>{family.name} · {headline(item)} · {shortMoney(item.costUsd)}</em>
                      </span>
                      <button type="button" className="icon" aria-label={`About ${item.name}`} onClick={(event) => { event.stopPropagation(); setAdvanced(false); setSpecId(item.id) }}>
                        <Info size={12} />
                      </button>
                      <button type="button" className="icon plus" aria-label={`Add ${item.name}`} onClick={(event) => { event.stopPropagation(); addPart(item.id) }}>
                        <Plus size={12} />
                      </button>
                      <Setting
                        ids={family.ids}
                        value={item.id}
                        label={`${family.name} setting`}
                        onChange={(id) => {
                          setPick((current) => ({ ...current, [family.id]: family.ids.indexOf(id) }))
                          selectPart(id)
                        }}
                      />
                    </div>
                  )
                })}
                {section.singles.map((item) => (
                  <div key={item.id} className={selectedId === item.id ? 'part-tile on' : 'part-tile'} onClick={() => fitOrSelect(item.id)}>
                    <PartPreview specId={item.id} />
                    <span>
                      <strong>{item.name}</strong>
                      <em>{headline(item)} · {shortMoney(item.costUsd)}</em>
                    </span>
                    <button type="button" className="icon" aria-label={`About ${item.name}`} onClick={(event) => { event.stopPropagation(); setAdvanced(false); setSpecId(item.id) }}>
                      <Info size={12} />
                    </button>
                    <button type="button" className="icon plus" aria-label={`Add ${item.name}`} onClick={(event) => { event.stopPropagation(); addPart(item.id) }}>
                      <Plus size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            <button type="button" className="word slim more-parts" onClick={() => setMoreParts((value) => !value)}>
              {moreParts ? 'Fewer parts' : 'More instruments'}
            </button>
          </div>
        </Glass>
      </aside>
      <aside className="side right assembly">
        <Glass className="stack-card">
          <div className="name-row">
            <input
              aria-label="Call sign"
              value={callSign}
              onChange={(event) => {
                setCallSign(event.target.value)
                rename(event.target.value)
              }}
            />
            <button type="button" className="word slim generate" onClick={() => generate(callSign)}><Sparkles size={14} /> Generate</button>
            <button type="button" className="icon" aria-label={`${report.issues.length} constraints`} onClick={() => setIssuesOpen(true)}>
              {hard > 0 ? <CircleAlert size={15} /> : <CircleCheck size={15} />}
              {report.issues.length > 0 && <em className="count-pip">{report.issues.length}</em>}
            </button>
          </div>
          <div className="edit-row">
            <button type="button" className="word slim" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 size={13} /> Undo</button>
            <button type="button" className="word slim" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"><Redo2 size={13} /> Redo</button>
            <button type="button" className="word slim" onClick={startDesignTutorial}>Help</button>
          </div>
          <div className="scroll">
            <Meter label="Mass" value={kg(report.mass.totalKg)} ratio={report.mass.totalKg / mission.maxMassKg} tone={report.mass.marginKg < 0 ? 'bad' : 'ok'} />
            <Meter label="Fuel / Δv" value={mps(report.propulsion.dvMps)} ratio={report.requiredDvMps > 0 ? report.propulsion.dvMps / report.requiredDvMps : 1} tone={report.propulsion.dvMps + 1 < report.requiredDvMps ? 'bad' : 'ok'} />
            <Meter label="Power" value={watts(generation)} ratio={report.power.loadW > 0 ? generation / report.power.loadW : 1} tone={generation + 1 < report.power.loadW ? 'bad' : 'ok'} />
            <Meter label="Cost" value={shortMoney(report.cost.totalUsd)} ratio={report.cost.totalUsd / mission.budgetUsd} tone={report.cost.marginUsd < 0 ? 'bad' : 'ok'} />
            <p className="edu-note">{EDU_LIMITS}</p>
            <SiDesk mission={mission} craft={craft} plan={plan} report={report} />
            <h2 className="section-label">Fitted</h2>
            {craft.parts.map((part) => {
              const fitted = CATALOG.find((item) => item.id === part.specId)
              if (!fitted) return null
              const family = familyOf(part.specId)
              return (
                <div key={part.instanceId} className={selectedInstanceId === part.instanceId ? 'part-tile on' : 'part-tile'} onClick={() => selectInstance(part.instanceId)}>
                  <PartPreview specId={fitted.id} />
                  <span>
                    <strong>{family?.name ?? fitted.name}</strong>
                    <em>{headline(fitted)} · {shortMoney(fitted.costUsd)}</em>
                  </span>
                  <button
                    type="button"
                    className="icon"
                    title={part.enabled ? `Hide ${fitted.name}` : `Show ${fitted.name}`}
                    aria-label={part.enabled ? `Hide ${fitted.name}` : `Show ${fitted.name}`}
                    onClick={(event) => { event.stopPropagation(); togglePart(part.instanceId) }}
                  >
                    {part.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button
                    type="button"
                    className="icon danger"
                    title={`Remove ${fitted.name}`}
                    aria-label={`Remove ${fitted.name}`}
                    onClick={(event) => { event.stopPropagation(); removePart(part.instanceId) }}
                  >
                    <Trash2 size={13} />
                  </button>
                  {family && (
                    <Setting
                      ids={family.ids}
                      value={part.specId}
                      label={`${family.name} setting`}
                      onChange={(id) => setSpec(part.instanceId, id)}
                    />
                  )}
                  {fitted.tankCapacityKg > 0 && (
                    <label className="fill-label" onClick={(event) => event.stopPropagation()}>
                      <span>Fill {Math.round(part.fill * 100)}%</span>
                      <input
                        className="fill"
                        aria-label={`${fitted.name} fill`}
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={part.fill}
                        onChange={(event) => setFill(part.instanceId, Number(event.target.value))}
                      />
                    </label>
                  )}
                </div>
              )
            })}
            {hard > 0 && (
              <div className="fix-first-block">
                <h2 className="section-label">Fix these first</h2>
                <ul className="fix-first-list">
                  {report.issues.filter((issue) => issue.severity === 'hard').slice(0, 3).map((issue) => (
                    <li key={issue.id}>{issue.what}</li>
                  ))}
                </ul>
                {hard > 3 && (
                  <button type="button" className="word slim" onClick={() => setIssuesOpen(true)}>
                    {hard - 3} more holds
                  </button>
                )}
              </div>
            )}
            {selected && (
              <div className="pad" aria-label="Move part">
                <Move3d size={14} />
                <button type="button" className="icon" aria-label="Move up" onClick={() => nudgePart(selected.instanceId, 0, 0.12, 0)}><ArrowUp size={14} /></button>
                <button type="button" className="icon" aria-label="Move down" onClick={() => nudgePart(selected.instanceId, 0, -0.12, 0)}><ArrowDown size={14} /></button>
                <button type="button" className="icon" aria-label="Move left" onClick={() => nudgePart(selected.instanceId, -0.12, 0, 0)}><ArrowLeft size={14} /></button>
                <button type="button" className="icon" aria-label="Move right" onClick={() => nudgePart(selected.instanceId, 0.12, 0, 0)}><ArrowRight size={14} /></button>
                <button type="button" className="icon" aria-label="Move forward" onClick={() => nudgePart(selected.instanceId, 0, 0, 0.12)}><ChevronsUp size={14} /></button>
                <button type="button" className="icon" aria-label="Move back" onClick={() => nudgePart(selected.instanceId, 0, 0, -0.12)}><ChevronsDown size={14} /></button>
                <button type="button" className="icon" aria-label="Reset placement" onClick={() => resetOffset(selected.instanceId)}><RotateCcw size={14} /></button>
                <p className="muted">{withoutLine(craft, mission, plan, selected.instanceId, report)}</p>
              </div>
            )}
          </div>
          <div className="card-actions">
            <button type="button" className="word" onClick={() => go('plan')}>Plan the flight</button>
          </div>
        </Glass>
      </aside>
      <div className="plan-launch hangar-actions">
        <p>Mass {kg(report.mass.totalKg)} / {kg(mission.maxMassKg)} · {shortMoney(report.cost.totalUsd)} / {shortMoney(mission.budgetUsd)} · {hard > 0 ? `${hard} holds` : 'Clear to plan'}</p>
        <button type="button" className="word" onClick={() => go('plan')}>Plan the flight</button>
      </div>
      {spec && (
        <Sheet title={spec.name} onClose={() => setSpecId(null)}>
          <div className="spec-hero"><PartPreview specId={spec.id} large /></div>
          <p>{spec.summary}</p>
          <button type="button" className="word" onClick={() => setAdvanced((value) => !value)}>{advanced ? 'Plain' : 'Numbers'}</button>
          {advanced && (
            <div className="facts">
              {facts(spec).map((fact) => (
                <div key={fact.label}><span>{fact.label}</span><b>{fact.value}</b></div>
              ))}
              <div><span>Hazard</span><b>{spec.hazardPerYear.toFixed(3)} / year</b></div>
              <div><span>Temperature</span><b>{Math.round(spec.tempMinK)}–{Math.round(spec.tempMaxK)} K</b></div>
            </div>
          )}
        </Sheet>
      )}
      {issuesOpen && (
        <Sheet title="Constraints" onClose={() => setIssuesOpen(false)}>
          {report.issues.length === 0 && <p className="ready">Ready to launch. Nothing is holding this spacecraft.</p>}
          {report.issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
          {hard > 0 && (
            <button type="button" className="word autofix" onClick={autoFix}><Sparkles size={14} /> Auto-fix</button>
          )}
        </Sheet>
      )}
    </>
  )
}

function FixBar({ show, onFix }: { show: boolean; onFix: () => void }) {
  if (!show) return null
  return (
    <div className="fix-bar">
      <span>This craft cannot fly yet.</span>
      <button type="button" className="word autofix" onClick={onFix}><Sparkles size={14} /> Auto-fix</button>
    </div>
  )
}

function IssueRow({ issue }: { issue: EngineeringIssue }) {
  return (
    <div className="issue-row">
      <span className={issue.severity === 'hard' ? 'pip bad' : 'pip'} />
      <div>
        <strong>{issue.what}</strong>
        <p>{issue.why}</p>
        <p>{issue.change}</p>
      </div>
    </div>
  )
}

export function PlanScreen() {
  const mission = useActiveMission()
  const craft = useMission((state) => state.craft)
  const plan = useMission((state) => state.plan)
  const setPlan = useMission((state) => state.setPlan)
  const rate = useMission((state) => state.rate)
  const setRate = useMission((state) => state.setRate)
  const autoFix = useMission((state) => state.autoFix)
  const go = useMission((state) => state.go)
  const armLaunch = useMission((state) => state.armLaunch)
  if (!mission || !craft || !plan) return null
  const report = evaluate(craft, mission, plan)
  const notes = report.issues.filter((issue) => issue.severity === 'hard')
  return (
    <>
      <FixBar show={notes.length > 0} onFix={autoFix} />
      <aside className="side left">
        <Glass className="pad-card">
          <DifficultyPanel compact />
          <div className="choice-row">
            {mission.captureOptions.map((option) => (
              <SpotButton
                key={option.id}
                className="choice-card"
                aria-pressed={plan.captureId === option.id}
                onClick={() => setPlan({ captureId: option.id })}
              >
                <b>{mps(option.dvMps)}</b>
                <span>{option.label}</span>
              </SpotButton>
            ))}
          </div>
          <h2 className="section-label">Suggestions</h2>
          {notes.length === 0 && <p className="ready">The plan can fly with this spacecraft.</p>}
          {notes.map((issue) => (
            <div key={issue.id} className="fix">
              <strong>{issue.what}</strong>
              <p>{issue.why}</p>
              <p>{issue.change}</p>
            </div>
          ))}
          {notes.length > 0 && (
            <button type="button" className="word autofix" onClick={autoFix}><Sparkles size={12} /> Auto-fix</button>
          )}
          <SiDesk mission={mission} craft={craft} plan={plan} report={report} />
        </Glass>
      </aside>
      <aside className="side right">
        <Glass className="pad-card">
          <Meter label="Available Δv" value={mps(report.propulsion.dvMps)} ratio={report.requiredDvMps > 0 ? report.propulsion.dvMps / report.requiredDvMps : 1} tone={report.propulsion.dvMps + 1 < report.requiredDvMps ? 'bad' : 'ok'} />
          <Meter label="Needed Δv" value={mps(report.requiredDvMps)} ratio={1} />
          <p className="edu-note">{EDU_LIMITS}</p>
          <label className="slider">
            <span>Reserve <b>{mps(plan.reserveDvMps)}</b></span>
            <input type="range" min={0} max={200} step={5} value={plan.reserveDvMps} onChange={(event) => setPlan({ reserveDvMps: Number(event.target.value) })} />
          </label>
          <label className="slider">
            <span>Science <b>{Math.round(plan.scienceDuty * 100)}%</b></span>
            <input type="range" min={0.2} max={1} step={0.05} value={plan.scienceDuty} onChange={(event) => setPlan({ scienceDuty: Number(event.target.value) })} />
          </label>
          <label className="slider">
            <span>Launch day <b>{(plan.launchDay ?? 0) > 0 ? `+${plan.launchDay}` : plan.launchDay ?? 0} d</b></span>
            <input type="range" min={-180} max={180} step={5} value={plan.launchDay ?? 0} onChange={(event) => setPlan({ launchDay: Number(event.target.value) })} />
          </label>
          <label className="slider">
            <span>Objective <b>{objectiveOf(plan).title}</b></span>
            <input
              type="range"
              min={0}
              max={OBJECTIVES.length - 1}
              step={1}
              value={Math.max(0, OBJECTIVES.findIndex((item) => item.id === (plan.objectiveId ?? 'water')))}
              onChange={(event) => {
                const objectiveId = OBJECTIVES[Number(event.target.value)].id
                const site = suggestedSite(mission.id, objectiveId)
                setPlan({ objectiveId, siteId: site.id })
              }}
            />
          </label>
          <p className="ready">{objectiveOf(plan).question}</p>
          <p>
            Kit {objectiveKit(plan.objectiveId).map((id) => getSpec(id)?.name ?? id).join(', ')}. {Math.round(kitCoverage(plan.objectiveId, craft.parts.filter((part) => part.enabled).map((part) => part.specId)) * objectiveKit(plan.objectiveId).length)} of {objectiveKit(plan.objectiveId).length} aboard. Suggested site {suggestedSite(mission.id, plan.objectiveId).name}.
          </p>
          <label className="slider">
            <span>Site <b>{siteOf(mission, plan).name}</b></span>
            <input
              type="range"
              min={0}
              max={sitesFor(mission.id === 'custom' ? 'mars' : mission.id).length - 1}
              step={1}
              value={Math.max(0, sitesFor(mission.id === 'custom' ? 'mars' : mission.id).findIndex((item) => item.id === plan.siteId))}
              onChange={(event) => {
                const rows = sitesFor(mission.id === 'custom' ? 'mars' : mission.id)
                setPlan({ siteId: rows[Number(event.target.value)].id })
              }}
            />
          </label>
          <p>{siteOf(mission, plan).note}</p>
          <p>{transferLine(mission, plan)}</p>
          <label className="slider">
            <span>Sim speed <b>{warpLabel(rate)}</b></span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={warpToSlider(rate)}
              onChange={(event) => setRate(sliderToWarp(Number(event.target.value)))}
            />
          </label>
          <div className="burns">
            {requiredBurns(mission, plan).map((burn) => (
              <div key={burn.id} className="burn">
                <i />
                <span>{burn.label}</span>
                <b>{mps(burn.dvMps)}</b>
              </div>
            ))}
          </div>
        </Glass>
      </aside>
      <div className="plan-launch">
        <p>Budget {shortMoney(mission.budgetUsd)} · this ship {shortMoney(report.cost.totalUsd)}</p>
        <button type="button" className="word slim" onClick={startPlanTutorial}>Help</button>
        <button type="button" className="word slim" onClick={() => go('design')}><Boxes size={16} /> Design</button>
        <button type="button" className="word" onClick={() => armLaunch()}><Rocket size={16} /> Launch</button>
      </div>
    </>
  )
}

const COUNT_STATUS = ['Flight computer', 'Guidance', 'Power', 'Thermal', 'Communications', 'Propulsion', 'Tanks', 'Hold', 'Ignition', 'Commit']

function km(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`
  return `${Math.round(metres)} m`
}

function transferLine(mission: MissionDef, plan: MissionPlan): string {
  const extra = Math.round(windowExtraDv(mission, plan))
  const days = (sec: number) => `${Math.round(sec / 86400)} days`
  if (mission.id === 'lunar') {
    const hop = lunarTransfer()
    if (!hop) return ''
    return `Patched conic: TLI ${Math.round(hop.tliMps)} m/s, lunar capture ${Math.round(hop.loiMps)} m/s, ${days(hop.tofSec)}. This launch date adds ${extra} m/s.`
  }
  if (mission.id === 'mars') {
    const hop = marsTransfer()
    if (!hop) return ''
    return `Hohmann: Earth departure ${Math.round(hop.departureMps)} m/s, Mars capture ${Math.round(hop.captureMps)} m/s, ${days(hop.tofSec)}. The window is about 26 months. This date adds ${extra} m/s.`
  }
  const hop = solarTransfer(mission.destinationAu)
  if (!hop) return ''
  return `Hohmann departure ${Math.round(hop.departureMps)} m/s, arrival excess ${Math.round(hop.vInfArrive)} m/s, ${days(hop.tofSec)}. This launch date adds ${extra} m/s.`
}

export function LaunchScreen({ onCharge, onAscent }: { charge: number; onCharge: (value: number) => void; onAscent: (state: AscentState | null) => void }) {
  const mission = useActiveMission()
  const craft = useMission((state) => state.craft)
  const plan = useMission((state) => state.plan)
  const audio = useMission((state) => state.audio)
  const commit = useMission((state) => state.commitLaunch)
  const go = useMission((state) => state.go)
  const autoFix = useMission((state) => state.autoFix)
  const [count, setCount] = useState<number | null>(null)
  const [flying, setFlying] = useState(false)
  const [readout, setReadout] = useState<AscentState | null>(null)
  const controls = useRef({ throttle: 1, pitch: 0, yaw: 0, abort: false })
  const heard = useRef<number | null>(null)

  useEffect(() => {
    if (count === null || flying) {
      if (count === null) onCharge(0)
      return undefined
    }
    onCharge(Math.min(1, (10 - count) / 10))
    if (heard.current !== count) {
      heard.current = count
      if (count > 0) say(String(count), audio)
    }
    if (count <= 0) {
      setFlying(true)
      return undefined
    }
    const id = window.setTimeout(() => setCount((value) => (value === null ? value : value - 1)), 1800)
    return () => window.clearTimeout(id)
  }, [count, flying, onCharge, audio])

  useEffect(() => {
    if (!flying || !craft || !mission || !plan) return undefined
    const payload = evaluate(craft, mission, plan).mass.totalKg
    let state = createAscent(payload)
    let last = performance.now()
    let frame = 0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const input = controls.current
      state = stepAscent(state, input, dt * ASCENT_TIME_SCALE, payload)
      onAscent(state)
      setReadout(state)
      if (state.callout) say(state.callout, useMission.getState().audio)
      if (state.phase === 'orbit') {
        commit()
        return
      }
      if (state.aborted) {
        silence()
        onAscent(null)
        go('design')
        return
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      onAscent(null)
    }
  }, [flying, craft, mission, plan, commit, go, onAscent])

  if (!mission || !craft || !plan) return null
  const report = evaluate(craft, mission, plan)
  const problems = report.issues.filter((issue) => issue.severity === 'hard')
  const status = count && count > 0 ? COUNT_STATUS[10 - count] : flying ? (readout?.phase ?? 'ascent') : 'Launch'
  return (
    <>
      <aside className="side left">
        <Glass className="pad-card">
          {problems.length > 0 ? (
            <>
              {problems.map((issue) => (
                <div key={issue.id} className="fix">
                  <strong>{issue.what}</strong>
                  <p>{issue.why}</p>
                  <p>{issue.change}</p>
                </div>
              ))}
              <div className="card-actions">
                <button type="button" className="word autofix" onClick={autoFix}><Sparkles size={12} /> Auto-fix</button>
                <button type="button" className="word slim" onClick={() => go('design')}>
                  <PenLine size={12} /> Design
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="ready">{count === null && !flying ? `${craft.name} on the shared booster. Start the countdown.` : status}</p>
              {readout && (
                <div className="readouts">
                  <div><span>Altitude</span><b>{km(readout.altitudeM)}</b></div>
                  <div><span>Speed</span><b>{Math.round(readout.velocityMps)} m/s</b></div>
                  <div><span>Path</span><b>{Math.round((readout.flightPathRad * 180) / Math.PI)}°</b></div>
                  <div><span>Q</span><b>{(readout.qPa / 1000).toFixed(1)} kPa</b></div>
                  <div><span>AoA</span><b>{Math.abs(readout.aoaRad * 180 / Math.PI).toFixed(1)}°</b></div>
                  <div><span>TWR</span><b>{readout.twr.toFixed(2)}</b></div>
                  <div><span>Accel</span><b>{(readout.accelMps2 / 9.80665).toFixed(2)} g</b></div>
                  <div><span>Mach</span><b>{readout.mach.toFixed(2)}</b></div>
                  <div><span>Core</span><b>{(readout.propellantKg / 1000).toFixed(0)} t</b></div>
                </div>
              )}
            </>
          )}
        </Glass>
      </aside>
      {flying && readout && (
        <aside className="side right">
          <Glass className="pad-card captain">
            <strong>Captain</strong>
            <label className="slider">
              <span>Throttle</span>
              <input type="range" min={0.4} max={1} step={0.01} defaultValue={1} onChange={(event) => { controls.current.throttle = Number(event.target.value) }} />
            </label>
            <label className="slider">
              <span>Pitch</span>
              <input type="range" min={-1} max={1} step={0.01} defaultValue={0} onChange={(event) => { controls.current.pitch = Number(event.target.value) }} />
            </label>
            <div className="card-actions">
              <button type="button" className="word slim" onPointerDown={() => { controls.current.yaw = 0.8 }} onPointerUp={() => { controls.current.yaw = 0 }} onPointerLeave={() => { controls.current.yaw = 0 }}>Yaw left</button>
              <button type="button" className="word slim" onPointerDown={() => { controls.current.yaw = -0.8 }} onPointerUp={() => { controls.current.yaw = 0 }} onPointerLeave={() => { controls.current.yaw = 0 }}>Yaw right</button>
            </div>
            <button type="button" className="word slim" onClick={() => { controls.current.abort = true }}>Abort</button>
          </Glass>
        </aside>
      )}
      <div className="launch-stage">
        {count !== null && count > 0 && !flying && <div className="count">{count}</div>}
        {problems.length === 0 && count === null && !flying && (
          <button type="button" className="word count-go" onClick={() => setCount(10)}>
            <Rocket size={16} /> Begin countdown
          </button>
        )}
      </div>
    </>
  )
}

export function FlightScreen() {
  const sim = useMission((state) => state.sim)
  const craft = useMission((state) => state.craft)
  const mission = useActiveMission()
  const paused = useMission((state) => state.paused)
  const rate = useMission((state) => state.rate)
  const camera = useMission((state) => state.camera)
  const tick = useMission((state) => state.tick)
  const setPaused = useMission((state) => state.setPaused)
  const setRate = useMission((state) => state.setRate)
  const setCamera = useMission((state) => state.setCamera)
  const decide = useMission((state) => state.decide)
  const toggle = useMission((state) => state.toggleSystem)
  const finish = useMission((state) => state.finish)
  const go = useMission((state) => state.go)
  const audio = useMission((state) => state.audio)
  const [sheet, setSheet] = useState<'log' | 'decision' | null>(null)

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let carry = 0
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const state = useMission.getState()
      if (state.phase === 'flight' && state.sim?.status === 'running' && !state.paused) {
        carry += dt * state.rate
        let guard = 0
        while (carry > 1 && guard < 48) {
          const live = useMission.getState()
          if (!live.sim || live.sim.status !== 'running' || live.paused) break
          const before = live.sim.tSec
          live.tick(carry)
          const after = useMission.getState().sim?.tSec ?? before
          const advanced = after - before
          if (advanced <= 0) break
          carry -= advanced
          guard += 1
        }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [tick])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === ' ' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault()
        setPaused(!useMission.getState().paused)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaused])

  useEffect(() => {
    if (!audio || !sim?.decision) return
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 440
    gain.gain.value = 0.03
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
    return () => { void ctx.close() }
  }, [audio, sim?.decision?.id])

  if (!sim || !craft || !mission) return null
  const prop = sim.propellant.chemical + sim.propellant.electric + sim.propellant['cold-gas']
  const done = sim.status === 'complete' || sim.status === 'failed'
  const science = craft.parts.filter((part) => CATALOG.find((spec) => spec.id === part.specId)?.subsystem === 'science')
  return (
    <div className="flight-ui">
      {sim.decision && (
        <Glass className="decision">
          <div className="card-head">
            <strong>{sim.decision.title}</strong>
            <button type="button" className="icon" aria-label="Decision details" onClick={() => setSheet('decision')}><Info size={14} /></button>
          </div>
          <div className="choice-row">
            {sim.decision.options.map((option) => (
              <button key={option.id} type="button" className="word" title={option.detail} onClick={() => decide(option.id)}>{option.label}</button>
            ))}
          </div>
        </Glass>
      )}
      <aside className="side right">
        <Glass className="stack-card">
          <div className="scroll">
            <div className="card-head">
              <strong className="truncate">{sim.phaseLabel}</strong>
              <span className="badge">Schematic</span>
            </div>
            <Meter icon={<Clock size={14} />} label="Clock" value={clock(sim.tSec)} ratio={Math.min(1, sim.tSec / (mission.durationDays * 86400))} />
            <Meter icon={<Droplets size={14} />} label="Propellant" value={kg(prop, 1)} ratio={0.7} />
            <Meter icon={<Gauge size={14} />} label="Delta-v" value={mps(sim.dvUsedMps)} ratio={Math.min(1, sim.dvUsedMps / 4000)} />
            <Meter icon={<Zap size={14} />} label="Power" value={watts(sim.powerGenW)} ratio={sim.powerLoadW > 0 ? sim.powerGenW / sim.powerLoadW : 1} tone={sim.powerGenW + 1 < sim.powerLoadW ? 'bad' : 'ok'} />
            <Meter icon={<Battery size={14} />} label="Battery" value={`${(sim.batteryJ / 3600).toFixed(0)} Wh`} ratio={0.6} />
            <Meter icon={<Radio size={14} />} label="Link" value={db(sim.commsMarginDb)} ratio={sim.commsMarginDb > 0 ? 1 : 0.3} tone={sim.commsMarginDb > 0 ? 'ok' : 'bad'} />
            <div className="chips">
              {science.map((part) => {
                const spec = CATALOG.find((item) => item.id === part.specId)
                const off = sim.disabled.includes(part.specId)
                return (
                  <button key={part.instanceId} type="button" className="chip" aria-pressed={!off} aria-label={spec?.name ?? part.specId} onClick={() => toggle(part.specId)}>
                    {spec?.name ?? 'Instrument'}
                  </button>
                )
              })}
            </div>
          </div>
        </Glass>
      </aside>
      {sim.log[0] && <div className="ticker-wrap"><span className="ticker">{sim.log[0].text}</span></div>}
      <Dock className="bottom-dock">
        <button type="button" data-dock className="dock-btn" aria-label={paused ? 'Resume' : 'Pause'} onClick={() => setPaused(!paused)}>
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <label className="dock-warp">
          <span>{warpLabel(rate)}</span>
          <input type="range" min={0} max={1} step={0.001} value={warpToSlider(rate)} aria-label="Sim speed" onChange={(event) => setRate(sliderToWarp(Number(event.target.value)))} />
        </label>
        <button type="button" data-dock className="dock-btn" aria-label="Chase" aria-pressed={camera === 'chase'} onClick={() => setCamera('chase')}><Crosshair size={16} /></button>
        <button type="button" data-dock className="dock-btn" aria-label="Aft" aria-pressed={camera === 'aft'} onClick={() => setCamera('aft')}><ArrowLeft size={16} /></button>
        <button type="button" data-dock className="dock-btn" aria-label="Wide" aria-pressed={camera === 'wide'} onClick={() => setCamera('wide')}><Maximize2 size={16} /></button>
        <button type="button" data-dock className="dock-btn" aria-label="Orbit" aria-pressed={camera === 'orbit'} onClick={() => setCamera('orbit')}><Orbit size={16} /></button>
        <button type="button" data-dock className="dock-btn" aria-label="Log" onClick={() => setSheet('log')}><List size={16} /></button>
        {done && !sim.failed && <button type="button" data-dock className="dock-btn" aria-label="Land" onClick={() => go('landing')}><Flag size={16} /></button>}
        {done && sim.failed && <button type="button" data-dock className="dock-btn" aria-label="Debrief" onClick={finish}><Flag size={16} /></button>}
      </Dock>
      {sheet === 'log' && (
        <Sheet title="Log" onClose={() => setSheet(null)}>
          {sim.log.slice(0, 12).map((entry, index) => (
            <div key={`${entry.tSec}-${index}`} className="log-line"><span>{clock(entry.tSec)}</span><span>{entry.text}</span></div>
          ))}
          <p className="muted">{kelvin(sim.temperatureK)} · {bits(sim.dataReturnedBits)} · science {sim.sciencePoints.toFixed(0)}</p>
        </Sheet>
      )}
      {sheet === 'decision' && sim.decision && (
        <Sheet title={sim.decision.title} onClose={() => setSheet(null)}>
          <p>{sim.decision.detail}</p>
          {sim.decision.options.map((option) => <p key={option.id}><strong>{option.label}.</strong> {option.detail}</p>)}
        </Sheet>
      )}
    </div>
  )
}

export function DebriefScreen() {
  const outcome = useMission((state) => state.outcome)
  const go = useMission((state) => state.go)
  const field = useMission((state) => state.field)
  const resumeSurface = useMission((state) => state.resumeSurface)
  const missionId = useMission((state) => state.missionId)
  const [copied, setCopied] = useState(false)
  if (!outcome) return null

  const rank = outcome.gradeRank ?? (outcome.score >= 92 ? 'S' : outcome.score >= 80 ? 'A' : outcome.score >= 65 ? 'B' : outcome.score >= 50 ? 'C' : 'F')
  const leftover = outcome.budgetUsd - outcome.costUsd
  const { title, tone: verdictTone } = debriefVerdict(outcome)
  const flapPhrase = title.toUpperCase()
  const flapColor = verdictTone === 'win' ? '#9be7b0' : verdictTone === 'partial' ? '#f0c48a' : '#f0a090'

  const breakdown = outcome.scoreBreakdown ?? {
    primaryPoints: outcome.success ? 30 : 12,
    sciencePoints: Math.min(30, Math.round(outcome.score * 0.3)),
    dataPoints: Math.min(25, Math.round(outcome.score * 0.25)),
    budgetPoints: Math.min(15, leftover >= 0 ? 10 : 0),
    landingPoints: 0,
    anomalyPoints: 0,
    total: outcome.score,
  }

  const handleCopy = () => {
    void navigator.clipboard?.writeText(summaryOf(outcome))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const mars = missionId === 'mars' || missionId === 'custom'

  return (
    <div className="center-stage debrief-stage">
      <Glass className={`debrief-console result-card ${verdictTone === 'win' ? 'is-win' : verdictTone === 'partial' ? 'is-partial' : 'is-lose'}`}>
        <div className="debrief-header">
          <div>
            <span className="debrief-tag">Result</span>
            <h1 className="debrief-title">
              <SplitFlapText
                key={flapPhrase}
                text={flapPhrase}
                loop={false}
                intro
                tileStyle="board"
                padTo={14}
                align="left"
                fontSize={20}
                gap={4}
                tileRadius={5}
                tileColor="#0f1419"
                textColor={flapColor}
                flipDuration={0.1}
                stagger={0.045}
                flipsPerChar={7}
                glare={0.12}
                depth={0.42}
                order="left"
              />
            </h1>
            <p className="muted">{outcome.craftName}{outcome.siteName ? ` · ${outcome.siteName}` : ''}</p>
          </div>
          <div className={`debrief-rank-badge rank-${rank}`}>
            <span>{rank}</span>
          </div>
        </div>

        <p className="result-why">{outcome.summary}</p>
        <p className="edu-note">{EDU_LIMITS}</p>

        <div className="debrief-hero">
          <div className="debrief-summary-box">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span className="debrief-summary-score">{outcome.score}</span>
              <span style={{ fontSize: '12px', color: '#64748b' }}>/ 100</span>
            </div>
          </div>
        </div>

        <div className="debrief-breakdown-grid">
          <div className="debrief-cat-row">
            <div className="debrief-cat-header">
              <span>Flight</span>
              <b>{breakdown.primaryPoints} / 30</b>
            </div>
            <div className="debrief-cat-bar">
              <div className="debrief-cat-fill" style={{ width: `${(Math.max(0, breakdown.primaryPoints) / 30) * 100}%` }} />
            </div>
          </div>
          <div className="debrief-cat-row">
            <div className="debrief-cat-header">
              <span>Science</span>
              <b>{breakdown.sciencePoints} / 30</b>
            </div>
            <div className="debrief-cat-bar">
              <div className="debrief-cat-fill" style={{ width: `${(Math.max(0, breakdown.sciencePoints) / 30) * 100}%` }} />
            </div>
          </div>
          <div className="debrief-cat-row">
            <div className="debrief-cat-header">
              <span>Data sent</span>
              <b>{breakdown.dataPoints} / 25</b>
            </div>
            <div className="debrief-cat-bar">
              <div className="debrief-cat-fill" style={{ width: `${(Math.max(0, breakdown.dataPoints) / 25) * 100}%` }} />
            </div>
          </div>
          <div className="debrief-cat-row">
            <div className="debrief-cat-header">
              <span>Budget left</span>
              <b>{Math.max(0, breakdown.budgetPoints)} / 15</b>
            </div>
            <div className="debrief-cat-bar">
              <div className="debrief-cat-fill" style={{ width: `${(Math.max(0, breakdown.budgetPoints) / 15) * 100}%` }} />
            </div>
          </div>
        </div>

        {outcome.lessons.length > 0 && (
          <div className="result-lessons">
            {outcome.lessons.map((line) => <p key={line}>{line}</p>)}
          </div>
        )}

        {outcome.crew && outcome.crew.length > 1 && (
          <div className="crew-report">
            <b>Flight crew</b>
            <ul>
              {outcome.crew.map((seat) => (
                <li key={seat.role}><em>{seat.role}</em> {seat.name}</li>
              ))}
            </ul>
          </div>
        )}
        <MissionRankingTable limit={6} />
        <div className="debrief-objectives-box">
          <p className="debrief-panel-label">Goals</p>
          {outcome.objectives.filter((item) => item.id === 'survive' || item.id === 'science' || item.id === 'data').map((item) => (
            <div key={item.id} className="debrief-obj-row">
              {item.met ? (
                <CircleCheck size={15} style={{ color: '#4ade80', flexShrink: 0, marginTop: '2px' }} />
              ) : (
                <CircleAlert size={15} style={{ color: '#f87171', flexShrink: 0, marginTop: '2px' }} />
              )}
              <strong style={{ color: item.met ? '#f1f5f9' : '#e2e8f0', fontSize: '12px' }}>{item.label}</strong>
            </div>
          ))}
        </div>

        <div className="result-actions">
          {((!outcome.success) || (mars && (outcome.success || outcome.partial || outcome.score >= 65))) && (
            <div className="result-actions-primary">
              {!outcome.success && (
                <button type="button" className="word fill" onClick={() => go('design')}>Try again</button>
              )}
              {mars && (outcome.success || outcome.partial || outcome.score >= 65) && (
                <button type="button" className="word fill" onClick={() => (field ? resumeSurface() : go('surface'))}>
                  Walk the surface
                </button>
              )}
            </div>
          )}
          <button type="button" className="word slim" onClick={() => go('design')}>Rebuild</button>
          <button type="button" className="word slim" onClick={() => go('select')}>Home</button>
          <button type="button" className="word slim" onClick={handleCopy}>{copied ? 'Copied' : 'Copy result'}</button>
        </div>
      </Glass>
    </div>
  )
}

function summaryOf(outcome: MissionOutcome): string {
  const bd = outcome.scoreBreakdown
  const { title: verdictTitle } = debriefVerdict(outcome)
  const bdLines = bd ? [
    `Flight ${bd.primaryPoints}/30 · Science ${bd.sciencePoints}/30 · Data ${bd.dataPoints}/25 · Budget ${bd.budgetPoints}/15`,
  ] : []
  const blurb = verdictTitle === 'You won'
    ? 'Goals met.'
    : verdictTitle === 'Strong run'
      ? 'High score. One or more mission goals were still short.'
      : outcome.partial
        ? 'Flight finished. Some goals were short.'
        : 'Flight stopped early.'
  return [
    `${APP_NAME} · ${outcome.craftName} · ${outcome.gradeRank ?? 'A'} ${outcome.score}/100`,
    EDU_LIMITS,
    blurb,
    `Budget ${shortMoney(outcome.costUsd)} of ${shortMoney(outcome.budgetUsd)} · data ${bits(outcome.dataReturnedBits)}`,
    ...bdLines,
  ].filter(Boolean).join('\n')
}

export function CreditsScreen() {
  const [gpu, setGpu] = useState('Checking the graphics device')
  useEffect(() => { setGpu(graphicsLabel()) }, [])
  return (
    <div className="center-stage">
      <Glass className="pad-card credits">
        <strong>{APP_NAME}</strong>
        <p>Briefing stills come from the NASA Image and Video Library. A Mars frame comes from the NASA/JPL Mars 2020 raw-image feed. Solar notes come from DONKI notifications. The asteroid count comes from the NEO feed. Each is cached for twelve hours, and the briefing stays up if a request fails. None of those feeds is the trajectory.</p>
        <p>The spacecraft is extruded the way Alexander Sanfilippo builds one: a polygon scaled and stitched, nose one way and the bell the other. Plate, foil and tile are painted on that hull. Catalog parts sit on it. https://github.com/AlexSanfilippo/ProceduralMeshGeneration</p>
        <p>Earth and Mars maps in the cruise sky are CC-BY 4.0 by Akshat. The Moon, Europa, and Jupiter maps, the grass clumps, the launch console, and the suited astronaut are the files supplied in public/3d.</p>
        <p>After booster separation the winged craft uses lift and drag from the NASA Operational Aerodynamic Data Book, September 1985. The stack below that uses an axial drag coefficient with a transonic rise.</p>
        <p>The hangar name still follows Shipwright by Dolf Veenvliet. https://github.com/macouno/shipwright</p>
        <p>Sound effects are the Oculus Audio Pack 1 by Oculus VR, LLC, CC BY 4.0, from the Meta open-sound collection. https://github.com/facebookincubator/Meta-open-sound</p>
        <p>The Mars surface rover is the NASA/JPL public-domain Perseverance model. The yard also uses NASA’s Ingenuity helicopter, Apollo lunar module, Explorer Jupiter-C, astronaut, and extravehicular suit. Those models are free of copyright. https://github.com/nasa/NASA-3D-Resources</p>
        <p>Starfield, flame and renderer fallback follow VOIDTYPE by Itz-Murali and Itz-Anya. https://github.com/Itz-Murali/Void-Type</p>
        <p>The hangar engineer is SI-generated text from NVIDIA NIM. It tries nvidia/nemotron-3.5-super-vl-120b-a12b, then nvidia/nemotron-3-ultra-550b-a55b, then nvidia/nemotron-3.5-lightning-30b-a3b. It explains holds and can suggest catalog parts. Mass, delta-v, power, link, heat, and cost are still computed in the game. No NASA logos or mission marks are generated.</p>
        <p>Mission titles use TechText; spotlight cards, the dock and the starfield follow patterns from React Bits (reactbits.dev).</p>
        <p className="muted">{gpu}</p>
      </Glass>
    </div>
  )
}
