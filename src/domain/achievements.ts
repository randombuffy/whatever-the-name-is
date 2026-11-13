/** Badges are awarded from the flight that just ended. Opening a screen does not qualify. */

export interface Badge {
  id: string
  name: string
  detail: string
}

export interface BadgeInput {
  launched: boolean
  flew: boolean
  failed: boolean
  landing: 'soft' | 'hard' | 'none'
  heat: number
  science: number
  dataBits: number
  dataGoal: number
  underBudget: boolean
  success: boolean
  mars: boolean
}

export function badgesOf(input: BadgeInput): Badge[] {
  const earned: Badge[] = []
  if (input.launched) {
    earned.push({ id: 'launch', name: 'First Launch', detail: 'The stack reached orbit and the cruise started.' })
  }
  if (input.flew && !input.failed) {
    earned.push({ id: 'orbit', name: 'Perfect Orbit', detail: 'Insertion held and the departure burn was flown.' })
  }
  if (input.landing === 'soft' && input.heat <= 0.72) {
    earned.push({ id: 'landing', name: 'Precision Landing', detail: 'Touchdown was soft and the heat stayed inside the limit.' })
  }
  if (input.landing === 'soft' && input.heat <= 0.72) {
    earned.push({ id: 'gear', name: 'Zero Equipment Damage', detail: 'The gear was not bent and entry heat did not fault the first sol.' })
  }
  if (input.science > 0) {
    earned.push({ id: 'science', name: 'Scientific Pioneer', detail: 'Surface findings were filed into the return.' })
  }
  if (input.underBudget) {
    earned.push({ id: 'budget', name: 'Efficient Engineer', detail: 'The craft that flew stayed inside the mission budget.' })
  }
  if (input.dataGoal > 0 && input.dataBits >= input.dataGoal) {
    earned.push({ id: 'data', name: 'Complete Data Return', detail: 'Returned bits met the mission data goal.' })
  }
  if (input.mars && input.landing !== 'none') {
    earned.push({ id: 'mars', name: 'Mars Explorer', detail: 'A Mars campaign reached the surface.' })
  }
  if (input.success) {
    earned.push({ id: 'specialist', name: 'Mission Specialist', detail: 'The primary objectives were met.' })
  }
  return earned
}
