import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { getSpec } from '../domain/catalog'
import type { EngineeringReport, MissionDef, MissionPlan, SpacecraftConfig } from '../domain/types'
import { askNim, NIM_LABEL, type NimAdvice } from '../si/nvidia'
import { useMission } from '../store/useMission'

function craftNote(mission: MissionDef, craft: SpacecraftConfig, plan: MissionPlan, report: EngineeringReport) {
  return {
    mission: mission.name,
    destination: mission.id,
    durationDays: mission.durationDays,
    maxMassKg: mission.maxMassKg,
    budgetUsd: mission.budgetUsd,
    requiredDvMps: Math.round(report.requiredDvMps),
    massKg: Math.round(report.mass.totalKg),
    dvMps: Math.round(report.propulsion.dvMps),
    powerW: Math.round(report.power.constantGenerationW + report.power.generationAt1AuW / (mission.destinationAu ** 2)),
    loadW: Math.round(report.power.loadW),
    linkDb: Math.round(report.link.marginDb * 10) / 10,
    costUsd: Math.round(report.cost.totalUsd),
    parts: craft.parts.filter((part) => part.enabled).map((part) => part.specId),
    holds: report.issues.map((issue) => `${issue.severity}: ${issue.what}. ${issue.change}`),
    site: plan.siteId,
    window: plan.launchDay,
  }
}

export function SiDesk({
  mission,
  craft,
  plan,
  report,
}: {
  mission: MissionDef
  craft: SpacecraftConfig
  plan: MissionPlan
  report: EngineeringReport
}) {
  const addPart = useMission((state) => state.addPart)
  const rename = useMission((state) => state.rename)
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [advice, setAdvice] = useState<NimAdvice | null>(null)
  const [open, setOpen] = useState(false)

  const run = async (prompt: string) => {
    setBusy(true)
    setError('')
    try {
      const next = await askNim(craftNote(mission, craft, plan, report), prompt)
      setAdvice(next)
    } catch (err) {
      setAdvice(null)
      setError(err instanceof Error ? err.message : 'NVIDIA NIM did not answer.')
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!advice) return
    for (const id of advice.add) {
      if (getSpec(id) && !craft.parts.some((part) => part.specId === id && part.enabled)) addPart(id)
    }
    if (advice.name) rename(advice.name)
  }

  if (!open) {
    return (
      <button type="button" className="word slim" onClick={() => setOpen(true)}>
        Ask hangar
      </button>
    )
  }

  return (
    <div className="si-desk">
      <div className="si-desk-head">
        <b>Hangar engineer</b>
        <span className="si-mark">{NIM_LABEL}</span>
      </div>
      <p className="si-note">The model only talks. Mass, delta-v, power, and cost stay on the ledger.</p>
      <textarea
        rows={2}
        value={ask}
        placeholder="Why is the link dark? What tank do I need for Mars?"
        onChange={(event) => setAsk(event.target.value)}
      />
      <div className="si-actions">
        <button type="button" className="word slim" disabled={busy} onClick={() => void run(ask || 'Explain the holds and what to fit next.')}>
          <Sparkles size={13} /> {busy ? 'Asking NIM…' : 'Ask'}
        </button>
        <button type="button" className="word slim" disabled={busy} onClick={() => void run('Name this spacecraft. Keep it short. Then say the one change that closes the worst hold.')}>
          Name it
        </button>
      </div>
      {error && <p className="si-error">{error}</p>}
      {advice && (
        <div className="si-reply">
          <p>{advice.brief}</p>
          {advice.steps.length > 0 && (
            <ol>
              {advice.steps.map((line) => <li key={line}>{line}</li>)}
            </ol>
          )}
          {advice.add.length > 0 && (
            <p className="muted">Fit {advice.add.map((id) => getSpec(id)?.name ?? id).join(', ')}</p>
          )}
          {(advice.add.length > 0 || advice.name) && (
            <button type="button" className="word slim" onClick={apply}>
              Apply {advice.name ? `“${advice.name}”` : 'parts'}
            </button>
          )}
          <span className="si-mark">{NIM_LABEL}. Not a NASA product.</span>
        </div>
      )}
    </div>
  )
}
