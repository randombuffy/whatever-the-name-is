import { SIGMA, SOLAR_CONSTANT, SPACE_TEMP_K } from './constants'
import type { ComponentSpec, SpacecraftConfig, ThermalBudget } from './types'

/**
 * Single-node isothermal balance.
 * Qin = internal heat + absorptivity · S · A · illumination / r^2
 * Qout = emissivity · σ · (Arad + Abody) · (T^4 - Tspace^4)
 * Solved for T. No transients, no planetary infrared, no view-factor detail.
 * Insulation components reduce absorptivity. Radiator components add area.
 */
export function equilibriumTemperatureK(heatW: number, solarW: number, emissivity: number, areaM2: number): number | null {
  const q = finiteNonNeg(heatW) + finiteNonNeg(solarW)
  const eps = Number.isFinite(emissivity) ? emissivity : 0
  const area = Number.isFinite(areaM2) ? areaM2 : 0
  if (eps <= 0 || area <= 0) return null
  const sink = SPACE_TEMP_K ** 4
  const t4 = q / (eps * SIGMA * area) + sink
  if (t4 <= 0) return null
  return t4 ** 0.25
}

export function thermalBudget(
  config: SpacecraftConfig,
  lookup: (id: string) => ComponentSpec | undefined,
  distanceAu: number,
  illumination: number,
  baseAbsorptivity: number,
  emissivity: number,
  bodyAreaM2: number,
): ThermalBudget {
  let heat = 0
  let radiator = 0
  let absorbDrop = 0
  let minK = 0
  let maxK = 1000
  let any = false
  for (const part of config.parts) {
    if (!part.enabled) continue
    const spec = lookup(part.specId)
    if (!spec) continue
    heat += Math.max(0, spec.heatW + spec.powerDrawW * 0.35)
    if (spec.powerScale === 'constant') heat += spec.powerGenW * 0.7
    radiator += Math.max(0, spec.radiatorM2)
    absorbDrop += Math.max(0, spec.absorptivityDrop)
    if (spec.subsystem === 'structure' || spec.subsystem === 'avionics' || spec.subsystem === 'science') {
      if (!any) {
        minK = spec.tempMinK
        maxK = spec.tempMaxK
        any = true
      } else {
        minK = Math.max(minK, spec.tempMinK)
        maxK = Math.min(maxK, spec.tempMaxK)
      }
    }
  }
  const au = distanceAu > 0 ? distanceAu : 1
  const sun = Math.min(1, Math.max(0, illumination))
  const alpha = Math.max(0.05, baseAbsorptivity - absorbDrop)
  const solar = alpha * SOLAR_CONSTANT * Math.max(0, bodyAreaM2) * sun / (au * au)
  const area = Math.max(0.2, bodyAreaM2) + radiator
  const temperature = equilibriumTemperatureK(heat, solar, emissivity, area)
  const t = temperature ?? Number.NaN
  const within = Number.isFinite(t) && t >= minK && t <= maxK
  return {
    heatW: heat,
    solarW: solar,
    radiatorM2: radiator,
    temperatureK: t,
    minLimitK: any ? minK : 253,
    maxLimitK: any ? maxK : 323,
    withinLimits: within,
    note: 'Single-node balance. Internal electrical load is treated as 35% waste heat. Constant power sources add 70% of their output as heat. Deep space sink is 3 K. Planetary infrared and albedo are omitted.',
  }
}

function finiteNonNeg(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}
