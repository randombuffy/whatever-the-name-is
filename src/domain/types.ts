export type Subsystem =
  | 'structure'
  | 'propulsion'
  | 'fuel'
  | 'power'
  | 'communications'
  | 'science'
  | 'thermal'
  | 'avionics'

export type PropellantType = 'none' | 'chemical' | 'electric' | 'cold-gas'
export type PowerScale = 'solar' | 'constant'
export type Mount = 'bus' | 'aft' | 'forward' | 'port' | 'starboard' | 'zenith' | 'nadir'

export interface ComponentSpec {
  id: string
  name: string
  subsystem: Subsystem
  summary: string
  massKg: number
  costUsd: number
  powerDrawW: number
  powerGenW: number
  powerScale: PowerScale
  energyWh: number
  thrustN: number
  ispS: number
  /** Propellant stored on the component itself (ACS clusters). */
  onboardPropellantKg: number
  /** Tank capacity. Empty until the player sets a fill. */
  tankCapacityKg: number
  propellant: PropellantType
  /** When true, departure and capture burns draw this tank type. */
  feedsMainEngine: boolean
  /** Constant hazard, failures per year. Series reliability model. */
  hazardPerYear: number
  tempMinK: number
  tempMaxK: number
  heatW: number
  /** Radiating area added to the single-node thermal model. */
  radiatorM2: number
  /** Absorptivity reduction when insulation is fitted. */
  absorptivityDrop: number
  txPowerW: number
  antennaGainDbi: number
  frequencyHz: number
  dataRateBps: number
  storageBits: number
  sciencePoints: number
  instrument: string | null
  /** Preferred structural mount for the procedural mesh. */
  mount: Mount
}

export interface InstalledPart {
  instanceId: string
  specId: string
  /** 0 to 1. Tanks use this as propellant fill. Other parts ignore it. */
  fill: number
  enabled: boolean
  mount: Mount
  /** Hangar placement only. Mass, delta-v, power and cost ignore it. */
  offset?: { x: number; y: number; z: number }
}

export interface SpacecraftConfig {
  name: string
  parts: InstalledPart[]
  /** Bumped to rebuild the hull without changing the parts list. */
  hullSeed?: number
}

export interface BurnSpec {
  id: string
  label: string
  dvMps: number
  /** Propellant family allowed to perform the burn. */
  propellant: PropellantType[]
  /** Coast that follows a successful burn, seconds. */
  coastAfterSec: number
  windowSec: number
}

export interface MissionDef {
  id: string
  name: string
  index: number
  destination: string
  destinationAu: number
  originAu: number
  summary: string
  scienceContext: string
  durationDays: number
  launchWindow: string
  launchVehicle: string
  maxMassKg: number
  budgetUsd: number
  launchCostUsd: number
  opsPerDayUsd: number
  contingencyRate: number
  requiredInstruments: string[]
  optionalInstruments: string[]
  successDataBits: number
  successScience: number
  optionalScience: number
  eclipseFraction: number
  eclipseHours: number
  contactFraction: number
  /** Planning range for the downlink, metres. Not the heliocentric distance. */
  linkDistanceM: number
  /** Minimum returned rate the scenario will accept, bits per second. */
  minDownlinkBps: number
  groundGainDbi: number
  groundTempK: number
  requiredMarginDb: number
  solarAbsorptivity: number
  emissivity: number
  bodyAreaM2: number
  captureOptions: { id: string; label: string; dvMps: number; scienceBonus: number }[]
  burns: BurnSpec[]
  scienceWindowSec: number
  /** Scripted operational events. These always occur. */
  events: MissionEventDef[]
  nasaQuery: string
  assumptions: string[]
}

export interface MissionEventDef {
  id: string
  /** Fired when cruise fraction reaches this value, or 'arrival' / 'science'. */
  at: number | 'arrival' | 'science'
  title: string
  detail: string
  options: { id: string; label: string; detail: string }[]
}

export interface MissionPlan {
  captureId: string
  reserveDvMps: number
  scienceDuty: number
  /** Days from the best departure. Zero is the bowl of the window. */
  launchDay?: number
  siteId?: string
  objectiveId?: string
}

export interface MassBudget {
  dryKg: number
  propellantKg: number
  payloadKg: number
  totalKg: number
  limitKg: number
  marginKg: number
  bySubsystem: Record<Subsystem, number>
}

export interface PropulsionBudget {
  dvMps: number
  byPropellant: { type: PropellantType; dvMps: number; propellantKg: number; ispS: number; thrustN: number; burnSec: number }[]
  massFlowKgS: number
  usablePropellantKg: number
}

export interface PowerBudget {
  generationAt1AuW: number
  constantGenerationW: number
  loadW: number
  eclipseLoadWh: number
  batteryWh: number
  eclipseFraction: number
  netCruiseW: number
  coversEclipse: boolean
}

