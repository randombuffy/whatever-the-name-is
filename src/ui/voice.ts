const WANTED = /david|daniel|alex|fred|aaron|male|daniel/i

let primed = false

function voices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return []
  return window.speechSynthesis.getVoices()
}

/** Browser speech only. Mute is the sound toggle already in the dock. */
export function say(line: string, enabled: boolean, volume = 0.78): void {
  if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return
  const text = line.trim()
  if (!text) return
  if (!primed) {
    primed = true
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      voices()
    })
    voices()
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.92
  utterance.pitch = 0.72
  utterance.volume = Math.max(0, Math.min(1, volume))
  const list = voices()
  const voice = list.find((item) => item.lang.toLowerCase().startsWith('en') && WANTED.test(item.name))
    ?? list.find((item) => item.lang.toLowerCase().startsWith('en'))
  if (voice) utterance.voice = voice
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

const spoken = new Set<string>()

/** Speak a line once per flight. Later calls with the same id are ignored. */
export function sayOnce(id: string, line: string, enabled: boolean, volume = 0.78): void {
  if (spoken.has(id)) return
  spoken.add(id)
  say(line, enabled, volume)
}

export function resetVoice(): void {
  spoken.clear()
  silence()
}

export function silence(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}
