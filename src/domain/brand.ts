/** Product name shown in the shell, boot gate, credits, and docs. */
export const APP_NAME = 'AeroAestro'

export const STORAGE_MAIN = 'aeroaestro-v1'
export const STORAGE_BINDS = 'aeroaestro-binds-v2'
export const STORAGE_FLIGHT_GUIDE = 'aeroaestro-flight-guide'

const LEGACY = {
  main: 'mission-control-v1',
  binds: 'mission-control-binds-v2',
  flightGuide: 'mission-control-flight-guide',
} as const

/** One-time copy so deploys under the new name keep saved campaigns. */
export function migrateLegacyStorage(): void {
  if (typeof window === 'undefined') return
  try {
    if (!localStorage.getItem(STORAGE_MAIN) && localStorage.getItem(LEGACY.main)) {
      localStorage.setItem(STORAGE_MAIN, localStorage.getItem(LEGACY.main)!)
    }
    if (!localStorage.getItem(STORAGE_BINDS) && localStorage.getItem(LEGACY.binds)) {
      localStorage.setItem(STORAGE_BINDS, localStorage.getItem(LEGACY.binds)!)
    }
    if (!localStorage.getItem(STORAGE_FLIGHT_GUIDE) && localStorage.getItem(LEGACY.flightGuide)) {
      localStorage.setItem(STORAGE_FLIGHT_GUIDE, localStorage.getItem(LEGACY.flightGuide)!)
    }
  } catch {
    /* private mode */
  }
}