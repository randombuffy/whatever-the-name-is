import type { MissionDef, MissionPlan, SpacecraftConfig } from '../domain/types'
import { evaluate } from '../domain/validate'
import { en } from './i18n/locales/en'
import { SITES, type FactRow, type LandingSite } from './mission/sites'

export type BodyId = 'mars' | 'moon' | 'europa'

export const voyageTune = {
  departed: true,
  useMarsMaps: true,
  airless: false,
  noChute: false,
  noShield: false,
  cargoBias: 0,
  landingPenalty: 0,
  ground: '#b06c4c',
  haze: [0.95, 0.8, 0.68] as [number, number, number],
  body: 'mars' as BodyId,
  title: 'Mars',
}

const text = en as Record<string, string>
const originalText: Record<string, string> = { ...text }

interface SiteSnap {
  name: string
  shortName: string
  lat: number
  lon: number
  coords: string
  hazard: 1 | 2 | 3
  iceAccess: number
  tint: [number, number, number]
  polygons: boolean
  layeredScarp: boolean
  rimRing: boolean
  relief: number
}

const snaps: SiteSnap[] = SITES.map((site) => ({
  name: site.name,
  shortName: site.shortName,
  lat: site.lat,
  lon: site.lon,
  coords: site.coords,
  hazard: site.hazard,
  iceAccess: site.iceAccess,
  tint: [...site.terrain.tint] as [number, number, number],
  polygons: site.terrain.polygons,
  layeredScarp: site.terrain.layeredScarp,
  rimRing: site.terrain.rimRing,
  relief: site.terrain.relief,
}))

function restore() {
  SITES.forEach((site, index) => {
    const snap = snaps[index]
    site.name = snap.name
    site.shortName = snap.shortName
    site.lat = snap.lat
    site.lon = snap.lon
    site.coords = snap.coords
    site.hazard = snap.hazard
    site.iceAccess = snap.iceAccess
    site.terrain.tint = [...snap.tint]
    site.terrain.polygons = snap.polygons
    site.terrain.layeredScarp = snap.layeredScarp
    site.terrain.rimRing = snap.rimRing
    site.terrain.relief = snap.relief
    site.solarFactor = Math.round(Math.cos((site.lat * Math.PI) / 180) * 100) / 100
    site.sunlightPercent = Math.round(site.solarFactor * 100)
    for (const row of Object.keys(site.facts) as FactRow[]) site.facts[row].tag = 'OBSERVED'
  })
  for (const key of Object.keys(originalText)) text[key] = originalText[key]
}

function place(site: LandingSite, next: {
  name: string
  short: string
  lat: number
  lon: number
  coords: string
  hazard: 1 | 2 | 3
  ice: number
  tint: [number, number, number]
  polygons?: boolean
  relief?: number
}) {
  site.name = next.name
  site.shortName = next.short
  site.lat = next.lat
  site.lon = next.lon
  site.coords = next.coords
  site.hazard = next.hazard
  site.iceAccess = next.ice
  site.terrain.tint = next.tint
  site.terrain.polygons = next.polygons ?? false
  site.terrain.relief = next.relief ?? site.terrain.relief
  site.solarFactor = Math.round(Math.cos((next.lat * Math.PI) / 180) * 100) / 100
  site.sunlightPercent = Math.round(Math.abs(site.solarFactor) * 100)
  for (const row of Object.keys(site.facts) as FactRow[]) site.facts[row].tag = 'GAMEPLAY'
}

function facts(id: string, rows: Record<string, string>) {
  for (const [key, value] of Object.entries(rows)) text[`site.${id}.${key}`] = value
}

const airlessCopy = {
  'landingCopy.DESCENT.why': 'There is no useful air here. The engines do all of the slowing.',
  'edl.ev.parachuteDeploy': 'Braking burn',
  'edl.ev.parachuteInflation': 'Throttle up',
  'edl.ev.heatshieldSep': 'Cruise stage away',
}

