import { AU_M, MARS_ORBIT_AU, MOON_ORBIT_M, MU_EARTH, MU_SUN, R_EARTH_M, R_MARS_M, R_MOON_M } from './constants'

const C = 299_792_458

export interface Vec {
  x: number
  y: number
  z: number
}

export interface TransferState {
  earth: Vec
  dest: Vec
  ship: Vec
  speed: number
  radial: number
  horizontal: number
  altitudeM: number
  lightSec: number
  apoM: number
  periM: number
  qPa: number
}

/** Scene units per metre so one astronomical unit is 42 units across the map. */
export const SYSTEM_SCALE = 42 / AU_M

function vec(x: number, y: number, z: number): Vec {
  return { x, y, z }
}

function add(a: Vec, b: Vec): Vec {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z)
}

function sub(a: Vec, b: Vec): Vec {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z)
}

function mul(a: Vec, s: number): Vec {
  return vec(a.x * s, a.y * s, a.z * s)
}

function length(a: Vec): number {
  return Math.hypot(a.x, a.y, a.z)
}

function unit(a: Vec): Vec {
  const span = length(a) || 1
  return mul(a, 1 / span)
}

function mix(a: Vec, b: Vec, t: number): Vec {
  return add(mul(a, 1 - t), mul(b, t))
}

function polar(radius: number, angle: number): Vec {
  return vec(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
}

/** Hohmann ellipse. Fraction 0 is periapsis, 1 is apoapsis. Radial and tangential speeds come from the orbit equation. */
function hohmann(mu: number, r1: number, r2: number, fraction: number) {
  const peri = Math.min(r1, r2)
  const apo = Math.max(r1, r2)
  const a = (peri + apo) / 2
  const e = (apo - peri) / (apo + peri)
  const theta = Math.PI * Math.min(1, Math.max(0, fraction))
  const h = Math.sqrt(Math.max(mu * a * (1 - e * e), 1))
  const radial = (mu / h) * e * Math.sin(theta)
  const horizontal = (mu / h) * (1 + e * Math.cos(theta))
  return { radial, horizontal, speed: Math.hypot(radial, horizontal), apo, peri }
}

export function transferState(missionId: string, destAu: number, fraction: number, tSec: number): TransferState {
  const f = Math.min(1, Math.max(0, fraction))
  const year = 365.25 * 86400
  const earthAngle = (tSec / year) * Math.PI * 2
  const earth = polar(AU_M, earthAngle)
  const lunar = missionId === 'lunar'
  const au = destAu > 0.2 ? destAu : missionId === 'mars' ? MARS_ORBIT_AU : 1
  const destRadius = AU_M * au
  const destPeriod = year * Math.pow(au, 1.5)
  const destAngle = earthAngle + 0.9 + (tSec / destPeriod) * Math.PI * 2
  const moonAngle = (tSec / (27.321661 * 86400)) * Math.PI * 2
  const dest = lunar ? add(earth, polar(MOON_ORBIT_M, moonAngle)) : polar(destRadius, destAngle)
  const depart = add(earth, mul(unit(sub(dest, earth)), R_EARTH_M + 300_000))
  const bodyR = lunar ? R_MOON_M : missionId === 'mars' || missionId === 'custom' ? R_MARS_M : R_EARTH_M * 0.35
  const arrive = add(dest, mul(unit(sub(earth, dest)), bodyR + 400_000))
  const ship = mix(depart, arrive, f)
  const rates = lunar
    ? hohmann(MU_EARTH, R_EARTH_M + 300_000, MOON_ORBIT_M, f)
    : hohmann(MU_SUN, AU_M, destRadius, f)
  const rangeEarth = length(sub(ship, earth))
  const rangeDest = length(sub(ship, dest))
  const nearEarth = rangeEarth <= rangeDest
  const altitudeM = nearEarth ? Math.max(0, rangeEarth - R_EARTH_M) : Math.max(0, rangeDest - bodyR)
  const air = altitudeM < 140_000 && (nearEarth || missionId === 'mars' || missionId === 'custom')
  const rho = air ? (nearEarth ? 1.225 : 0.02) * Math.exp(-altitudeM / (nearEarth ? 8500 : 11_100)) : 0
  return {
    earth,
    dest,
    ship,
    speed: rates.speed,
    radial: rates.radial,
    horizontal: rates.horizontal,
    altitudeM,
    lightSec: rangeEarth / C,
    apoM: rates.apo,
    periM: rates.peri,
    qPa: 0.5 * rho * rates.speed * rates.speed,
  }
}

export function sceneOf(point: Vec): Vec {
  return mul(point, SYSTEM_SCALE)
}
