import { BOLTZMANN } from './constants'
import type { ComponentSpec, LinkBudget, SpacecraftConfig } from './types'

/**
 * Educational downlink.
 * FSPL(dB) = 20 log10(d_km) + 20 log10(f_MHz) + 32.44
 * Pr = Pt + Gt + Gr - FSPL
 * Achievable rate treats the required margin as an Eb/N0 target:
 * R = Pr / (k T Eb/N0)
 * Weather, coding gain and pointing loss are omitted. This is not a CCSDS design.
 */
export function freeSpacePathLossDb(distanceM: number, frequencyHz: number): number | null {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return null
  const dKm = distanceM / 1000
  const fMHz = frequencyHz / 1e6
  return 20 * Math.log10(dKm) + 20 * Math.log10(fMHz) + 32.44
}

export function linkBudget(
  config: SpacecraftConfig,
  lookup: (id: string) => ComponentSpec | undefined,
  distanceM: number,
  groundGainDbi: number,
  groundTempK: number,
  requiredEbNoDb: number,
  minRateBps: number,
): LinkBudget {
  let tx = 0
  let gain = -Infinity
  let freq = 0
  let rate = 0
  for (const part of config.parts) {
    if (!part.enabled) continue
    const spec = lookup(part.specId)
    if (!spec) continue
    if (spec.txPowerW > tx) tx = spec.txPowerW
    if (spec.antennaGainDbi > gain) {
      gain = spec.antennaGainDbi
      if (spec.frequencyHz > 0) freq = spec.frequencyHz
    }
    if (spec.antennaGainDbi > 0 && spec.dataRateBps > rate) rate = spec.dataRateBps
  }
  if (!Number.isFinite(gain)) gain = 0
  if (freq <= 0) freq = 8.4e9
  const fspl = freeSpacePathLossDb(distanceM, freq)
  const empty: LinkBudget = {
    frequencyHz: freq,
    txPowerW: tx,
    gainDbi: Number.isFinite(gain) ? gain : 0,
    fsplDb: fspl ?? 0,
    receivedDbw: -Infinity,
    noiseDbw: 0,
    snrDb: -Infinity,
    marginDb: -Infinity,
    dataRateBps: 0,
    achievableBps: 0,
    distanceM,
    closes: false,
  }
  if (fspl === null || tx <= 0 || !(minRateBps > 0)) return empty
  const ptDbw = 10 * Math.log10(tx)
  const received = ptDbw + gain + groundGainDbi - fspl
  const temp = groundTempK > 0 ? groundTempK : 50
  const ebno = 10 ** ((Number.isFinite(requiredEbNoDb) ? requiredEbNoDb : 8) / 10)
  const prW = 10 ** (received / 10)
  const achievable = prW / (BOLTZMANN * temp * ebno)
  const usable = Math.max(0, Math.min(rate || achievable, achievable))
  const margin = achievable > 0 && minRateBps > 0 ? 10 * Math.log10(achievable / minRateBps) : -Infinity
  return {
    ...empty,
    fsplDb: fspl,
    receivedDbw: received,
    noiseDbw: 10 * Math.log10(BOLTZMANN * temp * Math.max(minRateBps, 1)),
    snrDb: margin,
    marginDb: margin,
    dataRateBps: usable,
    achievableBps: achievable,
    closes: achievable >= minRateBps && gain > 0,
  }
}
