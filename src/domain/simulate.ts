import { G0, SIM_STEP_SEC } from './constants'
import { getSpec } from './catalog'
import { linkBudget } from './link'
import { stepBattery } from './power'
import { propellantForDeltaV } from './propulsion'
import { hashString, nextRandom } from './reliability'
import { thermalBudget } from './thermal'
import { objectiveKit } from './campaign'
import { captureOf, propellantPools, requiredBurns } from './validate'
import type {
  ComponentSpec,
  InstalledPart,
  MissionDef,
  MissionPlan,
  PropellantType,
  ScriptItem,
  SimState,
  SpacecraftConfig,
} from './types'

export function createSim(config: SpacecraftConfig, mission: MissionDef, plan: MissionPlan): SimState {
  const pools = propellantPools(config)
  const seed = hashString(`${mission.id}|${config.name}|${config.parts.map((part) => `${part.specId}:${part.fill.toFixed(3)}:${part.enabled}`).join(',')}|${plan.captureId}|${plan.reserveDvMps}`)
  const state: SimState = {
    seed,
    rng: seed || 1,
    tSec: 0,
    script: buildScript(mission, plan),
    index: 0,
    segmentElapsed: 0,
    propellant: { chemical: pools.chemical, electric: pools.electric, 'cold-gas': pools['cold-gas'] },
    batteryJ: batteryCapacityJ(config),
    dvUsedMps: 0,
    sciencePoints: 0,
    dataStoredBits: 0,
    dataReturnedBits: 0,
    distanceFraction: 0,
    powerMode: 'nominal',
    disabled: [],
    burning: false,
    thrustFraction: 0,
    maneuver: 'Awaiting checkout',
    phaseLabel: 'Pre-departure',
    commsMarginDb: 0,
    temperatureK: 280,
    powerGenW: 0,
    powerLoadW: 0,
    status: 'running',
    decision: null,
    log: [{ tSec: 0, tone: 'info', text: 'Spacecraft is in the parking orbit. The launcher’s job ends here.' }],
    alerts: [],
    decisionsMade: [],
    brownoutSec: 0,
    failed: false,
    failReason: '',
    correctionPenalty: 0,
    scienceMultiplier: 1,
    extraArrivalDv: 0,
    arrivalResolved: false,
    burnDvLeft: null,
    safeUntil: 0,
    linkBlackoutUntil: 0,
    solarScale: 1,
    overflowLogged: false,
    dayMark: -1,
    originAu: mission.originAu,
    destAu: mission.destinationAu,
    node: null,
    throttle: 1,
    pointingRad: 0,
  }
  refreshEnvironment(state, config, mission)
  state.powerLoadW = hotelLoad(state, config, null)
  state.dayMark = -1
  return state
}

export function buildScript(mission: MissionDef, plan: MissionPlan): ScriptItem[] {
  const capture = captureOf(mission, plan)
  const script: ScriptItem[] = [{ type: 'coast', sec: 3600, label: 'Parking orbit checkout', fractionFrom: 0, fractionTo: 0.02 }]
  const cruiseEvents = mission.events.filter((event) => typeof event.at === 'number')
  mission.burns.forEach((burn, index) => {
    const listed = requiredBurns(mission, plan).find((item) => item.id === burn.id)
    const dv = listed?.dvMps ?? (burn.id === 'arrival' ? capture.dvMps : burn.dvMps)
    script.push({ type: 'burn', id: burn.id, dv, label: burn.label, propellant: burn.propellant, windowSec: burn.windowSec })
    if (burn.coastAfterSec > 0) {
      if (index === 0 && cruiseEvents.length > 0) {
        const first = burn.coastAfterSec * 0.42
        script.push({ type: 'coast', sec: first, label: 'Outbound coast', fractionFrom: 0.02, fractionTo: 0.45 })
        for (const event of cruiseEvents) script.push({ type: 'decision', eventId: event.id })
        script.push({ type: 'coast', sec: burn.coastAfterSec - first, label: 'Continue coast', fractionFrom: 0.45, fractionTo: 1 })
      } else {
        script.push({ type: 'coast', sec: burn.coastAfterSec, label: 'Coast', fractionFrom: 0.2, fractionTo: 1 })
      }
    }
  })
  for (const event of mission.events.filter((item) => item.at === 'arrival')) script.push({ type: 'decision', eventId: event.id })
  for (const event of mission.events.filter((item) => item.at === 'science')) script.push({ type: 'decision', eventId: event.id })
  script.push({ type: 'science', sec: mission.scienceWindowSec })
  script.push({ type: 'end' })
  return script
}

