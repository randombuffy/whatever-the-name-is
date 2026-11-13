import { G0 } from './constants'
import { windowExtraDv, objectiveKit } from './campaign'
import { costBudget } from './budget'
import { getSpec } from './catalog'
import { linkBudget } from './link'
import { massBudget } from './mass'
import { powerBudget } from './power'
import { propulsionBudget, propellantForDeltaV, rocketDeltaV } from './propulsion'
import { seriesReliability } from './reliability'
import { thermalBudget } from './thermal'
import type {
  ComponentSpec,
  EngineeringIssue,
  EngineeringReport,
  MissionDef,
  MissionPlan,
  PropellantType,
  SpacecraftConfig,
} from './types'

export interface BurnAssessment {
  id: string
  label: string
  dvMps: number
  propellantKg: number
  burnSec: number
  windowSec: number
  ok: boolean
  reason: string
}

export function captureOf(mission: MissionDef, plan: MissionPlan) {
  return mission.captureOptions.find((option) => option.id === plan.captureId) ?? mission.captureOptions[0]
}

export function requiredBurns(mission: MissionDef, plan: MissionPlan): { id: string; label: string; dvMps: number; propellant: PropellantType[]; windowSec: number }[] {
  const capture = captureOf(mission, plan)
  return mission.burns.map((burn) => ({
    id: burn.id,
    label: burn.label,
    dvMps: (burn.id === 'arrival' ? capture.dvMps : burn.dvMps) + (burn.id !== 'arrival' && burn.id === mission.burns[0]?.id ? windowExtraDv(mission, plan) : 0),
    propellant: burn.propellant,
    windowSec: burn.windowSec,
  }))
}

export function requiredDeltaV(mission: MissionDef, plan: MissionPlan): number {
  const burns = requiredBurns(mission, plan)
  return burns.reduce((sum, burn) => sum + burn.dvMps, 0) + Math.max(0, plan.reserveDvMps)
}

export function propellantPools(config: SpacecraftConfig): Record<PropellantType, number> {
  const pools: Record<PropellantType, number> = { none: 0, chemical: 0, electric: 0, 'cold-gas': 0 }
  for (const part of config.parts) {
    if (!part.enabled) continue
    const spec = getSpec(part.specId)
    if (!spec) continue
    if (spec.tankCapacityKg > 0) pools[spec.propellant] += spec.tankCapacityKg * clamp01(part.fill)
    if (!spec.feedsMainEngine && spec.onboardPropellantKg > 0) pools[spec.propellant] += spec.onboardPropellantKg
  }
  return pools
}

