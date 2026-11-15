import { kitCoverage, objectiveKit, objectiveOf } from './campaign'
import { getSpec } from './catalog'
import { massBudget } from './mass'
import { propulsionBudget } from './propulsion'
import { evaluate } from './validate'
import type { MissionDef, MissionOutcome, MissionPlan, SimState, SpacecraftConfig } from './types'

export function debriefVerdict(outcome: Pick<MissionOutcome, 'success' | 'partial' | 'score'>): {
  title: string
  tone: 'win' | 'partial' | 'lose'
} {
  if (outcome.success) return { title: 'You won', tone: 'win' }
  if (outcome.score >= 80) return { title: 'Strong run', tone: 'win' }
  if (outcome.partial || outcome.score >= 50) return { title: 'Partial result', tone: 'partial' }
  return { title: 'You lost', tone: 'lose' }
}

export function outcomeOf(
  config: SpacecraftConfig,
  mission: MissionDef,
  plan: MissionPlan,
  sim: SimState,
  landing: 'soft' | 'hard' | 'none' = 'none',
): MissionOutcome {
  const report = evaluate(config, mission, plan)
  const propulsion = propulsionBudget(config, getSpec)
  const mass = massBudget(config, getSpec, mission.maxMassKg)
  const remaining = sim.propellant.chemical + sim.propellant.electric + sim.propellant['cold-gas']
  const used = Math.max(0, mass.propellantKg - remaining)
  const scienceMet = sim.sciencePoints + 1e-6 >= mission.successScience
  const dataMet = sim.dataReturnedBits + 1 >= mission.successDataBits
  const reached =
    (!sim.failed && (sim.status === 'complete' || sim.distanceFraction >= 0.99)) || landing !== 'none'
  const survived = reached
  const objectives = [
    { id: 'survive', label: 'Finish the flight', met: survived, detail: survived ? 'Arrived.' : sim.failReason || 'Stopped early.' },
    { id: 'science', label: 'Science', met: survived && scienceMet, detail: `${sim.sciencePoints.toFixed(0)} / ${mission.successScience}` },
    { id: 'data', label: 'Data sent', met: survived && dataMet, detail: `${(sim.dataReturnedBits / 1e9).toFixed(2)} / ${(mission.successDataBits / 1e9).toFixed(2)} Gbit` },
    { id: 'optional', label: 'Bonus science', met: survived && sim.sciencePoints >= mission.optionalScience, detail: `${sim.sciencePoints.toFixed(0)} / ${mission.optionalScience}` },
  ]
  const campaign = objectiveOf(plan)
  const kit = objectiveKit(plan.objectiveId)
  const coverage = kitCoverage(plan.objectiveId, config.parts.filter((part) => part.enabled).map((part) => part.specId))
  const covered = Math.round(coverage * kit.length)
  objectives.push({
    id: 'campaign',
    label: campaign.title,
    met: survived && covered === kit.length,
    detail: covered === kit.length ? 'The right instruments were aboard.' : `${covered} of ${kit.length} kit instruments aboard.`,
  })
  const primary = objectives.filter((item) => item.id !== 'optional' && item.id !== 'campaign').every((item) => item.met)
  const lessons: string[] = []
  if (!survived) lessons.push(sim.failReason || 'The flight stopped early.')
  else if (!scienceMet) lessons.push('Collect and send more samples, or keep the instruments powered.')
  else if (!dataMet) lessons.push('Send the held samples and keep the radio open.')
  else if (covered < kit.length) lessons.push(`Fit the missing ${kit.length - covered} kit instrument${kit.length - covered === 1 ? '' : 's'}.`)

  const costMargin = (mission.budgetUsd - report.cost.totalUsd) / mission.budgetUsd
  const massMargin = report.mass.marginKg / mission.maxMassKg

  const breakdown = calculateScoreBreakdown(sim, mission, massMargin, costMargin, landing)
  const score = breakdown.total
  const gradeRank: 'S' | 'A' | 'B' | 'C' | 'F' =
    score >= 92 ? 'S' : score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'F'

  return {
    missionId: mission.id,
    craftName: config.name,
    success: primary,
    partial: survived && !primary,
    score,
    gradeRank,
    scoreBreakdown: breakdown,
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
    lessons: lessons.slice(0, 2),
    strengths: [],
    mistakes: [],
    summary: primary
      ? 'Goals met.'
      : survived
        ? 'The flight finished. Some goals were short.'
        : sim.failed
          ? sim.failReason || 'The flight stopped early.'
          : 'The flight stopped early.',
    finishedAt: new Date().toISOString(),
  }
}

function calculateScoreBreakdown(
  sim: SimState,
  mission: MissionDef,
  massMargin: number,
  costMargin: number,
  landing: 'soft' | 'hard' | 'none',
) {
  const arrived = !sim.failed && (sim.status === 'complete' || sim.distanceFraction >= 0.99 || landing !== 'none')
  let primaryPoints = 0
  if (sim.failed) primaryPoints = Math.round(Math.min(10, sim.distanceFraction * 12))
  else if (arrived) primaryPoints = sim.status === 'complete' || landing !== 'none' ? 30 : 24
  else primaryPoints = Math.round(10 + Math.min(1, sim.distanceFraction) * 14)
  if (massMargin > 0.08 && arrived) primaryPoints = Math.min(30, primaryPoints + 2)

  const scienceRatio = Math.min(1, sim.sciencePoints / Math.max(1, mission.successScience))
  const sciencePoints = Math.round(scienceRatio * 30)

  const dataRatio = Math.min(1, sim.dataReturnedBits / Math.max(1, mission.successDataBits))
  const dataPoints = Math.round(Math.sqrt(dataRatio) * 25)

  const budgetPoints = costMargin < 0 ? 0 : Math.round(Math.min(15, 10 + costMargin * 10))
  const landingPoints = 0

  const total = Math.round(
    Math.max(0, Math.min(100, primaryPoints + sciencePoints + dataPoints + budgetPoints + landingPoints))
  )

  return {
    primaryPoints,
    sciencePoints,
    dataPoints,
    budgetPoints,
    landingPoints,
    anomalyPoints: 0,
    total,
  }
}
