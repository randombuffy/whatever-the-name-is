const NIM_MODEL = 'meta/llama-3.3-70b-instruct'
const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const IDS = 'bus-12u, bus-small, bus-probe, bus-deep, frame, acs, cold-gas, monoprop, biprop-450, biprop-4k, ion, hall, tank-40, tank-160, tank-500, tank-1500, tank-xe-30, tank-xe-120, panel-150, panel-600, panel-2000, panel-8000, battery-200, battery-1500, battery-6000, rtg, fission, transponder, antenna-lga, antenna-mga, antenna-hga, antenna-hga-l, camera, spectrometer, magnetometer, radar, particle, payload, mli, radiator-s, radiator-l, heaters, heatshield, chute, descent, legs, rover-light, rover-heavy, heli, drill, weather, soil, rock, radiation, arm, cache'

function systemPrompt() {
  return [
    'You are the hangar engineer in AeroAestro, an educational NASA Space Apps mission-design game.',
    'Mass, delta-v, power, link, heat, and cost are already computed by the game. Do not invent those numbers. Explain the holds using the figures you were given.',
    `Suggest only catalog part ids from this list: ${IDS}`,
    'Reply with JSON only, no markdown: {"brief":"2-4 sentences a cadet can follow","steps":["do this"],"add":["catalog-id"],"name":null}',
    'Do not use NASA logos, flags, or fake NASA mission identifiers.',
  ].join('\n')
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  const key = process.env.NVIDIA_API_KEY
  if (!key) {
    res.status(501).json({ error: 'NVIDIA_API_KEY is not set on the server.' })
    return
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
    const ask = typeof body.ask === 'string' && body.ask.trim() ? body.ask.trim() : 'Explain the holds and what to fit next.'
    const upstream = await fetch(NIM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: `${ask}\n\nCRAFT:\n${JSON.stringify(body.note ?? {})}` },
        ],
        temperature: 0.25,
        top_p: 0.7,
        max_tokens: 700,
        stream: false,
      }),
    })
    const raw = await upstream.text()
    if (!upstream.ok) {
      res.status(502).json({ error: `NVIDIA NIM ${upstream.status}` })
      return
    }
    const payload = JSON.parse(raw)
    const text = payload?.choices?.[0]?.message?.content ?? ''
    res.status(200).json({ advice: parseAdvice(text), model: NIM_MODEL })
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'NVIDIA NIM failed' })
  }
}
