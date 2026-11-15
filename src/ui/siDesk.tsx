import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { PlanetSaturnIcon } from './pixelIcons'
import { getSpec } from '../domain/catalog'
import type { EngineeringReport, MissionDef, MissionPlan, SpacecraftConfig } from '../domain/types'
import { askNim, modelLabel, type NimAdvice } from '../si/nvidia'
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
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [advice, setAdvice] = useState<NimAdvice | null>(null)
  const [open, setOpen] = useState(false)
  const hard = report.issues.filter((issue) => issue.severity === 'hard').length

  const close = () => {
    setOpen(false)
    setError('')
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

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

  const applyParts = () => {
    if (!advice) return
    for (const id of advice.add) {
      if (getSpec(id) && !craft.parts.some((part) => part.specId === id && part.enabled)) addPart(id)
    }
  }

  return (
    <>
      <button type="button" className="word slim" onClick={() => setOpen(true)}>
        Ask hangar
      </button>
      {open && (
        <div className="si-pop-back" onClick={close} role="presentation">
          <div
            className="si-pop glass"
            role="dialog"
            aria-label="Hangar"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="si-pop-head">
              <b>Hangar</b>
              <button type="button" className="icon" aria-label="Close" onClick={close}>
                <X size={16} />
              </button>
            </header>
            <p className="si-note">Answers are suggestions only. Mass, Δv, and cost stay on the ledger.</p>
            <textarea
              rows={3}
              value={ask}
              placeholder="What is short on delta-v? Which part closes the warning?"
              onChange={(event) => setAsk(event.target.value)}
            />
            <div className="si-actions">
              <button
                type="button"
                className="word fill"
                disabled={busy}
                onClick={() => void run(ask.trim() || 'Explain the warnings and the one catalog change that helps most.')}
              >
                <PlanetSaturnIcon size={13} /> {busy ? 'Thinking…' : 'Ask'}
              </button>
              {hard > 0 && (
                <button
                  type="button"
                  className="word slim"
                  disabled={busy}
                  onClick={() => void run('Why can this stack not fly yet? One short paragraph, then bullet fixes.')}
                >
                  Why not flyable?
                </button>
              )}
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
                  <>
                    <p className="muted">Suggested: {advice.add.map((id) => getSpec(id)?.name ?? id).join(', ')}</p>
                    <button type="button" className="word slim" onClick={applyParts}>
                      Add suggested parts
                    </button>
                  </>
                )}
                <span className="si-mark">{modelLabel(advice.model)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}