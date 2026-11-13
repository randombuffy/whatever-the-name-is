import { AU_M, MU_EARTH, MU_MARS, MU_MOON, MU_SUN, R_EARTH_M, R_MARS_M, R_MOON_M, MOON_ORBIT_M } from './constants'

export interface Hohmann {
  aM: number
  dv1Mps: number
  dv2Mps: number
  tofSec: number
  vInfDepartMps: number
  vInfArriveMps: number
}

/**
 * Circular coplanar Hohmann transfer.
 * Valid for two circular orbits around the same body. Patched-conic departures
 * use the resulting v-infinity with a separate finite-body burn.
 * This is not an ephemeris and ignores inclination, eccentricity and phasing.
 */
export function hohmann(mu: number, r1: number, r2: number): Hohmann | null {
  if (!(mu > 0) || !(r1 > 0) || !(r2 > 0)) return null
  const a = (r1 + r2) / 2
  const v1 = Math.sqrt(mu / r1)
  const v2 = Math.sqrt(mu / r2)
  const vp = Math.sqrt(mu * (2 / r1 - 1 / a))
  const va = Math.sqrt(mu * (2 / r2 - 1 / a))
  return {
    aM: a,
    dv1Mps: vp - v1,
    dv2Mps: v2 - va,
    tofSec: Math.PI * Math.sqrt((a * a * a) / mu),
    vInfDepartMps: Math.abs(vp - v1),
    vInfArriveMps: Math.abs(v2 - va),
  }
}

export function circularVelocity(mu: number, radiusM: number): number | null {
  if (!(mu > 0) || !(radiusM > 0)) return null
  return Math.sqrt(mu / radiusM)
}

export function escapeVelocity(mu: number, radiusM: number): number | null {
  if (!(mu > 0) || !(radiusM > 0)) return null
  return Math.sqrt((2 * mu) / radiusM)
}

export function orbitalPeriodSec(mu: number, radiusM: number): number | null {
  if (!(mu > 0) || !(radiusM > 0)) return null
  return 2 * Math.PI * Math.sqrt((radiusM ** 3) / mu)
}

/** Burn from a circular parking orbit that leaves with a given excess speed. */
export function departureFromCircular(mu: number, radiusM: number, vInfMps: number): number | null {
  if (!(mu > 0) || !(radiusM > 0) || !Number.isFinite(vInfMps) || vInfMps < 0) return null
  const vCirc = Math.sqrt(mu / radiusM)
  const vBurn = Math.sqrt(vInfMps * vInfMps + (2 * mu) / radiusM)
  return vBurn - vCirc
}

/** Burn that captures a hyperbolic arrival into a circular orbit. */
export function captureToCircular(mu: number, radiusM: number, vInfMps: number): number | null {
  return departureFromCircular(mu, radiusM, vInfMps)
}

export function leoRadius(altitudeM = 300_000): number {
  return R_EARTH_M + altitudeM
}

/**
 * Patched-conic Earth to Moon.
 * Earth-centered Hohmann from a 300 km parking orbit to lunar distance,
 * then a lunar capture into a 100 km orbit about the Moon.
 * The Moon is treated as moving on a circular Earth orbit. Three-body motion,
 * Earth obliquity and launch-site plane change are omitted.
 */
export function lunarTransfer(): { tliMps: number; loiMps: number; tofSec: number; vInfMoonMps: number } | null {
  const rLeo = leoRadius()
  const transfer = hohmann(MU_EARTH, rLeo, MOON_ORBIT_M)
  if (!transfer) return null
  const vMoon = circularVelocity(MU_EARTH, MOON_ORBIT_M)
  if (vMoon === null) return null
  const vApo = Math.sqrt(MU_EARTH * (2 / MOON_ORBIT_M - 1 / transfer.aM))
  const vInf = Math.abs(vMoon - vApo)
  const loi = captureToCircular(MU_MOON, R_MOON_M + 100_000, vInf)
  if (loi === null) return null
  return { tliMps: transfer.dv1Mps, loiMps: loi, tofSec: transfer.tofSec, vInfMoonMps: vInf }
}

/**
 * Patched-conic Earth to Mars.
 * Heliocentric Hohmann between circular orbits, then a departure from 300 km LEO
 * and a capture into a 400 km Mars orbit. Phasing and launch windows are descriptive only.
 */
export function marsTransfer(): { departureMps: number; captureMps: number; tofSec: number; vInfArrive: number } | null {
  const r1 = AU_M
  const r2 = AU_M * 1.5237
  const helio = hohmann(MU_SUN, r1, r2)
  if (!helio) return null
  const depart = departureFromCircular(MU_EARTH, leoRadius(), helio.vInfDepartMps)
  const capture = captureToCircular(MU_MARS, R_MARS_M + 400_000, helio.vInfArriveMps)
  if (depart === null || capture === null) return null
  return { departureMps: depart, captureMps: capture, tofSec: helio.tofSec, vInfArrive: helio.vInfArriveMps }
}

/** Heliocentric Hohmann to a circular orbit at `destAu`, departed from LEO. Capture is supplied by the scenario. */
export function solarTransfer(destAu: number): { departureMps: number; vInfArrive: number; tofSec: number } | null {
  if (!(destAu > 0)) return null
  const helio = hohmann(MU_SUN, AU_M, AU_M * destAu)
  if (!helio) return null
  const depart = departureFromCircular(MU_EARTH, leoRadius(), helio.vInfDepartMps)
  if (depart === null) return null
  return { departureMps: depart, vInfArrive: helio.vInfArriveMps, tofSec: helio.tofSec }
}
