import { describe, expect, it } from 'vitest'
import { shuttleCoefficients, stackAxialCd, wingAreaM2 } from './shuttleAero'

describe('shuttle aerodynamic table', () => {
  it('reads the zero-lift corner of the NASA table', () => {
    const row = shuttleCoefficients(0.25, 0)
    expect(row.cl).toBeCloseTo(-0.05, 4)
    expect(row.cd).toBeCloseTo(0.0684, 4)
  })

  it('raises stack drag through the transonic range and keeps a wing smaller than the orbiter', () => {
    expect(stackAxialCd(1)).toBeGreaterThan(stackAxialCd(0.2))
    expect(wingAreaM2(800)).toBeLessThan(wingAreaM2(78_000))
    expect(wingAreaM2(78_000)).toBeLessThanOrEqual(249.9)
  })
})
