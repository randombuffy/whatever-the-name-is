import type { ComponentSpec, ReliabilityBudget, SpacecraftConfig } from './types'

/**
 * Constant hazard, series reliability.
 * R = exp(-Σ λ t), with λ in failures per year and t in years.
 * Duplicate parts are both counted. The model gives no redundancy credit.
 * Random draws during flight use this same hazard and a seeded generator.
 */
export function seriesReliability(
  config: SpacecraftConfig,
  lookup: (id: string) => ComponentSpec | undefined,
  years: number,
): ReliabilityBudget {
  const t = Number.isFinite(years) && years > 0 ? years : 0
  let sum = 0
  let weakest: { id: string; hazard: number } | null = null
  for (const part of config.parts) {
    if (!part.enabled) continue
    const spec = lookup(part.specId)
    if (!spec) continue
    const hazard = Number.isFinite(spec.hazardPerYear) ? Math.max(0, spec.hazardPerYear) : 0
    sum += hazard
    if (!weakest || hazard > weakest.hazard) weakest = { id: spec.id, hazard }
  }
  return {
    seriesReliability: Math.exp(-sum * t),
    years: t,
    weakestId: weakest?.id ?? null,
  }
}

/** Mulberry32. State is a uint32 so a flight can be resumed without replaying. */
export function nextRandom(state: number): { state: number; value: number } {
  let a = state >>> 0
  a = (a + 0x6d2b79f5) >>> 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { state: a, value }
}

export function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
