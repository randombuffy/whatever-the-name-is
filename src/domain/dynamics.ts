import { G0, MU_EARTH, R_EARTH_M } from './constants'

/**
 * Point-mass flight equations used by ascent and entry.
 * Thrust, mass flow, drag, lift and gravity are integrated. This is not an n-body model.
 *
 * F = ṁ ve = Isp ṁ g0
 * q = ½ ρ v²
 * ρ = ρ0 exp(−h / H)
 */

export function massFlowKgS(thrustN: number, ispS: number): number {
  if (!(thrustN > 0) || !(ispS > 0)) return 0
  return thrustN / (ispS * G0)
}

export function dynamicPressure(density: number, speedMps: number): number {
  return 0.5 * Math.max(0, density) * speedMps * speedMps
}

export function exponentialDensity(surfaceKgM3: number, altitudeM: number, scaleHeightM: number): number {
  if (!(surfaceKgM3 > 0) || !(scaleHeightM > 0)) return 0
  return surfaceKgM3 * Math.exp(-Math.max(0, altitudeM) / scaleHeightM)
}

export interface PlanarState {
  velocityMps: number
  flightPathRad: number
  pitchRad: number
  pitchRate: number
}

export interface PlanarDeriv {
  velocityMps: number
  flightPathRad: number
  pitchRad: number
  pitchRate: number
  aoaRad: number
  accelMps2: number
  load: number
}

/**
 * Planar point mass.
 * v̇ = (T cos α − D) / m − g sin γ
 * v γ̇ = (T sin α + L) / m − g cos γ
 * I θ̈ = T ℓ sin δ − q A c α
 * α is the angle between the nose and the velocity.
 */
export function stepPlanar(
  state: PlanarState,
  massKg: number,
  thrustN: number,
  dragN: number,
  liftPerRad: number,
  gimbalRad: number,
  leverM: number,
  inertia: number,
  gravity: number,
  dt: number,
  liftN?: number,
): PlanarDeriv {
  const mass = Math.max(1, massKg)
  const aoa = state.pitchRad - state.flightPathRad
  const lift = liftN ?? liftPerRad * aoa
  const along = (thrustN * Math.cos(aoa) - dragN) / mass - gravity * Math.sin(state.flightPathRad)
  const normal = (thrustN * Math.sin(aoa) + lift) / mass - gravity * Math.cos(state.flightPathRad)
  let velocity = state.velocityMps + along * dt
  if (velocity < 0) velocity = 0
  const gammaDot = velocity > 25 ? normal / velocity : 0
  const flightPath = clamp(state.flightPathRad + gammaDot * dt, 0.02, Math.PI / 2)
  const torque = thrustN * leverM * Math.sin(gimbalRad) - liftPerRad * 0.35 * aoa
  const inertiaSafe = Math.max(inertia, 1)
  let pitchRate = state.pitchRate + (torque / inertiaSafe) * dt
  pitchRate = clamp(pitchRate, -1.1, 1.1)
  const pitch = state.pitchRad + pitchRate * dt
  const accel = along
  const load = Math.abs(normal) / Math.max(gravity, 0.1)
  return { velocityMps: velocity, flightPathRad: flightPath, pitchRad: pitch, pitchRate, aoaRad: pitch - flightPath, accelMps2: accel, load }
}

/** Specific angular momentum and energy give apoapsis and periapsis for a coast. */
export function coastApsis(mu: number, radiusM: number, speedMps: number, flightPathFromHorizonRad: number): { apoM: number; periM: number; periodSec: number } | null {
  if (!(mu > 0) || !(radiusM > 0) || !(speedMps > 0)) return null
  const radial = speedMps * Math.sin(flightPathFromHorizonRad)
  const tangential = speedMps * Math.cos(flightPathFromHorizonRad)
  const energy = (speedMps * speedMps) / 2 - mu / radiusM
  const h = radiusM * tangential
  if (Math.abs(energy) < 1e-6) return null
  if (energy >= 0) {
    return { apoM: Number.POSITIVE_INFINITY, periM: Math.max(0, radiusM - Math.abs(radial)), periodSec: Number.POSITIVE_INFINITY }
  }
  const a = -mu / (2 * energy)
  const eSq = 1 + (2 * energy * h * h) / (mu * mu)
  const e = Math.sqrt(Math.max(0, eSq))
  return {
    apoM: a * (1 + e),
    periM: Math.max(0, a * (1 - e)),
    periodSec: 2 * Math.PI * Math.sqrt((a * a * a) / mu),
  }
}

export function earthCoast(altitudeM: number, speedMps: number, flightPathFromHorizonRad: number) {
  return coastApsis(MU_EARTH, R_EARTH_M + Math.max(0, altitudeM), speedMps, flightPathFromHorizonRad)
}

export interface EntryInput {
  massKg: number
  velocityDownMps: number
  altitudeM: number
  gravity: number
  surfaceRho: number
  scaleHeightM: number
  bodyCdA: number
  chuteCdA: number
  chuteOpen: boolean
  thrustN: number
  throttle: number
  shield: boolean
}

export interface EntryDeriv {
  velocityDownMps: number
  accelMps2: number
  dragN: number
  rho: number
  heatWm2: number
}

/**
 * Vertical entry.
 * m v̇ = m g − ½ Cd A ρ v² − T
 * Heat rate follows a Sutton–Graves shape, q̇ ∝ √ρ v³, and a shield divides it.
 */
export function stepEntry(input: EntryInput, dt: number): EntryDeriv {
  const mass = Math.max(1, input.massKg)
  const rho = exponentialDensity(input.surfaceRho, input.altitudeM, input.scaleHeightM)
  const speed = Math.max(0, input.velocityDownMps)
  const cda = input.bodyCdA + (input.chuteOpen ? input.chuteCdA : 0)
  const drag = dynamicPressure(rho, speed) * cda
  const thrust = Math.max(0, input.thrustN) * clamp(input.throttle, 0, 1)
  const accel = input.gravity - (drag + thrust) / mass
  const heat = 1.83e-4 * Math.sqrt(Math.max(rho, 0) / 0.5) * speed * speed * speed
  return {
    velocityDownMps: Math.max(-2, speed + accel * dt),
    accelMps2: accel,
    dragN: drag,
    rho,
    heatWm2: input.shield ? heat / 8 : heat,
  }
}

export function landingThrustN(parts: { enabled: boolean; specId: string; thrustN: number; propellant: string; feedsMainEngine: boolean }[]): number {
  if (parts.some((part) => part.enabled && part.specId === 'descent')) return 14_000
  let best = 0
  for (const part of parts) {
    if (!part.enabled || !part.feedsMainEngine || part.propellant !== 'chemical') continue
    if (part.thrustN > best) best = part.thrustN
  }
  return best * 12
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
