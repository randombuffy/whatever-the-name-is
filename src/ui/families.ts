import type { Subsystem } from '../domain/types'

export interface PartFamily {
  id: string
  name: string
  subsystem: Subsystem
  ids: string[]
}

/** One control per family. The slider picks an existing catalog spec, so cost, mass, thrust, power and link stay real. */
export const FAMILIES: PartFamily[] = [
  { id: 'bus', name: 'Bus', subsystem: 'structure', ids: ['bus-12u', 'bus-small', 'bus-probe', 'bus-deep'] },
  { id: 'engine', name: 'Engine', subsystem: 'propulsion', ids: ['cold-gas', 'monoprop', 'biprop-450', 'biprop-4k', 'ion', 'hall'] },
  { id: 'tank', name: 'Tank', subsystem: 'fuel', ids: ['tank-40', 'tank-160', 'tank-500', 'tank-1500'] },
  { id: 'xenon', name: 'Xenon', subsystem: 'fuel', ids: ['tank-xe-30', 'tank-xe-120'] },
  { id: 'solar', name: 'Solar array', subsystem: 'power', ids: ['panel-150', 'panel-600', 'panel-2000', 'panel-8000'] },
  { id: 'battery', name: 'Battery', subsystem: 'power', ids: ['battery-200', 'battery-1500', 'battery-6000'] },
  { id: 'source', name: 'Constant power', subsystem: 'power', ids: ['rtg', 'fission'] },
  { id: 'antenna', name: 'Antenna', subsystem: 'communications', ids: ['antenna-lga', 'antenna-mga', 'antenna-hga', 'antenna-hga-l'] },
  { id: 'radiator', name: 'Radiator', subsystem: 'thermal', ids: ['radiator-s', 'radiator-l'] },
]

export const SINGLE_IDS = [
  'frame',
  'acs',
  'transponder',
  'camera',
  'spectrometer',
  'magnetometer',
  'radar',
  'particle',
  'payload',
  'mli',
  'heaters',
  'heatshield',
  'chute',
  'descent',
  'legs',
  'rover-light',
  'rover-heavy',
  'heli',
  'drill',
  'weather',
  'soil',
  'rock',
  'radiation',
  'arm',
  'cache',
]

export interface CatalogSection {
  label: string
  familyIds: string[]
  singleIds: string[]
}

/** The hangar list, in the order a vehicle is actually argued about. */
export const SECTIONS: CatalogSection[] = [
  { label: 'Structure', familyIds: ['bus'], singleIds: ['frame'] },
  { label: 'Propulsion', familyIds: ['engine'], singleIds: ['acs'] },
  { label: 'Fuel', familyIds: ['tank', 'xenon'], singleIds: [] },
  { label: 'Power', familyIds: ['solar', 'battery', 'source'], singleIds: [] },
  { label: 'Thermal', familyIds: ['radiator'], singleIds: ['mli', 'heaters', 'heatshield'] },
  { label: 'Communications', familyIds: ['antenna'], singleIds: ['transponder'] },
  { label: 'Science', familyIds: [], singleIds: ['camera', 'spectrometer', 'magnetometer', 'radar', 'particle', 'payload', 'drill', 'weather', 'soil', 'rock', 'radiation'] },
  { label: 'Landing', familyIds: [], singleIds: ['chute', 'descent', 'legs'] },
  { label: 'Rover', familyIds: [], singleIds: ['rover-light', 'rover-heavy', 'heli'] },
  { label: 'Deployment', familyIds: [], singleIds: ['arm', 'cache'] },
]

export function familyOf(specId: string): PartFamily | undefined {
  return FAMILIES.find((family) => family.ids.includes(specId))
}
