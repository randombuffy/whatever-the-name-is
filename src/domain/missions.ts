import { AU_M, MU_EARTH } from './constants'
import { departureFromCircular, leoRadius, lunarTransfer, marsTransfer, solarTransfer } from './orbit'
import type { MissionDef, MissionPlan, SpacecraftConfig } from './types'

function must<T>(value: T | null, label: string): T {
  if (!value) throw new Error(`Orbit model failed for ${label}`)
  return value
}

const lunar = must(lunarTransfer(), 'Moon')
const mars = must(marsTransfer(), 'Mars')
const europa = must(solarTransfer(5.2), 'Europa')
const asteroidDepart = must(departureFromCircular(MU_EARTH, leoRadius(), 2400), 'asteroid')

const sharedAssumptions = [
  'Parking orbit is a 300 km circular Earth orbit. The launch vehicle provides that orbit if the mass limit is met.',
  'Transfers are coplanar patched-conic models. They are not JPL Horizons trajectories.',
  'Finite burns use the rocket equation. Gravity losses are not modelled. A burn that overruns its window is rejected.',
  'Component figures are illustrative game values, not flight-hardware specifications.',
]

export const MISSIONS: MissionDef[] = [
  {
    id: 'lunar',
    name: 'Lunar reconnaissance',
    index: 1,
    destination: 'Moon, 100 km class orbit',
    destinationAu: 1,
    originAu: 1,
    summary: 'Leave Earth orbit, insert at the Moon, and return images.',
    scienceContext: 'A short flight for learning mass, propellant and the link budget. The Moon is close, so power is forgiving and communications are the first place a small antenna fails.',
    durationDays: 18,
    launchWindow: 'A few days each month in this scenario. The game does not model the real declination window.',
    launchVehicle: 'Illustrative small launcher to a 300 km parking orbit',
    maxMassKg: 850,
    budgetUsd: 42_000_000,
    launchCostUsd: 14_000_000,
    opsPerDayUsd: 40_000,
    contingencyRate: 0.12,
    requiredInstruments: ['camera'],
    optionalInstruments: ['spectrometer', 'magnetometer'],
    successDataBits: 1.5e9,
    successScience: 30,
    optionalScience: 70,
    eclipseFraction: 0.35,
    eclipseHours: 0.9,
    contactFraction: 0.45,
    linkDistanceM: 384_400_000,
    minDownlinkBps: 20_000,
    groundGainDbi: 32,
    groundTempK: 45,
    requiredMarginDb: 8,
    solarAbsorptivity: 0.42,
    emissivity: 0.82,
    bodyAreaM2: 2.4,
    captureOptions: [
      { id: 'loose', label: 'Loose lunar orbit', dvMps: lunar.loiMps * 0.82, scienceBonus: 0 },
      { id: 'nominal', label: 'Nominal mapping orbit', dvMps: lunar.loiMps, scienceBonus: 12 },
      { id: 'close', label: 'Close reconnaissance orbit', dvMps: lunar.loiMps * 1.18, scienceBonus: 28 },
    ],
    burns: [
      { id: 'departure', label: 'Trans-lunar injection', dvMps: lunar.tliMps, propellant: ['chemical', 'electric', 'cold-gas'], coastAfterSec: lunar.tofSec, windowSec: 6 * 3600 },
      { id: 'arrival', label: 'Lunar orbit insertion', dvMps: lunar.loiMps, propellant: ['chemical', 'electric', 'cold-gas'], coastAfterSec: 0, windowSec: 4 * 3600 },
    ],
    scienceWindowSec: 10 * 86400,
    events: [
      {
        id: 'nav-residual',
        at: 0.5,
        title: 'Navigation residual',
        detail: 'Tracking shows the outbound path will miss the aim point. A correction of 25 m/s restores the insertion. Skipping it makes insertion cost more and cuts the science return.',
        options: [
          { id: 'correct', label: 'Burn the correction', detail: 'Spend 25 m/s now.' },
          { id: 'ignore', label: 'Leave the error', detail: 'Insertion needs an extra 40 m/s and science is reduced.' },
        ],
      },
      {
        id: 'pointing',
        at: 'science',
        title: 'Antenna pointing drift',
        detail: 'The high-rate link is walking off the station. You can stop science briefly and repoint, or keep observing and accept a slower return.',
        options: [
          { id: 'repoint', label: 'Repoint, then observe', detail: 'Lose a little science time and keep the data rate.' },
          { id: 'degrade', label: 'Keep the instruments on', detail: 'Science continues at a lower returned fraction.' },
        ],
      },
    ],
    nasaQuery: 'moon reconnaissance orbiter',
    assumptions: [
      ...sharedAssumptions,
      'Trans-lunar injection is an Earth-centered Hohmann departure from 300 km to lunar distance.',
      'Lunar orbit insertion uses the Moon’s gravity and a 100 km circular target. The capture options scale that burn.',
      `Patched-conic time of flight is ${(lunar.tofSec / 86400).toFixed(1)} days.`,
    ],
  },
  {
    id: 'mars',
    name: 'Mars pathfinder',
    index: 2,
    destination: 'Mars, 400 km class orbit',
    destinationAu: 1.5237,
    originAu: 1,
    summary: 'A heliocentric transfer, a capture at Mars, and a spectrometer data return.',
    scienceContext: 'Fictional operations inspired by the idea of an orbital survey. Solar power is weaker at Mars, the cruise is most of a year, and the capture burn is expensive.',
    durationDays: Math.ceil(mars.tofSec / 86400) + 70,
    launchWindow: 'An illustrative opposition window. Real Mars windows depend on ephemerides this game does not compute.',
    launchVehicle: 'Illustrative medium launcher to a 300 km parking orbit',
    maxMassKg: 1600,
    budgetUsd: 190_000_000,
    launchCostUsd: 62_000_000,
    opsPerDayUsd: 55_000,
    contingencyRate: 0.15,
    requiredInstruments: ['camera', 'spectrometer'],
    optionalInstruments: ['radar', 'magnetometer'],
    successDataBits: 4e8,
    successScience: 70,
    optionalScience: 120,
    eclipseFraction: 0.38,
    eclipseHours: 0.7,
    contactFraction: 0.28,
    linkDistanceM: 2.5 * AU_M,
    minDownlinkBps: 400,
    groundGainDbi: 60,
    groundTempK: 40,
    requiredMarginDb: 8,
    solarAbsorptivity: 0.4,
    emissivity: 0.84,
    bodyAreaM2: 3.2,
    captureOptions: [
      { id: 'loose', label: 'High Mars orbit', dvMps: mars.captureMps * 0.78, scienceBonus: 0 },
      { id: 'nominal', label: 'Mapping orbit', dvMps: mars.captureMps, scienceBonus: 15 },
      { id: 'close', label: 'Low survey orbit', dvMps: mars.captureMps * 1.12, scienceBonus: 30 },
    ],
    burns: [
      { id: 'departure', label: 'Earth departure', dvMps: mars.departureMps, propellant: ['chemical', 'electric'], coastAfterSec: mars.tofSec, windowSec: 10 * 3600 },
      { id: 'arrival', label: 'Mars orbit insertion', dvMps: mars.captureMps, propellant: ['chemical', 'electric'], coastAfterSec: 0, windowSec: 8 * 3600 },
    ],
    scienceWindowSec: 40 * 86400,
    events: [
      {
        id: 'nav-residual',
        at: 0.5,
        title: 'Midcourse residual',
        detail: 'The cruise trajectory has drifted. Correcting it costs 30 m/s. Leaving it adds 70 m/s to capture and degrades the orbit for science.',
        options: [
          { id: 'correct', label: 'Correct the path', detail: 'Spend 30 m/s during cruise.' },
          { id: 'ignore', label: 'Accept the drift', detail: 'Capture costs an extra 70 m/s and science falls.' },
        ],
      },
      {
        id: 'solar-event',
        at: 0.72,
        title: 'Solar particle event',
        detail: 'An illustrative solar event, not a live DONKI alert. Arrays lose output for two days unless you safing the vehicle and wait.',
        options: [
          { id: 'safe', label: 'Enter safe mode', detail: 'Instruments off until the event passes. Arrays are protected.' },
          { id: 'ride', label: 'Keep operating', detail: 'Science is reduced and a sensitive instrument may drop out.' },
        ],
      },
    ],
    nasaQuery: 'mars reconnaissance',
    assumptions: [
      ...sharedAssumptions,
      'Earth and Mars orbits are circular and coplanar at 1 AU and 1.524 AU.',
      'Capture targets a 400 km circular Mars orbit before the selected option scales it.',
      `Heliocentric coast is about ${(mars.tofSec / 86400).toFixed(0)} days.`,
    ],
  },
  {
    id: 'europa',
    name: 'Europa explorer',
    index: 3,
    destination: 'Europa, illustrative Jupiter orbit',
    destinationAu: 5.2,
    originAu: 1,
    summary: 'A direct outer-planet transfer. Power and the link decide it, not a bigger chemical tank alone.',
    scienceContext: 'Fictional operations around an icy moon. A real Europa mission uses gravity assists and a radiation design this game does not attempt. The lesson is distance: sunlight, heat and the radio link all change together.',
    durationDays: Math.ceil(europa.tofSec / 86400) + 400,
    launchWindow: 'Illustrative. A real Jupiter window is an ephemeris problem.',
    launchVehicle: 'Illustrative heavy launcher to a 300 km parking orbit',
    maxMassKg: 2800,
    budgetUsd: 720_000_000,
    launchCostUsd: 180_000_000,
    opsPerDayUsd: 70_000,
    contingencyRate: 0.18,
    requiredInstruments: ['camera', 'spectrometer', 'magnetometer', 'particle'],
    optionalInstruments: ['radar'],
    successDataBits: 2e9,
    successScience: 90,
    optionalScience: 140,
    eclipseFraction: 0.12,
    eclipseHours: 1.2,
    contactFraction: 0.12,
    linkDistanceM: 6 * AU_M,
    minDownlinkBps: 400,
    groundGainDbi: 68,
    groundTempK: 30,
    requiredMarginDb: 6,
    solarAbsorptivity: 0.35,
    emissivity: 0.86,
    bodyAreaM2: 4.5,
    captureOptions: [
      { id: 'loose', label: 'Distant capture', dvMps: 1400, scienceBonus: 0 },
      { id: 'nominal', label: 'Europa-observing orbit', dvMps: 2100, scienceBonus: 18 },
      { id: 'close', label: 'Close flyby campaign', dvMps: 2800, scienceBonus: 36 },
    ],
    burns: [
      { id: 'departure', label: 'Earth departure', dvMps: europa.departureMps, propellant: ['chemical', 'electric'], coastAfterSec: europa.tofSec, windowSec: 280 * 86400 },
      { id: 'arrival', label: 'Jupiter capture', dvMps: 2100, propellant: ['chemical', 'electric'], coastAfterSec: 0, windowSec: 120 * 86400 },
    ],
    scienceWindowSec: 120 * 86400,
    events: [
      {
        id: 'nav-residual',
        at: 0.4,
        title: 'Cruise navigation residual',
        detail: 'A long cruise accumulates error. The correction is 40 m/s. Skipping it adds 120 m/s at Jupiter.',
        options: [
          { id: 'correct', label: 'Correct during cruise', detail: 'Spend 40 m/s while power is still available.' },
          { id: 'ignore', label: 'Save the propellant', detail: 'Arrival costs an extra 120 m/s and science is reduced.' },
        ],
      },
      {
        id: 'solar-event',
        at: 0.15,
        title: 'Solar conjunction noise',
        detail: 'The link margin collapses for a week of illustrative solar conjunction. You can store data or pause collection.',
        options: [
          { id: 'store', label: 'Keep collecting and store', detail: 'Data waits in the recorder. If the recorder fills, the overflow is lost.' },
          { id: 'pause', label: 'Pause the instruments', detail: 'No new data until the link returns. Power load drops.' },
        ],
      },
    ],
    nasaQuery: 'europa clipper',
    assumptions: [
      ...sharedAssumptions,
      'The heliocentric leg is a circular coplanar Hohmann to 5.2 AU. There is no Venus or Earth gravity assist.',
      'Jupiter capture delta-v values are illustrative round numbers, not a satellite tour design.',
      'Solar power uses the inverse square law. A constant power source does not.',
      `Coast is about ${(europa.tofSec / 86400).toFixed(0)} days.`,
    ],
  },
  {
    id: 'asteroid',
    name: 'Asteroid survey',
    index: 4,
    destination: 'Illustrative near-Earth asteroid',
    destinationAu: 1.2,
    originAu: 1,
    summary: 'Rendezvous with a near-Earth object and map it from close range.',
    scienceContext: 'The asteroid is not a specific numbered body. Departure excess speed is an illustrative 2.4 km/s, not a Horizons solution. The interesting part is the propellant you must still have when you arrive.',
    durationDays: 420,
    launchWindow: 'Illustrative. A real asteroid window is target-specific.',
    launchVehicle: 'Illustrative small launcher to a 300 km parking orbit',
    maxMassKg: 700,
    budgetUsd: 78_000_000,
    launchCostUsd: 22_000_000,
    opsPerDayUsd: 28_000,
    contingencyRate: 0.12,
    requiredInstruments: ['camera', 'spectrometer'],
    optionalInstruments: ['particle', 'magnetometer'],
    successDataBits: 3e9,
    successScience: 60,
    optionalScience: 100,
    eclipseFraction: 0.08,
    eclipseHours: 0.4,
    contactFraction: 0.35,
    linkDistanceM: 0.25 * AU_M,
    minDownlinkBps: 8_000,
    groundGainDbi: 55,
    groundTempK: 40,
    requiredMarginDb: 8,
    solarAbsorptivity: 0.4,
    emissivity: 0.82,
    bodyAreaM2: 2.2,
    captureOptions: [
      { id: 'standoff', label: 'Standoff survey', dvMps: asteroidDepart * 0 + 700, scienceBonus: 0 },
      { id: 'nominal', label: 'Close rendezvous', dvMps: 1100, scienceBonus: 16 },
      { id: 'hover', label: 'Proximity hovering', dvMps: 1500, scienceBonus: 34 },
    ],
    burns: [
      { id: 'departure', label: 'Earth departure', dvMps: asteroidDepart, propellant: ['chemical', 'electric'], coastAfterSec: 280 * 86400, windowSec: 8 * 3600 },
      { id: 'arrival', label: 'Rendezvous', dvMps: 1100, propellant: ['chemical', 'electric'], coastAfterSec: 0, windowSec: 15 * 86400 },
    ],
    scienceWindowSec: 30 * 86400,
    events: [
      {
        id: 'proximity',
        at: 'arrival',
        title: 'Unexpected relative motion',
        detail: 'The body is lighter than the planning model, and the approach is faster than predicted. Match it, or stand off and take a poorer data set.',
        options: [
          { id: 'match', label: 'Match the motion', detail: 'Spend 80 m/s of proximity propellant.' },
          { id: 'standoff', label: 'Hold a safer distance', detail: 'No extra burn. Science return is cut.' },
        ],
      },
      {
        id: 'nav-residual',
        at: 0.6,
        title: 'Cruise drift',
        detail: 'A 20 m/s correction keeps the rendezvous budget intact.',
        options: [
          { id: 'correct', label: 'Correct', detail: 'Spend 20 m/s.' },
          { id: 'ignore', label: 'Ignore', detail: 'Rendezvous needs an extra 50 m/s.' },
        ],
      },
    ],
    nasaQuery: 'near earth asteroid',
    assumptions: [
      ...sharedAssumptions,
      'Earth departure uses an illustrative excess speed of 2.4 km/s from a 300 km orbit.',
      'The rendezvous burns are scenario inputs, not a solution for a named asteroid.',
      'Proximity operations are a single extra burn, not a full guidance simulation.',
    ],
  },
]

