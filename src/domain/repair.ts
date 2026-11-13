import { CATALOG, getSpec } from './catalog'
import type { InstalledPart, MissionDef, MissionPlan, SpacecraftConfig } from './types'
import { evaluate } from './validate'

const ANTENNAS = ['antenna-lga', 'antenna-mga', 'antenna-hga', 'antenna-hga-l']
const SOLAR = ['panel-150', 'panel-600', 'panel-2000', 'panel-8000']
const BATTERIES = ['battery-200', 'battery-1500', 'battery-6000']
const CHEMICAL = ['tank-40', 'tank-160', 'tank-500', 'tank-1500']
const XENON = ['tank-xe-30', 'tank-xe-120']
const BUSES = ['bus-12u', 'bus-small', 'bus-probe', 'bus-deep']
const RADIATORS = ['radiator-s', 'radiator-l']

function clone(craft: SpacecraftConfig): SpacecraftConfig {
  return {
    name: craft.name,
    hullSeed: craft.hullSeed,
    parts: craft.parts.map((part) => ({ ...part, offset: part.offset ? { ...part.offset } : undefined })),
  }
}

function signature(craft: SpacecraftConfig): string {
  return craft.parts.map((part) => `${part.specId}:${part.fill.toFixed(2)}:${part.enabled}`).join('|')
}

function withPart(craft: SpacecraftConfig, specId: string, fill = 1, unique = true): SpacecraftConfig {
  const spec = getSpec(specId)
  if (!spec) return craft
  if (unique && craft.parts.some((part) => part.specId === specId)) return craft
  const part: InstalledPart = {
    instanceId: `fix-${specId}-${craft.parts.length}`,
    specId,
    fill,
    enabled: true,
    mount: spec.mount,
  }
  return { ...craft, parts: [...craft.parts, part] }
}

function step(craft: SpacecraftConfig, family: string[], direction: 1 | -1): SpacecraftConfig {
  const index = craft.parts.findIndex((part) => family.includes(part.specId))
  if (index < 0) return direction > 0 ? withPart(craft, family[0]) : craft
  const current = family.indexOf(craft.parts[index].specId)
  const next = family[current + direction]
  if (!next) return craft
  const spec = getSpec(next)
  if (!spec) return craft
  const parts = craft.parts.map((part, i) => (i === index ? { ...part, specId: next, mount: spec.mount } : part))
  return { ...craft, parts }
}

function setFill(craft: SpacecraftConfig, propellant: 'chemical' | 'electric' | 'cold-gas', fill: number): SpacecraftConfig {
  let touched = false
  const parts = craft.parts.map((part) => {
    const spec = getSpec(part.specId)
    if (!spec || spec.tankCapacityKg <= 0 || spec.propellant !== propellant) return part
    touched = true
    return { ...part, fill }
  })
  return touched ? { ...craft, parts } : craft
}

function dropDearestOptional(craft: SpacecraftConfig, mission: MissionDef): SpacecraftConfig {
  const required = new Set(mission.requiredInstruments)
  let worst: InstalledPart | null = null
  let cost = -1
  for (const part of craft.parts) {
    const spec = getSpec(part.specId)
    if (!spec) continue
    if (spec.id.startsWith('bus') || spec.id === 'transponder' || spec.id === 'acs') continue
    if (spec.instrument && required.has(spec.instrument)) continue
    if (spec.costUsd > cost) {
      cost = spec.costUsd
      worst = part
    }
  }
  if (!worst) return craft
  return { ...craft, parts: craft.parts.filter((part) => part.instanceId !== worst.instanceId) }
}

