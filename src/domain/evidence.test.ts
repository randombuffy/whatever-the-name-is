import { describe, expect, it } from 'vitest'
import { contactBytes, kindFor, observe, returnedScience, sendChosen } from './evidence'
import { fieldSol } from './fieldEvents'

describe('surface evidence', () => {
  it('pays a fitted drill more than a bare eye, and dust cuts both', () => {
    const base = {
      kind: 'core' as const,
      name: 'Delta mudstone',
      x: 1,
      z: 2,
      sol: 1,
      objectiveId: 'water',
      basePoints: 20,
      dust: 0,
      fault: false,
      near: true,
      fov: 60,
    }
    const clear = observe({ ...base, id: 'a', instruments: ['drill', 'camera'] })
    const eye = observe({ ...base, id: 'b', instruments: [] })
    const dusty = observe({ ...base, id: 'c', instruments: ['drill', 'camera'], dust: 0.7 })
    expect(clear.quality).toBeGreaterThan(0.7)
    expect(eye.quality).toBeLessThan(0.35)
    expect(dusty.quality).toBeLessThan(clear.quality)
    expect(clear.instrument).toBe('drill')
  })

  it('sends the chosen finding only when the contact and the battery allow it', () => {
    const note = observe({
      id: 'pic',
      kind: 'image',
      name: 'Context',
      x: 0,
      z: 0,
      sol: 1,
      objectiveId: 'geology',
      instruments: ['camera'],
      basePoints: 10,
      dust: 0,
      fault: false,
      near: false,
      fov: 70,
    })
    expect(contactBytes(0, true)).toBe(0)
    expect(contactBytes(1000, false)).toBe(0)
    const closed = sendChosen([note], 0, 0, 100)
    expect(closed.reason).toBe('window')
    expect(closed.notes[0].sent).toBe(false)
    const poor = sendChosen([note], 0, note.bytes, 1)
    expect(poor.reason).toBe('power')
    const sent = sendChosen([note], 0, note.bytes, 40)
    expect(sent.reason).toBe('sent')
    expect(sent.energy).toBeLessThan(40)
    expect(returnedScience(sent.notes)).toBeGreaterThan(0)
  })

  it('picks the objective instrument and repeats a sol exactly', () => {
    expect(kindFor('atmosphere', ['weather', 'spectrometer'])).toBe('weather')
    expect(kindFor('water', ['radar', 'drill'])).toBe('radar')
    const a = fieldSol(5, true, false, 0.7)
    const b = fieldSol(5, true, false, 0.7)
    expect(a).toEqual(b)
    expect(a.storm).toBe(true)
    expect(a.comms).toBe(true)
    expect(fieldSol(4, true, false, 0.2).comms).toBe(false)
    expect(fieldSol(1, true, false, 0.2).label).toBe('Clear')
    expect(fieldSol(6, true, false, 0.9).wheel).toBeGreaterThan(fieldSol(6, true, false, 0.1).wheel)
  })
})
