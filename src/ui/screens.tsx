import { useEffect, useRef, useState, useMemo } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Battery,
  Boxes,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  CircleAlert,
  CircleCheck,
  CheckCircle2,
  Clock,
  Compass,
  Crosshair,
  DollarSign,
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
  Radio,
  Redo2,
  Rocket,
  RotateCcw,
  Route,
  Sparkles,
  Undo2,
  Wand2,
  Weight,
  Zap,
} from 'lucide-react'
import { CATALOG, getSpec } from '../domain/catalog'
import { OBJECTIVES, kitCoverage, objectiveKit, objectiveOf, siteOf, sitesFor, suggestedSite, windowExtraDv } from '../domain/campaign'
import { bits, clock, db, kelvin, kg, money, mps, percent, watts } from '../domain/format'
import { lunarTransfer, marsTransfer, solarTransfer } from '../domain/orbit'
import { sliderToWarp, warpLabel, warpToSlider } from '../domain/time'
import { evaluate, requiredBurns } from '../domain/validate'
import type { ComponentSpec, EngineeringIssue, EngineeringReport, MissionDef, MissionOutcome, MissionPlan, SpacecraftConfig } from '../domain/types'
import { loadMarsPhoto, loadNasa, loadSolarNote, type MarsFrame, type NasaContext, type SolarNote } from '../nasa/client'
import { useActiveMission, useMission } from '../store/useMission'
import { graphicsLabel } from '../render/world'
import { createAscent, stepAscent, ASCENT_TIME_SCALE, type AscentState } from '../domain/ascent'
import { say, silence } from './voice'
import { Dock, Glass, Meter, MissionTitle, ScoreRing, Sheet, SpotButton } from './bits'
import { PartPreview } from './partPreview'
import { DestModel } from './DestStill'
import { TitleBanner } from './TitleBanner'
import { FAMILIES, SECTIONS, familyOf } from './families'
import { CATEGORIES, type UiCategory, getPartCategory, JARGON_TOOLTIPS } from './themeTokens'
import { PartCard } from './PartCard'

const BUILD_TABS: { id: UiCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'structure', label: 'Structure' },
  { id: 'propulsion', label: 'Propulsion' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'power', label: 'Power' },
  { id: 'communications', label: 'Comms' },
  { id: 'science', label: 'Science' },
  { id: 'thermal', label: 'Thermal' },
  { id: 'landing', label: 'Landing' },
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

