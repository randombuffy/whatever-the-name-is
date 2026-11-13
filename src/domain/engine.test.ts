import { describe, expect, it } from 'vitest'
import { G0, MU_EARTH, R_EARTH_M, SIGMA } from './constants'
import { costBudget } from './budget'
import { getMission, starterCraft, defaultPlan } from './missions'
import { massBudget } from './mass'
import { freeSpacePathLossDb } from './link'
import { lunarTransfer, circularVelocity, escapeVelocity, hohmann } from './orbit'
import { rocketDeltaV, massFlowKgS, burnDurationSec, propellantForDeltaV } from './propulsion'
import { solarPowerW, stepBattery } from './power'
import { equilibriumTemperatureK } from './thermal'
import { seriesReliability, nextRandom } from './reliability'
import { getSpec } from './catalog'
import { evaluate } from './validate'
import { repairCraft } from './repair'
import { applyDecision, createSim, runUntilBoundary, stepSim } from './simulate'
import type { SpacecraftConfig } from './types'

function craft(ids: string[]): SpacecraftConfig {
  return {
    name: 'Candidate',
    parts: ids.map((specId, index) => ({
      instanceId: `${specId}-${index}`,
      specId,
      fill: 1,
      enabled: true,
      mount: 'bus' as const,
    })),
  }
}

describe('rocket equation', () => {
  it('matches an independent numerical case', () => {
    const isp = 321
    const m0 = 1000
    const mf = 700
    const expected = isp * 9.80665 * Math.log(m0 / mf)
    const result = rocketDeltaV(isp, m0, mf)
    expect(result.ok).toBe(true)
    expect(result.dvMps).toBeCloseTo(expected, 8)
    expect(result.dvMps).toBeCloseTo(1122.79, 2)
  })

  it('rejects an invalid logarithm domain', () => {
    expect(rocketDeltaV(300, 100, 0).ok).toBe(false)
    expect(rocketDeltaV(300, 100, 120).ok).toBe(false)
    expect(rocketDeltaV(-1, 100, 80).ok).toBe(false)
    expect(rocketDeltaV(300, 100, 100).dvMps).toBe(0)
  })

  it('computes mass flow and burn duration', () => {
    const flow = massFlowKgS(450, 321)
    expect(flow.ok).toBe(true)
    expect(flow.dvMps).toBeCloseTo(450 / (321 * G0), 8)
    const duration = burnDurationSec(100, 450, 321)
    expect(duration.ok).toBe(true)
    expect(duration.dvMps).toBeCloseTo(100 / (450 / (321 * G0)), 6)
    expect(burnDurationSec(10, 0, 300).ok).toBe(false)
    expect(massFlowKgS(10, 0).ok).toBe(false)
  })

  it('inverts delta-v back to propellant mass', () => {
    const prop = propellantForDeltaV(321, 1000, 500)
    expect(prop).not.toBeNull()
    const back = rocketDeltaV(321, 1000, 1000 - (prop ?? 0))
    expect(back.dvMps).toBeCloseTo(500, 4)
    expect(propellantForDeltaV(0, 1000, 100)).toBeNull()
    expect(propellantForDeltaV(300, 1000, -5)).toBeNull()
  })
})

