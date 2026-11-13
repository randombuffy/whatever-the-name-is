import { z } from 'zod'

export interface NasaContext {
  status: 'loading' | 'ready' | 'error'
  source: 'nasa-images' | 'bundle'
  retrievedAt: string | null
  title: string
  text: string
  imageUrl: string | null
  neoCount: number | null
  error: string | null
}

const imageSchema = z.object({
  collection: z.object({
    items: z.array(z.object({
      href: z.string().optional(),
      data: z.array(z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        date_created: z.string().optional(),
      })).optional(),
      links: z.array(z.object({ href: z.string().optional() })).optional(),
    })).optional(),
  }).optional(),
})

const neoSchema = z.object({
  element_count: z.number().optional(),
})

const cacheSchema = z.object({
  savedAt: z.number(),
  title: z.string(),
  text: z.string(),
  imageUrl: z.string().nullable(),
  neoCount: z.number().nullable(),
})

export function bundledContext(title: string, text: string): NasaContext {
  return { status: 'ready', source: 'bundle', retrievedAt: null, title, text, imageUrl: null, neoCount: null, error: null }
}

export async function loadNasa(query: string, fallbackTitle: string, fallbackText: string, wantNeo: boolean): Promise<NasaContext> {
  const key = `mc-nasa:${query}`
  const cached = readCache(key)
  if (cached) {
    return {
      status: 'ready',
      source: 'nasa-images',
      retrievedAt: new Date(cached.savedAt).toISOString(),
      title: cached.title,
      text: cached.text,
      imageUrl: cached.imageUrl,
      neoCount: cached.neoCount,
      error: null,
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Image library responded ${response.status}`)
    const parsed = imageSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error('Image library payload did not match the expected shape')
    const item = parsed.data.collection?.items?.find((entry) => entry.links?.[0]?.href && entry.data?.[0]?.title)
    if (!item) throw new Error('Image library returned no usable still')
    const neoCount = wantNeo ? await neoQuiet(controller.signal) : null
    const payload = {
      savedAt: Date.now(),
      title: item.data?.[0]?.title ?? fallbackTitle,
      text: item.data?.[0]?.description ?? fallbackText,
      imageUrl: item.links?.[0]?.href ?? null,
      neoCount,
    }
    localStorage.setItem(key, JSON.stringify(payload))
    return {
      status: 'ready',
      source: 'nasa-images',
      retrievedAt: new Date(payload.savedAt).toISOString(),
      title: payload.title,
      text: payload.text,
      imageUrl: payload.imageUrl,
      neoCount,
      error: null,
    }
  } catch (error) {
    return {
      ...bundledContext(fallbackTitle, fallbackText),
      status: 'error',
      error: error instanceof Error ? error.message : 'NASA request failed',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function neoQuiet(signal: AbortSignal): Promise<number | null> {
  try {
    const response = await fetch(`https://api.nasa.gov/neo/rest/v1/feed?api_key=${encodeURIComponent(apiKey())}`, { signal })
    if (!response.ok) return null
    const parsed = neoSchema.safeParse(await response.json())
    return parsed.success && typeof parsed.data.element_count === 'number' ? parsed.data.element_count : null
  } catch {
    return null
  }
}

function readCache(key: string): z.infer<typeof cacheSchema> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = cacheSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    if (Date.now() - parsed.data.savedAt > 12 * 3600 * 1000) return null
    return parsed.data
  } catch {
    return null
  }
}

export interface MarsFrame {
  sol: number
  earthDate: string
  camera: string
  rover: string
  imageUrl: string
}

export interface SolarNote {
  classType: string
  begin: string
}

const rawSchema = z.object({
  images: z.array(z.object({
    sol: z.number().optional(),
    title: z.string().optional(),
    date_taken_utc: z.string().optional(),
    credit: z.string().optional(),
    camera: z.object({ instrument: z.string().optional() }).optional(),
    image_files: z.object({ small: z.string().optional(), medium: z.string().optional() }).optional(),
  })).optional(),
})

const noteSchema = z.array(z.object({
  messageType: z.string().optional(),
  messageIssueTime: z.string().optional(),
  messageBody: z.string().optional(),
}))

const marsCache = z.object({
  savedAt: z.number(),
  sol: z.number(),
  earthDate: z.string(),
  camera: z.string(),
  rover: z.string(),
  imageUrl: z.string(),
})

const flareCache = z.object({
  savedAt: z.number(),
  classType: z.string(),
  begin: z.string(),
})

/** A real Perseverance frame from the Mars 2020 raw-image feed. Null when the feed is down. */
export function pickPhoto(payload: unknown): MarsFrame | null {
  const parsed = rawSchema.safeParse(payload)
  if (!parsed.success) return null
  const photo = parsed.data.images?.find((item) => item.image_files?.small && typeof item.sol === 'number')
  if (!photo?.image_files?.small || typeof photo.sol !== 'number') return null
  return {
    sol: photo.sol,
    earthDate: photo.date_taken_utc?.slice(0, 10) ?? '',
    camera: photo.camera?.instrument ?? photo.title ?? 'Camera',
    rover: 'Perseverance',
    imageUrl: photo.image_files.small,
  }
}

/** The latest DONKI notification. Null when the catalog is empty. */
export function pickFlare(payload: unknown): SolarNote | null {
  const parsed = noteSchema.safeParse(payload)
  if (!parsed.success || parsed.data.length === 0) return null
  const note = [...parsed.data].reverse().find((item) => item.messageIssueTime)
  if (!note?.messageIssueTime) return null
  const klass = note.messageBody?.match(/\b([XMC]\d+(?:\.\d+)?)\b/)?.[1]
  return { classType: klass ?? note.messageType ?? 'notice', begin: note.messageIssueTime }
}

function apiKey(): string {
  return import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY'
}

function fresh<T>(key: string, schema: z.ZodType<{ savedAt: number } & T>): ({ savedAt: number } & T) | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = schema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    if (Date.now() - parsed.data.savedAt > 12 * 3600 * 1000) return null
    return parsed.data
  } catch {
    return null
  }
}

export async function loadMarsPhoto(): Promise<MarsFrame | null> {
  const cached = fresh('mc-nasa:mars-photo', marsCache)
  if (cached) return { sol: cached.sol, earthDate: cached.earthDate, camera: cached.camera, rover: cached.rover, imageUrl: cached.imageUrl }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch('https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=1', { signal: controller.signal })
    if (!response.ok) return null
    const frame = pickPhoto(await response.json())
    if (!frame) return null
    localStorage.setItem('mc-nasa:mars-photo', JSON.stringify({ savedAt: Date.now(), ...frame }))
    return frame
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function loadSolarNote(): Promise<SolarNote | null> {
  const cached = fresh('mc-nasa:donki', flareCache)
  if (cached) return { classType: cached.classType, begin: cached.begin }
  const end = new Date()
  const start = new Date(end.getTime() - 30 * 86400000)
  const from = start.toISOString().slice(0, 10)
  const to = end.toISOString().slice(0, 10)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`https://api.nasa.gov/DONKI/notifications?startDate=${from}&endDate=${to}&type=FLR&api_key=${encodeURIComponent(apiKey())}`, { signal: controller.signal })
    if (!response.ok) return null
    const note = pickFlare(await response.json())
    if (!note) return null
    localStorage.setItem('mc-nasa:donki', JSON.stringify({ savedAt: Date.now(), ...note }))
    return note
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