export function stepSim(state: SimState, config: SpacecraftConfig, mission: MissionDef, plan: MissionPlan, budgetSec?: number): SimState {
  if (state.status !== 'running') return state
  const next: SimState = structuredClone(state)
  const item = next.script[next.index]
  if (!item || item.type === 'end') return complete(next, config, mission)

  if (item.type === 'decision') {
    const event = mission.events.find((entry) => entry.id === item.eventId)
    if (!event) {
      next.index += 1
      return next
    }
    next.decision = { id: event.id, title: event.title, detail: event.detail, options: event.options }
    next.status = 'awaiting'
    next.burning = false
    next.thrustFraction = 0
    next.maneuver = 'Awaiting a decision'
    next.phaseLabel = event.title
    pushLog(next, 'warn', event.title)
    return next
  }

  const coastBudget = budgetSec && budgetSec > 0 ? budgetSec : 3600
  const remaining = item.type === 'burn' ? SIM_STEP_SEC : Math.max(0, item.sec - next.segmentElapsed)
  const dt = item.type === 'burn'
    ? Math.min(SIM_STEP_SEC, budgetSec && budgetSec > 0 ? budgetSec : SIM_STEP_SEC)
    : Math.min(coastBudget, remaining)
  if (dt <= 0) {
    next.index += 1
    next.segmentElapsed = 0
    next.burnDvLeft = null
    return next
  }

  if (item.type === 'burn') {
    if (next.burnDvLeft === null) {
      const planned = item.dv + (item.id === 'arrival' ? next.extraArrivalDv : 0)
      const armed = next.node && next.node.burnId === item.id ? next.node : null
      const magnitude = armed ? Math.hypot(armed.prograde, armed.radial, armed.normal) : planned
      next.burnDvLeft = Number.isFinite(magnitude) ? magnitude : planned
      if (item.id === 'arrival') next.extraArrivalDv = 0
      if (armed) {
        next.node = null
        pushLog(next, 'info', `${item.label} started from the node. ${next.burnDvLeft.toFixed(0)} m/s. Prograde ${armed.prograde.toFixed(0)}, radial ${armed.radial.toFixed(0)}, normal ${armed.normal.toFixed(0)}.`)
      } else {
        pushLog(next, 'info', `${item.label} started. ${next.burnDvLeft.toFixed(0)} m/s planned.`)
      }
    }
    const burned = integrateBurn(next, config, item.propellant, dt)
    next.burning = burned.thrustFraction > 0
    next.thrustFraction = burned.thrustFraction
    next.maneuver = item.label
    next.phaseLabel = item.label
    next.segmentElapsed += dt
    if (!burned.ok) return fail(next, burned.reason)
    if ((next.burnDvLeft ?? 0) <= 1) {
      pushLog(next, 'good', `${item.label} complete.`)
      next.index += 1
      next.segmentElapsed = 0
      next.burnDvLeft = null
      next.burning = false
      next.thrustFraction = 0
    } else if (next.segmentElapsed > item.windowSec) {
      return fail(next, `${item.label} exceeded its window with ${(next.burnDvLeft ?? 0).toFixed(0)} m/s still required.`)
    }
  } else {
    next.burning = false
    next.thrustFraction = 0
    next.maneuver = item.type === 'science' ? 'Science operations' : item.label
    next.phaseLabel = next.maneuver
    integrateCoast(next, config, mission, plan, dt, item.type === 'science')
    if (item.type === 'coast') {
      const span = item.fractionTo - item.fractionFrom
      const elapsed = next.segmentElapsed + dt
      next.distanceFraction = item.fractionFrom + Math.min(1, item.sec > 0 ? elapsed / item.sec : 1) * span
    } else {
      next.distanceFraction = 1
    }
    next.segmentElapsed += dt
    if (next.segmentElapsed >= item.sec - 0.1) {
      next.index += 1
      next.segmentElapsed = 0
    }
  }

  next.tSec += dt
  refreshEnvironment(next, config, mission)
  maybeFailParts(next, config, dt)
  if (next.status === 'failed') return next
  if (next.safeUntil > 0 && next.tSec >= next.safeUntil && next.powerMode === 'safe') next.powerMode = 'nominal'
  return next
}

