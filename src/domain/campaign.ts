import type { MissionDef, MissionPlan } from './types'

export interface CampaignObjective {
  id: string
  title: string
  question: string
}

export interface LandingSite {
  id: string
  missionId: string
  name: string
  /** 0 is a flat plain. 1 is a canyon wall. */
  difficulty: number
  science: number
  lat?: number
  lon?: number
  elevM?: number
  slopeDeg?: number
  note: string
}

export const OBJECTIVES: CampaignObjective[] = [
  { id: 'water', title: 'Ancient water', question: 'Did liquid water persist here long enough to matter?' },
  { id: 'atmosphere', title: 'Atmosphere', question: 'How thin, cold, and dusty is the air, and how fast does it change?' },
  { id: 'geology', title: 'Geology', question: 'What are the rocks made of, and which process stacked them?' },
  { id: 'habitation', title: 'Habitation', question: 'Is there ice, shelter, and a place a crew could actually work?' },
]

export const SITES: LandingSite[] = [
  { id: 'jezero', missionId: 'mars', name: 'Jezero crater', difficulty: 0.72, science: 1.35, lat: 18.38, lon: 77.58, elevM: -2560, slopeDeg: 4, note: 'Perseverance landed in this river delta. Strong for ancient water.' },
  { id: 'gale', missionId: 'mars', name: 'Gale crater', difficulty: 0.55, science: 1.2, lat: -5.4, lon: 137.8, elevM: -4500, slopeDeg: 6, note: 'Curiosity climbed the layered mountain here. Strong for geology.' },
  { id: 'meridiani', missionId: 'mars', name: 'Meridiani Planum', difficulty: 0.22, science: 0.9, lat: -1.9, lon: -5.5, elevM: -1400, slopeDeg: 1, note: 'Opportunity’s flat plains. Safer entry, quieter science.' },
  { id: 'utopia', missionId: 'mars', name: 'Utopia Planitia', difficulty: 0.35, science: 1.05, lat: 46.7, lon: 117.5, elevM: -4000, slopeDeg: 2, note: 'Northern plains with buried ice. The habitation case.' },
  { id: 'valles', missionId: 'mars', name: 'Valles Marineris rim', difficulty: 0.9, science: 1.5, lat: -14, lon: -59.2, elevM: 2000, slopeDeg: 18, note: 'Canyon walls. Highest payoff and the smallest margin.' },
  { id: 'mare', missionId: 'lunar', name: 'Mare Imbrium', difficulty: 0.2, science: 0.85, note: 'A wide lava plain. The short mission’s safe floor.' },
  { id: 'pole', missionId: 'lunar', name: 'South pole', difficulty: 0.7, science: 1.3, note: 'Permanent shadow and ice. Hard lighting, real crew interest.' },
  { id: 'farside', missionId: 'lunar', name: 'Farside highlands', difficulty: 0.48, science: 1.1, note: 'No direct Earth link during surface work. Relay or lose the data.' },
  { id: 'chaos', missionId: 'europa', name: 'Conamara Chaos', difficulty: 0.8, science: 1.4, note: 'Broken ice. The interesting terrain is also the terrain that tips a lander.' },
  { id: 'europa-plain', missionId: 'europa', name: 'Ridged plains', difficulty: 0.4, science: 1, note: 'A calmer ice sheet for a first look at the surface.' },
  { id: 'equator', missionId: 'asteroid', name: 'Equatorial ridge', difficulty: 0.3, science: 0.95, note: 'A slow approach over coarse regolith.' },
  { id: 'boulders', missionId: 'asteroid', name: 'Boulder field', difficulty: 0.75, science: 1.25, note: 'Fresh fragments. More composition, less room to settle.' },
]

export function sitesFor(missionId: string): LandingSite[] {
  const rows = SITES.filter((site) => site.missionId === missionId)
  return rows.length > 0 ? rows : SITES.filter((site) => site.missionId === 'lunar')
}

export function siteOf(mission: MissionDef, plan: MissionPlan): LandingSite {
  const rows = sitesFor(mission.id === 'custom' ? 'mars' : mission.id)
  return rows.find((site) => site.id === plan.siteId) ?? rows[0]
}