export interface CostBudget {
  componentsUsd: number
  launchUsd: number
  operationsUsd: number
  contingencyUsd: number
  totalUsd: number
  limitUsd: number
  marginUsd: number
}

export interface LinkBudget {
  frequencyHz: number
  txPowerW: number
  gainDbi: number
  fsplDb: number
  receivedDbw: number
  noiseDbw: number
  snrDb: number
  marginDb: number
  dataRateBps: number
  achievableBps: number
  distanceM: number
  closes: boolean
}

export interface ThermalBudget {
  heatW: number
  solarW: number
  radiatorM2: number
  temperatureK: number
  minLimitK: number
  maxLimitK: number
  withinLimits: boolean
  note: string
}

export interface ReliabilityBudget {
  seriesReliability: number
  years: number
  weakestId: string | null
}

export type Severity = 'hard' | 'warning'

export interface EngineeringIssue {
  id: string
  severity: Severity
  subsystem: Subsystem | 'mission'
  what: string
  why: string
  change: string
}

export interface EngineeringReport {
  mass: MassBudget
  propulsion: PropulsionBudget
  power: PowerBudget
  cost: CostBudget
  link: LinkBudget
  thermal: ThermalBudget
  reliability: ReliabilityBudget
  requiredDvMps: number
  issues: EngineeringIssue[]
  hardCount: number
  warningCount: number
  flyable: boolean
}

export type PowerMode = 'nominal' | 'reduced' | 'safe'
export type SimStatus = 'running' | 'paused' | 'awaiting' | 'complete' | 'failed'

export interface LogEntry {
  tSec: number
  tone: 'info' | 'warn' | 'fault' | 'good'
  text: string
}

export interface Decision {
  id: string
  title: string
  detail: string
  options: { id: string; label: string; detail: string }[]
}

export type ScriptItem =
  | { type: 'coast'; sec: number; label: string; fractionFrom: number; fractionTo: number }
  | { type: 'burn'; id: string; dv: number; label: string; propellant: PropellantType[]; windowSec: number }
  | { type: 'decision'; eventId: string }
  | { type: 'science'; sec: number }
  | { type: 'end' }

/** Impulsive burn in the vehicle frame. Prograde is along the velocity, radial is out, normal is out of plane. */
export interface ManoeuvreNode {
  burnId: string
  prograde: number
  radial: number
  normal: number
}

export interface SimState {
  seed: number
  rng: number
  tSec: number
  script: ScriptItem[]
  index: number
  segmentElapsed: number
  propellant: Record<'chemical' | 'electric' | 'cold-gas', number>
  batteryJ: number
  dvUsedMps: number
  sciencePoints: number
  dataStoredBits: number
  dataReturnedBits: number
  distanceFraction: number
  powerMode: PowerMode
  disabled: string[]
  burning: boolean
  thrustFraction: number
  maneuver: string
  phaseLabel: string
  commsMarginDb: number
  temperatureK: number
  powerGenW: number
  powerLoadW: number
  status: SimStatus
  decision: Decision | null
  log: LogEntry[]
  alerts: string[]
  decisionsMade: { id: string; option: string; title: string }[]
  brownoutSec: number
  failed: boolean
  failReason: string
  correctionPenalty: number
  scienceMultiplier: number
  extraArrivalDv: number
  arrivalResolved: boolean
  burnDvLeft: number | null
  safeUntil: number
  linkBlackoutUntil: number
  solarScale: number
  overflowLogged: boolean
  dayMark: number
  originAu: number
  destAu: number
  /** Replaces the named burn when it starts. Null keeps the scripted delta-v. */
  node: ManoeuvreNode | null
  /** Commanded throttle, 0 to 1. The burn integrates this fraction of thrust. */
  throttle: number
  /** Nose error from the burn direction, radians. Only the aligned share counts as progress. */
  pointingRad: number
}

export interface ObjectiveResult {
  id: string
  label: string
  met: boolean
  detail: string
}

export interface MissionOutcome {
  missionId: string
  craftName: string
  success: boolean
  partial: boolean
  score: number
  objectives: ObjectiveResult[]
  sciencePoints: number
  dataReturnedBits: number
  propellantUsedKg: number
  propellantRemainingKg: number
  dvUsedMps: number
  dvRemainingMps: number
  massKg: number
  costUsd: number
  budgetUsd: number
  commsMarginDb: number
  reliability: number
  decisions: { id: string; option: string; title: string }[]
  lessons: string[]
  strengths: string[]
  mistakes: string[]
  summary: string
  finishedAt: string
  launchDay?: number
  siteName?: string
  durationSec?: number
  landing?: 'soft' | 'hard' | 'none'
  entryHeat?: number
  landingOffset?: number
  rewinds?: number
  achievements?: { id: string; name: string; detail: string }[]
  timeline?: { tSec: number; label: string }[]
}
