import type { ComponentSpec, InstalledPart, MassBudget, SpacecraftConfig, Subsystem } from './types'

export const SUBSYSTEMS: Subsystem[] = [
  'structure',
  'propulsion',
  'fuel',
  'power',
  'communications',
  'science',
  'thermal',
  'avionics',
]

export function emptySubsystems(): Record<Subsystem, number> {
  return {
    structure: 0,
    propulsion: 0,
    fuel: 0,
    power: 0,
    communications: 0,
    science: 0,
    thermal: 0,
    avionics: 0,
  }
}

export function partPropellantKg(spec: ComponentSpec, part: InstalledPart): number {
  const tank = spec.tankCapacityKg > 0 ? spec.tankCapacityKg * clamp01(part.fill) : 0
  return tank + Math.max(0, spec.onboardPropellantKg)
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function massBudget(
  config: SpacecraftConfig,
  lookup: (id: string) => ComponentSpec | undefined,
  limitKg: number,
): MassBudget {
  const bySubsystem = emptySubsystems()
  let dry = 0
  let propellant = 0
  let payload = 0
  for (const part of config.parts) {
    const spec = lookup(part.specId)
    if (!spec || !part.enabled) continue
    dry += finite(spec.massKg)
    const prop = partPropellantKg(spec, part)
    propellant += prop
    bySubsystem[spec.subsystem] += finite(spec.massKg) + prop
    if (spec.subsystem === 'science') payload += finite(spec.massKg)
  }
  const total = dry + propellant
  return {
    dryKg: dry,
    propellantKg: propellant,
    payloadKg: payload,
    totalKg: total,
    limitKg,
    marginKg: limitKg - total,
    bySubsystem,
  }
}

function finite(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}
