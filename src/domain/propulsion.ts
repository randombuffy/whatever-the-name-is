import { G0 } from './constants'
import { partPropellantKg } from './mass'
import type { ComponentSpec, InstalledPart, PropellantType, PropulsionBudget, SpacecraftConfig } from './types'

export interface DeltaVResult {
  ok: boolean
  dvMps: number
  reason: string
}

/**
 * Tsiolkovsky rocket equation.
 * Δv = Isp · g0 · ln(m0 / mf)
 * Returns a reason instead of a silent infinity when the logarithm is undefined.
 */
export function rocketDeltaV(ispS: number, m0Kg: number, mfKg: number): DeltaVResult {
  if (!Number.isFinite(ispS) || ispS < 0) return { ok: false, dvMps: 0, reason: 'Specific impulse must be a non-negative number.' }
  if (ispS === 0) return { ok: true, dvMps: 0, reason: 'Specific impulse is zero, so this stage produces no delta-v.' }
  if (!Number.isFinite(m0Kg) || !Number.isFinite(mfKg) || m0Kg <= 0 || mfKg <= 0) {
    return { ok: false, dvMps: 0, reason: 'Initial and final mass must both be greater than zero.' }
  }
  if (mfKg > m0Kg) return { ok: false, dvMps: 0, reason: 'Final mass cannot exceed initial mass.' }
  if (mfKg === m0Kg) return { ok: true, dvMps: 0, reason: 'No propellant is expended.' }
  return { ok: true, dvMps: ispS * G0 * Math.log(m0Kg / mfKg), reason: '' }
}

/** ṁ = F / (Isp · g0). Thrust in newtons, result in kg/s. */
export function massFlowKgS(thrustN: number, ispS: number): DeltaVResult {
  if (!Number.isFinite(thrustN) || thrustN < 0) return { ok: false, dvMps: 0, reason: 'Thrust must be non-negative.' }
  if (!Number.isFinite(ispS) || ispS <= 0) return { ok: false, dvMps: 0, reason: 'Specific impulse must be greater than zero to compute mass flow.' }
  if (thrustN === 0) return { ok: true, dvMps: 0, reason: 'Thrust is zero.' }
  const mdot = thrustN / (ispS * G0)
  return { ok: true, dvMps: mdot, reason: '' }
}

export function burnDurationSec(propellantKg: number, thrustN: number, ispS: number): DeltaVResult {
  if (!Number.isFinite(propellantKg) || propellantKg < 0) return { ok: false, dvMps: 0, reason: 'Propellant mass must be non-negative.' }
  if (propellantKg === 0) return { ok: true, dvMps: 0, reason: 'No propellant.' }
  const flow = massFlowKgS(thrustN, ispS)
  if (!flow.ok) return flow
  if (flow.dvMps === 0) return { ok: false, dvMps: 0, reason: 'A burn with propellant but no mass flow has no finite duration.' }
  return { ok: true, dvMps: propellantKg / flow.dvMps, reason: '' }
}

const ORDER: PropellantType[] = ['chemical', 'electric', 'cold-gas']

interface EnginePick {
  spec: ComponentSpec
  part: InstalledPart
}

/**
 * Sequential stages: chemical tanks, then electric tanks, then cold gas.
 * Each stage uses the highest-thrust engine of that propellant that draws tank propellant.
 * Onboard ACS propellant is applied last, on the lightest mass.
 */
