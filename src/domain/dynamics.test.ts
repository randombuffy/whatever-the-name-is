import { describe, expect, it } from 'vitest'
import { G0 } from './constants'
import { coastApsis, massFlowKgS, stepEntry } from './dynamics'

describe('flight equations', () => {
  it('keeps thrust equal to mass flow times exhaust speed', () => {
    const isp = 311
    const thrust = 8.4e6
    const mdot = massFlowKgS(thrust, isp)
    expect(mdot * isp * G0).toBeCloseTo(thrust, 3)
  })

  it('reads a circular orbit as apoapsis equal to periapsis', () => {
    const mu = 3.986004418e14
    const radius = 6.371e6 + 300_000
    const speed = Math.sqrt(mu / radius)
    const coast = coastApsis(mu, radius, speed, 0)
    expect(coast).not.toBeNull()
    expect(coast!.apoM).toBeCloseTo(radius, -2)
    expect(coast!.periM).toBeCloseTo(radius, -2)
    expect(coast!.periodSec).toBeGreaterThan(5000)
  })

  it('lets a Mars parachute settle well below a bare heat shield', () => {
    const bare = fall(false)
    const chute = fall(true)
    expect(chute).toBeLessThan(20)
    expect(chute).toBeLessThan(bare * 0.2)
  })
})

function fall(chute: boolean): number {
  let speed = 400
  let altitude = 8000
  for (let i = 0; i < 4000 && altitude > 500; i++) {
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
