import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { badgesOf } from '../domain/achievements'
import { assembleFromCallSign } from '../domain/assemble'
import { campaignPhase, descentSave, fieldSave, simAlive, type DescentSave, type FieldSave } from '../domain/save'
import { repairCraft } from '../domain/repair'
import { getSpec } from '../domain/catalog'
import { siteOf } from '../domain/campaign'
import { defaultPlan, getMission, starterCraft } from '../domain/missions'
import { outcomeOf } from '../domain/score'
import { applyDecision, createSim, stepSim } from '../domain/simulate'
import { WARP_MAX } from '../domain/time'
import type { ManoeuvreNode, MissionDef, MissionOutcome, MissionPlan, SimState, SpacecraftConfig } from '../domain/types'

export interface Checkpoint {
  id: string
  tSec: number
  label: string
  sim: SimState
}

export type Phase = 'select' | 'brief' | 'design' | 'plan' | 'launch' | 'flight' | 'landing' | 'surface' | 'debrief' | 'credits' | 'station' | 'pad'

export interface MissionSave {
  id: string
  name: string
  missionId: string
  phase: Phase
  craft: SpacecraftConfig | null
  plan: MissionPlan | null
  sim: SimState | null
  launchReady: boolean
  custom: MissionDef | null
  customBaseId: string | null
  field: FieldSave | null
  descent: DescentSave | null
  distanceFraction: number
  savedAt: number
}

interface MissionStore {
  phase: Phase
  missionId: string | null
  craft: SpacecraftConfig | null
  plan: MissionPlan | null
  sim: SimState | null
  outcome: MissionOutcome | null
  history: MissionOutcome[]
  paused: boolean
  rate: number
  camera: 'orbit' | 'chase' | 'aft' | 'wide'
  selectedId: string | null
  selectedInstanceId: string | null
  custom: MissionDef | null
  customBaseId: string | null
  audio: boolean
  soundChosen: boolean
  volume: number
  surfaceScience: number
  surfaceBits: number
  campaignNote: string
  touchdown: { grade: 'soft' | 'hard'; heat: number; offset: number } | null
  field: FieldSave | null
  descent: DescentSave | null
  rewinds: number
  badges: string[]
  checkpoints: Checkpoint[]
  launchReady: boolean
  launchRequest: boolean
  saves: MissionSave[]
  chooseMission: (id: string) => void
  assignMission: (id: string) => void
  enterCenter: () => void
  startFresh: () => void
  loadSave: (id: string) => void
  snapshotSave: () => void
  armLaunch: () => void
  requestLaunch: () => void
  clearLaunchRequest: () => void
  createCustom: (baseId: string, name: string, maxMassKg: number, budgetUsd: number) => void
  go: (phase: Phase) => void
  rename: (name: string) => void
  addPart: (specId: string) => void
  removePart: (instanceId: string) => void
  setFill: (instanceId: string, fill: number) => void
  togglePart: (instanceId: string) => void
  setSpec: (instanceId: string, specId: string) => void
  selectPart: (specId: string | null) => void
  selectInstance: (instanceId: string | null) => void
  nudgePart: (instanceId: string, dx: number, dy: number, dz: number) => void
  resetOffset: (instanceId: string) => void
  generate: (callSign: string) => void
  reshapeHull: () => void
  autoFix: () => void
  setPlan: (patch: Partial<MissionPlan>) => void
  commitLaunch: () => void
  tick: (budgetSec?: number) => void
  resumeFlight: () => void
  setPaused: (paused: boolean) => void
  setRate: (rate: number) => void
  setCamera: (camera: MissionStore['camera']) => void
  setNode: (node: ManoeuvreNode | null) => void
  noteFlight: (throttle: number, pointingRad: number) => void
  decide: (optionId: string) => void
  toggleSystem: (specId: string) => void
  finish: () => void
  setAudio: (audio: boolean) => void
  setVolume: (volume: number) => void
  bankSurface: (points: number, note: string, bits?: number) => void
  noteTouchdown: (grade: 'soft' | 'hard', heat: number, offset: number) => void
  noteField: (field: FieldSave) => void
  noteDescent: (descent: DescentSave) => void
  noteRewind: () => void
  restoreCheckpoint: (id: string) => void
}

