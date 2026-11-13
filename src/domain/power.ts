import type { ComponentSpec, InstalledPart, PowerBudget, SpacecraftConfig } from './types'

export interface PowerSample {
  generationW: number
  loadW: number
  netW: number
  batteryJ: number
  depleted: boolean
}

/**
 * Solar output scales with the inverse square of heliocentric distance.
 * Constant sources (illustrative radioisotope and fission modules) do not.
 * Illumination is 1 in full sun and 0 in eclipse. The panel mesh is not an input.
 */
export function solarPowerW(ratedAt1AuW: number, distanceAu: number, illumination: number): number {
  if (!Number.isFinite(ratedAt1AuW) || ratedAt1AuW <= 0) return 0
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) return 0
  const sun = Number.isFinite(illumination) ? Math.min(1, Math.max(0, illumination)) : 0
  return ratedAt1AuW * sun / (distanceAu * distanceAu)
}

export function powerBudget(
  config: SpacecraftConfig,
  lookup: (id: string) => ComponentSpec | undefined,
  distanceAu: number,
  eclipseFraction: number,
  eclipseHours: number,
): PowerBudget {
  let solar = 0
  let constant = 0
  let load = 0
  let batteryWh = 0
  for (const part of config.parts) {
    if (!part.enabled) continue
    const spec = lookup(part.specId)
    if (!spec) continue
    load += Math.max(0, spec.powerDrawW)
    batteryWh += Math.max(0, spec.energyWh)
    if (spec.powerGenW <= 0) continue
    if (spec.powerScale === 'constant') constant += spec.powerGenW
    else solar += spec.powerGenW
  }
  const eclipse = clamp01(eclipseFraction)
  const genSun = solarPowerW(solar, distanceAu, 1) + constant
  const genEclipse = constant
  const genAverage = genSun * (1 - eclipse) + genEclipse * eclipse
  const eclipseLoadWh = (Math.max(0, load - genEclipse) * Math.max(0, eclipseHours))
  return {
    generationAt1AuW: solar,
    constantGenerationW: constant,
    loadW: load,
    eclipseLoadWh,
    batteryWh,
    eclipseFraction: eclipse,
    netCruiseW: genAverage - load,
    coversEclipse: batteryWh + 1e-6 >= eclipseLoadWh,
  }
}

/**
 * Advances stored energy by a fixed step. Generation and load are watts, dt is seconds.
 * Battery is clamped to [0, capacity]. A depleted battery with a negative balance is reported.
 */
export function stepBattery(batteryJ: number, capacityJ: number, generationW: number, loadW: number, dtSec: number): PowerSample {
  const gen = finiteNonNeg(generationW)
  const load = finiteNonNeg(loadW)
  const dt = Number.isFinite(dtSec) && dtSec > 0 ? dtSec : 0
  const cap = finiteNonNeg(capacityJ)
  let next = finiteNonNeg(batteryJ) + (gen - load) * dt
  if (next > cap) next = cap
  const depleted = next <= 0 && load > gen
  if (next < 0) next = 0
  return { generationW: gen, loadW: load, netW: gen - load, batteryJ: next, depleted }
}

function finiteNonNeg(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function enabledDraw(parts: InstalledPart[], lookup: (id: string) => ComponentSpec | undefined, include: (spec: ComponentSpec) => boolean): number {
  let load = 0
  for (const part of parts) {
    if (!part.enabled) continue
    const spec = lookup(part.specId)
    if (!spec || !include(spec)) continue
    load += Math.max(0, spec.powerDrawW)
  }
  return load
}
