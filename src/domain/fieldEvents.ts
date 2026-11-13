/** Deterministic surface sols. The same sol number always produces the same sky. */

export interface FieldSol {
  storm: boolean
  dust: number
  comms: boolean
  wheel: number
  fault: boolean
  flare: boolean
  label: string
}

export function fieldSol(sol: number, air: boolean, steady: boolean, difficulty: number): FieldSol {
  const day = Math.max(1, Math.floor(sol))
  const storm = air && day % 5 === 0
  const flare = day % 9 === 0
  const comms = day % 4 !== 0
  const fault = day % 7 === 0
  const wheel = day % 6 === 0 ? 0.3 + Math.max(0, Math.min(1, difficulty)) * 0.45 : 0
  let dust = storm ? (steady ? 0.2 : 0.72) : steady ? 0.04 : Math.min(0.48, (day - 1) * 0.06)
  if (flare && !steady) dust = Math.min(1, dust + 0.28)
  let label = 'Clear'
  if (storm) label = 'Dust'
  else if (flare) label = 'Flare'
  else if (!comms) label = 'Blackout'
  else if (fault) label = 'Fault'
  else if (wheel > 0) label = 'Wheel'
  return { storm, dust, comms, wheel, fault, flare, label }
}