export function SelectScreen({ onLaunch }: { onLaunch?: () => void }) {
  const startFresh = useMission((state) => state.startFresh)
  const loadSave = useMission((state) => state.loadSave)
  const snapshotSave = useMission((state) => state.snapshotSave)
  const saves = useMission((state) => state.saves)
  const [loadOpen, setLoadOpen] = useState(false)
  return (
    <div className="center-stage">
      <TitleBanner />
      <div className="title-gate">
        <MissionTitle text="Mission Control" variant="hero" />
        <p>The rocket is on the pad. You start on the grounds, on foot.</p>
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
  }, [mission])
  if (!mission) return null
  const stillId = mission.id === 'custom' ? (customBaseId ?? 'lunar') : mission.id
  const tag = mission.id === 'custom' ? (SHORT[stillId] ?? mission.name) : (SHORT[mission.id] ?? mission.name)
  return (
    <>
      <div className="world-card brief-card">
        <h2 className="clean-mission-tag">{tag}</h2>
        <strong className="brief-card-title">{mission.name}</strong>
        <p className="brief-card-desc">{mission.summary}</p>
        <div className="card-actions brief-actions">
          <button type="button" className="word primary brief-build-btn" onClick={() => go('design')}><Boxes size={18} /> Build</button>
          <button type="button" className="word slim brief-close-btn" onClick={() => go('pad')}>Close</button>
        </div>
      </div>
      <aside className="side right">
        <Glass className="pad-card">
          <div className="card-head">
            <div>
              <strong className="brief-head-name">{mission.name}</strong>
              <p className="brief-head-summary">{mission.summary}</p>
            </div>
            <button type="button" className="icon" title="Mission notes" aria-label="Briefing notes" onClick={() => setInfo(true)}><Info size={16} /></button>
          </div>
          {/* 1. Summary stats first */}
          <div className="statgrid">
            <div className="statblock"><b>{mission.durationDays}</b><span>days</span></div>
            <div className="statblock"><b>{mission.maxMassKg}</b><span>kg</span></div>
            <div className="statblock"><b>{shortMoney(mission.budgetUsd)}</b><span>budget</span></div>
            <div className="statblock"><b>{mission.requiredInstruments.length}</b><span>instruments</span></div>
          </div>
          {/* 2. Instrument chips with icons */}
          <div className="chips-block">
            <span className="section-label">Instruments</span>
            <div className="chips">
              {mission.requiredInstruments.map((name) => (
                <span key={name} className="chip on" title="Required instrument">
                  <Sparkles size={12} /> {name}
                </span>
              ))}
              {mission.optionalInstruments.map((name) => (
                <span key={name} className="chip" title="Optional instrument">
                  <Sparkles size={12} /> {name} (opt)
                </span>
              ))}
            </div>
          </div>
          {/* 3. Images with captions */}
          {nasa?.imageUrl && (
            <figure className="nasa-still">
              <img src={nasa.imageUrl} alt={nasa.title} />
              <figcaption>{nasa.title}. NASA Image and Video Library.</figcaption>
            </figure>
          )}
          {photo && (
            <figure className="nasa-still">
              <img src={photo.imageUrl} alt={`${photo.rover} ${photo.camera}`} />
              <figcaption>{photo.rover} sol {photo.sol} · {photo.camera} · {photo.earthDate}. NASA/JPL Mars 2020 raw images.</figcaption>
            </figure>
          )}
          {solar && <p className="muted">DONKI lists a {solar.classType} flare issued {solar.begin.slice(0, 10)}. Catalogued space weather.</p>}
          {/* 4. Disclaimer in small text */}
          <p className="muted disclaimer-text">Days, mass, and budget are educational limits, not a NASA specification.</p>
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
  const arrange = useMission((state) => state.arrange)
  const canUndo = useMission((state) => (state.craftPast?.length ?? 0) > 0)
  const canRedo = useMission((state) => (state.craftFuture?.length ?? 0) > 0)
  const rename = useMission((state) => state.rename)
  const go = useMission((state) => state.go)
  const [filter, setFilter] = useState<UiCategory | 'all'>('structure')
  const [pick, setPick] = useState<Record<string, number>>({})
  const [callSign, setCallSign] = useState(craft?.name ?? 'Surveyor')
  const [specId, setSpecId] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [moreParts, setMoreParts] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [fittedOpen, setFittedOpen] = useState(true)

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

  const fittedCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    if (!craft) return counts
    for (const p of craft.parts) {
      const spec = CATALOG.find((c) => c.id === p.specId)
      if (spec) {
        const cat = getPartCategory(spec)
        counts[cat] = (counts[cat] ?? 0) + 1
        counts['all'] = (counts['all'] ?? 0) + 1
      }
    }
    return counts
  }, [craft])

  if (!craft || !mission || !plan) return null
  const report = evaluate(craft, mission, plan)
  const sections = SECTIONS.map((section) => ({
    label: section.label,
    families: section.familyIds
      .map((id) => FAMILIES.find((family) => family.id === id))
      .filter((family): family is NonNullable<typeof family> => {
        if (!family) return false
        const sampleSpec = CATALOG.find((e) => e.id === family.ids[0])
        if (!sampleSpec) return false
        return filter === 'all' || getPartCategory(sampleSpec) === filter
      }),
    singles: section.singleIds
      .map((id) => CATALOG.find((item) => item.id === id))
      .filter((item): item is ComponentSpec => {
        if (!item) return false
        const matchesFilter = filter === 'all' || getPartCategory(item) === filter
        const matchesExtra = moreParts || !EXTRA_PARTS.has(item.id) || filter === 'science'
        return matchesFilter && matchesExtra
      }),
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

  const fittedCountForSpec = (specId: string) => craft.parts.filter((p) => p.specId === specId).length

  return (
    <>
      <FixBar show={hard > 0} onFix={autoFix} />
      <aside className="side left">
        <Glass className="stack-card">
          <div className="build-tabs-bar" role="toolbar" aria-label="Part categories">
            {BUILD_TABS.map((item) => {
              const meta = item.id === 'all' ? null : CATEGORIES[item.id]
              const Icon = meta ? meta.icon : Boxes
              const count = fittedCounts[item.id] ?? 0
              const isActive = filter === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`build-tab-btn ${isActive ? 'is-active' : ''}`}
                  style={meta && isActive ? { borderColor: meta.border, color: meta.color, backgroundColor: meta.bg } : undefined}
                  onClick={() => setFilter(item.id)}
                  title={`Show ${item.label} parts`}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span>{item.label}</span>
                  {count > 0 && <span className="build-tab-badge">{count}</span>}
                </button>
              )
            })}
          </div>
          <div className="part-list">
            {sections.map((section) => (
              <div key={section.label} className="catalog-section">
                <h3 className="section-label">{section.label}</h3>
                {section.families.map((family) => {
                  const index = Math.min(pick[family.id] ?? 0, family.ids.length - 1)
                  const item = CATALOG.find((entry) => entry.id === family.ids[index])
                  if (!item) return null
                  return (
                    <PartCard
                      key={family.id}
                      mode="catalog"
                      item={item}
                      count={fittedCountForSpec(item.id)}
                      family={family}
                      selected={selectedId === item.id}
                      onSelect={() => fitOrSelect(item.id)}
                      onAdd={() => addPart(item.id)}
                      onRemove={() => {
                        const fitted = craft.parts.find((p) => p.specId === item.id)
                        if (fitted) removePart(fitted.instanceId)
                      }}
                      onInfo={() => { setAdvanced(false); setSpecId(item.id) }}
                      onSelectVariant={(id) => {
                        setPick((current) => ({ ...current, [family.id]: family.ids.indexOf(id) }))
                        selectPart(id)
                      }}
                    />
                  )
                })}
                {section.singles.map((item) => (
                  <PartCard
                    key={item.id}
                    mode="catalog"
                    item={item}
                    count={fittedCountForSpec(item.id)}
                    selected={selectedId === item.id}
                    onSelect={() => fitOrSelect(item.id)}
                    onAdd={() => addPart(item.id)}
                    onRemove={() => {
                      const fitted = craft.parts.find((p) => p.specId === item.id)
                      if (fitted) removePart(fitted.instanceId)
                    }}
                    onInfo={() => { setAdvanced(false); setSpecId(item.id) }}
                  />
                ))}
              </div>
            ))}
            <button
              type="button"
              className="word slim show-all-instruments-btn"
              onClick={() => setMoreParts((value) => !value)}
            >
              <Sparkles size={14} />
              <span>{moreParts ? 'Hide optional instruments' : 'Show all science instruments'}</span>
            </button>
          </div>
        </Glass>
      </aside>
      <aside className="side right">
        <Glass className="stack-card">
          <div className="design-action-toolbar">
            <input
              className="craft-name-input"
              aria-label="Call sign"
              title="Spacecraft name"
              value={callSign}
              onChange={(event) => {
                setCallSign(event.target.value)
                rename(event.target.value)
              }}
            />
            <div className="action-buttons-group">
              <button
                type="button"
                className="icon-action-btn"
                title="Generate spacecraft design"
                aria-label="Generate design"
                onClick={() => generate(callSign)}
              >
                <Sparkles size={15} />
              </button>
              <button
                type="button"
                className="icon-action-btn"
                title="Auto arrange & aerodynamic align"
                aria-label="Auto arrange"
                onClick={arrange}
              >
                <Wand2 size={15} />
              </button>
              <button
                type="button"
                className="icon-action-btn"
                title="Undo change (Ctrl+Z)"
                aria-label="Undo"
                disabled={!canUndo}
                onClick={undo}
              >
                <Undo2 size={15} />
              </button>
              <button
                type="button"
                className="icon-action-btn"
                title="Redo change (Ctrl+Y)"
                aria-label="Redo"
                disabled={!canRedo}
                onClick={redo}
              >
                <Redo2 size={15} />
              </button>
            </div>
            <button type="button" className="icon" title={`${report.issues.length} constraints`} aria-label={`${report.issues.length} constraints`} onClick={() => setIssuesOpen(true)}>
              {hard > 0 ? <CircleAlert size={15} /> : <CircleCheck size={15} />}
              {report.issues.length > 0 && <em className="count-pip">{report.issues.length}</em>}
            </button>
          </div>
          <div className="scroll">
            <div className="stat-cards-column">
              {/* 1. Mass */}
              <div className="clean-stat-card" title={JARGON_TOOLTIPS.mass}>
                <div className="stat-card-header">
                  <div className="stat-card-title">
                    <Weight size={14} />
                    <span>Mass</span>
                  </div>
                  <strong className={`stat-card-value ${report.mass.marginKg < 0 ? 'bad' : 'ok'}`}>
                    {kg(report.mass.totalKg)} / {kg(mission.maxMassKg)}
                  </strong>
                </div>
                <div className="stat-progress-track">
                  <div
                    className={`stat-progress-bar ${report.mass.marginKg < 0 ? 'bad' : 'ok'}`}
                    style={{ width: `${Math.min(100, (report.mass.totalKg / mission.maxMassKg) * 100)}%` }}
                  />
                </div>
              </div>

              {/* 2. Speed change / Delta-v */}
              <div className="clean-stat-card" title={JARGON_TOOLTIPS.deltav}>
                <div className="stat-card-header">
                  <div className="stat-card-title">
                    <Gauge size={14} />
                    <span>Speed change (Δv)</span>
                  </div>
                  <strong className={`stat-card-value ${report.propulsion.dvMps + 1 < report.requiredDvMps ? 'bad' : 'ok'}`}>
                    {mps(report.propulsion.dvMps)} / {mps(report.requiredDvMps)}
                  </strong>
                </div>
                <div className="stat-progress-track">
                  <div
                    className={`stat-progress-bar ${report.propulsion.dvMps + 1 < report.requiredDvMps ? 'bad' : 'ok'}`}
                    style={{ width: `${Math.min(100, report.requiredDvMps > 0 ? (report.propulsion.dvMps / report.requiredDvMps) * 100 : 100)}%` }}
                  />
                </div>
              </div>

              {/* 3. Power */}
              <div className="clean-stat-card" title={JARGON_TOOLTIPS.power}>
                <div className="stat-card-header">
                  <div className="stat-card-title">
                    <Zap size={14} />
                    <span>Power</span>
                  </div>
                  <strong className={`stat-card-value ${generation + 1 < report.power.loadW ? 'bad' : 'ok'}`}>
                    {watts(generation)} / {watts(report.power.loadW)}
                  </strong>
                </div>
                <div className="stat-progress-track">
                  <div
                    className={`stat-progress-bar ${generation + 1 < report.power.loadW ? 'bad' : 'ok'}`}
                    style={{ width: `${Math.min(100, report.power.loadW > 0 ? (generation / report.power.loadW) * 100 : 100)}%` }}
                  />
                </div>
              </div>

              {/* 4. Signal strength */}
              <div className="clean-stat-card" title={JARGON_TOOLTIPS.signal}>
                <div className="stat-card-header">
                  <div className="stat-card-title">
                    <Radio size={14} />
                    <span>Signal strength</span>
                  </div>
                  <strong className={`stat-card-value ${report.link.closes ? 'ok' : 'bad'}`}>
                    {db(report.link.marginDb)}
                  </strong>
                </div>
                <div className="stat-progress-track">
                  <div
                    className={`stat-progress-bar ${report.link.closes ? 'ok' : 'bad'}`}
                    style={{ width: `${report.link.closes ? 100 : 35}%` }}
                  />
                </div>
              </div>

              {/* 5. Cost */}
              <div className="clean-stat-card" title={JARGON_TOOLTIPS.cost}>
                <div className="stat-card-header">
                  <div className="stat-card-title">
                    <DollarSign size={14} />
                    <span>Cost</span>
                  </div>
                  <strong className={`stat-card-value ${report.cost.marginUsd < 0 ? 'bad' : 'ok'}`}>
                    {shortMoney(report.cost.totalUsd)} / {shortMoney(mission.budgetUsd)}
                  </strong>
                </div>
                <div className="stat-progress-track">
                  <div
                    className={`stat-progress-bar ${report.cost.marginUsd < 0 ? 'bad' : 'ok'}`}
                    style={{ width: `${Math.min(100, (report.cost.totalUsd / mission.budgetUsd) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <p className="plain-specs-breakdown">
              <span title={JARGON_TOOLTIPS.dryMass}>Dry {kg(report.mass.dryKg)}</span> ·{' '}
              <span title={JARGON_TOOLTIPS.propellant}>Propellant {kg(report.mass.propellantKg)}</span> ·{' '}
              <span title={JARGON_TOOLTIPS.payload}>Payload {kg(report.mass.payloadKg)}</span> ·{' '}
              <span title={JARGON_TOOLTIPS.isp}>Isp {report.propulsion.byPropellant[0] ? `${Math.round(report.propulsion.byPropellant[0].ispS)} s` : '—'}</span>
            </p>

            {/* Checklist: THIS MISSION NEEDS */}
            <div className="checklist-container">
              <h3 className="section-label">This mission needs</h3>
              {hard === 0 ? (
                <div className="checklist-success-banner">
                  <CheckCircle2 size={16} className="checklist-tick" />
                  <div>
                    <strong>Ready to plan</strong>
                    <p>The required parts are aboard. Drag parts on the ship to place them.</p>
                  </div>
                </div>
              ) : (
                report.issues.filter((issue) => issue.severity === 'hard').map((issue) => {
                  const targetTab: UiCategory =
                    issue.id.includes('landing') || issue.what.toLowerCase().includes('landing') || issue.what.toLowerCase().includes('parachute')
                      ? 'landing'
                      : issue.subsystem === 'power'
                      ? 'power'
                      : issue.subsystem === 'communications'
                      ? 'communications'
                      : issue.subsystem === 'science'
                      ? 'science'
                      : issue.subsystem === 'thermal'
                      ? 'thermal'
                      : issue.subsystem === 'structure'
                      ? 'structure'
                      : issue.subsystem === 'propulsion'
                      ? 'propulsion'
                      : 'fuel'
                  const tabLabel = CATEGORIES[targetTab]?.label ?? 'Parts'
                  return (
                    <div key={issue.id} className="checklist-issue-card">
                      <div className="checklist-issue-header">
                        <AlertTriangle size={15} className="checklist-warn-icon" />
                        <strong className="checklist-issue-title">{issue.what}</strong>
                      </div>
                      <p className="checklist-issue-why">{issue.change}</p>
                      <button
                        type="button"
                        className="checklist-fix-jump-btn"
                        onClick={() => setFilter(targetTab)}
                        title={`Switch to ${tabLabel} tab to fix this`}
                      >
                        <span>Fix in {tabLabel}</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            {/* Collapsible Fitted Parts List */}
            <div className="fitted-section">
              <div className="section-header-collapsible" onClick={() => setFittedOpen(!fittedOpen)}>
                <h3 className="section-label">Fitted ({craft.parts.length})</h3>
                <button type="button" className="collapse-toggle-btn" aria-label={fittedOpen ? 'Collapse' : 'Expand'}>
                  {fittedOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>
              {fittedOpen && (
                <div className="fitted-cards-list">
                  {craft.parts.map((part) => {
                    const fitted = CATALOG.find((item) => item.id === part.specId)
                    if (!fitted) return null
                    const family = familyOf(part.specId)
                    return (
                      <PartCard
                        key={part.instanceId}
                        mode="fitted"
                        item={fitted}
                        instanceId={part.instanceId}
                        enabled={part.enabled}
                        fill={part.fill}
                        family={family}
                        selected={selectedInstanceId === part.instanceId}
                        onSelect={() => selectInstance(part.instanceId)}
                        onToggle={() => togglePart(part.instanceId)}
                        onRemove={() => removePart(part.instanceId)}
                        onSetFill={(val) => setFill(part.instanceId, val)}
                        onSelectVariant={(id) => setSpec(part.instanceId, id)}
                      />
                    )
                  })}
                </div>
              )}
            </div>

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
        </Glass>
      </aside>
      <div className="viewport-overlay-corner">
        <button
          type="button"
          className="viewport-recenter-btn"
          title="Recenter spacecraft view"
          aria-label="Recenter view"
          onClick={() => go('pad')}
        >
          <Orbit size={16} />
          <span>Center</span>
        </button>
      </div>
      <div className="plan-launch">
        <button
          type="button"
          className={`word primary plan-main-btn ${hard > 0 ? 'is-disabled' : ''}`}
          disabled={hard > 0}
          title={hard > 0 ? `Fix ${hard} ${hard === 1 ? 'issue' : 'issues'} first` : 'Plan the flight'}
          onClick={() => go('plan')}
        >
          <Route size={18} />
          <span>{hard > 0 ? `Fix ${hard} ${hard === 1 ? 'issue' : 'issues'} first` : 'Plan the flight'}</span>
        </button>
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
        </Glass>
      </aside>
      <aside className="side right">
        <Glass className="pad-card">
          <Meter icon={<Gauge size={14} />} label="Available" value={mps(report.propulsion.dvMps)} ratio={report.requiredDvMps > 0 ? report.propulsion.dvMps / report.requiredDvMps : 1} tone={report.propulsion.dvMps + 1 < report.requiredDvMps ? 'bad' : 'ok'} />
          <Meter icon={<Route size={14} />} label="Required" value={mps(report.requiredDvMps)} ratio={1} />
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
  const history = useMission((state) => state.history)
  const field = useMission((state) => state.field)
  const resumeSurface = useMission((state) => state.resumeSurface)
  const [notes, setNotes] = useState(false)
  if (!outcome) return null
  const title = outcome.success ? 'Complete' : outcome.partial ? 'Partial' : 'Stopped'
  return (
    <div className="center-stage">
      <Glass className="score-card">
        <ScoreRing value={outcome.score} />
        <strong>{title}</strong>
        <div className="pips">
          {outcome.objectives.map((item) => <i key={item.id} className={item.met ? 'ok' : ''} title={item.label} />)}
        </div>
        <p className="muted">
          {outcome.siteName ? `${outcome.siteName}. ` : ''}
          {outcome.durationSec !== undefined ? `${clock(outcome.durationSec)}. ` : ''}
          {outcome.landing && outcome.landing !== 'none' ? `${outcome.landing} touchdown${outcome.landingOffset ? `, ${Math.abs(outcome.landingOffset).toFixed(0)} m off` : ''}. ` : ''}
          {kg(outcome.propellantRemainingKg, 1)} left. {bits(outcome.dataReturnedBits)} returned.
          {outcome.rewinds ? ` ${outcome.rewinds} rewind${outcome.rewinds === 1 ? '' : 's'}.` : ''}
        </p>
        {outcome.achievements && outcome.achievements.length > 0 && (
          <div className="chips">
            {outcome.achievements.map((badge) => <span key={badge.id} className="chip on" title={badge.detail}>{badge.name}</span>)}
          </div>
        )}
        <div className="row-actions">
          {field && (
            <button type="button" className="word" onClick={resumeSurface}>Continue</button>
          )}
          <button type="button" className="word" onClick={() => go('design')}><RotateCcw size={16} /> Revise</button>
          <button type="button" className="word slim" onClick={() => void navigator.clipboard?.writeText(summaryOf(outcome))}>Copy</button>
          <button type="button" className="icon" aria-label="Missions" onClick={() => go('select')}><Compass size={16} /></button>
          <button type="button" className="icon" aria-label="Flight notes" onClick={() => setNotes(true)}><Info size={16} /></button>
        </div>
      </Glass>
      {notes && (
        <Sheet title={outcome.craftName} onClose={() => setNotes(false)}>
          <p>{outcome.summary}</p>
          <div className="facts">
            <div><span>Propellant</span><b>{kg(outcome.propellantUsedKg, 1)}</b></div>
            <div><span>Left</span><b>{kg(outcome.propellantRemainingKg, 1)}</b></div>
            <div><span>Delta-v</span><b>{mps(outcome.dvUsedMps)}</b></div>
            <div><span>Mass</span><b>{kg(outcome.massKg)}</b></div>
            <div><span>Cost</span><b>{shortMoney(outcome.costUsd)}</b></div>
            <div><span>Budget</span><b>{shortMoney(outcome.budgetUsd)}</b></div>
            <div><span>Data</span><b>{bits(outcome.dataReturnedBits)}</b></div>
            <div><span>Reliability</span><b>{percent(outcome.reliability)}</b></div>
          </div>
          {outcome.objectives.map((item) => <p key={item.id}><strong>{item.label}.</strong> {item.met ? 'Met' : 'Short'}. {item.detail}</p>)}
          {outcome.strengths.map((line) => <p key={line}>{line}</p>)}
          {outcome.mistakes.map((line) => <p key={line}>{line}</p>)}
          {outcome.lessons.map((line) => <p key={line}>{line}</p>)}
          {outcome.timeline && outcome.timeline.length > 0 && (
            <div className="note-list">
              {outcome.timeline.map((mark) => <p key={`${mark.tSec}-${mark.label}`}>{clock(mark.tSec)} · {mark.label}</p>)}
            </div>
          )}
          {history.length > 1 && <p className="muted">{history.length} flights on this browser.</p>}
        </Sheet>
      )}
    </div>
  )
}

function summaryOf(outcome: MissionOutcome): string {
  return [
    `${outcome.craftName}: ${outcome.success ? 'complete' : outcome.partial ? 'partial' : 'stopped'}, score ${outcome.score}`,
    outcome.siteName ? `Site ${outcome.siteName}` : '',
    outcome.durationSec !== undefined ? `Duration ${clock(outcome.durationSec)}` : '',
    outcome.landing && outcome.landing !== 'none' ? `Landing ${outcome.landing}` : '',
    `Fuel left ${kg(outcome.propellantRemainingKg, 1)}`,
    `Data ${bits(outcome.dataReturnedBits)}`,
    ...(outcome.achievements ?? []).map((badge) => badge.name),
  ].filter(Boolean).join('\n')
}

export function CreditsScreen() {
  const [gpu, setGpu] = useState('Checking the graphics device')
  useEffect(() => { setGpu(graphicsLabel()) }, [])
  return (
    <div className="center-stage">
      <Glass className="pad-card credits">
        <strong>Mission Control</strong>
        <p>Briefing stills come from the NASA Image and Video Library. A Mars frame comes from the NASA/JPL Mars 2020 raw-image feed. Solar notes come from DONKI notifications. The asteroid count comes from the NEO feed. Each is cached for twelve hours, and the briefing stays up if a request fails. None of those feeds is the trajectory.</p>
        <p>The spacecraft is extruded the way Alexander Sanfilippo builds one: a polygon scaled and stitched, nose one way and the bell the other. Plate, foil and tile are painted on that hull. Catalog parts sit on it. https://github.com/AlexSanfilippo/ProceduralMeshGeneration</p>
        <p>Earth and Mars maps in the cruise sky are CC-BY 4.0 by Akshat. The Moon, Europa, and Jupiter maps, the grass clumps, the launch console, and the suited astronaut are the files supplied in public/3d.</p>
        <p>After booster separation the winged craft uses lift and drag from the NASA Operational Aerodynamic Data Book, September 1985. The stack below that uses an axial drag coefficient with a transonic rise.</p>
        <p>The hangar name still follows Shipwright by Dolf Veenvliet. https://github.com/macouno/shipwright</p>
        <p>Sound effects are the Oculus Audio Pack 1 by Oculus VR, LLC, CC BY 4.0, from the Meta open-sound collection. https://github.com/facebookincubator/Meta-open-sound</p>
        <p>The Mars surface rover is the NASA/JPL public-domain Perseverance model. The yard also uses NASA’s Ingenuity helicopter, Apollo lunar module, Explorer Jupiter-C, astronaut, and extravehicular suit. Those models are free of copyright. https://github.com/nasa/NASA-3D-Resources</p>
        <p>Starfield, flame and renderer fallback follow VOIDTYPE by Itz-Murali and Itz-Anya. https://github.com/Itz-Murali/Void-Type</p>
        <p>Mission titles use TechText; spotlight cards, the dock and the starfield follow patterns from React Bits (reactbits.dev).</p>
        <p className="muted">{gpu}</p>
      </Glass>
    </div>
  )
}