function clampOffset(value: number): number {
  return Math.max(-2.4, Math.min(2.4, value))
}

function missionFrom(missionId: string | null, custom: MissionDef | null): MissionDef | undefined {
  if (missionId === 'custom') return custom ?? undefined
  return getMission(missionId ?? '')
}

function captureSave(state: Pick<MissionStore, 'missionId' | 'craft' | 'plan' | 'sim' | 'phase' | 'launchReady' | 'custom' | 'customBaseId' | 'field' | 'descent'>): MissionSave | null {
  if (!state.missionId || !state.craft || !state.plan) return null
  if (state.phase === 'debrief' || state.phase === 'credits' || state.phase === 'select') return null
  const mission = missionFrom(state.missionId, state.custom)
  return {
    id: state.missionId,
    name: mission?.name ?? state.craft.name,
    missionId: state.missionId,
    phase: state.phase === 'station' ? 'pad' : state.phase,
    craft: structuredClone(state.craft),
    plan: structuredClone(state.plan),
    sim: state.sim ? structuredClone(state.sim) : null,
    launchReady: state.launchReady,
    custom: state.custom ? structuredClone(state.custom) : null,
    customBaseId: state.customBaseId,
    field: state.field ? structuredClone(state.field) : null,
    descent: state.descent ? structuredClone(state.descent) : null,
    distanceFraction: state.sim?.distanceFraction ?? 0,
    savedAt: Date.now(),
  }
}

function upsertSave(list: MissionSave[], next: MissionSave): MissionSave[] {
  const rest = list.filter((item) => item.id !== next.id)
  return [next, ...rest].slice(0, 6)
}

export function useActiveMission() {
  const missionId = useMission((state) => state.missionId)
  const custom = useMission((state) => state.custom)
  if (missionId === 'custom') return custom
  return getMission(missionId ?? '') ?? null
}

const campaignStorage = (() => {
  let pending: string | null = null
  let timer = 0
  let key = 'mission-control-v1'
  const flush = () => {
    timer = 0
    if (pending !== null) localStorage.setItem(key, pending)
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush)
  return createJSONStorage(() => ({
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      key = name
      pending = value
      if (timer) return
      timer = window.setTimeout(flush, 500)
    },
    removeItem: (name) => localStorage.removeItem(name),
  }))
})()

