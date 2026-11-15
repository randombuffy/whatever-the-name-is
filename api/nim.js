export const config = { maxDuration: 60 }

const NIM_MODELS = [
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
]
const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const RETRY = new Set([404, 408, 409, 410, 422, 429, 500, 502, 503, 529])
const IDS = 'bus-12u, bus-small, bus-probe, bus-deep, frame, acs, cold-gas, monoprop, biprop-450, biprop-4k, ion, hall, tank-40, tank-160, tank-500, tank-1500, tank-xe-30, tank-xe-120, panel-150, panel-600, panel-2000, panel-8000, battery-200, battery-1500, battery-6000, rtg, fission, transponder, antenna-lga, antenna-mga, antenna-hga, antenna-hga-l, camera, spectrometer, magnetometer, radar, particle, payload, mli, radiator-s, radiator-l, heaters, heatshield, chute, descent, legs, rover-light, rover-heavy, heli, drill, weather, soil, rock, radiation, arm, cache'

function systemPrompt() {
  return [
    'You are the hangar engineer in Martian Cats, an educational NASA Space Apps mission-design game. Educational limits, not NASA specifications.',
    'Mass, delta-v, power, link, heat, and cost are already computed by the game. Do not invent those numbers. Explain the holds using the figures you were given.',
    `Suggest only catalog part ids from this list: ${IDS}`,
    'Reply with JSON only, no markdown: {"brief":"2-4 sentences a cadet can follow","steps":["do this"],"add":["catalog-id"],"name":null}',
    'Do not use NASA logos, flags, or fake NASA mission identifiers.',
  ].join('\n')
}

function shortName(model) {
  return String(model).split('/')[1] || model
}

function messageText(message) {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content.map((part) => (part && part.text ? String(part.text) : '')).join('')
  }
  return typeof message.reasoning_content === 'string' ? message.reasoning_content : ''
}

function parseAdvice(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  let parsed = {}
  try {
    parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : '{}')
  } catch {
    parsed = { brief: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800) }
  }
  const allowed = new Set(IDS.split(', '))
  return {
    brief: typeof parsed.brief === 'string' && parsed.brief.trim() ? parsed.brief.trim() : 'The hangar engineer had nothing to add.',
    steps: Array.isArray(parsed.steps) ? parsed.steps.filter((line) => typeof line === 'string').slice(0, 6) : [],
    add: Array.isArray(parsed.add) ? parsed.add.filter((id) => typeof id === 'string' && allowed.has(id)).slice(0, 8) : [],
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 28) : null,
  }
}

function cutError(raw, status, model) {
  try {
    const parsed = JSON.parse(raw)
    const detail = parsed.detail ?? parsed.error?.message ?? parsed.message ?? parsed.title
    if (typeof detail === 'string' && detail.trim()) return `${shortName(model)}: ${detail.trim().slice(0, 200)}`
  } catch {
    /* keep status */
  }
  return `${shortName(model)}: NVIDIA NIM ${status}`
}

async function invokeNim(key, model, note, ask) {
  const upstream = await fetch(NIM_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: `${ask}\n\nCRAFT:\n${JSON.stringify(note ?? {})}` },
      ],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 900,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: 'none',
    }),
  })
  const raw = await upstream.text()
  if (!upstream.ok) return { status: upstream.status, text: '', error: cutError(raw, upstream.status, model) }
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return { status: 502, text: '', error: `${shortName(model)} sent a broken payload.` }
  }
  const text = messageText(payload?.choices?.[0]?.message)
  if (!String(text).trim()) return { status: 502, text: '', error: `${shortName(model)} returned an empty answer.` }
  return { status: upstream.status, text, error: '' }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  const key = process.env.NVIDIA_API_KEY
  if (!key) {
    res.status(501).json({ error: 'NVIDIA_API_KEY is not set on the server. Add it in Vercel env vars and redeploy.' })
    return
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
    const ask = typeof body.ask === 'string' && body.ask.trim() ? body.ask.trim() : 'Explain the holds and what to fit next.'
    let last = 'NVIDIA NIM did not answer.'
    for (const model of NIM_MODELS) {
      const result = await invokeNim(key, model, body.note, ask)
      if (result.status === 401 || result.status === 403) {
        res.status(502).json({ error: 'NVIDIA_API_KEY was rejected. Put a current key in Vercel env NVIDIA_API_KEY and redeploy.' })
        return
      }
      if (result.status >= 400) {
        last = result.error || `NVIDIA NIM ${result.status} on ${shortName(model)}`
        if (RETRY.has(result.status)) continue
        res.status(502).json({ error: last })
        return
      }
      res.status(200).json({ advice: parseAdvice(result.text), model })
      return
    }
    res.status(502).json({ error: last })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'NVIDIA NIM failed' })
  }
}
