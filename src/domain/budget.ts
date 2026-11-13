import type { ComponentSpec, CostBudget, SpacecraftConfig } from './types'

/**
 * C = components + launch + operations + contingency.
 * Contingency is a fraction of component cost, set by the mission, defaulting in the scenario file.
 * Launch cost is the vehicle price and does not shrink when the spacecraft is lighter.
 */
export function costBudget(
  config: SpacecraftConfig,
  lookup: (id: string) => ComponentSpec | undefined,
  launchUsd: number,
  opsPerDayUsd: number,
  durationDays: number,
  contingencyRate: number,
  limitUsd: number,
): CostBudget {
  let components = 0
  for (const part of config.parts) {
    const spec = lookup(part.specId)
    if (!spec) continue
    components += finiteNonNeg(spec.costUsd)
  }
  const launch = finiteNonNeg(launchUsd)
  const operations = finiteNonNeg(opsPerDayUsd) * finiteNonNeg(durationDays)
  const rate = Number.isFinite(contingencyRate) ? Math.max(0, contingencyRate) : 0
  const contingency = components * rate
  const total = components + launch + operations + contingency
  return {
    componentsUsd: components,
    launchUsd: launch,
    operationsUsd: operations,
    contingencyUsd: contingency,
    totalUsd: total,
    limitUsd: finiteNonNeg(limitUsd),
    marginUsd: finiteNonNeg(limitUsd) - total,
  }
}

function finiteNonNeg(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0
}
