export const FLIGHT_ACTIONS = [
  'pitchUp',
  'pitchDown',
  'yawLeft',
  'yawRight',
  'rollLeft',
  'rollRight',
  'throttleUp',
  'throttleDown',
  'engine',
  'stable',
  'level',
  'rewind',
  'pause',
  'cameras',
  'hud',
  'proceed',
] as const

export type FlightAction = (typeof FLIGHT_ACTIONS)[number]

export type FlightBinds = Record<FlightAction, string>

export const DEFAULT_BINDS: FlightBinds = {
  pitchUp: 'arrowup',
  pitchDown: 'arrowdown',
  yawLeft: 'arrowleft',
  yawRight: 'arrowright',
  rollLeft: 'z',
  rollRight: 'c',
  throttleUp: 'shift',
  throttleDown: 'control',
  engine: 'x',
  stable: 't',
  level: 'l',
  rewind: 'r',
  pause: 'p',
  cameras: 'm',
  hud: 'tab',
  proceed: ' ',
}

const KEY = 'mission-control-binds-v2'

export function loadBinds(): FlightBinds {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_BINDS }
    const parsed = JSON.parse(raw) as Partial<FlightBinds>
    const next = { ...DEFAULT_BINDS }
    for (const action of FLIGHT_ACTIONS) {
      const value = parsed[action]
      if (typeof value === 'string' && value.length > 0 && value.length < 20) next[action] = value
    }
    if (next.rewind === next.level) next.level = 'l'
    return next
  } catch {
    return { ...DEFAULT_BINDS }
  }
}

export function saveBinds(binds: FlightBinds): void {
  localStorage.setItem(KEY, JSON.stringify(binds))
}

export function keyName(event: KeyboardEvent): string {
  if (event.key === ' ') return ' '
  if (event.key === 'Tab') return 'tab'
  return event.key.toLowerCase()
}

export function keyLabel(name: string): string {
  if (name === ' ') return '⎵'
  if (name === 'tab') return '⇥'
  if (name === 'shift') return '⇧'
  if (name === 'control') return '⌃'
  return name.toUpperCase()
}
