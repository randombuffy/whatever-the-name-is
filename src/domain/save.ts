import type { Observation } from './evidence'
import type { SimState } from './types'

export type SavedPhase = 'select' | 'brief' | 'design' | 'plan' | 'launch' | 'flight' | 'landing' | 'surface' | 'debrief' | 'credits' | 'pad'

export type CampPhase = 'landing' | 'habitat' | 'life' | 'power' | 'food' | 'survival' | 'report'

export interface CampSave {
  phase: CampPhase
  pieces: string[]
  sol: number
  air: number
  water: number
  food: number
  power: number
  storm: 'shelter' | 'clean' | null
}

export interface FieldSave {
  x: number
  z: number
  yaw: number
  speed: number
  footX: number
  footZ: number
  lookYaw: number
  sol: number
  energy: number
  oxygen: number
  boarded: boolean
  parked: boolean
  mode: 'drive' | 'eva' | 'scout'
  found: string[]
  notes: Observation[]
  camp?: CampSave
}

export interface DescentSave {
  altitude: number
  sink: number
  lateral: number
  pitch: number
  throttle: number
  heat: number
  chuteOpen: boolean
  chuteFailed: boolean
  offset: number
  fuelKg: number
  done: 'down' | 'hard' | 'crash' | null
}

const PHASES: SavedPhase[] = ['select', 'brief', 'design', 'plan', 'launch', 'flight', 'landing', 'surface', 'debrief', 'credits', 'pad']

/** The station is a visit. A reload returns to the pad with the same craft. */
export function campaignPhase(value: unknown, missionId: string | null): SavedPhase {
  if (value === 'station') return missionId ? 'pad' : 'select'
  if (!PHASES.includes(value as SavedPhase)) return 'select'
  const phase = value as SavedPhase
  if (!missionId && phase !== 'select' && phase !== 'credits') return 'select'
  return phase
}

export function simAlive(value: unknown): value is SimState {
  if (!value || typeof value !== 'object') return false
  const sim = value as SimState
  return typeof sim.tSec === 'number'
    && typeof sim.index === 'number'
    && Array.isArray(sim.script)
    && typeof sim.propellant?.chemical === 'number'
    && typeof sim.status === 'string'
}

function observation(value: unknown): value is Observation {
  if (!value || typeof value !== 'object') return false
  const item = value as Observation
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.bytes === 'number'
    && typeof item.points === 'number'
    && typeof item.sent === 'boolean'
    && typeof item.x === 'number'
    && typeof item.z === 'number'
}

export function fieldSave(value: unknown): FieldSave | null {
  if (!value || typeof value !== 'object') return null
  const field = value as FieldSave
  const mode = field.mode === 'drive' || field.mode === 'eva' || field.mode === 'scout' ? field.mode : null
  if (!mode) return null
  if (![field.x, field.z, field.yaw, field.speed, field.sol, field.energy].every((item) => typeof item === 'number' && Number.isFinite(item))) return null
  const notes = Array.isArray(field.notes) ? field.notes.filter(observation) : []
  const found = Array.isArray(field.found) ? field.found.filter((item) => typeof item === 'string') : []
  const phases: CampPhase[] = ['landing', 'habitat', 'life', 'power', 'food', 'survival', 'report']
  const rawCamp = (field as FieldSave).camp
  const camp = rawCamp && phases.includes(rawCamp.phase) && Array.isArray(rawCamp.pieces)
    ? {
      phase: rawCamp.phase,
      pieces: rawCamp.pieces.filter((item) => typeof item === 'string'),
      sol: typeof rawCamp.sol === 'number' ? rawCamp.sol : 0,
      air: typeof rawCamp.air === 'number' ? rawCamp.air : 92,
      water: typeof rawCamp.water === 'number' ? rawCamp.water : 80,
      food: typeof rawCamp.food === 'number' ? rawCamp.food : 64,
      power: typeof rawCamp.power === 'number' ? rawCamp.power : 48,
      storm: rawCamp.storm === 'shelter' || rawCamp.storm === 'clean' ? rawCamp.storm : null,
    }
    : undefined
  return {
    x: field.x,
    z: field.z,
    yaw: field.yaw,
    speed: field.speed,
    footX: typeof field.footX === 'number' ? field.footX : field.x,
    footZ: typeof field.footZ === 'number' ? field.footZ : field.z,
    lookYaw: typeof field.lookYaw === 'number' ? field.lookYaw : field.yaw,
    sol: field.sol,
    energy: field.energy,
    oxygen: typeof field.oxygen === 'number' ? field.oxygen : 100,
    boarded: Boolean(field.boarded),
    parked: Boolean(field.parked),
    mode,
    found,
    notes,
    camp,
  }
}

export function descentSave(value: unknown): DescentSave | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as DescentSave
  if (![entry.altitude, entry.sink, entry.lateral, entry.fuelKg, entry.heat].every((item) => typeof item === 'number' && Number.isFinite(item))) return null
  const done = entry.done === 'down' || entry.done === 'hard' || entry.done === 'crash' ? entry.done : null
  return {
    altitude: entry.altitude,
    sink: entry.sink,
    lateral: entry.lateral,
    pitch: typeof entry.pitch === 'number' ? entry.pitch : 0,
    throttle: typeof entry.throttle === 'number' ? entry.throttle : 0,
    heat: entry.heat,
    chuteOpen: Boolean(entry.chuteOpen),
    chuteFailed: Boolean(entry.chuteFailed),
    offset: typeof entry.offset === 'number' ? entry.offset : 0,
    fuelKg: entry.fuelKg,
    done,
  }
}