export const useMission = create<MissionStore>()(
  persist(
    (set, get) => ({
      phase: 'select',
      missionId: null,
      craft: null,
      plan: null,
      sim: null,
      outcome: null,
      history: [],
      paused: false,
      rate: 300_000,
      camera: 'chase',
      selectedId: null,
      selectedInstanceId: null,
      custom: null,
      customBaseId: null,
      audio: true,
      soundChosen: false,
      volume: 0.7,
      surfaceScience: 0,
      surfaceBits: 0,
      campaignNote: '',
      touchdown: null,
      field: null,
      descent: null,
      rewinds: 0,
      badges: [],
      checkpoints: [],
      launchReady: false,
      launchRequest: false,
      saves: [],
      chooseMission: (id) => {
        const mission = getMission(id)
        if (!mission) return
        set({
          missionId: id,
          craft: starterCraft(id),
          plan: defaultPlan(mission),
          sim: null,
          outcome: null,
          phase: 'pad',
          selectedId: null,
          selectedInstanceId: null,
          custom: null,
          customBaseId: null,
          field: null,
          descent: null,
          touchdown: null,
          rewinds: 0,
          launchReady: false,
          launchRequest: false,
        })
      },
      assignMission: (id) => {
        const mission = getMission(id)
        if (!mission) return
        const stay = get().phase === 'pad' ? 'pad' : 'station'
        set({
          missionId: id,
          craft: starterCraft(id),
          plan: defaultPlan(mission),
          sim: null,
          outcome: null,
          phase: stay,
          selectedId: null,
          selectedInstanceId: null,
          custom: null,
          customBaseId: null,
          field: null,
          descent: null,
          touchdown: null,
          rewinds: 0,
          launchReady: false,
        })
      },
      enterCenter: () => {
        const state = get()
        if (state.sim && (state.sim.status === 'running' || state.sim.status === 'awaiting')) {
          set({ phase: 'flight', paused: false })
          return
        }
        if (state.missionId && state.craft && state.plan) {
          const parked = state.phase === 'select' || state.phase === 'credits' || state.phase === 'debrief'
          set({ phase: parked ? 'pad' : state.phase })
          return
        }
        set({
          phase: 'pad',
          missionId: null,
          craft: null,
          plan: null,
          sim: null,
          outcome: null,
          custom: null,
          customBaseId: null,
          selectedId: null,
          selectedInstanceId: null,
          launchReady: false,
          launchRequest: false,
        })
      },
      snapshotSave: () => {
        const snap = captureSave(get())
        if (!snap) return
        set({ saves: upsertSave(get().saves, snap) })
      },
      startFresh: () => {
        const snap = captureSave(get())
        set({
          saves: snap ? upsertSave(get().saves, snap) : get().saves,
          phase: 'pad',
          missionId: null,
          craft: null,
          plan: null,
          sim: null,
          outcome: null,
          custom: null,
          customBaseId: null,
          selectedId: null,
          selectedInstanceId: null,
          launchReady: false,
          launchRequest: false,
          field: null,
          descent: null,
          touchdown: null,
        })
      },
      loadSave: (id) => {
        const snap = get().saves.find((item) => item.id === id)
        if (!snap || !snap.craft || !snap.plan) return
        set({
          missionId: snap.missionId,
          craft: structuredClone(snap.craft),
          plan: structuredClone(snap.plan),
          sim: snap.sim ? structuredClone(snap.sim) : null,
          custom: snap.custom ? structuredClone(snap.custom) : null,
          customBaseId: snap.customBaseId,
          launchReady: snap.launchReady,
          field: snap.field ? structuredClone(snap.field) : null,
          descent: snap.descent ? structuredClone(snap.descent) : null,
          phase: snap.phase === 'select' || snap.phase === 'credits' ? 'pad' : snap.phase,
          outcome: null,
          selectedId: null,
          selectedInstanceId: null,
          paused: false,
        })
      },
      armLaunch: () => set({ launchReady: true, phase: 'pad', launchRequest: true }),
      requestLaunch: () => {
        const current = get()
        if (!current.missionId || !current.craft || !current.plan) return
        set({ phase: 'pad', launchReady: true, launchRequest: true, paused: false })
      },
      clearLaunchRequest: () => set({ launchRequest: false }),
      createCustom: (baseId, name, maxMassKg, budgetUsd) => {
        const base = getMission(baseId)
        if (!base) return
        const custom: MissionDef = {
          ...base,
          name: name.trim() || base.name,
          maxMassKg,
          budgetUsd,
        }
        set({
          custom,
          customBaseId: base.id,
          missionId: 'custom',
          craft: starterCraft(base.id),
          plan: defaultPlan(base),
          sim: null,
          outcome: null,
          phase: 'brief',
          selectedId: null,
          selectedInstanceId: null,
        })
      },
      go: (phase) => {
        const current = get()
        if (phase === 'flight') return
        if ((phase === 'design' || phase === 'plan' || phase === 'launch' || phase === 'brief' || phase === 'pad' || phase === 'landing' || phase === 'surface') && !current.missionId) return
        if (phase === 'debrief' && !current.outcome) return
        const keepFlight = phase === 'pad' || phase === 'design' || phase === 'brief' || phase === 'plan'
        const keep = phase === 'landing' || phase === 'surface' || (keepFlight && current.sim && current.sim.status !== 'failed')
        set({
          phase,
          paused: false,
          sim: keep ? current.sim : null,
          descent: phase === 'landing' ? null : current.descent,
        })
        const snap = captureSave(get())
        if (snap) set({ saves: upsertSave(get().saves, snap) })
      },
      rename: (name) => {
        const craft = get().craft
        if (!craft) return
        set({ craft: { ...craft, name } })
      },
      addPart: (specId) => {
        const craft = get().craft
        const spec = getSpec(specId)
        if (!craft || !spec) return
        const instanceId = `${specId}-${crypto.randomUUID()}`
        set({
          craft: {
            ...craft,
            parts: [...craft.parts, { instanceId, specId, fill: 1, enabled: true, mount: spec.mount }],
          },
          selectedId: specId,
          selectedInstanceId: instanceId,
        })
      },
      removePart: (instanceId) => {
        const craft = get().craft
        if (!craft) return
        set({
          craft: { ...craft, parts: craft.parts.filter((part) => part.instanceId !== instanceId) },
          selectedInstanceId: get().selectedInstanceId === instanceId ? null : get().selectedInstanceId,
        })
      },
      setFill: (instanceId, fill) => {
        const craft = get().craft
        if (!craft) return
        set({
          craft: {
            ...craft,
            parts: craft.parts.map((part) => (part.instanceId === instanceId ? { ...part, fill } : part)),
          },
        })
      },
      togglePart: (instanceId) => {
        const craft = get().craft
        if (!craft) return
        set({
          craft: {
            ...craft,
            parts: craft.parts.map((part) => (part.instanceId === instanceId ? { ...part, enabled: !part.enabled } : part)),
          },
        })
      },
      setSpec: (instanceId, specId) => {
        const craft = get().craft
        const spec = getSpec(specId)
        if (!craft || !spec) return
        set({
          selectedId: specId,
          craft: {
            ...craft,
            parts: craft.parts.map((part) => (part.instanceId === instanceId ? { ...part, specId, mount: spec.mount } : part)),
          },
        })
      },
      selectPart: (specId) => {
        if (!specId) {
          set({ selectedId: null, selectedInstanceId: null })
          return
        }
        const instance = get().craft?.parts.find((part) => part.specId === specId)
        set({ selectedId: specId, selectedInstanceId: instance?.instanceId ?? null })
      },
      selectInstance: (instanceId) => {
        if (!instanceId) {
          set({ selectedInstanceId: null, selectedId: null })
          return
        }
        const part = get().craft?.parts.find((item) => item.instanceId === instanceId)
        set({ selectedInstanceId: instanceId, selectedId: part?.specId ?? get().selectedId })
      },
      nudgePart: (instanceId, dx, dy, dz) => {
        const craft = get().craft
        if (!craft) return
        set({
          craft: {
            ...craft,
            parts: craft.parts.map((part) => {
              if (part.instanceId !== instanceId) return part
              const origin = part.offset ?? { x: 0, y: 0, z: 0 }
              return {
                ...part,
                offset: {
                  x: clampOffset(origin.x + dx),
                  y: clampOffset(origin.y + dy),
                  z: clampOffset(origin.z + dz),
                },
              }
            }),
          },
        })
      },
      resetOffset: (instanceId) => {
        const craft = get().craft
        if (!craft) return
        set({
          craft: {
            ...craft,
            parts: craft.parts.map((part) => (part.instanceId === instanceId ? { ...part, offset: { x: 0, y: 0, z: 0 } } : part)),
          },
        })
      },
      generate: (callSign) => {
        const state = get()
        const mission = missionFrom(state.missionId, state.custom)
        if (!mission) return
        set({ craft: assembleFromCallSign(callSign, mission), selectedInstanceId: null })
      },
      reshapeHull: () => {
        const craft = get().craft
        if (!craft) return
        set({ craft: { ...craft, hullSeed: ((craft.hullSeed ?? 1) * 1103515245 + 12345) >>> 0 }, selectedInstanceId: null })
      },
      autoFix: () => {
        const state = get()
        const mission = missionFrom(state.missionId, state.custom)
        if (!state.craft || !mission || !state.plan) return
        set({ craft: repairCraft(state.craft, mission, state.plan), selectedInstanceId: null })
      },
      setPlan: (patch) => {
        const plan = get().plan
        if (!plan) return
        set({ plan: { ...plan, ...patch } })
      },
      commitLaunch: () => {
        const { craft, missionId, plan, custom } = get()
        const mission = missionFrom(missionId, custom)
        if (!craft || !mission || !plan) return
        const sim = createSim(craft, mission, plan)
        const departure: Checkpoint = { id: 'departure', tSec: 0, label: 'Departure', sim: structuredClone(sim) }
        const rate = Math.min(WARP_MAX, Math.max(1, get().rate))
        set({ sim, phase: 'flight', paused: false, rate, outcome: null, camera: 'chase', checkpoints: [departure], field: null, descent: null, touchdown: null, rewinds: 0 })
      },
      resumeFlight: () => {
        const { sim, missionId } = get()
        if (!sim || !missionId || sim.status === 'failed') return
        set({ phase: 'flight', paused: false })
      },
      tick: (budgetSec?: number) => {
        const { sim, craft, missionId, plan, custom } = get()
        const mission = missionFrom(missionId, custom)
        if (!sim || !craft || !mission || !plan || sim.status !== 'running') return
        const next = stepSim(sim, craft, mission, plan, budgetSec)
        let checkpoints = get().checkpoints
        if (next.phaseLabel !== sim.phaseLabel || next.status !== sim.status || next.index !== sim.index) {
          checkpoints = [...checkpoints, { id: `${sim.tSec}-${checkpoints.length}`, tSec: sim.tSec, label: sim.phaseLabel || sim.maneuver, sim: structuredClone(sim) }].slice(-18)
        }
        set({ sim: next, checkpoints })
      },
      setPaused: (paused) => set({ paused }),
      setRate: (rate) => set({ rate: Math.min(WARP_MAX, Math.max(1, rate)) }),
      setCamera: (camera) => set({ camera }),
      setNode: (node) => {
        const sim = get().sim
        if (!sim || sim.status === 'complete' || sim.status === 'failed') return
        set({ sim: { ...sim, node } })
      },
      noteFlight: (throttle, pointingRad) => {
        const sim = get().sim
        if (!sim) return
        const nextThrottle = Math.max(0, Math.min(1, throttle))
        const nextPoint = Math.max(0, pointingRad)
        if (Math.abs(sim.throttle - nextThrottle) < 0.015 && Math.abs(sim.pointingRad - nextPoint) < 0.02) return
        set({ sim: { ...sim, throttle: nextThrottle, pointingRad: nextPoint } })
      },
      decide: (optionId) => {
        const { sim, craft, missionId, custom } = get()
        const mission = missionFrom(missionId, custom)
        if (!sim || !craft || !mission) return
        set({ sim: applyDecision(sim, optionId, craft, mission), paused: false })
      },
      toggleSystem: (specId) => {
        const sim = get().sim
        if (!sim) return
        const disabled = sim.disabled.includes(specId) ? sim.disabled.filter((id) => id !== specId) : [...sim.disabled, specId]
        set({ sim: { ...sim, disabled } })
      },
      finish: () => {
        const { sim, craft, missionId, plan, history, custom, surfaceScience, surfaceBits, campaignNote, touchdown, rewinds, checkpoints, badges } = get()
        const mission = missionFrom(missionId, custom)
        if (!sim || !craft || !mission || !plan) return
        const scored = { ...sim, sciencePoints: sim.sciencePoints + surfaceScience, dataReturnedBits: sim.dataReturnedBits + surfaceBits }
        const outcome = outcomeOf(craft, mission, plan, scored)
        if (campaignNote) outcome.lessons = [campaignNote, ...outcome.lessons]
        const landing = touchdown?.grade ?? 'none'
        const earned = badgesOf({
          launched: true,
          flew: sim.distanceFraction > 0 || sim.index > 0 || sim.status === 'complete',
          failed: sim.failed,
          landing,
          heat: touchdown?.heat ?? 0,
          science: surfaceScience,
          dataBits: scored.dataReturnedBits,
          dataGoal: mission.successDataBits,
          underBudget: outcome.costUsd <= outcome.budgetUsd,
          success: outcome.success,
          mars: mission.id === 'mars' || mission.id === 'custom',
        })
        outcome.launchDay = plan.launchDay
        outcome.siteName = siteOf(mission, plan).name
        outcome.durationSec = sim.tSec
        outcome.landing = landing
        outcome.entryHeat = touchdown?.heat ?? 0
        outcome.landingOffset = touchdown?.offset ?? 0
        outcome.rewinds = rewinds
        outcome.achievements = earned
        outcome.timeline = checkpoints.map((mark) => ({ tSec: mark.tSec, label: mark.label }))
        const nextBadges = [...new Set([...badges, ...earned.map((badge) => badge.id)])]
        set({
          outcome,
          history: [outcome, ...history].slice(0, 12),
          phase: 'debrief',
          surfaceScience: 0,
          surfaceBits: 0,
          campaignNote: '',
          touchdown: null,
          field: null,
          descent: null,
          badges: nextBadges,
        })
      },
      bankSurface: (points, note, bits = 0) => set({ surfaceScience: points, campaignNote: note, surfaceBits: bits }),
      noteTouchdown: (grade, heat, offset) => set({ touchdown: { grade, heat, offset } }),
      noteField: (field) => set({ field }),
      noteDescent: (descent) => set({ descent }),
      noteRewind: () => set({ rewinds: get().rewinds + 1 }),
      restoreCheckpoint: (id) => {
        const { checkpoints } = get()
        const index = checkpoints.findIndex((mark) => mark.id === id)
        if (index < 0) return
        const mark = checkpoints[index]
        set({
          sim: structuredClone(mark.sim),
          checkpoints: checkpoints.slice(0, index + 1),
          phase: 'flight',
          paused: true,
          outcome: null,
          rewinds: get().rewinds + 1,
        })
      },
      setAudio: (audio) => set({ audio, soundChosen: true }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
    }),
    {
      name: 'mission-control-v1',
      storage: campaignStorage,
      partialize: (state) => ({
        phase: state.phase === 'station' ? (state.missionId ? 'pad' : 'select') : state.phase,
        missionId: state.missionId,
        craft: state.craft,
        plan: state.plan,
        sim: state.sim,
        outcome: state.outcome,
        history: state.history,
        paused: state.paused,
        rate: state.rate,
        checkpoints: state.checkpoints.slice(-8),
        field: state.field,
        descent: state.descent,
        touchdown: state.touchdown,
        surfaceScience: state.surfaceScience,
        surfaceBits: state.surfaceBits,
        campaignNote: state.campaignNote,
        rewinds: state.rewinds,
        badges: state.badges,
        audio: state.audio,
        soundChosen: state.soundChosen,
        volume: state.volume,
        custom: state.custom,
        customBaseId: state.customBaseId,
        launchReady: state.launchReady,
        saves: state.saves,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<typeof current>
        const missionId = typeof saved.missionId === 'string' ? saved.missionId : null
        let phase = campaignPhase(saved.phase, missionId)
        const sim = simAlive(saved.sim) ? saved.sim : null
        if (phase === 'flight' && !sim) phase = missionId ? 'pad' : 'select'
        if ((phase === 'landing' || phase === 'surface') && !missionId) phase = 'select'
        const volume = typeof saved.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : current.volume
        const field = fieldSave(saved.field)
        const descent = descentSave(saved.descent)
        const rewinds = typeof saved.rewinds === 'number' ? saved.rewinds : 0
        const badges = Array.isArray(saved.badges) ? saved.badges.filter((item) => typeof item === 'string') : []
        const paused = typeof saved.paused === 'boolean' ? saved.paused : current.paused
        const rate = typeof saved.rate === 'number' ? Math.min(WARP_MAX, Math.max(1, saved.rate)) : current.rate
        const checkpoints = Array.isArray(saved.checkpoints)
          ? saved.checkpoints.filter((mark) => mark && simAlive(mark.sim) && typeof mark.id === 'string').slice(-8)
          : []
        const saves = Array.isArray(saved.saves)
          ? saved.saves.filter((item) => item && typeof item.id === 'string' && item.craft && item.plan).slice(0, 6)
          : []
        const live = captureSave({
          missionId,
          craft: saved.craft ?? null,
          plan: saved.plan ?? null,
          sim,
          phase,
          launchReady: saved.launchReady === true,
          custom: saved.custom ?? null,
          customBaseId: saved.customBaseId ?? null,
          field,
          descent,
        })
        return {
          ...current,
          ...saved,
          phase,
          sim,
          field,
          descent,
          volume,
          rewinds,
          badges,
          paused,
          rate,
          checkpoints,
          saves: live ? upsertSave(saves, live) : saves,
          launchReady: saved.launchReady === true,
          soundChosen: saved.soundChosen === true,
          audio: saved.soundChosen === true ? saved.audio !== false : true,
        }
      },
    },
  ),
)

