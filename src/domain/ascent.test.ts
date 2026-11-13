import { describe, expect, it } from 'vitest'
import { createAscent, stepAscent } from './ascent'

describe('shared booster ascent', () => {
  it('climbs off the pad, burns propellant, and reaches insertion', () => {
    let state = createAscent(800)
    let t = 0
    while (t < 700 && state.phase !== 'orbit' && !state.aborted) {
      state = stepAscent(state, { throttle: 1, pitch: 0, yaw: 0, abort: false }, 0.25, 800)
      t += 0.25
    }
    expect(state.aborted).toBe(false)
    expect(state.altitudeM).toBeGreaterThan(140_000)
    expect(state.velocityMps).toBeGreaterThan(7_600)
    expect(state.propellantKg).toBeLessThan(430_000)
    expect(state.phase).toBe('orbit')
    expect(Number.isFinite(state.downrangeM)).toBe(true)
    expect(state.fairingGone).toBe(true)
    expect(state.boosterGone).toBe(true)
  })

  it('stays on the pad until thrust beats weight', () => {
    let state = createAscent(800)
    state = stepAscent(state, { throttle: 0.2, pitch: 0, yaw: 0, abort: false }, 2, 800)
    expect(state.altitudeM).toBe(0)
    expect(state.phase === 'pad' || state.phase === 'ignition').toBe(true)
  })
})