describe('mass, power, cost, thermal, link', () => {
  it('splits dry mass, propellant and payload', () => {
    const config = craft(['bus-12u', 'tank-40', 'camera'])
    const budget = massBudget(config, getSpec, 100)
    expect(budget.dryKg).toBeCloseTo(9 + 5 + 2.4, 6)
    expect(budget.propellantKg).toBeCloseTo(40, 6)
    expect(budget.payloadKg).toBeCloseTo(2.4, 6)
    expect(budget.totalKg).toBeCloseTo(budget.dryKg + budget.propellantKg, 6)
    expect(budget.marginKg).toBeCloseTo(100 - budget.totalKg, 6)
  })

  it('scales solar power with the inverse square and steps the battery', () => {
    expect(solarPowerW(400, 2, 1)).toBeCloseTo(100, 6)
    expect(solarPowerW(400, 1, 0)).toBe(0)
    expect(solarPowerW(-5, 1, 1)).toBe(0)
    const full = stepBattery(0, 1000, 10, 0, 10)
    expect(full.batteryJ).toBe(100)
    const held = stepBattery(500, 1000, 50, 50, 10)
    expect(held.batteryJ).toBe(500)
    const empty = stepBattery(10, 1000, 0, 5, 10)
    expect(empty.batteryJ).toBe(0)
    expect(empty.depleted).toBe(true)
  })

  it('adds contingency on component cost only', () => {
    const config = craft(['camera'])
    const cost = costBudget(config, getSpec, 1_000_000, 10_000, 10, 0.1, 5_000_000)
    expect(cost.componentsUsd).toBe(800_000)
    expect(cost.launchUsd).toBe(1_000_000)
    expect(cost.operationsUsd).toBe(100_000)
    expect(cost.contingencyUsd).toBeCloseTo(80_000, 4)
    expect(cost.totalUsd).toBeCloseTo(1_980_000, 4)
    expect(cost.marginUsd).toBeCloseTo(5_000_000 - 1_980_000, 4)
  })

  it('solves the single-node radiator balance', () => {
    const heat = 100
    const solar = 0
    const eps = 0.85
    const area = 1
    const expected = ((heat) / (eps * SIGMA * area) + 3 ** 4) ** 0.25
    const t = equilibriumTemperatureK(heat, solar, eps, area)
    expect(t).toBeCloseTo(expected, 6)
    expect(t ?? 0).toBeGreaterThan(200)
    expect(t ?? 0).toBeLessThan(250)
    expect(equilibriumTemperatureK(10, 0, 0, 1)).toBeNull()
  })

  it('computes free-space loss with the standard decibel form', () => {
    const dKm = 384400
    const fMHz = 2200
    const expected = 20 * Math.log10(dKm) + 20 * Math.log10(fMHz) + 32.44
    expect(freeSpacePathLossDb(dKm * 1000, fMHz * 1e6)).toBeCloseTo(expected, 8)
    expect(expected).toBeCloseTo(210.97, 1)
    expect(freeSpacePathLossDb(0, 1e9)).toBeNull()
    expect(freeSpacePathLossDb(1e6, 0)).toBeNull()
  })

  it('uses a series reliability that falls with time', () => {
    const config = craft(['bus-12u'])
    const year = seriesReliability(config, getSpec, 1)
    expect(year.seriesReliability).toBeCloseTo(Math.exp(-0.03), 8)
    const zero = seriesReliability(config, getSpec, 0)
    expect(zero.seriesReliability).toBe(1)
  })
})

describe('orbits', () => {
  it('reproduces circular and escape speed at Earth radius', () => {
    const v = circularVelocity(MU_EARTH, R_EARTH_M)
    const esc = escapeVelocity(MU_EARTH, R_EARTH_M)
    expect(v).toBeCloseTo(Math.sqrt(MU_EARTH / R_EARTH_M), 6)
    expect(esc).toBeCloseTo((v ?? 0) * Math.sqrt(2), 6)
    expect(circularVelocity(0, 1)).toBeNull()
    expect(hohmann(-1, 1, 2)).toBeNull()
  })

  it('puts trans-lunar injection in the familiar band', () => {
    const lunar = lunarTransfer()
    expect(lunar).not.toBeNull()
    expect(lunar!.tliMps).toBeGreaterThan(3000)
    expect(lunar!.tliMps).toBeLessThan(3300)
    expect(lunar!.loiMps).toBeGreaterThan(600)
    expect(lunar!.loiMps).toBeLessThan(1400)
    expect(lunar!.tofSec).toBeGreaterThan(3 * 86400)
    expect(lunar!.tofSec).toBeLessThan(7 * 86400)
  })
})