export function applyDecision(state: SimState, optionId: string, config: SpacecraftConfig, mission: MissionDef): SimState {
  if (!state.decision) return state
  const id = state.decision.id
  const next: SimState = structuredClone(state)
  next.decisionsMade.push({ id, option: optionId, title: state.decision.title })
  next.decision = null
  next.status = 'running'
  next.index += 1
  next.segmentElapsed = 0

  if (id === 'nav-residual' && optionId === 'correct') {
    const spent = spendDeltaV(next, config, id === 'nav-residual' && mission.id === 'europa' ? 40 : mission.id === 'mars' ? 30 : mission.id === 'asteroid' ? 20 : 25)
    pushLog(next, spent.ok ? 'good' : 'fault', spent.ok ? `Correction burned. ${spent.dv.toFixed(0)} m/s used.` : spent.reason)
    if (!spent.ok) return fail(next, spent.reason)
  } else if (id === 'nav-residual' && optionId === 'ignore') {
    next.scienceMultiplier *= 0.6
    next.extraArrivalDv += mission.id === 'europa' ? 120 : mission.id === 'mars' ? 70 : mission.id === 'asteroid' ? 50 : 40
    pushLog(next, 'warn', 'Navigation residual left in the trajectory. Arrival will cost more.')
  } else if (id === 'pointing' && optionId === 'repoint') {
    next.scienceMultiplier *= 0.92
    pushLog(next, 'info', 'Antenna repointed. A short observing gap was taken.')
  } else if (id === 'pointing' && optionId === 'degrade') {
    next.scienceMultiplier *= 0.7
    pushLog(next, 'warn', 'Instruments stayed on. The return link is slower.')
  } else if (id === 'solar-event' && optionId === 'safe') {
    next.safeUntil = next.tSec + 2 * 86400
    next.powerMode = 'safe'
    pushLog(next, 'info', 'Safe mode for two days. Arrays stay available afterwards.')
  } else if (id === 'solar-event' && optionId === 'ride') {
    next.solarScale = 0.55
    next.safeUntil = next.tSec + 2 * 86400
    next.scienceMultiplier *= 0.75
    pushLog(next, 'warn', 'Riding through the particle event. Generation is reduced and science is degraded.')
  } else if (id === 'solar-event' && optionId === 'store') {
    next.linkBlackoutUntil = next.tSec + 7 * 86400
    pushLog(next, 'info', 'Collecting into the recorder until the link returns.')
  } else if (id === 'solar-event' && optionId === 'pause') {
    next.safeUntil = next.tSec + 7 * 86400
    next.powerMode = 'safe'
    next.linkBlackoutUntil = next.tSec + 7 * 86400
    pushLog(next, 'info', 'Instruments paused for the conjunction.')
  } else if (id === 'proximity' && optionId === 'match') {
    const spent = spendDeltaV(next, config, 80)
    pushLog(next, spent.ok ? 'good' : 'fault', spent.ok ? 'Proximity burn matched the relative motion.' : spent.reason)
    if (!spent.ok) return fail(next, spent.reason)
  } else if (id === 'proximity' && optionId === 'standoff') {
    next.scienceMultiplier *= 0.62
    pushLog(next, 'warn', 'Holding a standoff distance. The data set will be poorer.')
  }
  return next
}