export function getMission(id: string): MissionDef | undefined {
  return MISSIONS.find((mission) => mission.id === id)
}

const FIRST_SITE: Record<string, string> = {
  lunar: 'pole',
  mars: 'jezero',
  europa: 'chaos',
  asteroid: 'equator',
}

export function defaultPlan(mission: MissionDef): MissionPlan {
  const world = mission.id === 'custom' ? 'mars' : mission.id
  return {
    captureId: 'nominal',
    reserveDvMps: mission.id === 'europa' ? 80 : 40,
    scienceDuty: 0.75,
    objectiveId: 'water',
    siteId: FIRST_SITE[world] ?? 'jezero',
  }
}

export function starterCraft(missionId: string): SpacecraftConfig {
  const name = 'Surveyor'
  if (missionId === 'mars') {
    return {
      name,
      parts: parts(['bus-probe', 'biprop-450', 'tank-160', 'acs', 'panel-600', 'battery-1500', 'transponder', 'antenna-mga', 'camera', 'mli', 'radiator-s']),
    }
  }
  if (missionId === 'europa') {
    return {
      name,
      parts: parts(['bus-probe', 'ion', 'tank-xe-30', 'acs', 'panel-2000', 'battery-1500', 'transponder', 'antenna-hga', 'camera', 'spectrometer', 'mli', 'radiator-s']),
    }
  }
  if (missionId === 'asteroid') {
    return {
      name,
      parts: parts(['bus-small', 'biprop-450', 'tank-40', 'acs', 'panel-150', 'battery-200', 'transponder', 'antenna-lga', 'camera', 'mli', 'radiator-s']),
    }
  }
  return {
    name,
    parts: parts(['bus-small', 'biprop-450', 'tank-40', 'acs', 'panel-150', 'battery-200', 'transponder', 'antenna-lga', 'camera', 'mli', 'radiator-s']),
  }
}

function parts(ids: string[]): SpacecraftConfig['parts'] {
  return ids.map((specId, index) => ({
    instanceId: `${specId}-${index}`,
    specId,
    fill: specId.startsWith('tank') ? 1 : 1,
    enabled: true,
    mount: 'bus' as const,
  }))
}

export const ORBIT_NOTES = { lunar, mars, europa, asteroidDepart }
