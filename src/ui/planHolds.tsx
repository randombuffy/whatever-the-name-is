import { CATALOG, getSpec } from '../domain/catalog'
import type { ComponentSpec, EngineeringIssue, SpacecraftConfig } from '../domain/types'
import { HoldAlertPixelIcon } from './pixelIcons'
import { PartPreview } from './partPreview'

export function relatedSpecs(issue: EngineeringIssue, craft: SpacecraftConfig): ComponentSpec[] {
  const enabled = craft.parts.filter((part) => part.enabled)

  if (issue.id.startsWith('inst-') || issue.id.startsWith('obj-')) {
    const id = issue.id.replace(/^(inst|obj)-/, '')
    const spec = getSpec(id)
    if (spec) return [spec]
    const byInstrument = CATALOG.find((row) => row.instrument === id)
    if (byInstrument) return [byInstrument]
  }

  if (issue.id === 'no-bus') {
    const onBus = enabled.find((part) => getSpec(part.specId)?.mount === 'bus')
    if (onBus) {
      const spec = getSpec(onBus.specId)
      if (spec) return [spec]
    }
    const bus = getSpec('bus-small') ?? getSpec('bus-probe')
    return bus ? [bus] : []
  }

  if (issue.id === 'recorder' || issue.id === 'antenna') {
    const transponder = getSpec('transponder')
    const antenna = getSpec('antenna-hga') ?? getSpec('antenna-mga')
    const rows = [transponder, antenna].filter((row): row is ComponentSpec => Boolean(row))
    const fitted = enabled
      .map((part) => getSpec(part.specId))
      .filter((spec): spec is ComponentSpec => spec !== undefined && spec.subsystem === 'communications')
    if (fitted.length) return fitted.slice(0, 2)
    return rows.slice(0, 2)
  }

  const subsystem = issue.subsystem === 'mission' ? null : issue.subsystem
  if (subsystem) {
    const onCraft = enabled
      .map((part) => getSpec(part.specId))
      .filter((spec): spec is ComponentSpec => spec !== undefined && spec.subsystem === subsystem)
    if (onCraft.length) return onCraft.slice(0, 3)
    const fallback = CATALOG.filter((spec) => spec.subsystem === subsystem).slice(0, 2)
    if (fallback.length) return fallback
  }

  return []
}

export function PlanHoldList({ notes, craft }: { notes: EngineeringIssue[]; craft: SpacecraftConfig }) {
  if (notes.length === 0) {
    return <p className="ready plan-hold-clear">No part warnings. Launch when capture and Δv look good.</p>
  }
  return (
    <ul className="plan-hold-list">
      {notes.map((issue) => {
        const specs = relatedSpecs(issue, craft)
        return (
          <li key={issue.id} className="plan-hold-card">
            <HoldAlertPixelIcon label="Warning" />
            <div className="plan-hold-main">
              <strong>{issue.what}</strong>
              <div className="plan-hold-previews" aria-hidden={specs.length === 0}>
                {specs.map((spec) => (
                  <PartPreview key={spec.id} specId={spec.id} />
                ))}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}