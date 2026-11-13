import { G0 } from './constants'
import { massFlowKgS, stepPlanar } from './dynamics'
import { shuttleCoefficients, stackAxialCd, wingAreaM2 } from './shuttleAero'

/** Shared core used for every liftoff. The ship on top is the player's craft. */
export const BOOSTER = {
  thrustN: 8_400_000,
  ispS: 311,
  dryKg: 20_000,
  propellantKg: 430_000,
  areaM2: 10.5,
  cd: 0.32,
} as const

/** The stage that keeps burning after the booster drops. Same tanks in the integrator, smaller engine. */
export const UPPER = {
  thrustN: 1_450_000,
  ispS: 340,
  dryKg: 4_000,
  propellantKg: 55_000,
} as const

/** Real-time seconds are stretched so a burn fits a captain's sequence. The integrator itself is in SI seconds. */
export const ASCENT_TIME_SCALE = 18

export type AscentPhase =
  | 'pad'
  | 'ignition'
  | 'liftoff'
  | 'ascent'
  | 'maxq'
  | 'fairing'
  | 'booster'
  | 'orbit'
  | 'abort'

export interface AscentInput {
  throttle: number
  /** -1 nose down, +1 nose up, added to the pitch program. */
  pitch: number
  /** Visual yaw rate, radians per second. The ascent stays in one plane. */
  yaw: number
  abort: boolean
}

export interface AscentState {
  tSec: number
  altitudeM: number
  downrangeM: number
  velocityMps: number
  flightPathRad: number
  propellantKg: number
  throttle: number
  qPa: number
  massKg: number
  mach: number
  /** Lift and drag coefficients in use. The booster uses an axial stack coefficient. The winged stage uses the shuttle table. */
  cl: number
  cd: number
  phase: AscentPhase
  fairingGone: boolean
  boosterGone: boolean
  callout: string | null
  aborted: boolean
  yawRad: number
  qPeak: number
  pitchRad: number
  pitchRate: number
  aoaRad: number
  accelMps2: number
  twr: number
  note: string | null
}

const ORDER: AscentPhase[] = ['pad', 'ignition', 'liftoff', 'ascent', 'maxq', 'fairing', 'booster', 'orbit']

const CALLOUT: Partial<Record<AscentPhase, string>> = {
  ignition: 'Ignition.',
  liftoff: 'Liftoff.',
  maxq: 'Maximum dynamic pressure.',
  fairing: 'Fairing separation.',
  booster: 'Booster separation. Upper stage.',
  orbit: 'Orbit insertion.',
  abort: 'Abort.',
}

