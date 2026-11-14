import { useEffect, useRef, useState, useMemo } from 'react'
import {
  ArrowLeft,
  Battery,
  Boxes,
  Clock,
  Compass,
  Crosshair,
  Droplets,
  Gauge,
  Info,
  List,
  Maximize2,
  Orbit,
  Pause,
  Flag,
  PenLine,
  Play,
  Radio,
  Rocket,
  RotateCcw,
  Route,
  Sparkles,
  Zap,
} from 'lucide-react'
import { CATALOG, getSpec } from '../domain/catalog'
import { OBJECTIVES, kitCoverage, objectiveKit, objectiveOf, siteOf, sitesFor, suggestedSite, windowExtraDv } from '../domain/campaign'
import { bits, clock, db, kelvin, kg, money, mps, percent, watts } from '../domain/format'
import { lunarTransfer, marsTransfer, solarTransfer } from '../domain/orbit'
import { sliderToWarp, warpLabel, warpToSlider } from '../domain/time'
import { evaluate, requiredBurns } from '../domain/validate'
import type { ComponentSpec, EngineeringIssue, MissionDef, MissionOutcome, MissionPlan } from '../domain/types'
import { loadMarsPhoto, loadNasa, loadSolarNote, type MarsFrame, type NasaContext, type SolarNote } from '../nasa/client'
import { useActiveMission, useMission } from '../store/useMission'
import { graphicsLabel } from '../render/world'
import { createAscent, stepAscent, ASCENT_TIME_SCALE, type AscentState } from '../domain/ascent'
import { say, silence } from './voice'
import { Dock, Glass, Meter, MissionTitle, ScoreRing, Sheet, SpotButton } from './bits'
import { PartPreview } from './partPreview'
import { DestModel } from './DestStill'
import { TitleBanner } from './TitleBanner'
import { familyOf } from './families'
import { JARGON_TOOLTIPS, plainSpec } from './themeTokens'

const BUILD_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'structure', label: 'Structure' },
  { id: 'propulsion', label: 'Propulsion' },
  { id: 'engine', label: 'Engine' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'power', label: 'Power' },
  { id: 'communications', label: 'Comms' },
  { id: 'science', label: 'Science' },
  { id: 'thermal', label: 'Thermal' },
  { id: 'landing', label: 'Landing' },
]

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

const isLandingPart = (specId: string) => ['heatshield', 'chute', 'descent', 'legs'].includes(specId)

