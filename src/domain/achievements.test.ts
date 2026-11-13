import { describe, expect, it } from 'vitest'
import { badgesOf } from './achievements'

describe('mission badges', () => {
  it('awards a soft Mars landing and withholds badges that were not earned', () => {
    const earned = badgesOf({
      launched: true,
      flew: true,
      failed: false,
      landing: 'soft',
      heat: 0.4,
      science: 12,
      dataBits: 10,
      dataGoal: 100,
      underBudget: true,
      success: false,
      mars: true,
    }).map((badge) => badge.id)
    expect(earned).toContain('launch')
    expect(earned).toContain('landing')
    expect(earned).toContain('mars')
    expect(earned).not.toContain('data')
    expect(earned).not.toContain('specialist')
  })

  it('does not award a landing to a flight that never reached the surface', () => {
    const earned = badgesOf({
      launched: true,
      flew: false,
      failed: true,
      landing: 'none',
      heat: 0,
      science: 0,
      dataBits: 0,
      dataGoal: 1,
      underBudget: false,
      success: false,
      mars: true,
    }).map((badge) => badge.id)
    expect(earned).toEqual(['launch'])
  })
})
