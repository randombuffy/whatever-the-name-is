import { describe, expect, it } from 'vitest'
import { fieldSamples, SITES } from './campaign'

describe('fieldSamples', () => {
  it('plants five distinct markers around the landing site', () => {
    const site = SITES.find((row) => row.id === 'jezero')
    if (!site) throw new Error('missing Jezero')
    const samples = fieldSamples(site, 'water', [-3, -9])
    expect(samples).toHaveLength(5)
    expect(new Set(samples.map((sample) => sample.kind)).size).toBe(5)
    expect(new Set(samples.map((sample) => sample.name)).size).toBe(5)
    for (const sample of samples) {
      const range = Math.hypot(sample.x + 3, sample.z + 9)
      expect(range).toBeGreaterThan(6)
      expect(range).toBeLessThan(22)
    }
  })
})
