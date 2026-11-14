import { CATALOG } from '../domain/catalog'

export const NIM_MODEL = 'meta/llama-3.3-70b-instruct'
const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'

const IDS = CATALOG.map((spec) => spec.id).join(', ')

export function nimSystemPrompt(): string {
  return [
    'You are the hangar engineer in AeroAestro, an educational NASA Space Apps mission-design game. Educational limits, not NASA specifications.',
    'Mass, delta-v, power, link, heat, and cost are already computed by the game. Do not invent those numbers. Explain the holds using the figures you were given.',
    'Suggest only catalog part ids from this list:',
    IDS,
    'Reply with JSON only, no markdown:',
    '{"brief":"2-4 sentences a cadet can follow","steps":["do this","then this"],"add":["catalog-id"],"name":null}',
    'Do not use NASA logos, flags, or fake NASA mission identifiers. Do not claim the numbers came from NASA flight hardware.',
  ].join('\n')
}

export async function completeNim(apiKey: string, note: unknown, ask: string): Promise<{ brief: string; steps: string[]; add: string[]; name: string | null }> {
  const response = await fetch(NIM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: NIM_MODEL,
      messages: [
        { role: 'system', content: nimSystemPrompt() },
        { role: 'user', content: `${typeof ask === 'string' && ask.trim() ? ask.trim() : 'Explain the holds and what to fit next.'}\n\nCRAFT:\n${JSON.stringify(note)}` },
      ],
      temperature: 0.25,
      top_p: 0.7,
      max_tokens: 700,
      stream: false,
    }),
  })
  const raw = await response.text()
  if (!response.ok) {
    throw new Error(cutError(raw, response.status))
  }
  const payload = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
  const text = payload.choices?.[0]?.message?.content ?? ''
  return parseAdvice(text)
}

function parseAdvice(text: string): { brief: string; steps: string[]; add: string[]; name: string | null } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  const slice = start >= 0 && end > start ? text.slice(start, end + 1) : ''
  let parsed: { brief?: unknown; steps?: unknown; add?: unknown; name?: unknown } = {}
  try {
    parsed = JSON.parse(slice || '{}') as typeof parsed
  } catch {
    parsed = { brief: text.replace(/\s+/g, ' ').trim().slice(0, 800) }
  }
  const brief = typeof parsed.brief === 'string' && parsed.brief.trim()
    ? parsed.brief.trim()
    : 'The hangar engineer had nothing to add. Check the holds on the ledger.'
  const steps = Array.isArray(parsed.steps) ? parsed.steps.filter((line): line is string => typeof line === 'string').slice(0, 6) : []
  const allowed = new Set(CATALOG.map((spec) => spec.id))
  const add = Array.isArray(parsed.add)
    ? parsed.add.filter((id): id is string => typeof id === 'string' && allowed.has(id)).slice(0, 8)
    : []
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 28) : null
  return { brief, steps, add, name }
}

function cutError(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; error?: { message?: string }; message?: string }
    const detail = parsed.detail ?? parsed.error?.message ?? parsed.message
    if (typeof detail === 'string' && detail.trim()) return detail.trim().slice(0, 240)
  } catch {
    /* keep status */
  }
  return `NVIDIA NIM ${status}`
}
