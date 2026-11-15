import { useEffect, useState } from 'react'
import { Expand } from 'lucide-react'
import { BriefScreen, CreditsScreen, CrewBar, DebriefScreen, DesignScreen, PlanScreen, SelectScreen } from './ui/screens'
import { LandingScreen, SurfaceScreen } from './ui/field'
import { PadScreen } from './ui/pad'
import { CruiseScreen } from './ui/cruise'
import { StationScreen } from './ui/station'
import { applyMix, playGroup, startScore, unlock } from './ui/audio'
import { Boot } from './ui/Boot'
import { Mix } from './ui/mix'
import { Viewport } from './render/Viewport'
import type { SceneMode } from './render/world'
import { useActiveMission, useMission, type Phase } from './store/useMission'
import { effectiveWarp } from './domain/time'
import { APP_NAME } from './domain/brand'

function sceneMode(phase: Phase): SceneMode {
  if (phase === 'design') return 'design'
  if (phase === 'brief' || phase === 'plan' || phase === 'debrief') return 'destination'
  return 'menu'
}

/** Pad, cruise, landing and the surface each own a renderer. The hangar view must not keep drawing under them. */
function hangarOpen(phase: Phase): boolean {
  return phase !== 'pad' && phase !== 'launch' && phase !== 'flight' && phase !== 'landing' && phase !== 'surface' && phase !== 'station' && phase !== 'outpost'
}

