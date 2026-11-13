/** Recorded effects from the Oculus Audio Pack, on one gain the mute slider owns. */

export type Sting = 'radio' | 'warn' | 'separate' | 'click'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let heard = false
let mixVolume = 0.7
let score: HTMLAudioElement | null = null
let scoreBoost = false
let catalog: string[] = []
let catalogTask: Promise<string[]> | null = null
const decoded = new Map<string, AudioBuffer>()
const pending = new Map<string, Promise<AudioBuffer | null>>()
const cursor = new Map<string, number>()
const loops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode; file: string }>()

function contextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null
}

function ensure(): AudioContext | null {
  if (ctx && master) return ctx
  const Ctor = contextCtor()
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    return ctx
  } catch {
    ctx = null
    master = null
    return null
  }
}

function files(): Promise<string[]> {
  if (catalog.length > 0) return Promise.resolve(catalog)
  if (!catalogTask) {
    catalogTask = fetch('/sfx/manifest.json')
      .then((response) => response.json() as Promise<string[]>)
      .then((names) => {
        catalog = names
        return names
      })
      .catch(() => [])
  }
  return catalogTask
}

function take(prefix: string): string | null {
  const rows = catalog.filter((name) => name.startsWith(prefix))
  if (rows.length === 0) return null
  const index = cursor.get(prefix) ?? 0
  cursor.set(prefix, (index + 1) % rows.length)
  return rows[index] ?? null
}

async function buffer(file: string): Promise<AudioBuffer | null> {
  const cached = decoded.get(file)
  if (cached) return cached
  const waiting = pending.get(file)
  if (waiting) return waiting
  const audio = ensure()
  if (!audio) return null
  const task = fetch(`/sfx/${file}`)
    .then((response) => response.arrayBuffer())
    .then((bytes) => audio.decodeAudioData(bytes))
    .then((data) => {
      decoded.set(file, data)
      pending.delete(file)
      return data
    })
    .catch(() => {
      pending.delete(file)
      return null
    })
  pending.set(file, task)
  return task
}

function start(file: string, level: number, loop: boolean): { source: AudioBufferSourceNode; gain: GainNode } | null {
  const audio = ensure()
  const data = decoded.get(file)
  if (!audio || !master || !data) return null
  if (audio.state === 'suspended') void audio.resume()
  const gain = audio.createGain()
  gain.gain.value = level
  gain.connect(master)
  const source = audio.createBufferSource()
  source.buffer = data
  source.loop = loop
  source.connect(gain)
  source.start()
  return { source, gain }
}

function scoreLevel(): number {
  if (!heard) return 0
  const bed = scoreBoost ? 0.74 : 0.3
  return Math.max(0, Math.min(1, mixVolume * bed))
}

function tickScore(): void {
  if (!score) return
  score.volume = scoreLevel()
}

/** Loop /sfx/bg.mp3 from boot. Quiet enough to live under the pad, loud enough to hear. */
export function startScore(): void {
  if (!score) {
    score = new Audio('/sfx/bg.mp3')
    score.loop = true
    score.preload = 'auto'
    score.addEventListener('canplay', () => {
      if (score) void score.play().catch(() => undefined)
    })
  }
  tickScore()
  void score.play().catch(() => undefined)
}

/** After ignition the score lifts; it settles again on the pad. */
export function setScoreBoost(on: boolean): void {
  scoreBoost = on
  tickScore()
}

/** Resume the audio device after a click or key, which browsers require. */
export function unlock(): void {
  const audio = ensure()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()
  void files()
  startScore()
}

export function audioContext(): AudioContext | null {
  return ensure()
}

export function output(): GainNode | null {
  ensure()
  return master
}

export function applyMix(enabled: boolean, volume: number): void {
  heard = enabled
  mixVolume = Math.max(0, Math.min(1, volume))
  tickScore()
  if (!ctx && !enabled) return
  const audio = ensure()
  if (!audio || !master) return
  if (audio.state === 'suspended') void audio.resume()
  void files()
  master.gain.setTargetAtTime(enabled ? mixVolume : 0, audio.currentTime, 0.06)
}

function playFile(file: string | null, level: number): void {
  if (!heard || !file) return
  const ready = decoded.get(file)
  if (ready) {
    start(file, level, false)
    return
  }
  void buffer(file).then(() => {
    if (heard) start(file, level, false)
  })
}

/** Play the next clip whose name starts with `prefix`, so each take in that set is used. */
export function playGroup(prefix: string, level = 0.55): void {
  if (!heard) return
  void files().then(() => playFile(take(prefix), level))
}

export function loopFile(id: string, file: string | null, level: number): void {
  const current = loops.get(id)
  if (!heard || !file || level <= 0.001) {
    if (!current) return
    try { current.source.stop() } catch { /* already stopped */ }
    current.source.disconnect()
    current.gain.disconnect()
    loops.delete(id)
    return
  }
  if (current && current.file === file) {
    const audio = ensure()
    if (audio) current.gain.gain.setTargetAtTime(level, audio.currentTime, 0.12)
    return
  }
  if (current) {
    try { current.source.stop() } catch { /* already stopped */ }
    current.source.disconnect()
    current.gain.disconnect()
    loops.delete(id)
  }
  const begin = (data: AudioBuffer | null) => {
    if (!data || !heard) return
    if (loops.get(id)?.file === file) return
    const node = start(file, level, true)
    if (node) loops.set(id, { ...node, file })
  }
  const ready = decoded.get(file)
  if (ready) begin(ready)
  else void buffer(file).then(begin)
}

/** Wind outside, a room tone indoors. `amount` is the old 0-to-1 bed level. */
export function setBed(amount: number, enabled: boolean): void {
  if (!enabled || amount <= 0.001) {
    loopFile('bed', null, 0)
    return
  }
  const indoors = amount >= 0.04
  void files().then(() => {
    const file = indoors
      ? catalog.find((name) => name.startsWith('AMBInd')) ?? 'MACHHvac_HVAC_LOOP_01.ogg'
      : 'WINDVege_LightWindTreesBirds_LOOP_01.ogg'
    loopFile('bed', file, Math.min(0.42, amount * 7))
  })
}

export function sting(kind: Sting, enabled: boolean): void {
  if (!enabled) return
  const prefix = {
    radio: 'UIClick_Scifi',
    warn: 'UIAlert_Scifi',
    separate: 'DOORMetl_Hatch',
    click: 'UIClick_ScifiTraditional',
  }[kind]
  playGroup(prefix, kind === 'warn' ? 0.7 : 0.5)
}

export function playStep(place: string, sprint: boolean): void {
  const metal = /pad|tower|control|hangar|assembly/i.test(place)
  const prefix = metal
    ? (sprint ? 'FEETHmn_ShoeMetalRun' : 'FEETHmn_ShoeMetalWalk')
    : (sprint ? 'FEETHmn_ShoeGrassRun' : 'FEETHmn_ShoeGrassWalk')
  playGroup(prefix, sprint ? 0.42 : 0.34)
}

export function playJump(): void {
  playGroup('WHSH_WhooshSmall', 0.4)
}

export function playLand(place: string): void {
  const metal = /pad|tower|control|hangar|assembly/i.test(place)
  playGroup(metal ? 'FEETHmn_ShoeMetalLand' : 'FEETHmn_ShoeGrassLand', 0.4)
}
