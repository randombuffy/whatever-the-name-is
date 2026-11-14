/** Same-device crew of up to four. Each seat owns a slice of the mission trade-off. */

export type CrewRole = 'commander' | 'engineer' | 'scientist' | 'capcom'
export type CrewSize = 1 | 2 | 3 | 4

export interface CrewSeat {
  role: CrewRole
  name: string
  ready: boolean
}

export const CREW_ROLES: { id: CrewRole; title: string; duty: string; focus: string }[] = [
  { id: 'commander', title: 'Commander', duty: 'Objective, orbit, launch window, and go/no-go.', focus: 'plan' },
  { id: 'engineer', title: 'Engineer', duty: 'Bus, engines, tanks, mass, and power.', focus: 'design' },
  { id: 'scientist', title: 'Scientist', duty: 'Instruments, landing site, and science return.', focus: 'design' },
  { id: 'capcom', title: 'CAPCOM', duty: 'Link, data, budget, and in-flight anomalies.', focus: 'flight' },
]

export function defaultCrew(size: CrewSize): CrewSeat[] {
  const solo = size === 1
  return CREW_ROLES.slice(0, size).map((role, index) => ({
    role: role.id,
    name: solo ? 'Solo' : `Seat ${index + 1}`,
    ready: solo,
  }))
}

export function roleOf(id: CrewRole) {
  return CREW_ROLES.find((role) => role.id === id) ?? CREW_ROLES[0]
}

export function crewReady(seats: CrewSeat[]): boolean {
  return seats.length > 0 && seats.every((seat) => seat.ready)
}

export function parseCrewSize(value: unknown): CrewSize {
  const n = Number(value)
  if (n === 2 || n === 3 || n === 4) return n
  return 1
}

export function parseCrew(value: unknown, size: CrewSize): CrewSeat[] {
  const fallback = defaultCrew(size)
  if (!Array.isArray(value)) return fallback
  return fallback.map((seat, index) => {
    const raw = value[index] as Partial<CrewSeat> | undefined
    const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 24) : seat.name
    return { role: seat.role, name, ready: raw?.ready === true || size === 1 }
  })
}
