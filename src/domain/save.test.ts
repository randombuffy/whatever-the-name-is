import { describe, expect, it } from 'vitest'
import { campaignPhase, descentSave, fieldSave, simAlive } from './save'

describe('campaign save', () => {
  it('keeps a flight and sends a station reload back to the pad', () => {
    expect(campaignPhase('flight', 'mars')).toBe('flight')
    expect(campaignPhase('surface', 'mars')).toBe('surface')
    expect(campaignPhase('station', 'mars')).toBe('pad')
    expect(campaignPhase('nope', null)).toBe('select')
  })

  it('accepts a sim with a script and rejects a screen-only blob', () => {
    expect(simAlive({ tSec: 10, index: 1, script: [], propellant: { chemical: 3 }, status: 'running' })).toBe(true)
    expect(simAlive({ phase: 'flight' })).toBe(false)
  })

  it('restores a rover position and drops a broken field', () => {
    const field = fieldSave({
      x: 4, z: 2, yaw: 0.2, speed: 0, footX: 1, footZ: 1, lookYaw: 0.2,
      sol: 3, energy: 40, oxygen: 80, boarded: true, parked: false, mode: 'drive',
      found: ['a'], notes: [],
    })
    expect(field?.x).toBe(4)
    expect(field?.sol).toBe(3)
    expect(fieldSave({ mode: 'fly' })).toBeNull()
  })

  it('restores an entry in progress', () => {
    const entry = descentSave({ altitude: 1400, sink: 8, lateral: 2, fuelKg: 20, heat: 0.3, done: null })
    expect(entry?.altitude).toBe(1400)
    expect(descentSave({ altitude: 'low' })).toBeNull()
  })
})
