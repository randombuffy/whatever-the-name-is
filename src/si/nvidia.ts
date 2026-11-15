/** NVIDIA NIM via /api/nim. The key never leaves the server. Physics stay in src/domain. */

export const NIM_MODELS = [
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
] as const

export const NIM_MODEL = NIM_MODELS[0]
export const NIM_LABEL = 'SI-generated · NVIDIA NIM · Nemotron'

export interface NimAdvice {
  brief: string
  steps: string[]
  add: string[]
  name: string | null
  model: string
}

export interface NimCraftNote {
  mission: string
  destination: string
  durationDays: number
  maxMassKg: number
  budgetUsd: number
  requiredDvMps: number
  massKg: number
  dvMps: number
  powerW: number
  loadW: number
  linkDb: number
  costUsd: number
  parts: string[]
  holds: string[]
  site?: string
  window?: number
}

export async function askNim(note: NimCraftNote, ask: string): Promise<NimAdvice> {
  const response = await fetch('/api/nim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, ask }),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string; advice?: NimAdvice; model?: string }
  if (!response.ok) throw new Error(payload.error || `NVIDIA NIM ${response.status}`)
  if (!payload.advice?.brief) throw new Error('NVIDIA NIM returned an empty answer.')
  return {
    brief: payload.advice.brief,
    steps: Array.isArray(payload.advice.steps) ? payload.advice.steps.filter((line) => typeof line === 'string').slice(0, 6) : [],
    add: Array.isArray(payload.advice.add) ? payload.advice.add.filter((id) => typeof id === 'string').slice(0, 8) : [],
    name: typeof payload.advice.name === 'string' && payload.advice.name.trim() ? payload.advice.name.trim().slice(0, 28) : null,
    model: payload.model || payload.advice.model || NIM_MODEL,
  }
}

export function modelLabel(model: string): string {
  const id = model.split('/')[1] ?? model
  return `SI-generated · NVIDIA NIM · ${id}`
}