function patch(craft: SpacecraftConfig, id: string, mission: MissionDef): SpacecraftConfig {
  if (id === 'no-bus') return withPart(craft, mission.maxMassKg > 1600 ? 'bus-probe' : 'bus-small')
  if (id.startsWith('inst-')) {
    const name = id.slice('inst-'.length)
    const spec = CATALOG.find((item) => item.instrument === name)
    return spec ? withPart(craft, spec.id) : craft
  }
  if (id === 'recorder') return withPart(craft, 'transponder')
  if (id === 'antenna') return withPart(craft, mission.destinationAu > 3 ? 'antenna-hga' : 'antenna-mga')
  if (id === 'link' || id === 'link-thin') return step(craft, ANTENNAS, 1)
  if (id === 'power' || id === 'power-tight') {
    if (mission.destinationAu > 4) return withPart(craft, mission.budgetUsd > 100_000_000 ? 'fission' : 'rtg')
    return step(craft, SOLAR, 1)
  }
  if (id === 'eclipse') return step(craft, BATTERIES, 1)
  if (id === 'thermal') return step(craft, RADIATORS, 1)
  if (id === 'mass' || id === 'mass-margin') {
    const lighter = step(craft, CHEMICAL, -1)
    if (signature(lighter) !== signature(craft)) return lighter
    const eased = setFill(craft, 'chemical', 0.65)
    if (signature(eased) !== signature(craft)) return eased
    const bus = step(craft, BUSES, -1)
    if (signature(bus) !== signature(craft)) return bus
    return dropDearestOptional(craft, mission)
  }
  if (id === 'budget') {
    const cheaper = step(craft, BUSES, -1)
    if (signature(cheaper) !== signature(craft)) return cheaper
    return dropDearestOptional(craft, mission)
  }
  if (id === 'dv' || id.startsWith('burn-')) {
    const electric = mission.id === 'europa' || craft.parts.some((part) => getSpec(part.specId)?.propellant === 'electric' && getSpec(part.specId)?.feedsMainEngine)
    if (!craft.parts.some((part) => getSpec(part.specId)?.feedsMainEngine)) {
      return withPart(craft, electric ? 'ion' : 'biprop-450')
    }
    const family = electric ? XENON : CHEMICAL
    const bigger = step(craft, family, 1)
    if (signature(bigger) !== signature(craft)) return setFill(bigger, electric ? 'electric' : 'chemical', 1)
    return setFill(craft, electric ? 'electric' : 'chemical', 1)
  }
  return craft
}

const SOLVED: Record<string, { ids: string[]; tankFill?: number }> = {
  lunar: { ids: ['bus-small', 'biprop-450', 'tank-500', 'acs', 'panel-600', 'battery-1500', 'transponder', 'antenna-hga', 'camera', 'mli', 'radiator-s'] },
  mars: { ids: ['bus-small', 'biprop-450', 'tank-1500', 'acs', 'panel-2000', 'battery-1500', 'transponder', 'antenna-hga', 'camera', 'spectrometer', 'heaters', 'radiator-s'], tankFill: 0.88 },
  europa: { ids: ['bus-12u', 'hall', 'tank-xe-120', 'tank-xe-120', 'tank-xe-120', 'fission', 'battery-200', 'transponder', 'antenna-hga-l', 'camera', 'spectrometer', 'magnetometer', 'particle', 'radiator-l', 'radiator-l'] },
  asteroid: { ids: ['bus-12u', 'biprop-450', 'tank-500', 'acs', 'panel-600', 'battery-200', 'transponder', 'antenna-hga', 'camera', 'spectrometer', 'heaters', 'radiator-s'] },
}

function fromIds(name: string, ids: string[], tankFill = 1, hullSeed?: number): SpacecraftConfig {
  return {
    name,
    hullSeed,
    parts: ids.map((specId, index) => {
      const spec = getSpec(specId)
      return {
        instanceId: `fix-${specId}-${index}`,
        specId,
        fill: specId.startsWith('tank') ? tankFill : 1,
        enabled: true,
        mount: spec?.mount ?? 'bus',
      }
    }),
  }
}

function walk(craft: SpacecraftConfig, mission: MissionDef, plan: MissionPlan): SpacecraftConfig {
  let next = clone(craft)
  for (let stepIndex = 0; stepIndex < 32; stepIndex += 1) {
    const hard = evaluate(next, mission, plan).issues.filter((issue) => issue.severity === 'hard')
    if (hard.length === 0) return next
    let advanced = false
    for (const issue of hard) {
      const trial = patch(next, issue.id, mission)
      if (signature(trial) === signature(next)) continue
      next = trial
      advanced = true
      break
    }
    if (!advanced) {
      const shed = dropDearestOptional(next, mission)
      if (signature(shed) === signature(next)) break
      next = shed
    }
  }
  return next
}

/** Walk the hard issues and apply one compatible catalog change at a time. The hull seed stays. */
export function repairCraft(craft: SpacecraftConfig, mission: MissionDef, plan: MissionPlan): SpacecraftConfig {
  const keep = (next: SpacecraftConfig): SpacecraftConfig => ({ ...next, hullSeed: craft.hullSeed, name: craft.name })
  const walked = walk(craft, mission, plan)
  if (evaluate(walked, mission, plan).issues.every((issue) => issue.severity !== 'hard')) return keep(walked)
  const solved = SOLVED[mission.id] ?? SOLVED.lunar
  const kit = keep(fromIds(craft.name, solved.ids, solved.tankFill ?? 1, craft.hullSeed))
  if (evaluate(kit, mission, plan).issues.every((issue) => issue.severity !== 'hard')) return kit
  return keep(walk(kit, mission, plan))
}
