import { CATALOG } from '../domain/catalog'

export const NIM_MODELS = [
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
] as const

export const NIM_MODEL = NIM_MODELS[0]
const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const RETRY = new Set([404, 408, 409, 410, 422, 429, 500, 502, 503, 529])

const IDS = CATALOG.map((spec) => spec.id).join(', ')

export function nimSystemPrompt(): string {
  return [
    'You are the hangar engineer in Martian Cats, an educational NASA Space Apps mission-design game. Educational limits, not NASA specifications.',
    'Mass, delta-v, power, link, heat, and cost are already computed by the game. Do not invent those numbers. Explain the holds using the figures you were given.',
    'Suggest only catalog part ids from this list:',
    IDS,
    'Reply with JSON only, no markdown:',
    '{"brief":"2-4 sentences a cadet can follow","steps":["do this","then this"],"add":["catalog-id"],"name":null}',
    'Do not use NASA logos, flags, or fake NASA mission identifiers. Do not claim the numbers came from NASA flight hardware.',
  ].join('\n')
}

export async function completeNim(
  apiKey: string,
  note: unknown,
  ask: string,
): Promise<{ brief: string; steps: string[]; add: string[]; name: string | null; model: string }> {
  const prompt = typeof ask === 'string' && ask.trim() ? ask.trim() : 'Explain the holds and what to fit next.'
  let last = 'NVIDIA NIM did not answer.'
  for (const model of NIM_MODELS) {
    try {
      const { status, text, error } = await invokeNim(apiKey, model, note, prompt)
      if (status === 401 || status === 403) {
        throw new Error('NVIDIA_API_KEY was rejected. Put a current key in .env and in the Vercel NVIDIA_API_KEY env var.')
      }
      if (!status || status >= 400) {
        last = error || `NVIDIA NIM ${status || 'failed'} on ${shortName(model)}`
        if (RETRY.has(status)) continue
        throw new Error(last)
      }
      const advice = parseAdvice(text)
      return { ...advice, model }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('NVIDIA_API_KEY was rejected')) throw error
      last = error instanceof Error ? error.message : `NVIDIA NIM failed on ${shortName(model)}`
    }
  }
  throw new Error(last)
}

async function invokeNim(apiKey: string, model: string, note: unknown, ask: string): Promise<{ status: number; text: string; error: string }> {
  const response = await fetch(NIM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: nimSystemPrompt() },
        { role: 'user', content: `${ask}\n\nCRAFT:\n${JSON.stringify(note)}` },
      ],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 900,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: 'none',
    }),
  })
  const raw = await response.text()
  if (!response.ok) return { status: response.status, text: '', error: cutError(raw, response.status, model) }
  let payload: { choices?: { message?: { content?: unknown; reasoning_content?: unknown } }[] }
  try {
    payload = JSON.parse(raw) as typeof payload
  } catch {
    return { status: 502, text: '', error: `${shortName(model)} sent a broken payload.` }
  }
  const text = messageText(payload.choices?.[0]?.message)
  if (!text.trim()) return { status: 502, text: '', error: `${shortName(model)} returned an empty answer.` }
  return { status: response.status, text, error: '' }
}

function messageText(message: { content?: unknown; reasoning_content?: unknown } | undefined): string {
  if (!message) return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part === 'object' && 'text' in part ? String((part as { text?: unknown }).text ?? '') : '')).join('')
  }
  return typeof message.reasoning_content === 'string' ? message.reasoning_content : ''
}

export function parseAdvice(text: string): { brief: string; steps: string[]; add: string[]; name: string | null } {
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

function shortName(model: string): string {
  return model.split('/')[1] ?? model
}

function cutError(raw: string, status: number, model: string): string {
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; title?: unknown; error?: { message?: string }; message?: string }
    const detail = parsed.detail ?? parsed.error?.message ?? parsed.message ?? parsed.title
    if (typeof detail === 'string' && detail.trim()) return `${shortName(model)}: ${detail.trim().slice(0, 200)}`
  } catch {
    /* keep status */
  }
  return `${shortName(model)}: NVIDIA NIM ${status}`
}