function integrateBurn(state: SimState, config: SpacecraftConfig, allowed: PropellantType[], dt: number): { ok: boolean; reason: string; thrustFraction: number } {
  const engine = pickLiveEngine(config, state, allowed)
  if (!engine) return { ok: false, reason: 'The burn has no working engine and no propellant of the right type.', thrustFraction: 0 }
  const poolKey = engine.propellant
  const pool = state.propellant[poolKey]
  if (pool <= 0) return { ok: false, reason: 'Propellant for this burn is exhausted.', thrustFraction: 0 }
  const hotel = hotelLoad(state, config, engine.id)
  const gen = generationW(state, config)
  let fraction = 1
  if (engine.powerDrawW > 50) {
    const spare = gen + state.batteryJ / Math.max(dt, 1) - hotel
    fraction = Math.max(0, Math.min(1, spare / engine.powerDrawW))
  }
  if (fraction < 0.05) {
    const idle = stepBattery(state.batteryJ, batteryCapacityJ(config), gen, hotel, dt)
    state.powerGenW = gen
    state.powerLoadW = hotel
    state.batteryJ = idle.batteryJ
    return { ok: false, reason: 'The engine does not have enough electrical power to produce useful thrust.', thrustFraction: 0 }
  }
  const commanded = Math.min(1, Math.max(0, state.throttle ?? 1))
  const thrust = engine.thrustN * fraction * commanded
  const load = hotel + engine.powerDrawW * fraction * commanded
  const powered = stepBattery(state.batteryJ, batteryCapacityJ(config), gen, load, dt)
  const mdot = thrust / (engine.ispS * G0)
  let used = Math.min(pool, mdot * dt)
  const mass = currentMass(config, state)
  const wanted = propellantForDeltaV(engine.ispS, mass, Math.max(0, state.burnDvLeft ?? 0))
  if (wanted !== null) used = Math.min(used, wanted)
  if (used >= mass) used = mass * 0.5
  const dv = mass - used > 0 ? engine.ispS * G0 * Math.log(mass / (mass - used)) : 0
  const align = Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(state.pointingRad ?? 0))))
  state.propellant[poolKey] = pool - used
  state.dvUsedMps += dv
  state.burnDvLeft = Math.max(0, (state.burnDvLeft ?? 0) - dv * align)
  state.powerGenW = gen
  state.powerLoadW = load
  state.batteryJ = powered.batteryJ
  if (powered.depleted && engine.powerDrawW > 50) {
    state.powerMode = 'reduced'
    pushLog(state, 'warn', 'Battery is empty during the burn. Thrust is following available generation.')
  }
  return { ok: true, reason: '', thrustFraction: fraction }
}

function integrateCoast(state: SimState, config: SpacecraftConfig, mission: MissionDef, plan: MissionPlan, dt: number, science: boolean): void {
  const gen = generationW(state, config)
  const load = hotelLoad(state, config, null)
  const power = stepBattery(state.batteryJ, batteryCapacityJ(config), gen, load, dt)
  state.powerGenW = gen
  state.powerLoadW = load
  state.batteryJ = power.batteryJ
  if (power.depleted) {
    state.brownoutSec += dt
    if (state.powerMode === 'nominal') {
      state.powerMode = 'reduced'
      pushLog(state, 'warn', 'Power margin is gone. Instruments drop to a reduced duty.')
    } else if (state.brownoutSec > 6 * 3600 && state.powerMode === 'reduced') {
      state.powerMode = 'safe'
      pushLog(state, 'fault', 'Bus entered safe mode to keep the battery alive.')
    }
  } else if (state.tSec >= state.safeUntil && state.powerMode !== 'nominal' && state.solarScale === 1) {
    state.powerMode = 'nominal'
  }
  if (!science) return
  const factor = state.powerMode === 'nominal' ? 1 : state.powerMode === 'reduced' ? 0.4 : 0
  const duty = Math.min(1, Math.max(0, plan.scienceDuty)) * state.scienceMultiplier * factor
  const aboard = liveParts(config, state)
  const kit = objectiveKit(plan.objectiveId)
  const covered = kit.filter((id) => aboard.some((part) => part.id === id)).length
  const kitScale = 1 + 0.35 * (kit.length > 0 ? covered / kit.length : 0)
  for (const part of aboard) {
    if (!part.instrument || part.sciencePoints <= 0) continue
    state.sciencePoints += (part.sciencePoints / 86400) * duty * dt * kitScale
    state.dataStoredBits += part.dataRateBps * duty * dt
  }
  const capture = captureOf(mission, plan)
  state.sciencePoints += (capture.scienceBonus / mission.scienceWindowSec) * duty * dt * kitScale
  if (state.tSec >= state.linkBlackoutUntil && state.commsMarginDb >= 0) {
    const link = flightLink(state, config, mission)
    const moved = Math.min(state.dataStoredBits, link.dataRateBps * mission.contactFraction * dt)
    state.dataStoredBits -= moved
    state.dataReturnedBits += moved
  }
  const capacity = recorderBits(config)
  if (state.dataStoredBits > capacity) {
    state.dataStoredBits = capacity
    if (!state.overflowLogged) {
      state.overflowLogged = true
      pushLog(state, 'warn', 'The recorder is full. New bits are being discarded.')
    }
  }
}

