import { useEffect, useRef, useState } from 'react'
import { preloadAssets } from '../render/gltf'
import { applyMix, startScore, unlock } from './audio'
import { CallChip, type CallChipIcon, type CallChipStatus } from './CallChip'
import { useMission } from '../store/useMission'

type Props = { onReady: () => void }

const MIN_MS = 2000
const MAX_MS = 4000
const ICONS: CallChipIcon[] = ['terminal', 'file', 'search', 'edit']

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function Boot({ onReady }: Props) {
  const [status, setStatus] = useState<CallChipStatus>('running')
  const [icon, setIcon] = useState<CallChipIcon>('terminal')
  const video = useRef<HTMLVideoElement>(null)
  const readyRef = useRef(onReady)
  readyRef.current = onReady

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
    const spin = window.setInterval(() => {
      setIcon((current) => ICONS[(ICONS.indexOf(current) + 1) % ICONS.length])
    }, 700)
    let live = true
    const started = performance.now()
    void (async () => {
      const preload = preloadAssets(() => undefined)
      const gated = preload.then(async () => {
        const remain = MIN_MS - (performance.now() - started)
        if (remain > 0) await wait(remain)
      })
      await Promise.race([gated, wait(MAX_MS)])
      if (!live) return
      setStatus('done')
      await wait(320)
      if (!live) return
      readyRef.current()
    })()
    return () => {
      live = false
      window.clearInterval(spin)
    }
  }, [])

  return (
    <div className="boot-ascii" aria-busy={status === 'running'} aria-live="polite">
      <video
        ref={video}
        className="boot-video"
        src="/download.mp4"
        autoPlay
        muted
        playsInline
        loop
        preload="metadata"
        aria-hidden="true"
      />
      <div className="boot-veil" />
      <CallChip
        icon={icon}
        name="load"
        argument="assets"
        status={status}
        expectedMs={3000}
        size={36}
        color="#f4f1ea"
        surfaceColor="#18181b"
        progressColor="#f4f1ea"
      />
    </div>
  )
}
