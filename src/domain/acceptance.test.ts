import { describe, expect, it } from 'vitest'
import { badgesOf } from './achievements'
import { createAscent, stepAscent } from './ascent'
import { stepEntry } from './dynamics'
import { getMission, defaultPlan } from './missions'
import { outcomeOf } from './score'
import { campaignPhase, simAlive } from './save'
import { applyDecision, createSim, runUntilBoundary, stepSim } from './simulate'
import { stepDrive } from './surface'
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

const lunarIds = ['bus-small', 'biprop-450', 'tank-500', 'acs', 'panel-600', 'battery-1500', 'transponder', 'antenna-hga', 'camera', 'mli', 'radiator-s']

describe('campaign acceptance', () => {
  it('lifts a full-throttle ascent off the pad', () => {
    let state = createAscent(400)
    const loaded = state.propellantKg
    for (let i = 0; i < 8; i++) state = stepAscent(state, { throttle: 1, pitch: 0, yaw: 0, abort: false }, 0.5, 400)
    expect(state.altitudeM).toBeGreaterThan(0)
    expect(state.propellantKg).toBeLessThan(loaded)
  })

  it('spends the armed node and wastes a burn that is pointed sideways', () => {
    const mission = getMission('lunar')!
    const plan = defaultPlan(mission)
    const config = craft(lunarIds)
    const sim = createSim(config, mission, plan)
    const index = sim.script.findIndex((item) => item.type === 'burn')
    const burn = sim.script[index]
    expect(burn.type).toBe('burn')
    if (burn.type !== 'burn') return
    sim.index = index
    const plain = stepSim(sim, config, mission, plan)
    const armed = stepSim({ ...sim, node: { burnId: burn.id, prograde: burn.dv + 800, radial: 40, normal: 25 } }, config, mission, plan)
    const sideways = stepSim({ ...sim, pointingRad: Math.PI / 2 }, config, mission, plan)
    expect(armed.burnDvLeft ?? 0).toBeGreaterThan(plain.burnDvLeft ?? 0)
    expect(armed.log.some((line) => line.text.includes('node'))).toBe(true)
    expect(sideways.burnDvLeft ?? 0).toBeGreaterThan((plain.burnDvLeft ?? 0) + 1)
    expect(sideways.propellant.chemical).toBeLessThan(sim.propellant.chemical)
  })

  it('flies the lunar campaign, scores it, and reloads the sim', () => {
    const mission = getMission('lunar')!
    const plan = defaultPlan(mission)
    const config = craft(lunarIds)
    const run = (extra: number) => {
      let sim = createSim(config, mission, plan)
      const burn = sim.script.find((item) => item.type === 'burn')
      if (burn && burn.type === 'burn' && extra > 0) {
        sim = { ...sim, node: { burnId: burn.id, prograde: burn.dv + extra, radial: 0, normal: 0 } }
      }
      let guard = 0
      while (sim.status !== 'complete' && sim.status !== 'failed' && guard < 30) {
        sim = runUntilBoundary(sim, config, mission, plan)
        if (sim.decision) sim = applyDecision(sim, sim.decision.options[0].id, config, mission)
        guard += 1
      }
      return sim
    }
    const plain = run(0)
    const again = run(0)
    const nudged = run(40)
    expect(plain.status).toBe('complete')
    expect(plain.failed).toBe(false)
    expect(again.propellant).toEqual(plain.propellant)
    expect(again.tSec).toBe(plain.tSec)
    expect(nudged.status).toBe('complete')
    expect(nudged.dvUsedMps).toBeGreaterThan(plain.dvUsedMps)
    const outcome = outcomeOf(config, mission, plan, plain)
    expect(outcome.score).toBeGreaterThan(0)
    expect(outcome.success).toBe(true)
    const badges = badgesOf({
      launched: true,
      flew: true,
      failed: false,
      landing: 'none',
      heat: 0,
      science: 0,
      dataBits: plain.dataReturnedBits,
      dataGoal: mission.successDataBits,
      underBudget: true,
      success: outcome.success,
      mars: false,
    })
    expect(badges.map((badge) => badge.id)).toContain('launch')
    expect(badges.map((badge) => badge.id)).toContain('orbit')
    expect(badges.map((badge) => badge.id)).not.toContain('mars')
    expect(simAlive(structuredClone(plain))).toBe(true)
    expect(campaignPhase('flight', 'lunar')).toBe('flight')
    expect(campaignPhase('station', 'lunar')).toBe('pad')
  })

  it('slows an entry with a parachute and drives the rover', () => {
    const sink = (chute: boolean) => {
      let speed = 400
      let altitude = 8000
      for (let i = 0; i < 800 && altitude > 500; i++) {
        const step = stepEntry({
          massKg: 600,
          velocityDownMps: speed,
          altitudeM: altitude,
          gravity: 3.71,
          surfaceRho: 0.02,
          scaleHeightM: 11_100,
          bodyCdA: 4.5,
          chuteCdA: 1400,
          chuteOpen: chute,
          thrustN: 0,
          throttle: 0,
          shield: true,
        }, 0.05)
        speed = step.velocityDownMps
        altitude -= speed * 0.05
      }
      return speed
    }
    expect(sink(true)).toBeLessThan(sink(false))
    let rover = { x: 0, z: 0, yaw: 0, speed: 0 }
    for (let i = 0; i < 40; i++) {
      rover = stepDrive(rover, {
        throttle: 1,
        steer: 0,
        brake: false,
        park: false,
        boost: false,
        massKg: 200,
        gravity: 3.71,
        rough: 0.1,
        gradX: 0,
        gradZ: 0,
      }, 0.05)
    }
    expect(Math.hypot(rover.x, rover.z)).toBeGreaterThan(0.2)
  })
})
