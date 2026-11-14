// Physical descent profile for the landing sequence.
//
// The state machine decides WHICH stage is playing; this file says what the vehicle is doing
// at progress t (0..1) inside that stage: altitude, speed, heating, parachute, engine throttle,
// dust, leg compression. The scene writes these into the Signals Vehicles.tsx reads, and a HUD
// can print the same numbers, so picture and telemetry always agree.
//
// Anchors are rounded figures from published Mars landings (Phoenix 2008, InSight 2018):
// entry near 125 km at roughly 5.5 km/s, peak deceleration on the order of 8 g, parachute near
// 11 km at about Mach 1.7-2, heat shield jettison soon after, backshell separation near 1 km,
// touchdown at a few metres per second. The timing is compressed for play; it is not a simulator.

import { DECISION_POINT } from './landingMachine';
import type { LandingStage, SkillGrade } from './landingMachine';

export interface DescentSample {
  altitudeKm: number;
  speed: number; // m/s
  mach: number;
  gLoad: number;
  heat: number; // 0..1 -> Aeroshell heat signal
  chute: number; // 0..1 -> ParachutePackage inflate signal
  throttle: number; // 0..1 -> Lander throttle signal
  proximity: number; // 0..1, how close the exhaust is to the ground (drives dust)
  compress: number; // 0..1 -> Lander leg compression signal
  heatShieldAttached: boolean;
  backshellAttached: boolean;
  callout: string | null; // most recent flight event, for a HUD toast
}

// [t, altitude km, speed m/s, heat, chute, throttle, g]
type Key = [number, number, number, number, number, number, number];

const ENTRY: Key[] = [
  [0.0, 125, 5500, 0.0, 0, 0, 0.0],
  [0.2, 95, 5450, 0.25, 0, 0, 0.4],
  [0.45, 55, 4600, 1.0, 0, 0, 8.0],
  [0.7, 30, 2200, 0.6, 0, 0, 5.0],
  [1.0, 11.0, 420, 0.1, 0, 0, 2.0], // matches the first DESCENT key so stages join smoothly
];

const DESCENT: Key[] = [
  [0.0, 11.0, 420, 0.0, 0.0, 0, 3.0], // parachute mortar fires
  [0.05, 10.6, 200, 0.0, 1.0, 0, 6.0], // canopy opening shock
  [0.15, 8.0, 110, 0.0, 1.0, 0, 1.5], // heat shield jettison
  [0.3, 4.5, 80, 0.0, 1.0, 0, 1.0],
  [DECISION_POINT, 1.1, 65, 0.0, 1.0, 0.0, 1.0], // backshell separation
  [DECISION_POINT + 0.05, 0.9, 50, 0.0, 0.0, 0.75, 1.3], // engines light
  [0.75, 0.3, 25, 0.0, 0.0, 0.8, 1.2],
  [1.0, 0.05, 8, 0.0, 0.0, 0.7, 1.0],
];

const CONTACT = 0.6; // fraction of TOUCHDOWN at which the pads touch
const TOUCHDOWN: Key[] = [
  [0.0, 0.05, 8, 0.0, 0, 0.7, 1.0],
  [0.4, 0.012, 3.5, 0.0, 0, 0.65, 1.0],
  [CONTACT, 0.0, 2.4, 0.0, 0, 0.5, 1.3],
  [CONTACT + 0.04, 0.0, 0.0, 0.0, 0, 0.0, 1.0], // engine cut-off
  [1.0, 0.0, 0.0, 0.0, 0, 0.0, 1.0],
];

const TABLES: Partial<Record<LandingStage, Key[]>> = { ENTRY, DESCENT, TOUCHDOWN };

// Flight events in order, as [stage, t, label].
export const LANDING_EVENTS: ReadonlyArray<readonly [LandingStage, number, string]> = [
  ['ENTRY', 0.0, 'Entry interface'],
  ['ENTRY', 0.45, 'Peak heating'],
  ['DESCENT', 0.0, 'Parachute deploy'],
  ['DESCENT', 0.15, 'Heat shield jettison'],
  ['DESCENT', DECISION_POINT, 'Backshell separation - choose your approach'],
  ['DESCENT', DECISION_POINT + 0.05, 'Powered descent'],
  ['TOUCHDOWN', CONTACT, 'Touchdown'],
];

