import { useEffect, useRef, useState } from 'react'
import { preloadAssets } from '../render/gltf'
import { applyMix, startScore, unlock } from './audio'
import { useMission } from '../store/useMission'

const ROCKET = [
  [
    '        /\\',
    '       /  \\',
    '      |    |',
    '      | MC |',
    '      |    |',
    '      /||||\\',
    '     /      \\',
    '        ..',
  ],
  [
    '        /\\',
    '       /  \\',
    '      |    |',
    '      | MC |',
    '      |    |',
    '      /||||\\',
    '     /      \\',
    '       .||.',
  ],
  [
    '        /\\',
    '       /  \\',
    '      |    |',
    '      | MC |',
    '      |    |',
    '      /||||\\',
    '     /      \\',
    '      .||||.',
  ],
  [
    '        /\\',
    '       /  \\',
    '      |    |',
    '      | MC |',
    '      |    |',
    '      /||||\\',
    '     /      \\',
    '     .||||||.',
  ],
]

type Props = { onReady: () => void }

const HOLD_MS = 5500

export function Boot({ onReady }: Props) {
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(1)
  const [label, setLabel] = useState('assets')
  const [frame, setFrame] = useState(0)
  const [ready, setReady] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const ratio = total > 0 ? done / total : 0
  const pct = Math.round(ratio * 100)
  const art = ROCKET[frame % ROCKET.length]

  useEffect(() => {
    applyMix(useMission.getState().audio, useMission.getState().volume)
    unlock()
    startScore()
    const clip = video.current
    if (clip) {
      clip.muted = true
      clip.playsInline = true
      void clip.play().catch(() => undefined)
    }
    const id = window.setInterval(() => setFrame((n) => n + 1), 180)
    let live = true
    const hold = new Promise<void>((resolve) => {
      window.setTimeout(resolve, HOLD_MS)
    })
    void Promise.all([
      preloadAssets((next, count, name) => {
        if (!live) return
        setDone(next)
        setTotal(count)
        setLabel(name)
      }),
      hold,
    ]).then(() => {
      if (!live) return
      setReady(true)
      readyRef.current()
    })
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <div className="boot-ascii" aria-busy={!ready} aria-live="polite">
      <video
        ref={video}
        className="boot-video"
        src="/download.mp4"
        autoPlay
        muted
        playsInline
        loop
        preload="auto"
        aria-hidden="true"
      />
      <div className="boot-veil" />
      <pre className="boot-rocket">{art.join('\n')}</pre>
      <aside className="boot-card">
        <b>AeroAestro</b>
        <span>
          Loading pad assets · {done}/{total}
        </span>
        <div
          className="boot-track"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Asset load progress"
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="boot-stat">
          <code>{pct}%</code>
          <em>{ready ? 'Ready' : label}</em>
        </p>
      </aside>
    </div>
  )
}
