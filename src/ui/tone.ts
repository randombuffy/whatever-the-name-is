import { loopFile, playGroup } from './audio'

/** Surface rover and alerts. They share the volume bus. */

export interface FieldTone {
  drive: (speed: number, enabled: boolean) => void
  blip: (freq: number, enabled: boolean) => void
  stop: () => void
}

export function createFieldTone(): FieldTone {
  return {
    drive(speed: number, enabled: boolean) {
      const moving = enabled && Math.abs(speed) > 0.15
      const file = Math.abs(speed) > 6 ? 'VEHCar_CarEngineHigh_LOOP_01.ogg' : 'VEHCar_CarEngineSlow_LOOP_01.ogg'
      loopFile('field-drive', moving ? file : null, Math.min(0.5, 0.12 + Math.abs(speed) * 0.03))
    },
    blip(_freq: number, enabled: boolean) {
      if (!enabled) return
      playGroup('UIAlert_Notification', 0.45)
    },
    stop() {
      loopFile('field-drive', null, 0)
    },
  }
}

/** Booster and cruise-engine roar from the recorded machine loop. */
export function createEngineTone(): { roar: (throttle: number, enabled: boolean) => void; stop: () => void } {
  return {
    roar(throttle: number, enabled: boolean) {
      const open = enabled && throttle > 0.04
      loopFile('engine', open ? 'MACHMisc_MachineGeneric_LOOP_01.ogg' : null, Math.min(0.26, 0.04 + throttle * 0.2))
    },
    stop() {
      loopFile('engine', null, 0)
    },
  }
}