describe('mission validation', () => {
  it('rejects the lunar starter for a real delta-v or link shortfall', () => {
    const mission = getMission('lunar')!
    const report = evaluate(starterCraft('lunar'), mission, defaultPlan(mission))
    expect(report.flyable).toBe(false)
    expect(report.hardCount).toBeGreaterThan(0)
  })

  it('accepts a resized lunar spacecraft', () => {
    const mission = getMission('lunar')!
    const report = evaluate(
      craft(['bus-small', 'biprop-450', 'tank-500', 'acs', 'panel-600', 'battery-1500', 'transponder', 'antenna-hga', 'camera', 'mli', 'radiator-s']),
      mission,
      defaultPlan(mission),
    )
    expect(report.issues.filter((issue) => issue.severity === 'hard').map((issue) => issue.what + ' ' + issue.why)).toEqual([])
    expect(report.flyable).toBe(true)
    expect(report.propulsion.dvMps).toBeGreaterThan(report.requiredDvMps)
  })

  it('auto-fix clears every hard issue, including launch mass', () => {
    for (const id of ['lunar', 'mars', 'europa', 'asteroid']) {
      const mission = getMission(id)!
      const plan = defaultPlan(mission)
      const fixed = repairCraft(starterCraft(id), mission, plan)
      const hard = evaluate(fixed, mission, plan).issues.filter((issue) => issue.severity === 'hard')
      expect(hard.map((issue) => `${id}:${issue.id}`)).toEqual([])
    }
  })
})

describe('simulation', () => {
  it('is deterministic and spends propellant when the correction is flown', () => {
    const mission = getMission('lunar')!
    const plan = defaultPlan(mission)
    const config = craft(['bus-small', 'biprop-450', 'tank-500', 'acs', 'panel-600', 'battery-1500', 'transponder', 'antenna-hga', 'camera', 'mli', 'radiator-s'])
    const run = () => {
      let sim = createSim(config, mission, plan)
      sim = runUntilBoundary(sim, config, mission, plan)
      expect(sim.status).toBe('awaiting')
      expect(sim.decision?.id).toBe('nav-residual')
      const before = sim.propellant.chemical
      sim = applyDecision(sim, 'correct', config, mission)
      return { before, after: sim.propellant.chemical, dv: sim.dvUsedMps, rng: sim.rng }
    }
    const a = run()
    const b = run()
    expect(a).toEqual(b)
    expect(a.after).toBeLessThan(a.before)
  })

  it('does not advance while a decision is open', () => {
    const mission = getMission('lunar')!
    const config = craft(['bus-small', 'biprop-450', 'tank-500', 'acs', 'panel-600', 'battery-1500', 'transponder', 'antenna-hga', 'camera', 'mli', 'radiator-s'])
    let sim = runUntilBoundary(createSim(config, mission, defaultPlan(mission)), config, mission, defaultPlan(mission))
    const frozen = stepSim(sim, config, mission, defaultPlan(mission))
    expect(frozen.tSec).toBe(sim.tSec)
    expect(frozen.status).toBe('awaiting')
  })

  it('flies the corrected lunar case through to a debrief', () => {
    const mission = getMission('lunar')!
    const plan = defaultPlan(mission)
    const config = craft(['bus-small', 'biprop-450', 'tank-500', 'acs', 'panel-600', 'battery-1500', 'transponder', 'antenna-hga', 'camera', 'mli', 'radiator-s'])
    let sim = createSim(config, mission, plan)
    let guard = 0
    while (sim.status !== 'complete' && sim.status !== 'failed' && guard < 20) {
      sim = runUntilBoundary(sim, config, mission, plan)
      if (sim.decision) sim = applyDecision(sim, sim.decision.options[0].id, config, mission)
      guard += 1
    }
    expect(sim.status).toBe('complete')
    expect(sim.failed).toBe(false)
    expect(sim.dvUsedMps).toBeGreaterThan(1000)
    expect(sim.sciencePoints).toBeGreaterThan(mission.successScience)
    expect(sim.dataReturnedBits).toBeGreaterThan(mission.successDataBits)
  })

  it('keeps a seeded generator on a stable stream', () => {
    const first = nextRandom(99)
    const second = nextRandom(first.state)
    const again = nextRandom(99)
    expect(again).toEqual(first)
    expect(second.value).not.toBe(first.value)
  })
})
