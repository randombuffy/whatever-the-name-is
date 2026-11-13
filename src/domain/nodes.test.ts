import { describe, expect, it } from 'vitest'
import { MU_EARTH } from './constants'
import { burnSeconds, cruiseOrbit, stateVector } from './nodes'
import { orbitalPeriodSec } from './orbit'

describe('orbital elements and manoeuvre nodes', () => {
  const mu = MU_EARTH
  const radius = 6.371e6 + 300_000
  const circular = Math.sqrt(mu / radius)

  it('reads a circular orbit as zero eccentricity and a matching period', () => {
    const orbit = stateVector(mu, radius, circular, 0, 0)
    expect(orbit).not.toBeNull()
    expect(orbit!.bound).toBe(true)
    expect(orbit!.ecc).toBeLessThan(1e-6)
    expect(orbit!.apoM).toBeCloseTo(radius, -2)
    expect(orbit!.periM).toBeCloseTo(radius, -2)
    expect(orbit!.periodSec).toBeCloseTo(orbitalPeriodSec(mu, radius)!, -1)
    expect(orbit!.incRad).toBeCloseTo(0, 6)
  })

  it('raises apoapsis with a prograde burn and inclination with a normal burn', () => {
    const raised = stateVector(mu, radius, circular + 80, 0, 0)
    const plane = stateVector(mu, radius, circular, 0, 120)
    expect(raised!.apoM).toBeGreaterThan(radius + 50_000)
    expect(raised!.incRad).toBeCloseTo(0, 4)
    expect(plane!.incRad).toBeGreaterThan(0.01)
    expect(plane!.incRad).toBeLessThan(0.05)
  })

  it('gives a finite burn time from thrust, mass, and delta-v', () => {
    const seconds = burnSeconds(321, 450, 1200, 100)
    expect(seconds).not.toBeNull()
    expect(seconds!).toBeGreaterThan(10)
    expect(seconds!).toBeLessThan(2000)
  })

  it('predicts a higher Mars apoapsis when the departure node adds prograde', () => {
    const coast = cruiseOrbit('mars', 1.5237, 0.05, 86400, { prograde: 0, radial: 0, normal: 0 })
    const node = cruiseOrbit('mars', 1.5237, 0.05, 86400, { prograde: 250, radial: 0, normal: 40 })
    expect(coast).not.toBeNull()
    expect(node!.predicted.apoM).toBeGreaterThan(coast!.now.apoM)
    expect(node!.predicted.incRad).toBeGreaterThan(coast!.now.incRad)
  })
})