export function assessBurns(config: SpacecraftConfig, mission: MissionDef, plan: MissionPlan): BurnAssessment[] {
  const pools = propellantPools(config)
  let mass = massBudget(config, getSpec, mission.maxMassKg).totalKg
  const assessments: BurnAssessment[] = []
  for (const burn of requiredBurns(mission, plan)) {
    const engine = pickEngine(config, burn.propellant, pools)
    if (!engine) {
      assessments.push({ id: burn.id, label: burn.label, dvMps: burn.dvMps, propellantKg: 0, burnSec: Infinity, windowSec: burn.windowSec, ok: false, reason: 'No engine can burn the propellant this manoeuvre allows.' })
      continue
    }
    if (!(mass > 0) || !(engine.spec.ispS > 0)) {
      assessments.push({ id: burn.id, label: burn.label, dvMps: burn.dvMps, propellantKg: 0, burnSec: Infinity, windowSec: burn.windowSec, ok: false, reason: 'Mass or specific impulse is not usable.' })
      continue
    }
    const need = propellantForDeltaV(engine.spec.ispS, mass, burn.dvMps)
    const pool = engine.feedsTank ? pools[engine.spec.propellant] : engine.onboard
    if (need === null) {
      assessments.push({ id: burn.id, label: burn.label, dvMps: burn.dvMps, propellantKg: 0, burnSec: Infinity, windowSec: burn.windowSec, ok: false, reason: 'Delta-v demand is not a valid rocket-equation input.' })
      continue
    }
    const flow = engine.spec.thrustN > 0 ? engine.spec.thrustN / (engine.spec.ispS * G0) : 0
    const burnSec = flow > 0 ? need / flow : Infinity
    const enough = pool + 1e-6 >= need
    const inWindow = burnSec <= burn.windowSec
    let reason = ''
    if (!enough) reason = `Needs ${need.toFixed(1)} kg of ${engine.spec.propellant} propellant and ${pool.toFixed(1)} kg is available.`
    else if (!inWindow) reason = `The burn takes ${formatHours(burnSec)} and the window is ${formatHours(burn.windowSec)}. Thrust is too low, or the wrong engine is fitted.`
    assessments.push({ id: burn.id, label: burn.label, dvMps: burn.dvMps, propellantKg: need, burnSec, windowSec: burn.windowSec, ok: enough && inWindow, reason })
    if (enough) {
      if (engine.feedsTank) pools[engine.spec.propellant] -= need
      mass -= need
    }
  }
  const reserve = Math.max(0, plan.reserveDvMps)
  if (reserve > 0) {
    const engine = pickEngine(config, ['chemical', 'electric', 'cold-gas'], pools)
    if (!engine) {
      assessments.push({ id: 'reserve', label: 'Reserve', dvMps: reserve, propellantKg: 0, burnSec: 0, windowSec: Infinity, ok: false, reason: 'No propellant remains for the reserve.' })
    } else {
      const need = propellantForDeltaV(engine.spec.ispS, Math.max(mass, 1), reserve) ?? Infinity
      const pool = engine.feedsTank ? pools[engine.spec.propellant] : engine.onboard
      const ok = pool + 1e-6 >= need
      assessments.push({
        id: 'reserve',
        label: 'Reserve',
        dvMps: reserve,
        propellantKg: Number.isFinite(need) ? need : 0,
        burnSec: 0,
        windowSec: Infinity,
        ok,
        reason: ok ? '' : `Reserve of ${reserve.toFixed(0)} m/s needs ${Number.isFinite(need) ? need.toFixed(1) : 'more'} kg after the planned burns.`,
      })
    }
  }
  return assessments
}

function pickEngine(config: SpacecraftConfig, allowed: PropellantType[], pools: Record<PropellantType, number>) {
  let best: { spec: ComponentSpec; feedsTank: boolean; onboard: number } | null = null
  for (const part of config.parts) {
    if (!part.enabled) continue
    const spec = getSpec(part.specId)
    if (!spec || spec.thrustN <= 0 || spec.ispS <= 0) continue
    if (!allowed.includes(spec.propellant)) continue
    const feedsTank = spec.feedsMainEngine
    const onboard = spec.onboardPropellantKg
    const available = feedsTank ? pools[spec.propellant] : onboard
    if (available <= 0) continue
    if (!best || spec.thrustN > best.spec.thrustN) best = { spec, feedsTank, onboard }
  }
  return best
}