export function App() {
  const phase = useMission((state) => state.phase)
  const missionId = useMission((state) => state.missionId)
  const outcome = useMission((state) => state.outcome)
  const go = useMission((state) => state.go)
  const requestLaunch = useMission((state) => state.requestLaunch)
  const resumeFlight = useMission((state) => state.resumeFlight)
  const paused = useMission((state) => state.paused)
  const rate = useMission((state) => state.rate)
  const craft = useMission((state) => state.craft)
  const audio = useMission((state) => state.audio)
  const volume = useMission((state) => state.volume)
  const sim = useMission((state) => state.sim)
  const camera = useMission((state) => state.camera)
  const selectedInstanceId = useMission((state) => state.selectedInstanceId)
  const selectInstance = useMission((state) => state.selectInstance)
  const nudgePart = useMission((state) => state.nudgePart)
  const mission = useActiveMission()
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const [full, setFull] = useState(Boolean(document.fullscreenElement))
  const [gate, setGate] = useState(true)
  const [booting, setBooting] = useState(true)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const lost = phase !== 'select' && phase !== 'credits' && !mission

  useEffect(() => {
    applyMix(audio, volume)
    startScore()
  }, [audio, volume])

  const coasting = Boolean(sim && sim.status === 'running' && !paused && phase !== 'flight' && phase !== 'landing' && phase !== 'surface')
  useEffect(() => {
    if (!coasting) return undefined
    let frame = 0
    let last = performance.now()
    let carry = 0
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const state = useMission.getState()
      if (!state.sim || state.sim.status !== 'running' || state.paused || state.phase === 'flight') return
      carry += dt * effectiveWarp(state.rate, state.sim)
      let guard = 0
      while (carry > 1 && guard < 48) {
        const before = state.sim.tSec
        state.tick(carry)
        const after = useMission.getState().sim?.tSec ?? before
        if (after <= before) break
        carry -= after - before
        guard += 1
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [coasting])

  useEffect(() => {
    const resume = () => unlock()
    const click = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('button, a')) return
      if (!useMission.getState().audio) return
      playGroup('UIClick_Scifi', 0.42)
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    document.addEventListener('click', click)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
      document.removeEventListener('click', click)
    }
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const onChange = () => setNarrow(query.matches)
    query.addEventListener('change', onChange)
    const onFull = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFull)
    return () => {
      query.removeEventListener('change', onChange)
      document.removeEventListener('fullscreenchange', onFull)
    }
  }, [])

  const toggleFull = () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen()
    else void document.exitFullscreen()
  }

  if (booting) {
    return (
      <div className="game">
        <div className="boot-gate">
          <Boot onReady={() => setBooting(false)} />
        </div>
      </div>
    )
  }

  if (gate) {
    return (
      <div className="game">
        <div className="boot-gate">
          <SelectScreen onLaunch={() => setGate(false)} />
        </div>
      </div>
    )
  }

  return (
    <div className="game">
      {hangarOpen(lost ? 'select' : phase) && (
        <div className="world-layer">
          <Viewport
            mode={sceneMode(lost ? 'select' : phase)}
            craft={craft}
            selectedInstanceId={selectedInstanceId}
            burning={false}
            thrust={0}
            progress={0}
            missionId={mission?.id ?? 'lunar'}
            reduced={reduced}
            camera={camera}
            launchCharge={0}
            ascent={null}
            onPick={selectInstance}
            onNudge={nudgePart}
          />
        </div>
      )}
      {hangarOpen(lost ? 'select' : phase) && <div className="vignette" />}
      {phase !== 'surface' && phase !== 'outpost' && phase !== 'station' && phase !== 'pad' && phase !== 'flight' && phase !== 'landing' && phase !== 'launch' && (
      <header className="app-header-area">
        <div className="float-top">
          <div className="brand-pill">
            <b>{APP_NAME}</b>
            <small>NASA Space Apps</small>
          </div>
          <nav className="top-nav" aria-label="Main Navigation">
          <button
            type="button"
            className={`top-nav-btn ${phase === 'select' || phase === 'brief' ? 'active' : ''}`}
            onClick={() => go('select')}
          >
            Home
          </button>
          <button
            type="button"
            className={`top-nav-btn ${phase === 'design' ? 'active' : ''}`}
            disabled={!missionId}
            onClick={() => go('design')}
          >
            Build
          </button>
          <button
            type="button"
            className={`top-nav-btn ${phase === 'plan' ? 'active' : ''}`}
            disabled={!missionId}
            onClick={() => go('plan')}
          >
            Plan
          </button>
          <button
            type="button"
            className="top-nav-btn"
            disabled={!missionId}
            onClick={() => requestLaunch()}
          >
            Launch
          </button>
          <button
            type="button"
            className={`top-nav-btn ${phase === 'debrief' ? 'active' : ''}`}
            disabled={!outcome}
            onClick={() => go('debrief')}
          >
            Result
          </button>
          {narrow && (
            <button
              type="button"
              className="top-nav-btn full-btn"
              title={full ? 'Exit full screen' : 'Full screen'}
              aria-label={full ? 'Exit full screen' : 'Full screen'}
              onClick={toggleFull}
            >
              <Expand size={16} strokeWidth={2} />
            </button>
          )}
        </nav>
        </div>
        <CrewBar />
      </header>
      )}
      {narrow && phase === 'design' && selectedInstanceId && (
        <div className="touch-pad" aria-label="Move part">
          <button type="button" onClick={() => nudgePart(selectedInstanceId, 0, 0.12, 0)}>Up</button>
          <button type="button" onClick={() => nudgePart(selectedInstanceId, -0.12, 0, 0)}>Left</button>
          <button type="button" onClick={() => nudgePart(selectedInstanceId, 0.12, 0, 0)}>Right</button>
          <button type="button" onClick={() => nudgePart(selectedInstanceId, 0, -0.12, 0)}>Down</button>
        </div>
      )}
      {sim && phase !== 'flight' && phase !== 'landing' && phase !== 'surface' && phase !== 'debrief' && (
        <button type="button" className="flight-tab" onClick={() => resumeFlight()}>
          <b>Mission live</b>
          <span>{sim.phaseLabel || 'Coast'} · {Math.round(sim.distanceFraction * 100)}% · {effectiveWarp(rate, sim)}×</span>
        </button>
      )}
      <div className="app-utility-dock" aria-label="About and sound">
        <button
          type="button"
          className={`utility-dock-btn ${phase === 'credits' ? 'active' : ''}`}
          onClick={() => go(phase === 'credits' ? (missionId ? 'pad' : 'select') : 'credits')}
        >
          About
        </button>
        <Mix />
      </div>
      <div className="overlay">
        {phase === 'station' && <StationScreen />}
        {phase === 'pad' || phase === 'launch' ? <PadScreen /> : null}
        {(phase === 'select' || lost) && <SelectScreen />}
        {phase === 'brief' && mission && <BriefScreen />}
        {phase === 'design' && mission && <DesignScreen />}
        {phase === 'plan' && mission && <PlanScreen />}
        {phase === 'flight' && mission && <CruiseScreen />}
        {phase === 'landing' && mission && <LandingScreen />}
        {phase === 'surface' && mission && <SurfaceScreen />}
        {phase === 'outpost' && mission && <SurfaceScreen />}
        {phase === 'debrief' && <DebriefScreen />}
        {phase === 'credits' && <CreditsScreen />}
      </div>
    </div>
  )
}
