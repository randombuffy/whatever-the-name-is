import { kitCoverage, objectiveKit, objectiveOf } from './campaign'
import { getSpec } from './catalog'
import { massBudget } from './mass'
import { propulsionBudget } from './propulsion'
import { evaluate } from './validate'
import type { MissionDef, MissionOutcome, MissionPlan, SimState, SpacecraftConfig } from './types'

export function outcomeOf(config: SpacecraftConfig, mission: MissionDef, plan: MissionPlan, sim: SimState): MissionOutcome {
  const report = evaluate(config, mission, plan)
  const propulsion = propulsionBudget(config, getSpec)
  const mass = massBudget(config, getSpec, mission.maxMassKg)
  const remaining = sim.propellant.chemical + sim.propellant.electric + sim.propellant['cold-gas']
  const used = Math.max(0, mass.propellantKg - remaining)
  const scienceMet = sim.sciencePoints + 1e-6 >= mission.successScience
  const dataMet = sim.dataReturnedBits + 1 >= mission.successDataBits
  const survived = sim.status === 'complete' && !sim.failed
  const objectives = [
    { id: 'survive', label: 'Spacecraft completed the timeline', met: survived, detail: survived ? 'The flight reached the end of the science window.' : sim.failReason || 'The flight stopped early.' },
    { id: 'science', label: 'Science objective', met: survived && scienceMet, detail: `${sim.sciencePoints.toFixed(0)} points collected, ${mission.successScience} required.` },
    { id: 'data', label: 'Data returned', met: survived && dataMet, detail: `${(sim.dataReturnedBits / 1e9).toFixed(2)} Gbit returned, ${(mission.successDataBits / 1e9).toFixed(2)} Gbit required.` },
    { id: 'optional', label: 'Extended science', met: survived && sim.sciencePoints >= mission.optionalScience, detail: `${mission.optionalScience} points marks the optional objective.` },
  ]
  const campaign = objectiveOf(plan)
  const kit = objectiveKit(plan.objectiveId)
  const coverage = kitCoverage(plan.objectiveId, config.parts.filter((part) => part.enabled).map((part) => part.specId))
  const covered = Math.round(coverage * kit.length)
  objectives.push({
    id: 'campaign',
    label: campaign.title,
    met: survived && covered === kit.length,
    detail: covered === kit.length
      ? `${campaign.question} The kit for this question was aboard, so the science return includes the full objective bonus.`
      : `${campaign.question} ${covered} of ${kit.length} instruments for this question were aboard, so cruise science did not get the full bonus.`,
  })
  const primary = objectives.filter((item) => item.id !== 'optional' && item.id !== 'campaign').every((item) => item.met)
  const mistakes: string[] = []
  const strengths: string[] = []
  const lessons: string[] = []
  for (const decision of sim.decisionsMade) {
    if (decision.option === 'ignore' || decision.option === 'degrade' || decision.option === 'ride' || decision.option === 'standoff') {
      mistakes.push(`${decision.title} was left in a degraded state. The score uses that penalty.`)
    }
    if (decision.option === 'correct' || decision.option === 'match' || decision.option === 'repoint' || decision.option === 'safe') {
      strengths.push(`${decision.title} was handled with a burn or a mode change.`)
    }
  }
  if (report.mass.marginKg > mission.maxMassKg * 0.15 && primary) strengths.push('Mass margin stayed comfortable without wasting the launcher.')
  if (report.propulsion.dvMps > report.requiredDvMps * 1.25) lessons.push('A large delta-v surplus means propellant mass that could have been instruments or a cheaper tank.')
  if (report.propulsion.dvMps < report.requiredDvMps * 1.08 && primary) strengths.push('Delta-v was sized close to the plan. That is efficient, and it leaves little room for a missed correction.')
  if (sim.powerMode === 'safe' && sim.brownoutSec > 0) mistakes.push('The bus entered safe mode because generation could not cover the load.')
  if (!primary && !survived) lessons.push(sim.failReason || 'Read the burn that stopped the flight and change that subsystem.')
  if (!dataMet && survived) lessons.push('The link or the contact time could not empty the recorder. Antenna gain and transmit power are the usual levers.')
  if (!scienceMet && survived) lessons.push('Science points come from instruments that stay powered. Duty cycle and power mode both count.')
  if (covered < kit.length) lessons.push(`${campaign.title} is not answered by a generic camera. ${kit.length - covered} instrument${kit.length - covered === 1 ? '' : 's'} from that kit were missing, and a different question wants a different kit.`)
  if (mistakes.length === 0 && primary) strengths.push('The scripted anomalies were absorbed without giving up the primary objectives.')
  const score = scoreOf(primary, objectives[3].met, sim, report.mass.marginKg / mission.maxMassKg, report.cost.marginUsd / mission.budgetUsd)
  return {
    missionId: mission.id,
    craftName: config.name,
    success: primary,
    partial: survived && !primary,
    score,
    objectives,
    sciencePoints: sim.sciencePoints,
    dataReturnedBits: sim.dataReturnedBits,
    propellantUsedKg: used,
    propellantRemainingKg: remaining,
    dvUsedMps: sim.dvUsedMps,
    dvRemainingMps: Math.max(0, propulsion.dvMps - sim.dvUsedMps),
    massKg: mass.totalKg,
    costUsd: report.cost.totalUsd,
    budgetUsd: mission.budgetUsd,
    commsMarginDb: sim.commsMarginDb,
    reliability: report.reliability.seriesReliability,
    decisions: sim.decisionsMade,
    lessons,
    strengths,
    mistakes,
    summary: primary
      ? 'Primary objectives met. The score favours the science return and the margins you did not spend.'
      : survived
        ? 'The spacecraft finished, and at least one primary objective is short.'
        : 'The flight ended before the science window closed.',
    finishedAt: new Date().toISOString(),
  }
}

function scoreOf(primary: boolean, optional: boolean, sim: SimState, massMargin: number, costMargin: number): number {
  if (sim.failed && sim.status === 'failed') return Math.round(8 + Math.min(12, sim.sciencePoints / 10))
  const science = Math.max(0, Math.min(40, sim.sciencePoints / 4))
  const data = sim.dataReturnedBits > 0 ? 15 : 0
  const decisions = sim.decisionsMade.reduce((sum, decision) => sum + (decision.option === 'ignore' || decision.option === 'ride' || decision.option === 'standoff' || decision.option === 'degrade' ? 0 : 4), 0)
  const margins = Math.max(0, Math.min(10, massMargin * 20)) + Math.max(0, Math.min(8, costMargin * 20))
  const base = (primary ? 25 : 8) + (optional ? 8 : 0) + science + data + decisions + margins
  return Math.round(Math.max(0, Math.min(100, base)))
}