export function evaluate(config: SpacecraftConfig, mission: MissionDef, plan: MissionPlan): EngineeringReport {
  const mass = massBudget(config, getSpec, mission.maxMassKg)
  const propulsion = propulsionBudget(config, getSpec)
  const power = powerBudget(config, getSpec, mission.destinationAu, mission.eclipseFraction, mission.eclipseHours)
  const cost = costBudget(config, getSpec, mission.launchCostUsd, mission.opsPerDayUsd, mission.durationDays, mission.contingencyRate, mission.budgetUsd)
  const distance = mission.linkDistanceM
  const link = linkBudget(config, getSpec, distance, mission.groundGainDbi, mission.groundTempK, mission.requiredMarginDb, mission.minDownlinkBps)
  const thermal = thermalBudget(config, getSpec, mission.destinationAu, 1, mission.solarAbsorptivity, mission.emissivity, mission.bodyAreaM2)
  const reliability = seriesReliability(config, getSpec, mission.durationDays / 365.25)
  const requiredDvMps = requiredDeltaV(mission, plan)
  const burns = assessBurns(config, mission, plan)
  const issues: EngineeringIssue[] = []

  const buses = config.parts.filter((part) => getSpec(part.specId)?.subsystem === 'structure' && part.specId.startsWith('bus'))
  if (buses.length === 0) {
    issues.push(issue('no-bus', 'hard', 'structure', 'The spacecraft has no bus.', 'Avionics, structure and the launch interface live on the bus.', 'Add one bus. A second bus only adds mass.'))
  }
  if (mass.totalKg > mission.maxMassKg) {
    issues.push(issue('mass', 'hard', 'structure', `Launch mass is ${mass.totalKg.toFixed(0)} kg. The vehicle limit is ${mission.maxMassKg.toFixed(0)} kg.`, 'Dry mass plus propellant exceeds the launcher.', 'Remove mass, shrink a tank, or choose a lighter bus. Propellant is usually the largest term.'))
  } else if (mass.marginKg < mission.maxMassKg * 0.05) {
    issues.push(issue('mass-margin', 'warning', 'structure', `Mass margin is only ${mass.marginKg.toFixed(0)} kg.`, 'A late instrument or a fuller tank will exceed the limit.', 'Leave a few percent of the limit unused.'))
  }
  if (cost.totalUsd > mission.budgetUsd) {
    issues.push(issue('budget', 'hard', 'avionics', `Cost is ${money(cost.totalUsd)} against a budget of ${money(mission.budgetUsd)}.`, 'Components, launch, operations and contingency are all counted.', 'Drop the most expensive part that is not carrying its keep, often a power source or a large dish.'))
  }
  for (const burn of burns) {
    if (!burn.ok) {
      issues.push(issue(`burn-${burn.id}`, 'hard', 'propulsion', `${burn.label} cannot be flown.`, burn.reason, 'Add propellant of the matching type, raise specific impulse, or raise thrust if the window is the problem.'))
    }
  }
  if (propulsion.dvMps + 1 < requiredDvMps) {
    issues.push(issue('dv', 'hard', 'propulsion', `Achievable delta-v is ${propulsion.dvMps.toFixed(0)} m/s. The plan needs ${requiredDvMps.toFixed(0)} m/s.`, 'The rocket equation uses the propellant you actually loaded and the engine that can burn it.', 'Increase tank fill or tank size, or remove dry mass. A heavier ship needs more propellant for the same delta-v.'))
  }
  const instruments = new Set(config.parts.filter((part) => part.enabled).map((part) => getSpec(part.specId)?.instrument).filter(Boolean) as string[])
  for (const need of mission.requiredInstruments) {
    if (!instruments.has(need)) {
      issues.push(issue(`inst-${need}`, 'hard', 'science', `Missing ${need}.`, 'The mission success criteria name this instrument.', `Add a ${need} from the science catalog.`))
    }
  }
  for (const need of objectiveKit(plan.objectiveId)) {
    if (!instruments.has(need)) {
      issues.push(issue(`obj-${need}`, 'warning', 'science', `The ${need} is not on this spacecraft.`, 'The chosen surface objective pays off when this instrument is aboard. The flight can still leave without it.', `Add the ${need} if this objective is the reason for the trip.`))
    }
  }
  if (!config.parts.some((part) => (getSpec(part.specId)?.storageBits ?? 0) > 0)) {
    issues.push(issue('recorder', 'hard', 'communications', 'No recorder is fitted.', 'Science data needs somewhere to sit between contacts.', 'Add the deep space transponder.'))
  }
  if (link.txPowerW <= 0 || link.gainDbi <= 0) {
    issues.push(issue('antenna', 'hard', 'communications', 'No transmitter and antenna are fitted.', 'A recorder without a radio cannot return data.', 'Add an antenna. Gain matters more as distance grows.'))
  } else if (!link.closes) {
    issues.push(issue('link', 'hard', 'communications', `Link margin at the destination is ${link.marginDb.toFixed(1)} dB.`, `Free-space loss over ${(distance / 1e6).toFixed(0)} thousand km is more than this transmitter and antenna can close at ${mission.minDownlinkBps.toLocaleString('en-US')} bit/s.`, 'Fit a higher-gain antenna or more transmit power. Both cost mass and watts.'))
  } else if (link.marginDb < 3) {
    issues.push(issue('link-thin', 'warning', 'communications', `Link margin is only ${link.marginDb.toFixed(1)} dB.`, 'The model omits weather and pointing loss, so a thin margin is fragile.', 'Take a larger antenna if the mass budget allows.'))
  }
  if (!power.coversEclipse) {
    issues.push(issue('eclipse', 'hard', 'power', 'The battery cannot cover the eclipse load.', `The eclipse asks for about ${power.eclipseLoadWh.toFixed(0)} Wh and the battery stores ${power.batteryWh.toFixed(0)} Wh, after constant generation is credited.`, 'Add battery capacity or cut the load that stays on in shadow.'))
  }
  const destGen = power.constantGenerationW + power.generationAt1AuW / (mission.destinationAu * mission.destinationAu)
  if (destGen + 1 < power.loadW * 0.55) {
    issues.push(issue('power', 'hard', 'power', 'Average power at the destination cannot support the spacecraft.', `Generation is about ${destGen.toFixed(0)} W and the fitted load is ${power.loadW.toFixed(0)} W.`, 'Add generation that still works at this distance, or remove load. Solar arrays follow an inverse square law.'))
  } else if (destGen < power.loadW) {
    issues.push(issue('power-tight', 'warning', 'power', 'Generation is below the full load at the destination.', 'You will have to duty-cycle instruments. The planner duty cycle has to stay inside this limit.', 'Lower the science duty or add power.'))
  }
  if (!thermal.withinLimits && Number.isFinite(thermal.temperatureK)) {
    issues.push(issue('thermal', 'hard', 'thermal', `Equilibrium temperature is ${thermal.temperatureK.toFixed(0)} K.`, `The allowed band for the fitted bus and instruments is ${thermal.minLimitK.toFixed(0)} K to ${thermal.maxLimitK.toFixed(0)} K. ${thermal.note}`, thermal.temperatureK > thermal.maxLimitK ? 'Add radiator area or reduce electrical load.' : 'Add heaters or a heat-producing power source, and check insulation.'))
  }
  if (reliability.seriesReliability < 0.85) {
    issues.push(issue('reliability', 'warning', 'avionics', `Series reliability over the mission is ${(reliability.seriesReliability * 100).toFixed(0)}%.`, 'Every enabled part is in series. Long missions accumulate hazard.', 'Remove parts you do not need, or accept the risk in flight.'))
  }
  const hardCount = issues.filter((item) => item.severity === 'hard').length
  return {
    mass,
    propulsion,
    power,
    cost,
    link,
    thermal,
    reliability,
    requiredDvMps,
    issues,
    hardCount,
    warningCount: issues.length - hardCount,
    flyable: hardCount === 0,
  }
}

function issue(id: string, severity: EngineeringIssue['severity'], subsystem: EngineeringIssue['subsystem'], what: string, why: string, change: string): EngineeringIssue {
  return { id, severity, subsystem, what, why, change }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function formatHours(sec: number): string {
  if (!Number.isFinite(sec)) return 'an unbounded time'
  if (sec < 7200) return `${(sec / 60).toFixed(0)} min`
  if (sec < 172800) return `${(sec / 3600).toFixed(1)} h`
  return `${(sec / 86400).toFixed(1)} days`
}

function money(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)} billion`
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)} million`
  return `$${Math.round(usd).toLocaleString('en-US')}`
}

export function propellantRemainingDeltaV(ispS: number, massKg: number, propellantKg: number): number {
  if (propellantKg <= 0 || massKg <= propellantKg) return 0
  const result = rocketDeltaV(ispS, massKg, massKg - propellantKg)
  return result.ok ? result.dvMps : 0
}