export function DesignScreen() {
  const tabsRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = tabsRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])
  const craft = useMission((state) => state.craft)
  const plan = useMission((state) => state.plan)
  const mission = useActiveMission()
  const selectedInstanceId = useMission((state) => state.selectedInstanceId)
  const addPart = useMission((state) => state.addPart)
  const removePart = useMission((state) => state.removePart)
  const setFill = useMission((state) => state.setFill)
  const setSpec = useMission((state) => state.setSpec)
  const selectInstance = useMission((state) => state.selectInstance)
  const nudgePart = useMission((state) => state.nudgePart)
  const resetOffset = useMission((state) => state.resetOffset)
  const togglePart = useMission((state) => state.togglePart)
  const generate = useMission((state) => state.generate)
  const undo = useMission((state) => state.undo)
  const redo = useMission((state) => state.redo)
  const arrange = useMission((state) => state.arrange)
  const canUndo = useMission((state) => (state.craftPast?.length ?? 0) > 0)
  const canRedo = useMission((state) => (state.craftFuture?.length ?? 0) > 0)
  const rename = useMission((state) => state.rename)
  const autoFix = useMission((state) => state.autoFix)
  const go = useMission((state) => state.go)
  const [filter, setFilter] = useState<string>('structure')
  const [callSign, setCallSign] = useState(craft?.name ?? 'Surveyor')
  const [specId, setSpecId] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [passedOpen, setPassedOpen] = useState(false)
  const [fittedOpen, setFittedOpen] = useState(true)
  const [deltaNotice, setDeltaNotice] = useState<string | null>(null)

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
      if (isLandingPart(p.specId)) {
        counts['landing'] = (counts['landing'] ?? 0) + 1
      } else {
        const itemSpec = CATALOG.find((c) => c.id === p.specId)
        if (itemSpec) {
          counts[itemSpec.subsystem] = (counts[itemSpec.subsystem] ?? 0) + 1
          if (itemSpec.subsystem === 'propulsion' && itemSpec.thrustN > 0) {
            counts['engine'] = (counts['engine'] ?? 0) + 1
          }
        }
      }
      counts['all'] = (counts['all'] ?? 0) + 1
    }
    return counts
  }, [craft])

  if (!craft || !mission || !plan) return null
  const report = evaluate(craft, mission, plan)
  const spent = report.cost.totalUsd
  const budget = mission.budgetUsd || 1
  const budgetRatio = Math.max(0, Math.min(1, spent / budget))
  const hard = report.issues.filter((issue) => issue.severity === 'hard').length
  const generation = report.power.constantGenerationW + report.power.generationAt1AuW / (mission.destinationAu ** 2)
  const selected = craft.parts.find((part) => part.instanceId === selectedInstanceId)

  // Delta effect notification on mass/dv change
  const prevMassRef = useRef(report.mass.totalKg)
  const prevDvRef = useRef(report.propulsion.dvMps)
  useEffect(() => {
    const diffMass = report.mass.totalKg - prevMassRef.current
    const diffDv = report.propulsion.dvMps - prevDvRef.current
    prevMassRef.current = report.mass.totalKg
    prevDvRef.current = report.propulsion.dvMps

    if (Math.abs(diffMass) > 0.05 || Math.abs(diffDv) > 0.5) {
      const text = `${diffMass >= 0 ? '+' : ''}${diffMass.toFixed(1)} kg · Δv ${diffDv >= 0 ? '+' : ''}${Math.round(diffDv)} m/s`
      setDeltaNotice(text)
      const t = setTimeout(() => setDeltaNotice(null), 2500)
      return () => clearTimeout(t)
    }
  }, [report.mass.totalKg, report.propulsion.dvMps])

  // Filter parts for active tab
  const displayedParts = useMemo(() => {
    return CATALOG.filter((item) => {
      if (filter === 'all') return true
      if (filter === 'landing') return isLandingPart(item.id)
      if (isLandingPart(item.id)) return false
      if (filter === 'engine') return item.subsystem === 'propulsion' && item.thrustN > 0
      if (filter === 'communications') return item.subsystem === 'communications'
      return item.subsystem === filter
    })
  }, [filter])

  // Landing risk computation
  const landingRisk = useMemo(() => {
    const site = siteOf(mission, plan)
    const isAtmospheric = mission.id === 'mars'
    const hasShield = craft.parts.some((p) => p.enabled && p.specId === 'heatshield')
    const hasChute = craft.parts.some((p) => p.enabled && p.specId === 'chute')
    const hasLegs = craft.parts.some((p) => p.enabled && p.specId === 'legs')
    const hasDescent = craft.parts.some((p) => p.enabled && p.specId === 'descent')

    let score = (site?.difficulty ?? 0.5) * 40
    const massRatio = report.mass.totalKg / (mission.maxMassKg || 1)
    score += Math.min(30, massRatio * 30)

    if (isAtmospheric) {
      if (!hasShield) score += 30
      if (!hasChute) score += 25
    } else {
      if (!hasDescent) score += 25
    }
    if (!hasLegs) score += 20

    if (hasShield) score -= 15
    if (hasChute) score -= 10
    if (hasLegs) score -= 10
    if (hasDescent) score -= 15

    const finalScore = Math.max(5, Math.min(95, Math.round(score)))
    const level: 'Low' | 'Medium' | 'High' = finalScore < 35 ? 'Low' : finalScore < 65 ? 'Medium' : 'High'
    return { score: finalScore, level }
  }, [mission, plan, craft, report.mass.totalKg])

  // Passed / resolved constraints
  const passedIssues = useMemo(() => {
    const list: { id: string; label: string }[] = []
    if (report.cost.marginUsd >= 0) list.push({ id: 'cost', label: 'Budget within mission limit' })
    if (report.mass.marginKg >= 0) list.push({ id: 'mass', label: 'Launch mass under launcher limit' })
    if (report.propulsion.dvMps + 1 >= report.requiredDvMps) list.push({ id: 'dv', label: 'Trajectory delta-v satisfied' })
    if (generation + 1 >= report.power.loadW) list.push({ id: 'power', label: 'Electrical power generation covers load' })
    if (report.link.closes) list.push({ id: 'link', label: 'Communications link closes to Earth' })
    const hasAllReq = mission.requiredInstruments.every((inst) =>
      craft.parts.some((p) => p.enabled && CATALOG.find((c) => c.id === p.specId)?.instrument === inst)
    )
    if (hasAllReq) list.push({ id: 'inst', label: 'Required instruments fitted' })
    if (craft.parts.some((p) => p.enabled && p.specId.startsWith('tank') && (p.fill ?? 1) > 0)) {
      list.push({ id: 'fuel', label: 'Propellant loaded in active tanks' })
    }
    return list
  }, [report, mission, craft, generation])

  const fitOrSelect = (partSpecId: string) => {
    const fitted = craft.parts.find((p) => p.specId === partSpecId && p.enabled) ?? craft.parts.find((p) => p.specId === partSpecId)
    if (fitted) {
      if (!fitted.enabled) togglePart(fitted.instanceId)
      selectInstance(fitted.instanceId)
      return
    }
    addPart(partSpecId)
  }

  const spec = CATALOG.find((item) => item.id === specId) ?? null

  return (
    <>
      {/* Left Panel: Catalog Parts */}
      <aside className="side left flat-panel" aria-label="Part Catalog">
        <div className="panel-inner">
          <nav ref={tabsRef} className="flat-tabs-row" role="tablist" aria-label="Part categories">
            {BUILD_TABS.map((tab) => {
              const count = fittedCounts[tab.id] ?? 0
              const isActive = filter === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`flat-tab-item ${isActive ? 'is-active' : ''}`}
                  onClick={(e) => {
                    setFilter(tab.id)
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
                  }}
                >
                  <span className="tab-label">{tab.label}</span>
                  <span className="tab-count">{count}</span>
                </button>
              )
            })}
          </nav>
          <div className="flat-part-rows-container">
            {displayedParts.map((item) => {
              const count = craft.parts.filter((p) => p.specId === item.id).length
              const fittedPart = craft.parts.find((p) => p.specId === item.id)
              const family = familyOf(item.id)
              return (
                <div key={item.id} className="flat-part-row">
                  <div className="part-info-block" onClick={() => fitOrSelect(item.id)}>
                    <div className="part-name-cost-line">
                      <span className="part-title">{item.name}</span>
                      <span className="part-cost-tag">{shortMoney(item.costUsd)}</span>
                    </div>
                    <div className="part-spec-sub">{plainSpec(item)}</div>
                  </div>
                  <div className="part-stepper-cell">
                    {count === 0 ? (
                      <button
                        type="button"
                        className="flat-add-btn"
                        onClick={() => addPart(item.id)}
                        aria-label={`Add ${item.name}`}
                      >
                        Add
                      </button>
                    ) : (
                      <div className="flat-stepper-ctrl">
                        <button
                          type="button"
                          onClick={() => {
                            const last = craft.parts.slice().reverse().find((p) => p.specId === item.id)
                            if (last) removePart(last.instanceId)
                          }}
                          aria-label={`Decrease ${item.name}`}
                        >
                          −
                        </button>
                        <span className="stepper-val-num">{count}</span>
                        <button
                          type="button"
                          onClick={() => addPart(item.id)}
                          aria-label={`Increase ${item.name}`}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                  {count > 0 && fittedPart && item.tankCapacityKg > 0 && (
                    <div className="flat-part-slider-row">
                      <div className="slider-label-val">
                        <span>Propellant fill</span>
                        <span>{Math.round((fittedPart.fill ?? 1) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={fittedPart.fill ?? 1}
                        onChange={(e) => setFill(fittedPart.instanceId, Number(e.target.value))}
                        aria-label="Propellant fill"
                      />
                    </div>
                  )}
                  {count > 0 && family && family.ids.length > 1 && (
                    <div className="flat-part-slider-row">
                      <div className="slider-label-val">
                        <span>Size</span>
                        <span>{item.name}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={family.ids.length - 1}
                        step={1}
                        value={Math.max(0, family.ids.indexOf(item.id))}
                        onChange={(e) => {
                          const newId = family.ids[Number(e.target.value)]
                          if (newId && fittedPart) setSpec(fittedPart.instanceId, newId)
                        }}
                        aria-label="Size variant"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </aside>
      {/* Right Panel: Stats, Risk, Issues, Fitted */}
      <aside className="side right flat-panel" aria-label="Spacecraft Stats & Review">
        <div className="panel-inner right-scroll-panel">
          {/* Design Name & Plain Text Toolbar */}
          <div className="design-header-block">
            <input
              className="flat-name-input"
              aria-label="Design name"
              title="Design name"
              value={callSign}
              onChange={(e) => {
                setCallSign(e.target.value)
                rename(e.target.value)
              }}
            />
            <div className="plain-text-toolbar" role="toolbar" aria-label="Design actions">
              <button
                type="button"
                className="toolbar-text-action"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
              >
                Undo
              </button>
              <button
                type="button"
                className="toolbar-text-action"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
              >
                Redo
              </button>
              <button
                type="button"
                className="toolbar-text-action"
                onClick={arrange}
                title="Auto-arrange parts symmetrically"
              >
                Auto-arrange
              </button>
              <button
                type="button"
                className="toolbar-text-action"
                onClick={() => generate(callSign)}
                title="Generate spacecraft design"
              >
                Generate
              </button>
            </div>
          </div>
          {/* 5 Stats as plain rows with 2px bars */}
          <div className="flat-stats-section">
            {/* 1. Mass */}
            <div className="flat-stat-row" title={JARGON_TOOLTIPS.mass}>
              <div className="stat-top-line">
                <span className="stat-name">Mass</span>
                <span className={`stat-num ${report.mass.marginKg < 0 ? 'status-bad' : 'status-ok'}`}>
                  {report.mass.marginKg < 0 ? 'Over limit ' : 'OK '}
                  {Math.round(report.mass.totalKg)} / {Math.round(mission.maxMassKg)} kg
                </span>
              </div>
              <div className="stat-thin-track">
                <div
                  className={`stat-thin-bar ${report.mass.marginKg < 0 ? 'bar-bad' : 'bar-ok'}`}
                  style={{ width: `${Math.min(100, (report.mass.totalKg / mission.maxMassKg) * 100)}%` }}
                />
              </div>
            </div>

            {/* 2. Delta-v */}
            <div className="flat-stat-row" title={JARGON_TOOLTIPS.deltav}>
              <div className="stat-top-line">
                <span className="stat-name">Delta-v</span>
                <span className={`stat-num ${report.propulsion.dvMps + 1 < report.requiredDvMps ? 'status-bad' : 'status-ok'}`}>
                  {report.propulsion.dvMps + 1 < report.requiredDvMps ? 'Low ' : 'OK '}
                  {Math.round(report.propulsion.dvMps)} / {Math.round(report.requiredDvMps)} m/s
                </span>
              </div>
              <div className="stat-thin-track">
                <div
                  className={`stat-thin-bar ${report.propulsion.dvMps + 1 < report.requiredDvMps ? 'bar-bad' : 'bar-ok'}`}
                  style={{ width: `${Math.min(100, report.requiredDvMps > 0 ? (report.propulsion.dvMps / report.requiredDvMps) * 100 : 100)}%` }}
                />
              </div>
            </div>

            {/* 3. Power */}
            <div className="flat-stat-row" title={JARGON_TOOLTIPS.power}>
              <div className="stat-top-line">
                <span className="stat-name">Power</span>
                <span className={`stat-num ${generation + 1 < report.power.loadW ? 'status-bad' : 'status-ok'}`}>
                  {generation + 1 < report.power.loadW ? 'Deficit ' : 'OK '}
                  {Math.round(generation)} / {Math.round(report.power.loadW)} W
                </span>
              </div>
              <div className="stat-thin-track">
                <div
                  className={`stat-thin-bar ${generation + 1 < report.power.loadW ? 'bar-bad' : 'bar-ok'}`}
                  style={{ width: `${Math.min(100, report.power.loadW > 0 ? (generation / report.power.loadW) * 100 : 100)}%` }}
                />
              </div>
            </div>

            {/* 4. Link margin */}
            <div className="flat-stat-row" title={JARGON_TOOLTIPS.signal}>
              <div className="stat-top-line">
                <span className="stat-name">Link margin</span>
                <span className={`stat-num ${report.link.closes ? 'status-ok' : 'status-bad'}`}>
                  {report.link.closes ? 'OK ' : 'Lost '}
                  {report.link.marginDb.toFixed(1)} dB
                </span>
              </div>
              <div className="stat-thin-track">
                <div
                  className={`stat-thin-bar ${report.link.closes ? 'bar-ok' : 'bar-bad'}`}
                  style={{ width: `${report.link.closes ? 100 : 30}%` }}
                />
              </div>
            </div>

            {/* 5. Cost */}
            <div className="flat-stat-row" title={JARGON_TOOLTIPS.cost}>
              <div className="stat-top-line">
                <span className="stat-name">Cost</span>
                <span className={`stat-num ${report.cost.marginUsd < 0 ? 'status-bad' : 'status-ok'}`}>
                  {report.cost.marginUsd < 0 ? 'Over budget ' : 'OK '}
                  {shortMoney(report.cost.totalUsd)} / {shortMoney(mission.budgetUsd)}
                </span>
              </div>
              <div className="stat-thin-track">
                <div
                  className={`stat-thin-bar ${report.cost.marginUsd < 0 ? 'bar-bad' : 'bar-ok'}`}
                  style={{ width: `${Math.min(100, (report.cost.totalUsd / mission.budgetUsd) * 100)}%` }}
                />
              </div>
            </div>

            {/* Landing Risk Row */}
            <div
              className="flat-stat-row"
              title="Landing risk computed from site difficulty, spacecraft mass, and landing hardware (heat shield, parachute, descent engine, legs)."
            >
              <div className="stat-top-line">
                <span className="stat-name">Landing risk</span>
                <span className={`stat-num ${landingRisk.level === 'High' ? 'status-bad' : landingRisk.level === 'Low' ? 'status-ok' : 'status-mid'}`}>
                  {landingRisk.level} ({landingRisk.score}%)
                </span>
              </div>
              <div className="stat-thin-track">
                <div
                  className={`stat-thin-bar ${landingRisk.level === 'High' ? 'bar-bad' : landingRisk.level === 'Low' ? 'bar-ok' : 'bar-mid'}`}
                  style={{ width: `${landingRisk.score}%` }}
                />
              </div>
            </div>
          </div>

          {/* Mass Breakdown & Delta Effect */}
          <div className="flat-breakdown-card">
            <div className="breakdown-columns">
              <div className="bd-cell"><span className="bd-label">Dry</span> <span className="bd-val">{kg(report.mass.dryKg)}</span></div>
              <div className="bd-cell"><span className="bd-label">Propellant</span> <span className="bd-val">{kg(report.mass.propellantKg)}</span></div>
              <div className="bd-cell"><span className="bd-label">Payload</span> <span className="bd-val">{kg(report.mass.payloadKg)}</span></div>
              <div className="bd-cell"><span className="bd-label">Launch</span> <span className="bd-val">{kg(report.mass.totalKg)}</span></div>
            </div>
            {deltaNotice && (
              <div className="mass-delta-flash-banner" role="status">
                {deltaNotice}
              </div>
            )}
          </div>

          {/* Compact Issues List */}
          <div className="flat-issues-section">
            <div className="section-title-line">Issues</div>
            {report.issues.length === 0 ? (
              <div className="all-clear-note">
                <span className="flat-dot green-dot">✓</span>
                <span>All design requirements passed. Ready to plan flight.</span>
              </div>
            ) : (
              report.issues.map((issue) => {
                const targetTab =
                  issue.id.includes('landing') || issue.what.toLowerCase().includes('landing') || issue.what.toLowerCase().includes('parachute') || issue.what.toLowerCase().includes('heat shield')
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
                    : 'fuel';
                const tabLabel = BUILD_TABS.find((t) => t.id === targetTab)?.label ?? 'Parts';
                return (
                  <div key={issue.id} className="flat-issue-item">
                    <span className="flat-dot red-dot" aria-hidden="true" />
                    <div className="flat-issue-info">
                      <div className="issue-row-title">{issue.what}</div>
                      <div className="issue-row-detail">{issue.change}</div>
                      <button
                        type="button"
                        className="issue-fix-jump"
                        onClick={() => setFilter(targetTab)}
                      >
                        Fix in {tabLabel} →
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Collapsed Passed Issues */}
            {passedIssues.length > 0 && (
              <div className="passed-collapse-group">
                <button
                  type="button"
                  className="passed-collapse-toggle"
                  onClick={() => setPassedOpen(!passedOpen)}
                  aria-expanded={passedOpen}
                >
                  <span>Passed ({passedIssues.length})</span>
                  <span>{passedOpen ? '▲' : '▼'}</span>
                </button>
                {passedOpen && (
                  <div className="passed-items-list">
                    {passedIssues.map((p) => (
                      <div key={p.id} className="passed-item-row">
                        <span className="flat-dot green-dot">✓</span>
                        <span className="passed-item-label">{p.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fitted Parts (Collapsible) */}
          <div className="flat-fitted-section">
            <button
              type="button"
              className="fitted-collapse-toggle"
              onClick={() => setFittedOpen(!fittedOpen)}
              aria-expanded={fittedOpen}
            >
              <span>Fitted parts ({craft.parts.length})</span>
              <span>{fittedOpen ? '▲' : '▼'}</span>
            </button>
            {fittedOpen && (
              <div className="fitted-items-list">
                {craft.parts.map((part) => {
                  const item = CATALOG.find((c) => c.id === part.specId);
                  if (!item) return null;
                  const partCount = craft.parts.filter((p) => p.specId === part.specId).length;
                  return (
                    <div key={part.instanceId} className="fitted-flat-row">
                      <div className="fitted-desc-block" onClick={() => selectInstance(part.instanceId)}>
                        <span className="fitted-name">{item.name}</span>
                        <span className="fitted-spec">{plainSpec(item)}</span>
                      </div>
                      <div className="fitted-actions-group">
                        <div className="flat-stepper-ctrl mini-stepper">
                          <button
                            type="button"
                            onClick={() => removePart(part.instanceId)}
                            aria-label={`Decrease ${item.name}`}
                          >
                            −
                          </button>
                          <span className="stepper-val-num">{partCount}</span>
                          <button
                            type="button"
                            onClick={() => addPart(item.id)}
                            aria-label={`Increase ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="fitted-remove-text-btn"
                          onClick={() => removePart(part.instanceId)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selected && (
            <div className="flat-nudge-pad" aria-label="Nudge part position">
              <button type="button" onClick={() => nudgePart(selected.instanceId, 0, 0.12, 0)}>Up</button>
              <button type="button" onClick={() => nudgePart(selected.instanceId, 0, -0.12, 0)}>Down</button>
              <button type="button" onClick={() => nudgePart(selected.instanceId, 0, -0.12, 0)}>Left</button>
              <button type="button" onClick={() => nudgePart(selected.instanceId, 0.12, 0, 0)}>Right</button>
              <button type="button" onClick={() => resetOffset(selected.instanceId)}>Reset</button>
            </div>
          )}
        </div>
      </aside>

      {/* Recenter 3D View Button */}
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

      {/* Bottom Center Container: Budget Block + Plan Button */}
      <div className="bottom-plan-bar" role="region" aria-label="Flight planning and budget">
        <div className="budget-float" aria-label="Budget">
          <span>Budget</span>
          <i><b style={{ transform: `scaleX(${budgetRatio})` }} className={report.cost.marginUsd < 0 ? 'over' : ''} /></i>
          <div className="budget-nums"><em>{shortMoney(spent)}</em><em>{shortMoney(budget)}</em></div>
          <span>Mass {Math.round(report.mass.totalKg)} / {Math.round(mission.maxMassKg)} kg · Δv {Math.round(report.propulsion.dvMps)} m/s</span>
        </div>
        <button
          type="button"
          className={`plan-flight-main-btn ${hard > 0 ? 'is-disabled' : 'is-ready'}`}
          disabled={hard > 0}
          onClick={() => go('plan')}
        >
          {hard > 0 ? `Fix ${hard} ${hard === 1 ? 'issue' : 'issues'} first` : 'Plan the flight'}
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