export function createAscent(payloadKg: number): AscentState {
  const payload = Math.max(0, payloadKg)
  return {
    tSec: 0,
    altitudeM: 0,
    downrangeM: 0,
    velocityMps: 0,
    flightPathRad: Math.PI / 2,
    propellantKg: BOOSTER.propellantKg,
    throttle: 0,
    qPa: 0,
    massKg: BOOSTER.dryKg + BOOSTER.propellantKg + payload,
    mach: 0,
    cl: 0,
    cd: 0.32,
    phase: 'pad',
    fairingGone: false,
    boosterGone: false,
    callout: null,
    aborted: false,
    yawRad: 0,
    qPeak: 0,
    pitchRad: Math.PI / 2,
    pitchRate: 0,
    aoaRad: 0,
    accelMps2: 0,
    twr: 0,
    note: null,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Flight-path angle from the horizon. Vertical is π/2. */
function programGamma(altitudeM: number, pitch: number): number {
  const knots: [number, number][] = [
    [0, Math.PI / 2],
    [250, Math.PI / 2],
    [12_000, 1.05],
    [40_000, 0.55],
    [80_000, 0.22],
    [120_000, 0.08],
    [160_000, 0.03],
  ]
  let gamma = knots[knots.length - 1][1]
  for (let i = 1; i < knots.length; i++) {
    const [h0, g0] = knots[i - 1]
    const [h1, g1] = knots[i]
    if (altitudeM <= h1) {
      const span = h1 - h0
      const t = span <= 0 ? 1 : (altitudeM - h0) / span
      gamma = g0 + (g1 - g0) * t
      break
    }
  }
  return clamp(gamma + clamp(pitch, -1, 1) * 0.4, 0.02, Math.PI / 2)
}

function atmosphere(altitudeM: number, velocity: number): { rho: number; q: number; mach: number } {
  const rho = 1.225 * Math.exp(-Math.max(0, altitudeM) / 8500)
  const q = 0.5 * rho * velocity * velocity
  const speedOfSound = Math.max(250, 340 * Math.exp(-Math.max(0, altitudeM) / 90000))
  return { rho, q, mach: velocity / speedOfSound }
}

function advance(previous: AscentPhase, next: AscentPhase): { phase: AscentPhase; callout: string | null } {
  if (next === 'abort') return { phase: 'abort', callout: CALLOUT.abort ?? null }
  const from = ORDER.indexOf(previous)
  const to = ORDER.indexOf(next)
  if (to > from) return { phase: next, callout: CALLOUT[next] ?? null }
  return { phase: previous, callout: null }
}

function integrate(state: AscentState, input: AscentInput, dt: number, payloadKg: number): AscentState {
  if (state.aborted || state.phase === 'orbit') {
    return { ...state, tSec: state.tSec + dt, callout: null }
  }
  if (input.abort) {
    return { ...state, tSec: state.tSec + dt, aborted: true, phase: 'abort', callout: CALLOUT.abort ?? null, throttle: 0 }
  }

  const payload = Math.max(0, payloadKg)
  const throttle = clamp(input.throttle, 0, 1)
  const propellant = state.propellantKg
  const upper = state.boosterGone
  const stageDry = upper ? UPPER.dryKg : BOOSTER.dryKg
  const stageThrust = upper ? UPPER.thrustN : BOOSTER.thrustN
  const stageIsp = upper ? UPPER.ispS : BOOSTER.ispS
  const stageArea = upper ? 4.2 : BOOSTER.areaM2
  const mass = stageDry + payload + propellant
  const fueled = propellant > 2
  const thrust = fueled ? throttle * stageThrust : 0
  const yawRad = state.yawRad + clamp(input.yaw, -1.2, 1.2) * dt

  const weight = mass * G0
  const onPad = state.altitudeM <= 0.2 && state.velocityMps < 0.4 && thrust <= weight
  if (onPad) {
    const phase = thrust > 1000 ? 'ignition' : 'pad'
    const moved = advance(state.phase, phase)
    return {
      ...state,
      tSec: state.tSec + dt,
      altitudeM: 0,
      velocityMps: 0,
      throttle,
      massKg: mass,
      qPa: 0,
      mach: 0,
      yawRad,
      phase: moved.phase,
      callout: moved.callout,
    }
  }

  const air = atmosphere(state.altitudeM, state.velocityMps)
  const aoaNow = state.pitchRad - state.flightPathRad
  const coeffs = upper
    ? shuttleCoefficients(air.mach, (aoaNow * 180) / Math.PI)
    : { cl: 0, cd: stackAxialCd(air.mach) }
  const sref = upper ? wingAreaM2(payload) : stageArea
  const drag = air.q * sref * Math.max(0.02, coeffs.cd)
  const liftN = upper ? air.q * sref * coeffs.cl : undefined
  const target = programGamma(state.altitudeM, input.pitch)
  const gimbal = clamp((target - state.pitchRad) * 2.6, -0.14, 0.14)
  const liftPerRad = air.q * sref * 1.4
  const inertia = (mass * 28 * 28) / 12
  const motion = stepPlanar(state, mass, thrust, drag, liftPerRad, gimbal, 4.2, inertia, G0, dt, liftN)
  const velocity = motion.velocityMps
  const flightPathRad = motion.flightPathRad
  let altitude = state.altitudeM + velocity * Math.sin(flightPathRad) * dt
  const downrange = state.downrangeM + velocity * Math.cos(flightPathRad) * dt
  if (altitude < 0) altitude = 0
  const mdot = massFlowKgS(thrust, stageIsp)
  const nextProp = Math.max(0, propellant - mdot * dt)
  const nextAir = atmosphere(altitude, velocity)
  const qPeak = Math.max(state.qPeak, nextAir.q)
  const fairingGone = state.fairingGone || altitude > 100_000
  const boosterGone = state.boosterGone || nextProp <= UPPER.propellantKg
  const twr = thrust / Math.max(mass * G0, 1)
  const aoaDeg = Math.abs(motion.aoaRad) * (180 / Math.PI)
  const note = `${upper ? 'Orbiter' : 'Stack'} Cl ${coeffs.cl.toFixed(2)} Cd ${coeffs.cd.toFixed(2)} · q ${(nextAir.q / 1000).toFixed(1)} kPa · AoA ${aoaDeg.toFixed(1)}°`
  const bent = nextAir.q * Math.abs(motion.aoaRad) > 90_000

  let milestone: AscentPhase = 'ascent'
  if (altitude > 1) milestone = 'liftoff'
  if (altitude > 500) milestone = 'ascent'
  if (qPeak > 18_000 && nextAir.q < qPeak * 0.9) milestone = 'maxq'
  if (fairingGone) milestone = 'fairing'
  if (boosterGone) milestone = 'booster'
  if (boosterGone && altitude > 140_000 && velocity > 7_600 && flightPathRad < 0.25) milestone = 'orbit'

  const falling = state.altitudeM > 80 && altitude <= 0.05 && velocity < 30
  if (bent || falling) {
    return {
      ...state,
      tSec: state.tSec + dt,
      altitudeM: falling ? 0 : altitude,
      downrangeM: downrange,
      velocityMps: falling ? 0 : velocity,
      flightPathRad,
      propellantKg: nextProp,
      throttle: 0,
      qPa: nextAir.q,
      massKg: (boosterGone ? UPPER.dryKg : BOOSTER.dryKg) + payload + nextProp,
      mach: nextAir.mach,
      cl: coeffs.cl,
      cd: coeffs.cd,
      phase: 'abort',
      callout: bent ? 'Angle of attack at max dynamic pressure broke the stack.' : CALLOUT.abort ?? null,
      aborted: true,
      yawRad,
      qPeak,
      fairingGone,
      boosterGone,
      pitchRad: motion.pitchRad,
      pitchRate: motion.pitchRate,
      aoaRad: motion.aoaRad,
      accelMps2: motion.accelMps2,
      twr,
      note,
    }
  }

  const moved = advance(state.phase, milestone)
  return {
    ...state,
    tSec: state.tSec + dt,
    altitudeM: altitude,
    downrangeM: downrange,
    velocityMps: velocity,
    flightPathRad,
    propellantKg: nextProp,
    throttle,
    qPa: nextAir.q,
    massKg: (boosterGone ? UPPER.dryKg : BOOSTER.dryKg) + payload + nextProp,
    mach: nextAir.mach,
    cl: coeffs.cl,
    cd: coeffs.cd,
    phase: moved.phase,
    callout: moved.callout,
    yawRad,
    qPeak,
    fairingGone,
    boosterGone,
    pitchRad: motion.pitchRad,
    pitchRate: motion.pitchRate,
    aoaRad: motion.aoaRad,
    accelMps2: motion.accelMps2,
    twr,
    note,
  }
}

export function stepAscent(state: AscentState, input: AscentInput, dt: number, payloadKg: number): AscentState {
  const step = Number.isFinite(dt) ? dt : 0
  let left = clamp(step, 0, 2)
  let next: AscentState = { ...state, callout: null }
  while (left > 1e-8) {
    const slice = Math.min(0.05, left)
    const piece = integrate(next, input, slice, payloadKg)
    next = piece.callout ? piece : { ...piece, callout: next.callout }
    left -= slice
    if (next.aborted || next.phase === 'orbit') break
  }
  return next
}
