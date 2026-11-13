import { G0, MU_EARTH, MU_SUN } from './constants'
import { propellantForDeltaV } from './propulsion'
import { transferState } from './transfer'

export interface NodeAxes {
  prograde: number
  radial: number
  normal: number
}

export interface OrbitElements {
  smaM: number
  ecc: number
  incRad: number
  apoM: number
  periM: number
  periodSec: number
  speedMps: number
  bound: boolean
}

/**
 * Keplerian elements from a state vector about one body.
 * The cruise itself stays a patched conic. This is not an n-body integration.
 * A normal component is an added delta-v, so it changes both inclination and energy.
 */
export function stateVector(
  mu: number,
  radiusM: number,
  tangentialMps: number,
  radialMps: number,
  normalMps: number,
  incRad = 0,
): OrbitElements | null {
  if (!(mu > 0) || !(radiusM > 0)) return null
  const speed = Math.hypot(tangentialMps, radialMps, normalMps)
  if (!(speed > 0)) return null
  const energy = (speed * speed) / 2 - mu / radiusM
  const h = radiusM * Math.hypot(tangentialMps, normalMps)
  const inc = incRad + Math.atan2(normalMps, Math.hypot(tangentialMps, radialMps) || 1)
  if (energy >= -1e-6) {
    return {
      smaM: Number.POSITIVE_INFINITY,
      ecc: 1,
      incRad: inc,
      apoM: Number.POSITIVE_INFINITY,
      periM: Math.max(0, radiusM * 0.5),
      periodSec: Number.POSITIVE_INFINITY,
      speedMps: speed,
      bound: false,
    }
  }
  const sma = -mu / (2 * energy)
  const eSq = 1 + (2 * energy * h * h) / (mu * mu)
  const ecc = Math.sqrt(Math.max(0, eSq))
  return {
    smaM: sma,
    ecc,
    incRad: inc,
    apoM: sma * (1 + ecc),
    periM: Math.max(0, sma * (1 - ecc)),
    periodSec: 2 * Math.PI * Math.sqrt((sma * sma * sma) / mu),
    speedMps: speed,
    bound: true,
  }
}

export function applyNode(
  mu: number,
  radiusM: number,
  tangentialMps: number,
  radialMps: number,
  incRad: number,
  node: NodeAxes,
): OrbitElements | null {
  return stateVector(mu, radiusM, tangentialMps + node.prograde, radialMps + node.radial, node.normal, incRad)
}

/** Seconds of constant thrust that produce `dvMps` from the rocket equation. */
export function burnSeconds(ispS: number, thrustN: number, massKg: number, dvMps: number): number | null {
  if (!(ispS > 0) || !(thrustN > 0) || !(massKg > 0) || !Number.isFinite(dvMps) || dvMps < 0) return null
  if (dvMps === 0) return 0
  const propellant = propellantForDeltaV(ispS, massKg, dvMps)
  if (propellant === null || propellant >= massKg) return null
  const mdot = thrustN / (ispS * G0)
  if (!(mdot > 0)) return null
  return propellant / mdot
}

export function nodeMagnitude(node: NodeAxes): number {
  return Math.hypot(node.prograde, node.radial, node.normal)
}

function radiusAlong(mu: number, sma: number, speed: number): number {
  if (!(sma > 0) || !(speed > 0) || !(mu > 0)) return Math.max(sma, 1)
  const denom = (speed * speed) / mu + 1 / sma
  if (!(denom > 0)) return sma
  return 2 / denom
}

/** Current and post-burn elements on the patched-conic cruise. Inclination starts at zero: the transfer is coplanar. */
export function cruiseOrbit(
  missionId: string,
  destAu: number,
  fraction: number,
  tSec: number,
  node: NodeAxes,
): { now: OrbitElements; predicted: OrbitElements } | null {
  const track = transferState(missionId, destAu, fraction, tSec)
  const mu = missionId === 'lunar' ? MU_EARTH : MU_SUN
  const sma = (track.apoM + track.periM) / 2
  const radius = radiusAlong(mu, sma, track.speed)
  const now = stateVector(mu, radius, track.horizontal, track.radial, 0, 0)
  const predicted = applyNode(mu, radius, track.horizontal, track.radial, 0, node)
  if (!now || !predicted) return null
  return { now, predicted }
}
