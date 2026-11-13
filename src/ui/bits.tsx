import { useEffect, useRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { Lock, Rocket, X } from 'lucide-react'
import TechText from './TechText'

const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Glass({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`glass ${className ?? ''}`}>{children}</div>
}

export function SpotButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} type="button" className={className}>
      {children}
    </button>
  )
}

export function Dock({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (event: MouseEvent) => {
    if (reduceMotion) return
    ref.current?.querySelectorAll<HTMLElement>('[data-dock]').forEach((node) => {
      const rect = node.getBoundingClientRect()
      const dist = Math.abs(event.clientX - (rect.left + rect.width / 2))
      const scale = Math.min(1.32, Math.max(1, 1.36 - dist / 170))
      node.style.transform = `translateY(${(1 - scale) * 10}px) scale(${scale})`
    })
  }
  const leave = () => {
    ref.current?.querySelectorAll<HTMLElement>('[data-dock]').forEach((node) => {
      node.style.transform = ''
    })
  }
  return (
    <div ref={ref} className={`dock ${className ?? ''}`} onMouseMove={move} onMouseLeave={leave}>
      {children}
    </div>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-back" onClick={onClose} role="presentation">
      <div className="sheet glass" role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{title}</strong>
          <button type="button" className="icon" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Meter({ icon, label, value, ratio, tone = 'ok' }: { icon: ReactNode; label: string; value: string; ratio: number; tone?: 'ok' | 'bad' }) {
  const width = Math.max(0.04, Math.min(1, ratio))
  return (
    <div className="meter">
      <span className="meter-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <b>{value}</b>
        <i className={tone === 'bad' ? 'bad' : ''} style={{ transform: `scaleX(${width})` }} />
      </div>
    </div>
  )
}

export function PartGlyph({ subsystem }: { subsystem: string }) {
  return (
    <span className="glyph preview" aria-hidden>
      <svg viewBox="0 0 64 64">{glyphShape(subsystem)}</svg>
    </span>
  )
}

function glyphShape(subsystem: string) {
  if (subsystem === 'structure') {
    return (
      <>
        <rect x="14" y="18" width="28" height="22" fill="#e7e2d6" />
        <rect x="22" y="12" width="14" height="8" fill="#cfc8ba" />
        <rect x="18" y="28" width="8" height="6" fill="#2c3138" />
      </>
    )
  }
  if (subsystem === 'propulsion') {
    return (
      <>
        <rect x="26" y="10" width="12" height="16" fill="#d9d4ca" />
        <path d="M22 26h20l6 22H16z" fill="#3e434a" />
      </>
    )
  }
  if (subsystem === 'fuel') {
    return (
      <>
        <rect x="22" y="12" width="20" height="40" rx="6" fill="#d5d0c6" />
        <rect x="22" y="28" width="20" height="4" fill="#8d8a82" />
      </>
    )
  }
  if (subsystem === 'power') {
    return (
      <>
        <rect x="6" y="26" width="20" height="12" fill="#1c2838" stroke="#d5d0c6" />
        <rect x="38" y="26" width="20" height="12" fill="#1c2838" stroke="#d5d0c6" />
        <rect x="26" y="28" width="12" height="8" fill="#e7e2d6" />
      </>
    )
  }
  if (subsystem === 'communications') {
    return (
      <>
        <ellipse cx="32" cy="30" rx="16" ry="8" fill="none" stroke="#e7e2d6" strokeWidth="2" />
        <rect x="30" y="30" width="4" height="16" fill="#c8bba4" />
      </>
    )
  }
  if (subsystem === 'science') {
    return (
      <>
        <rect x="16" y="20" width="26" height="18" fill="#e7e2d6" />
        <circle cx="42" cy="29" r="5" fill="#1c2430" />
      </>
    )
  }
  return (
    <>
      <rect x="14" y="16" width="36" height="8" fill="#d8d4cc" />
      <rect x="14" y="28" width="36" height="8" fill="#b7b2a8" />
      <rect x="14" y="40" width="36" height="8" fill="#8e8a82" />
    </>
  )
}

export function MissionTitle({ text, variant = 'hero' }: { text: string; variant?: 'hero' | 'card' | 'brief' }) {
  const compact = variant !== 'hero'
  const intro = variant === 'card' ? 'none' : 'type'
  return (
    <TechText
      text={text}
      className={variant === 'hero' ? 'tech-title-hero' : variant === 'brief' ? 'tech-title-brief' : 'tech-title-card'}
      fontFamily="Orbitron, Electrolize, sans-serif"
      fontSize={variant === 'hero' ? 120 : variant === 'brief' ? 52 : 22}
      fontWeight={600}
      letterSpacing={variant === 'card' ? -0.03 : -0.05}
      color="#f4f1ea"
      accentColor="#dadada"
      align={variant === 'hero' ? 'center' : 'left'}
      reveal={variant === 'card' ? 'area' : 'letter'}
      intro={intro}
      introDuration={variant === 'hero' ? 2.2 : 1.4}
      sweep={variant !== 'card'}
      speed={1}
      specks={compact ? 0 : 10}
      selection={false}
      labels={false}
      guides={false}
      draggable={false}
      clickKick={false}
      reach={variant === 'hero' ? 220 : 120}
      softness={0.65}
      dashLength={4}
      dashGap={2}
      strokeWidth={1.2}
      lineStyle="dashed"
    />
  )
}

export function ScoreRing({ value }: { value: number }) {
  const radius = 36
  const circ = 2 * Math.PI * radius
  const dash = circ * (Math.max(0, Math.min(100, value)) / 100)
  return (
    <svg className="ring" viewBox="0 0 88 88" aria-label={`Score ${Math.round(value)}`}>
      <circle cx="44" cy="44" r={radius} />
      <circle className="val" cx="44" cy="44" r={radius} strokeDasharray={`${dash} ${circ}`} />
      <text x="44" y="49">{Math.round(value)}</text>
    </svg>
  )
}

export function HoldLaunch({
  disabled,
  charge,
  sound,
  onCharge,
  onCommit,
}: {
  disabled: boolean
  charge: number
  sound: boolean
  onCharge: (value: number) => void
  onCommit: () => void
}) {
  const frame = useRef(0)
  const running = useRef(false)
  const done = useRef(false)
  const audio = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null)
  const radius = 46
  const circ = 2 * Math.PI * radius

  const endSound = () => {
    const node = audio.current
    audio.current = null
    if (!node) return
    const stopAt = node.ctx.currentTime + 0.18
    node.gain.gain.cancelScheduledValues(node.ctx.currentTime)
    node.gain.gain.setValueAtTime(Math.max(0.0001, node.gain.gain.value), node.ctx.currentTime)
    node.gain.gain.exponentialRampToValueAtTime(0.0001, stopAt)
    node.osc.stop(stopAt)
    window.setTimeout(() => void node.ctx.close(), 360)
  }

  const stop = () => {
    cancelAnimationFrame(frame.current)
    running.current = false
    endSound()
    if (!done.current) onCharge(0)
  }

  const start = () => {
    if (disabled || running.current) return
    running.current = true
    done.current = false
    if (sound) {
      try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.value = 55
        gain.gain.value = 0.018
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        audio.current = { ctx, osc, gain }
      } catch {
        audio.current = null
      }
    }
    const started = performance.now()
    const loop = (now: number) => {
      const next = Math.min(1, (now - started) / 1500)
      onCharge(next)
      if (audio.current) {
        audio.current.osc.frequency.value = 55 + next * 210
        audio.current.gain.gain.value = 0.016 + next * 0.03
      }
      if (next >= 1) {
        done.current = true
        running.current = false
        endSound()
        onCommit()
        return
      }
      frame.current = requestAnimationFrame(loop)
    }
    frame.current = requestAnimationFrame(loop)
  }

  useEffect(() => () => {
    cancelAnimationFrame(frame.current)
    endSound()
  }, [])

  return (
    <button
      type="button"
      className="hold"
      disabled={disabled}
      aria-label={disabled ? 'Launch held' : 'Hold to launch'}
      onPointerDown={(event) => {
        if (disabled) return
        event.currentTarget.setPointerCapture(event.pointerId)
        start()
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <svg viewBox="0 0 120 120" aria-hidden>
        <circle className="hold-track" cx="60" cy="60" r={radius} />
        <circle className="hold-fill" cx="60" cy="60" r={radius} strokeDasharray={`${circ * charge} ${circ}`} />
      </svg>
      {disabled ? <Lock size={22} /> : <Rocket size={22} />}
    </button>
  )
}
