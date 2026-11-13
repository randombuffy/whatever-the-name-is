// Candidate landing sites for the educational landing scenario.
// Facts tagged OBSERVED come from NASA mission results; MODELLED values are simple
// calculations made for this simulator; GAMEPLAY values are invented for play.
// None of these sites is an approved landing site for a crewed mission.

export type Evidence = 'OBSERVED' | 'MODELLED' | 'GAMEPLAY';
export type SiteId = 'jezero' | 'utopia' | 'elysium';

// Fact text lives in the locale files (site.<id>.fact.<row>.*); data keeps the evidence tag.
export interface SiteFact {
  tag: Evidence;
}

export type FactRow = 'hazards' | 'elevation' | 'resources' | 'energy' | 'confidence';

export interface TerrainProfile {
  seed: number;
  relief: number;
  rockDensity: number;
  craterDensity: number;
  layeredScarp: boolean;
  polygons: boolean;
  rimRing: boolean;
  tint: [number, number, number];
}

export interface LandingSite {
  id: SiteId;
  // Proper names stay in Latin script in every language (NASA usage).
  name: string;
  shortName: string;
  lat: number;
  lon: number;
  coords: string;
  hazard: 1 | 2 | 3;
  solarFactor: number;
  sunlightPercent: number;
  iceAccess: number;
  facts: Record<FactRow, SiteFact>;
  confidence: 'HIGH' | 'MEDIUM';
  terrain: TerrainProfile;
  // Source titles are the English titles of the linked NASA pages and are not translated.
  sources: { label: string; url: string }[];
}

// Relative insolation is modelled as cos(latitude) against the equator. It ignores
// season, orbital eccentricity, local slope and dust, so it is only a first-order guide.
const insolation = (lat: number) => Math.round(Math.cos((lat * Math.PI) / 180) * 100) / 100;

export const SITES: LandingSite[] = [
  {
    id: 'jezero',
    name: 'Jezero Crater',
    shortName: 'Jezero',
    lat: 18.4,
    lon: 77.5,
    coords: '18.4° N · 77.5° E',
    hazard: 3,
    solarFactor: insolation(18.4),
    sunlightPercent: Math.round(insolation(18.4) * 100),
    iceAccess: 0.3,
    facts: {
      hazards: { tag: 'OBSERVED' },
      elevation: { tag: 'OBSERVED' },
      resources: { tag: 'OBSERVED' },
      energy: { tag: 'MODELLED' },
      confidence: { tag: 'OBSERVED' },
    },
    confidence: 'HIGH',
    terrain: { seed: 11, relief: 1.15, rockDensity: 1.5, craterDensity: 1, layeredScarp: true, polygons: false, rimRing: true, tint: [1.0, 0.98, 0.96] },
    sources: [
      { label: 'NASA · Jezero crater elevation graph', url: 'https://science.nasa.gov/photojournal/jezero-crater-elevation-graph/' },
      { label: 'NASA/JPL · Jezero hazard map', url: 'https://www.jpl.nasa.gov/images/jezeros-hazard-map' },
      { label: 'NASA · Terrain Relative Navigation', url: 'https://www.nasa.gov/directorates/stmd/impact-story-terrain-relative-navigation/' },
    ],
  },
  {
    id: 'utopia',
    name: 'Utopia Planitia',
    shortName: 'Utopia',
    lat: 45,
    lon: 110,
    coords: '≈ 45° N · 110° E',
    hazard: 2,
    solarFactor: insolation(45),
    sunlightPercent: Math.round(insolation(45) * 100),
    iceAccess: 1,
    facts: {
      hazards: { tag: 'OBSERVED' },
      elevation: { tag: 'OBSERVED' },
      resources: { tag: 'OBSERVED' },
      energy: { tag: 'MODELLED' },
      confidence: { tag: 'OBSERVED' },
    },
    confidence: 'MEDIUM',
    terrain: { seed: 29, relief: 0.6, rockDensity: 0.9, craterDensity: 0.7, layeredScarp: false, polygons: true, rimRing: false, tint: [0.97, 0.97, 0.98] },
    sources: [
      { label: 'NASA/JPL · Mars ice deposit holds as much water as Lake Superior', url: 'https://www.jpl.nasa.gov/news/mars-ice-deposit-holds-as-much-water-as-lake-superior/' },
      { label: 'NASA PDS · MOLA gridded topography', url: 'https://pds-geosciences.wustl.edu/missions/mgs/megdr.html' },
    ],
  },
  {
    id: 'elysium',
    name: 'Elysium Planitia',
    shortName: 'Elysium',
    lat: 4.5,
    lon: 135.6,
    coords: '4.5° N · 135.6° E',
    hazard: 1,
    solarFactor: insolation(4.5),
    sunlightPercent: Math.round(insolation(4.5) * 100),
    iceAccess: 0.25,
    facts: {
      hazards: { tag: 'OBSERVED' },
      elevation: { tag: 'OBSERVED' },
      resources: { tag: 'MODELLED' },
      energy: { tag: 'MODELLED' },
      confidence: { tag: 'OBSERVED' },
    },
    confidence: 'HIGH',
    terrain: { seed: 47, relief: 0.45, rockDensity: 0.45, craterDensity: 1.25, layeredScarp: false, polygons: false, rimRing: false, tint: [1.02, 0.99, 0.95] },
    sources: [
      { label: 'NASA/JPL · InSight landing site', url: 'https://www.jpl.nasa.gov/news/press_kits/insight/landing/mission/landing-site' },
    ],
  },
];

export const siteById = (id: SiteId | null | undefined) => SITES.find((site) => site.id === id) ?? SITES[0];
