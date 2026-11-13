import type { SimState } from './types'

/** Coast runs from real time up to 300,000×. A decision still holds the clock at 1×. */
export const WARP_MIN = 1
export const WARP_MAX = 300_000
const WARP_SPAN = Math.log10(WARP_MAX)

/** Mission clock versus the real clock. 100× means one real second is 100 seconds of flight. */
export function warpLabel(simSecPerReal: number): string {
  const rate = Math.min(WARP_MAX, Math.max(1, simSecPerReal))
  if (rate >= 10_000) {
    const thousands = rate / 1000
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k×`
  }
  return `${Math.max(1, Math.round(rate))}×`
}

/** 0 is 1× and 1 is 300,000×, spaced so the low end stays usable. */
export function sliderToWarp(t: number): number {
  const u = Math.min(1, Math.max(0, t))
  return Math.max(WARP_MIN, Math.min(WARP_MAX, Math.round(10 ** (u * WARP_SPAN))))
}

export function warpToSlider(rate: number): number {
  return Math.min(1, Math.max(0, Math.log10(Math.max(WARP_MIN, Math.min(WARP_MAX, rate))) / WARP_SPAN))
}

/** Only a pending decision holds the clock. The rate on the slider is the rate that runs. */
export function warpCap(sim: Pick<SimState, 'burning' | 'distanceFraction' | 'status'>): number {
  if (sim.status === 'awaiting') return 1
  return WARP_MAX
}

export function effectiveWarp(chosen: number, sim: Pick<SimState, 'burning' | 'distanceFraction' | 'status'>): number {
  return Math.min(Math.max(1, chosen), warpCap(sim))
}
