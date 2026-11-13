import { Volume2, VolumeX } from 'lucide-react'
import { useMission } from '../store/useMission'

/** Mute and loudness. The bus reads the same store. */
export function Mix() {
  const audio = useMission((state) => state.audio)
  const volume = useMission((state) => state.volume)
  const setAudio = useMission((state) => state.setAudio)
  const setVolume = useMission((state) => state.setVolume)
  return (
    <span className="mix">
      <button type="button" aria-label={audio ? 'Mute' : 'Sound'} aria-pressed={audio} onClick={() => setAudio(!audio)}>
        {audio ? <Volume2 size={14} /> : <VolumeX size={14} />}
      </button>
      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
      />
    </span>
  )
}
