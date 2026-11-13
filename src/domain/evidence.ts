/** Surface findings. Quality comes from the fitted instrument, the sol, and how the picture was taken. Values are this educational model, not a mission catalogue. */

export type EvidenceKind = 'image' | 'core' | 'weather' | 'radar' | 'spectrum'

export interface Observation {
  id: string
  kind: EvidenceKind
  name: string
  x: number
  z: number
  instrument: string
  measurement: string
  quality: number
  confidence: number
  sol: number
  objectiveId: string
  bytes: number
  points: number
  sent: boolean
}

export interface ObserveInput {
  id: string
  kind: EvidenceKind
  name: string
  x: number
  z: number
  sol: number
  objectiveId: string
  instruments: string[]
  basePoints: number
  dust: number
  fault: boolean
  near: boolean
  fov: number
}

const BYTES: Record<EvidenceKind, number> = {
  image: 8_000_000,
  core: 4_000_000,
  weather: 200_000,
  radar: 12_000_000,
  spectrum: 3_000_000,
}

export function kindFor(objectiveId: string, instruments: string[]): EvidenceKind {
  if (objectiveId === 'atmosphere' && instruments.includes('weather')) return 'weather'
  if ((objectiveId === 'water' || objectiveId === 'habitation') && instruments.includes('radar')) return 'radar'
  if (instruments.includes('spectrometer') || instruments.includes('rock') || instruments.includes('soil')) return 'spectrum'
  if (instruments.includes('drill')) return 'core'
  return 'spectrum'
}

export function toolFor(kind: EvidenceKind, instruments: string[]): string {
  if (kind === 'image') return instruments.includes('camera') ? 'camera' : 'eye'
  if (kind === 'weather') return instruments.includes('weather') ? 'weather' : 'eye'
  if (kind === 'radar') return instruments.includes('radar') ? 'radar' : 'eye'
  if (kind === 'core') return instruments.includes('drill') ? 'drill' : 'eye'
  if (instruments.includes('spectrometer')) return 'spectrometer'
  if (instruments.includes('rock')) return 'rock'
  if (instruments.includes('soil')) return 'soil'
  return 'eye'
}

export function observe(input: ObserveInput): Observation {
  const tool = toolFor(input.kind, input.instruments)
  let quality = tool === 'eye' ? 0.28 : 0.9
  if (input.kind === 'image') {
    quality = tool === 'camera' ? 0.86 : 0.3
    quality *= input.near ? 1 : input.fov < 40 ? 0.74 : 0.42
  } else if (input.near) quality *= 1
  else quality *= 0.72
  quality *= 1 - Math.max(0, Math.min(1, input.dust)) * 0.55
  if (input.fault && input.kind !== 'image') quality *= 0.42
  quality = Math.max(0.05, Math.min(1, quality))
  const confidence = Math.max(0.05, Math.min(1, quality * (input.near ? 0.92 : 0.62)))
  return {
    id: input.id,
    kind: input.kind,
    name: input.name,
    x: input.x,
    z: input.z,
    instrument: tool,
    measurement: `${tool} at ${input.name}, sol ${input.sol}. Model quality ${(quality * 100).toFixed(0)}%.`,
    quality,
    confidence,
    sol: input.sol,
    objectiveId: input.objectiveId,
    bytes: BYTES[input.kind],
    points: input.basePoints,
    sent: false,
  }
}

/** Bytes that fit in one contact. A closed window returns nothing. */
export function contactBytes(uplinkBps: number, comms: boolean): number {
  if (!comms || uplinkBps <= 0) return 0
  return uplinkBps * 20 * 60
}

export function transmitCost(bytes: number): number {
  return 6 + bytes / 2_000_000
}

export type SendReason = 'sent' | 'empty' | 'window' | 'power'

/** Sends the chosen unsent finding if the contact and the battery can take it. */
export function sendChosen(notes: Observation[], index: number, roomBytes: number, energy: number): { notes: Observation[]; energy: number; reason: SendReason } {
  const held = notes.filter((item) => !item.sent)
  if (held.length === 0) return { notes, energy, reason: 'empty' }
  const chosen = held[Math.abs(index) % held.length]
  if (roomBytes < chosen.bytes) return { notes, energy, reason: 'window' }
  const cost = transmitCost(chosen.bytes)
  if (energy < cost) return { notes, energy, reason: 'power' }
  return {
    notes: notes.map((item) => (item.id === chosen.id ? { ...item, sent: true } : item)),
    energy: energy - cost,
    reason: 'sent',
  }
}

export function returnedScience(notes: Observation[]): number {
  return notes.filter((item) => item.sent).reduce((sum, item) => sum + item.points * item.quality, 0)
}

export function returnedBits(notes: Observation[]): number {
  return notes.filter((item) => item.sent).reduce((sum, item) => sum + item.bytes * 8, 0)
}