function auNow(state: SimState): number {
  const fraction = Math.min(1, Math.max(0, state.distanceFraction))
  return Math.max(0.2, state.originAu + (state.destAu - state.originAu) * fraction)
}

function generationW(state: SimState, config: SpacecraftConfig): number {
  const au = auNow(state)
  let solar = 0
  let constant = 0
  for (const spec of liveParts(config, state)) {
    if (spec.powerScale === 'constant') constant += Math.max(0, spec.powerGenW)
    else solar += Math.max(0, spec.powerGenW)
  }
  const scale = state.tSec < state.safeUntil ? state.solarScale : 1
  return constant + (solar * scale) / (au * au)
}

function hotelLoad(state: SimState, config: SpacecraftConfig, skipId: string | null): number {
  let load = 0
  for (const spec of liveParts(config, state)) {
    if (skipId && spec.id === skipId) continue
    const scienceOff = state.powerMode === 'safe' && spec.subsystem === 'science'
    if (scienceOff) continue
    if (state.powerMode === 'safe' && spec.thrustN > 0) continue
    if (state.powerMode === 'reduced' && spec.subsystem === 'science') load += spec.powerDrawW * 0.4
    else load += Math.max(0, spec.powerDrawW)
  }
  return load
}

function refreshEnvironment(state: SimState, config: SpacecraftConfig, mission: MissionDef): void {
  const au = auNow(state)
  state.powerGenW = generationW(state, config)
  const link = flightLink(state, config, mission)
  state.commsMarginDb = state.tSec < state.linkBlackoutUntil ? -20 : link.marginDb
  const thermal = thermalBudget(config, getSpec, au, 1, mission.solarAbsorptivity, mission.emissivity, mission.bodyAreaM2)
  state.temperatureK = Number.isFinite(thermal.temperatureK) ? thermal.temperatureK : state.temperatureK
  if (state.tSec >= state.safeUntil && state.solarScale !== 1) state.solarScale = 1
  const day = Math.floor(state.tSec / 86400)
  if (day !== state.dayMark && day > 0 && day % 30 === 0) {
    pushLog(state, 'info', `Day ${day}. Heliocentric distance ${au.toFixed(2)} AU.`)
  }
  state.dayMark = day
}

function flightLink(state: SimState, config: SpacecraftConfig, mission: MissionDef) {
  const distance = mission.linkDistanceM * (0.2 + 0.8 * Math.min(1, Math.max(0, state.distanceFraction)))
  return linkBudget(
    config,
    (id) => (state.disabled.includes(id) ? undefined : getSpec(id)),
    distance,
    mission.groundGainDbi,
    mission.groundTempK,
    mission.requiredMarginDb,
    mission.minDownlinkBps,
  )
}

function maybeFailParts(state: SimState, config: SpacecraftConfig, dt: number): void {
  const day0 = Math.floor((state.tSec - dt) / 86400)
  const day1 = Math.floor(state.tSec / 86400)
  if (day1 === day0) return
  for (const part of config.parts) {
    if (!part.enabled || state.disabled.includes(part.specId)) continue
    const spec = getSpec(part.specId)
    if (!spec) continue
    const p = 1 - Math.exp(-spec.hazardPerYear * (1 / 365.25))
    const roll = nextRandom(state.rng)
    state.rng = roll.state
    if (roll.value < p) {
      state.disabled.push(part.specId)
      pushLog(state, 'fault', `${spec.name} failed and is out of the configuration.`)
      if (spec.subsystem === 'structure') {
        state.failed = true
        state.failReason = 'The bus failed.'
        state.status = 'failed'
      }
    }
  }
}