export function objectiveOf(plan: MissionPlan): CampaignObjective {
  return OBJECTIVES.find((item) => item.id === plan.objectiveId) ?? OBJECTIVES[0]
}

const PREFERRED_SITE: Record<string, Record<string, string>> = {
  mars: { water: 'jezero', atmosphere: 'meridiani', geology: 'gale', habitation: 'utopia' },
  lunar: { water: 'pole', atmosphere: 'mare', geology: 'farside', habitation: 'pole' },
  europa: { water: 'chaos', atmosphere: 'europa-plain', geology: 'chaos', habitation: 'europa-plain' },
  asteroid: { water: 'equator', atmosphere: 'equator', geology: 'boulders', habitation: 'equator' },
}

/** The site that matches the question. The player can still move the site slider afterward. */
export function suggestedSite(missionId: string, objectiveId: string | undefined): LandingSite {
  const mission = missionId === 'custom' ? 'mars' : missionId
  const rows = sitesFor(mission)
  const id = PREFERRED_SITE[mission]?.[objectiveId ?? 'water']
  return rows.find((site) => site.id === id) ?? rows[0]
}

/** Share of the objective kit that is actually installed. 1 means every named instrument is aboard. */
export function kitCoverage(objectiveId: string | undefined, installed: Iterable<string>): number {
  const kit = objectiveKit(objectiveId)
  if (kit.length === 0) return 1
  const have = new Set(installed)
  return kit.filter((id) => have.has(id)).length / kit.length
}

/** Instruments that make a surface objective worth the mass. Missing ones warn. They do not ground the flight. */
export function objectiveKit(objectiveId: string | undefined): string[] {
  if (objectiveId === 'atmosphere') return ['weather', 'spectrometer']
  if (objectiveId === 'geology') return ['rock', 'drill', 'arm']
  if (objectiveId === 'habitation') return ['radiation', 'soil', 'radar']
  return ['spectrometer', 'drill', 'radar']
}

/** Extra departure delta-v for leaving the best date. Shape is a porkchop bowl, not an ephemeris. */
export function windowExtraDv(mission: MissionDef, plan: MissionPlan): number {
  const day = plan.launchDay ?? 0
  const span = mission.destinationAu > 1.2 ? 220 : 45
  const peak = mission.id === 'mars' ? 1600 : mission.id === 'europa' ? 900 : mission.id === 'asteroid' ? 700 : 180
  const x = day / span
  return peak * x * x
}

export function landingChance(massKg: number, limitKg: number, site: LandingSite, timing: number): number {
  const load = limitKg > 0 ? massKg / limitKg : 1
  const late = Math.abs(timing - 0.62)
  const chance = 0.94 - site.difficulty * 0.42 - Math.max(0, load - 0.7) * 0.85 - late * 1.35
  return Math.min(0.97, Math.max(0.06, chance))
}

export interface FieldSample {
  id: string
  name: string
  x: number
  z: number
  points: number
}

const SAMPLE_NAMES: Record<string, string[]> = {
  water: ['Delta mudstone', 'Carbonate vein', 'Lakebed silt'],
  atmosphere: ['Dust column', 'Pressure log', 'Wind streak'],
  geology: ['Layer contact', 'Vein fill', 'Impact breccia'],
  habitation: ['Ice table', 'Radiation shade', 'Soil oxidant'],
}

const JEZERO_SAMPLES = ['Máaz floor', 'Séítah outcrop', 'Delta carbonate']

export function fieldSamples(site: LandingSite, objectiveId: string): FieldSample[] {
  const names = site.id === 'jezero' ? JEZERO_SAMPLES : (SAMPLE_NAMES[objectiveId] ?? SAMPLE_NAMES.geology)
  return names.map((name, index) => {
    const angle = index * 2.2 + site.difficulty * 3
    const radius = 14 + index * 9
    return {
      id: `${site.id}-${index}`,
      name,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      points: Math.round(18 * site.science * (1.1 - index * 0.12)),
    }
  })
}
