import { describe, expect, it } from 'vitest'
import { rebase } from './frames'

describe('coordinate frames', () => {
  it('rebases a heliocentric point onto the ship', () => {
    const ship = { x: 1.5e11, y: 0, z: 2e10 }
    const earth = { x: 1.496e11, y: 4e6, z: 2e10 }
    const local = rebase(earth, ship)
    expect(local.x).toBeCloseTo(-4e8, -2)
    expect(local.y).toBeCloseTo(4e6, -2)
    expect(local.z).toBeCloseTo(0, -2)
    expect(Math.hypot(local.x, local.y, local.z)).toBeLessThan(1e10)
  })
})