function spendDeltaV(state: SimState, config: SpacecraftConfig, dv: number): { ok: boolean; reason: string; dv: number } {
  const engine = pickLiveEngine(config, state, ['chemical', 'electric', 'cold-gas'])
  if (!engine) return { ok: false, reason: 'No engine is available for the correction.', dv: 0 }
  const mass = currentMass(config, state)
  const need = propellantForDeltaV(engine.ispS, mass, dv)
  if (need === null) return { ok: false, reason: 'The correction is not a valid burn.', dv: 0 }
  if (state.propellant[engine.propellant] + 1e-6 < need) return { ok: false, reason: 'Not enough propellant to make the correction.', dv: 0 }
  state.propellant[engine.propellant] -= need
  state.dvUsedMps += dv
  return { ok: true, reason: '', dv }
}

function pickLiveEngine(config: SpacecraftConfig, state: SimState, allowed: PropellantType[]): (ComponentSpec & { propellant: 'chemical' | 'electric' | 'cold-gas' }) | null {
  let best: ComponentSpec | null = null
  for (const part of config.parts) {
    if (!part.enabled || state.disabled.includes(part.specId)) continue
    const spec = getSpec(part.specId)
    if (!spec || spec.thrustN <= 0 || !allowed.includes(spec.propellant)) continue
    if (spec.propellant === 'none') continue
    if (state.propellant[spec.propellant] <= 0) continue
    if (!best || spec.thrustN > best.thrustN) best = spec
  }
  if (!best || best.propellant === 'none') return null
  return best as ComponentSpec & { propellant: 'chemical' | 'electric' | 'cold-gas' }
}

function liveParts(config: SpacecraftConfig, state: SimState): ComponentSpec[] {
  const list: ComponentSpec[] = []
  for (const part of config.parts) {
    if (!part.enabled || state.disabled.includes(part.specId)) continue
    const spec = getSpec(part.specId)
    if (spec) list.push(spec)
  }
  return list
}

function currentMass(config: SpacecraftConfig, state: SimState): number {
  let dry = 0
  for (const part of config.parts) {
    const spec = getSpec(part.specId)
    if (spec) dry += spec.massKg
  }
  return dry + state.propellant.chemical + state.propellant.electric + state.propellant['cold-gas']
}

function batteryCapacityJ(config: SpacecraftConfig): number {
  let wh = 0
  for (const part of config.parts) {
    const spec = getSpec(part.specId)
    if (spec) wh += spec.energyWh
  }
  return wh * 3600
}

function recorderBits(config: SpacecraftConfig): number {
  let bits = 0
  for (const part of config.parts) {
    const spec = getSpec(part.specId)
    if (spec) bits += spec.storageBits
  }
  return bits
}

function complete(state: SimState, config: SpacecraftConfig, mission: MissionDef): SimState {
  void config
  void mission
  state.status = 'complete'
  state.burning = false
  state.thrustFraction = 0
  state.maneuver = 'Mission complete'
  state.phaseLabel = 'Complete'
  pushLog(state, 'good', 'Science window closed. The flight record is ready for debrief.')
  return state
}

function fail(state: SimState, reason: string): SimState {
  state.status = 'failed'
  state.failed = true
  state.failReason = reason
  state.burning = false
  state.thrustFraction = 0
  state.maneuver = 'Flight stopped'
  state.phaseLabel = 'Failed'
  pushLog(state, 'fault', reason)
  return state
}

function pushLog(state: SimState, tone: SimState['log'][number]['tone'], text: string): void {
  state.log.unshift({ tSec: state.tSec, tone, text })
  if (state.log.length > 80) state.log.length = 80
  state.alerts = state.log.filter((entry) => entry.tone === 'warn' || entry.tone === 'fault').slice(0, 4).map((entry) => entry.text)
}

export function runUntilBoundary(state: SimState, config: SpacecraftConfig, mission: MissionDef, plan: MissionPlan, maxSteps = 200000): SimState {
  let current = state
  let steps = 0
  while (current.status === 'running' && steps < maxSteps) {
    current = stepSim(current, config, mission, plan)
    steps += 1
  }
  return current
}

export function installedSignature(parts: InstalledPart[]): string {
  return parts.map((part) => `${part.instanceId}:${part.specId}:${part.fill}:${part.enabled}`).join('|')
}