function applyAirless(title: string, subtitle: string) {
  voyageTune.airless = true
  voyageTune.useMarsMaps = false
  voyageTune.title = title
  text['brand.subtitle'] = subtitle
  text['approach.mission'] = `${title} approach`
  Object.assign(text, airlessCopy)
}

export function applyBody(body: BodyId) {
  restore()
  voyageTune.body = body
  voyageTune.departed = true
  voyageTune.useMarsMaps = body === 'mars'
  voyageTune.airless = body !== 'mars'
  if (body === 'mars') {
    voyageTune.ground = '#b06c4c'
    voyageTune.haze = [0.95, 0.8, 0.68]
    voyageTune.title = 'Mars'
    return
  }
  if (body === 'moon') {
    voyageTune.ground = '#c2bfb8'
    voyageTune.haze = [0.82, 0.84, 0.86]
    applyAirless('Moon', 'Lunar landing and outpost')
    place(SITES[0], { name: 'Mare Imbrium', short: 'Imbrium', lat: 32.8, lon: -15.6, coords: '32.8° N · 15.6° W', hazard: 2, ice: 0.15, tint: [0.94, 0.94, 0.92], relief: 0.7 })
    place(SITES[1], { name: 'South Pole', short: 'Pole', lat: -85, lon: 0, coords: '85° S', hazard: 3, ice: 1, tint: [0.78, 0.82, 0.86], polygons: true, relief: 1.05 })
    place(SITES[2], { name: 'Tycho', short: 'Tycho', lat: -43.3, lon: -11.2, coords: '43.3° S · 11.2° W', hazard: 2, ice: 0.2, tint: [0.97, 0.97, 0.95], relief: 0.85 })
    facts('jezero', {
      region: 'Lava plain',
      summary: 'A wide mare. Fewer cliffs than the highlands, and almost no ice.',
      gains: 'Open ground and decent sunlight.',
      risks: 'Dust and a long night. Water has to be carried.',
      hazardLevel: 'Moderate',
      'fact.hazards.short': 'Moderate',
      'fact.hazards.value': 'Wrinkle ridges, small craters',
      'fact.hazards.note': 'Gameplay stand-in for a mare landing. The real Imbrium basin is a lava plain.',
      'fact.elevation.short': 'Basin',
      'fact.elevation.value': 'Low mare basin',
      'fact.elevation.note': 'No atmosphere to help. Elevation does not slow the lander.',
      'fact.resources.short': 'Regolith',
      'fact.resources.value': 'Regolith; no confirmed ice',
      'fact.resources.inline': 'regolith and almost no ice',
      'fact.resources.note': 'Water for this site comes from the tanks you launched with.',
      'fact.energy.short': '{percent}%',
      'fact.energy.value': '{percent}% of equatorial sunlight',
      'fact.energy.note': 'A two-week night is not in this number. Treat it as the day-side average.',
      'fact.confidence.short': 'Mapped',
      'fact.confidence.value': '{level} · orbital maps',
      'fact.confidence.level': 'Medium',
      'fact.confidence.note': 'The basin is well mapped. This outpost is still a game layout.',
    })
    facts('utopia', {
      region: 'Polar craters',
      summary: 'The best chance of ice, and the hardest light.',
      gains: 'Cold traps can hold ice.',
      risks: 'Long shadows, steep rims, very little sun.',
      hazardLevel: 'High',
      'fact.hazards.short': 'High',
      'fact.hazards.value': 'Crater rims and permanent shadow',
      'fact.hazards.note': 'Gameplay stand-in for a polar landing. The rims are the hazard. The floor is the prize.',
      'fact.elevation.short': 'Rim',
      'fact.elevation.value': 'Crater rim and floor',
      'fact.elevation.note': 'No air. The engines have to kill all of the speed.',
      'fact.resources.short': 'Ice',
      'fact.resources.value': 'Cold-trap ice',
      'fact.resources.inline': 'ice in the cold traps',
      'fact.resources.note': 'Orbital instruments have seen hydrogen at the south pole. How deep and how clean it is stays a gameplay assumption.',
      'fact.energy.short': '{percent}%',
      'fact.energy.value': '{percent}% of equatorial sunlight',
      'fact.energy.note': 'The sun stays low. Panels need the clear rim, not the shadowed floor.',
      'fact.confidence.short': 'Orbital',
      'fact.confidence.value': '{level} · orbital hydrogen maps',
      'fact.confidence.level': 'Medium',
      'fact.confidence.note': 'No crew has worked this ground. The outpost rules are the game.',
    })
    facts('elysium', {
      region: 'Highland crater',
      summary: 'Bright ejecta and a rough rim. A harder landing than the mare.',
      gains: 'Fresh rock for the science bay.',
      risks: 'Boulders in the ejecta blanket.',
      hazardLevel: 'Moderate',
      'fact.hazards.short': 'Moderate',
      'fact.hazards.value': 'Ejecta and rim blocks',
      'fact.hazards.note': 'Tycho is a young, bright crater. This layout uses that as rocky highlands.',
      'fact.elevation.short': 'Highlands',
      'fact.elevation.value': 'Highland crater',
      'fact.elevation.note': 'No parachute. Legs and throttle are the whole landing system.',
      'fact.resources.short': 'Rock',
      'fact.resources.value': 'Dry highland rock',
      'fact.resources.inline': 'dry highland rock',
      'fact.resources.note': 'Bring the water. The ground will not provide it.',
      'fact.energy.short': '{percent}%',
      'fact.energy.value': '{percent}% of equatorial sunlight',
      'fact.energy.note': 'Mid-latitude. Better than the pole, worse than the equator.',
      'fact.confidence.short': 'Mapped',
      'fact.confidence.value': '{level} · orbital images',
      'fact.confidence.level': 'Medium',
      'fact.confidence.note': 'The crater is famous from orbit. The outpost is not a real site plan.',
    })
    return
  }
  voyageTune.ground = '#d5e6ea'
  voyageTune.haze = [0.75, 0.88, 0.92]
  applyAirless('Europa', 'Icy moon landing and outpost')
  place(SITES[0], { name: 'Conamara Chaos', short: 'Conamara', lat: 9, lon: -87, coords: '9° N · 87° W', hazard: 3, ice: 0.8, tint: [0.75, 0.9, 0.95], polygons: true, relief: 1.2 })
  place(SITES[1], { name: 'Pwyll', short: 'Pwyll', lat: -25, lon: -88, coords: '25° S · 88° W', hazard: 2, ice: 0.7, tint: [0.85, 0.95, 0.98], relief: 0.9 })
  place(SITES[2], { name: 'Agenor Linea', short: 'Agenor', lat: 14, lon: -36, coords: '14° N · 36° W', hazard: 2, ice: 0.55, tint: [0.7, 0.86, 0.9], polygons: true, relief: 0.8 })
  facts('jezero', {
    region: 'Broken ice',
    summary: 'Chaos terrain. Blocks of ice rafted apart. The richest science and the roughest landing.',
    gains: 'Young ice and a chance of ocean material.',
    risks: 'Ridges and tilted blocks.',
    hazardLevel: 'High',
    'fact.hazards.short': 'High',
    'fact.hazards.value': 'Rafted ice blocks',
    'fact.hazards.note': 'Gameplay stand-in for Conamara Chaos. The real terrain is shattered ice.',
    'fact.elevation.short': 'Blocks',
    'fact.elevation.value': 'Tilted ice rafts',
    'fact.elevation.note': 'Europa has essentially no air. Elevation does not help the landing.',
    'fact.resources.short': 'Ice',
    'fact.resources.value': 'Water ice shell',
    'fact.resources.inline': 'the ice shell itself',
    'fact.resources.note': 'The ground is the water. Radiation at the surface is the reason the crew stays inside.',
    'fact.energy.short': '{percent}%',
    'fact.energy.value': '{percent}% of equatorial sunlight',
    'fact.energy.note': 'Jupiter is far from the Sun. Panels produce less than they would at Mars.',
    'fact.confidence.short': 'Orbital',
    'fact.confidence.value': '{level} · Galileo images',
    'fact.confidence.level': 'Medium',
    'fact.confidence.note': 'Nobody has landed here. The outpost is a training layout.',
  })
  facts('utopia', {
    region: 'Fresh crater',
    summary: 'A bright impact that punched the ice. Cleaner ground than the chaos.',
    gains: 'Excavated ice and a flatter floor.',
    risks: 'Rim blocks and ejecta.',
    hazardLevel: 'Moderate',
    'fact.hazards.short': 'Moderate',
    'fact.hazards.value': 'Rim and ejecta',
    'fact.hazards.note': 'Pwyll is a young crater. This site uses the floor as the safer pad.',
    'fact.elevation.short': 'Crater',
    'fact.elevation.value': 'Crater floor',
    'fact.elevation.note': 'Powered descent only.',
    'fact.resources.short': 'Ice',
    'fact.resources.value': 'Exposed ice',
    'fact.resources.inline': 'ice thrown out by the impact',
    'fact.resources.note': 'The crater dug into the shell. How deep the ocean is does not change the first sols.',
    'fact.energy.short': '{percent}%',
    'fact.energy.value': '{percent}% of equatorial sunlight',
    'fact.energy.note': 'Dim sunlight. Batteries matter more than they do on Mars.',
    'fact.confidence.short': 'Orbital',
    'fact.confidence.value': '{level} · flyby images',
    'fact.confidence.level': 'Medium',
    'fact.confidence.note': 'Imaged from orbit. Not a surveyed landing ellipse.',
  })
  facts('elysium', {
    region: 'Ice ridge',
    summary: 'A long bright band. Easier than chaos, poorer than a crater floor for fresh ice.',
    gains: 'A continuous ridge the habitat can sit beside.',
    risks: 'Cracks and a thin radiation shelter.',
    hazardLevel: 'Moderate',
    'fact.hazards.short': 'Moderate',
    'fact.hazards.value': 'Ridge cracks',
    'fact.hazards.note': 'Agenor Linea is a bright band across the ice. The cracks are the hazard.',
    'fact.elevation.short': 'Ridge',
    'fact.elevation.value': 'Low ice ridge',
    'fact.elevation.note': 'No parachute and no heat shield worth flying. The burn is the landing.',
    'fact.resources.short': 'Ice',
    'fact.resources.value': 'Surface ice',
    'fact.resources.inline': 'surface ice along the ridge',
    'fact.resources.note': 'Water is the ground. Digging it is the life-support problem.',
    'fact.energy.short': '{percent}%',
    'fact.energy.value': '{percent}% of equatorial sunlight',
    'fact.energy.note': 'Same faint sun as the rest of Europa.',
    'fact.confidence.short': 'Orbital',
    'fact.confidence.value': '{level} · orbital mosaic',
    'fact.confidence.level': 'Medium',
    'fact.confidence.note': 'A real feature, used here as a gameplay site.',
  })
}

export function tuneFromCraft(mission: MissionDef, craft: SpacecraftConfig, plan: MissionPlan) {
  const body: BodyId = mission.id === 'lunar' ? 'moon' : mission.id === 'europa' ? 'europa' : 'mars'
  applyBody(body)
  const enabled = craft.parts.filter((part) => part.enabled).map((part) => part.specId)
  const chute = enabled.includes('chute')
  const shield = enabled.includes('heatshield')
  const legs = enabled.includes('legs')
  voyageTune.noChute = voyageTune.airless || !chute
  voyageTune.noShield = voyageTune.airless || !shield
  const margin = evaluate(craft, mission, plan).cost.marginUsd
  voyageTune.cargoBias = (margin < 0 ? -4 : margin > mission.budgetUsd * 0.25 ? 1 : 0) + (legs ? 1 : -2) + (!voyageTune.airless && !chute ? -2 : 0)
  voyageTune.landingPenalty = (legs ? 0 : 12) + (!voyageTune.airless && !shield ? 10 : 0) + (!voyageTune.airless && !chute ? 8 : 0)
}