export function propulsionBudget(
  config: SpacecraftConfig,
  lookup: (id: string) => ComponentSpec | undefined,
): PropulsionBudget {
  const resolved: { spec: ComponentSpec; part: InstalledPart }[] = []
  for (const part of config.parts) {
    if (!part.enabled) continue
    const spec = lookup(part.specId)
    if (spec) resolved.push({ spec, part })
  }
  let mass = resolved.reduce((sum, item) => sum + item.spec.massKg + partPropellantKg(item.spec, item.part), 0)
  const byPropellant: PropulsionBudget['byPropellant'] = []
  let totalDv = 0

  for (const type of ORDER) {
    const engines = resolved.filter((item) => item.spec.propellant === type && item.spec.thrustN > 0 && item.spec.feedsMainEngine)
    const tanks = resolved.filter((item) => item.spec.propellant === type && item.spec.tankCapacityKg > 0)
    const prop = tanks.reduce((sum, item) => sum + item.spec.tankCapacityKg * clampFill(item.part.fill), 0)
    const engine = bestEngine(engines)
    if (engine && prop > 0 && mass > prop) {
      const stage = applyStage(mass, prop, engine.spec.ispS, engine.spec.thrustN, type)
      byPropellant.push(stage)
      totalDv += stage.dvMps
      mass -= prop
    }
  }

  const acs = resolved.filter((item) => item.spec.thrustN > 0 && !item.spec.feedsMainEngine && item.spec.onboardPropellantKg > 0)
  for (const item of acs) {
    const prop = item.spec.onboardPropellantKg
    if (prop <= 0 || mass <= prop) continue
    const stage = applyStage(mass, prop, item.spec.ispS, item.spec.thrustN, item.spec.propellant)
    stage.type = item.spec.propellant
    byPropellant.push(stage)
    totalDv += stage.dvMps
    mass -= prop
  }

  const main = byPropellant[0]
  return {
    dvMps: totalDv,
    byPropellant,
    massFlowKgS: main ? main.propellantKg / Math.max(main.burnSec, 1e-9) : 0,
    usablePropellantKg: byPropellant.reduce((sum, stage) => sum + stage.propellantKg, 0),
  }
}

function clampFill(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function bestEngine(engines: EnginePick[]): EnginePick | null {
  if (engines.length === 0) return null
  return engines.reduce((best, item) => (item.spec.thrustN > best.spec.thrustN ? item : best))
}

function applyStage(m0: number, prop: number, isp: number, thrust: number, type: PropellantType) {
  const dv = rocketDeltaV(isp, m0, m0 - prop)
  const duration = burnDurationSec(prop, thrust, isp)
  return {
    type,
    dvMps: dv.ok ? dv.dvMps : 0,
    propellantKg: prop,
    ispS: isp,
    thrustN: thrust,
    burnSec: duration.ok ? duration.dvMps : Number.POSITIVE_INFINITY,
  }
}

/** Propellant mass that produces `dvMps` starting from `m0Kg` at constant Isp. */
export function propellantForDeltaV(ispS: number, m0Kg: number, dvMps: number): number | null {
  if (!Number.isFinite(ispS) || ispS <= 0 || !Number.isFinite(m0Kg) || m0Kg <= 0) return null
  if (!Number.isFinite(dvMps) || dvMps < 0) return null
  if (dvMps === 0) return 0
  const mf = m0Kg * Math.exp(-dvMps / (ispS * G0))
  if (!Number.isFinite(mf) || mf <= 0 || mf > m0Kg) return null
  return m0Kg - mf
}

export function engineFor(
  config: SpacecraftConfig,
  lookup: (id: string) => ComponentSpec | undefined,
  allowed: PropellantType[],
): { spec: ComponentSpec; availableKg: number } | null {
  let best: ComponentSpec | null = null
  let available = 0
  const tanks: Record<string, number> = { chemical: 0, electric: 0, 'cold-gas': 0, none: 0 }
  for (const part of config.parts) {
    if (!part.enabled) continue
    const spec = lookup(part.specId)
    if (!spec) continue
    if (spec.tankCapacityKg > 0) tanks[spec.propellant] = (tanks[spec.propellant] ?? 0) + spec.tankCapacityKg * clampFill(part.fill)
  }
  for (const part of config.parts) {
    if (!part.enabled) continue
    const spec = lookup(part.specId)
    if (!spec || spec.thrustN <= 0) continue
    if (!allowed.includes(spec.propellant)) continue
    const pool = spec.feedsMainEngine ? tanks[spec.propellant] ?? 0 : spec.onboardPropellantKg
    if (pool <= 0) continue
    if (!best || spec.thrustN > best.thrustN) {
      best = spec
      available = pool
    }
  }
  return best ? { spec: best, availableKg: available } : null
}