const STAGE_ORDER: LandingStage[] = ['ENTRY', 'DESCENT', 'TOUCHDOWN'];
const SPEED_OF_SOUND = 240; // m/s, cold thin CO2 air; rounded
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const SKILL_IMPACT: Record<SkillGrade, number> = { pending: 0.5, neutral: 0.5, clear: 0.3, rough: 0.7, hard: 1 };

function interpolate(keys: Key[], t: number): number[] {
  const x = clamp01(t);
  for (let i = 1; i < keys.length; i += 1) {
    if (x <= keys[i][0]) {
      const a = keys[i - 1];
      const b = keys[i];
      const k = b[0] === a[0] ? 1 : (x - a[0]) / (b[0] - a[0]);
      return a.map((v, n) => v + (b[n] - v) * k);
    }
  }
  return [...keys[keys.length - 1]];
}

function calloutAt(stage: LandingStage, t: number): string | null {
  let latest: string | null = null;
  const here = STAGE_ORDER.indexOf(stage);
  for (const [s, at, label] of LANDING_EVENTS) {
    const order = STAGE_ORDER.indexOf(s);
    if (order < here || (order === here && at <= t)) latest = label;
  }
  return latest;
}

// Contact impulse: pads hit, legs crush quickly, then settle. Harder steering grade = deeper crush.
function legCompression(stage: LandingStage, t: number, skill: SkillGrade): number {
  if (stage === 'POST_LANDING' || stage === 'SETTLEMENT') return 0;
  if (stage !== 'TOUCHDOWN' || t < CONTACT) return 0;
  const s = (t - CONTACT) / (1 - CONTACT);
  const rise = Math.min(1, s / 0.1);
  const settle = s < 0.1 ? 1 : Math.exp(-(s - 0.1) * 5);
  return SKILL_IMPACT[skill] * rise * settle;
}

export function sampleDescent(stage: LandingStage, t: number, skill: SkillGrade = 'neutral'): DescentSample {
  const table = TABLES[stage];
  const landed = stage === 'POST_LANDING' || stage === 'SETTLEMENT';
  const keys = table ?? (landed ? TOUCHDOWN : ENTRY);
  const at = landed ? 1 : table ? t : 0;
  const [, alt, speed, heat, chute, throttle, g] = interpolate(keys, at);
  const stageIndex = landed ? 3 : Math.max(0, STAGE_ORDER.indexOf(stage));
  const descentT = stageIndex === 1 ? t : stageIndex > 1 ? 1 : 0;
  return {
    altitudeKm: alt,
    speed,
    mach: speed / SPEED_OF_SOUND,
    gLoad: g,
    heat,
    chute: stageIndex === 0 ? 0 : chute,
    throttle,
    proximity: clamp01(1 - (alt * 1000) / 40),
    compress: legCompression(stage, t, skill),
    heatShieldAttached: stageIndex === 0 || (stageIndex === 1 && descentT < 0.15),
    backshellAttached: stageIndex === 0 || (stageIndex === 1 && descentT < DECISION_POINT),
    callout: landed ? 'Touchdown' : table ? calloutAt(stage, at) : null,
  };
}

type SignalLike = { current: number };

// Call from a useFrame in the scene: write one sample into the signals Vehicles.tsx reads.
export function writeSignals(
  sample: DescentSample,
  out: { heat?: SignalLike; chute?: SignalLike; throttle?: SignalLike; compress?: SignalLike; proximity?: SignalLike },
) {
  if (out.heat) out.heat.current = sample.heat;
  if (out.chute) out.chute.current = sample.chute;
  if (out.throttle) out.throttle.current = sample.throttle;
  if (out.compress) out.compress.current = sample.compress;
  if (out.proximity) out.proximity.current = sample.proximity;
}

// HUD-friendly strings.
export function formatTelemetry(s: DescentSample) {
  return {
    altitude: s.altitudeKm >= 1 ? `${s.altitudeKm.toFixed(1)} km` : `${Math.round(s.altitudeKm * 1000)} m`,
    speed: s.speed >= 100 ? `${Math.round(s.speed)} m/s` : `${s.speed.toFixed(1)} m/s`,
    mach: s.mach >= 0.8 ? `Mach ${s.mach.toFixed(1)}` : 'subsonic',
    gLoad: `${s.gLoad.toFixed(1)} g`,
  };
}
