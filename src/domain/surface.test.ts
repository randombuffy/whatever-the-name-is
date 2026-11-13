import { describe, expect, it } from 'vitest'
import { stepDrive, surfaceHeight, type DriveInput, type DriveState } from './surface'

const flat: DriveInput = {
  throttle: 1,
  steer: 0,
  brake: false,
  park: false,
  boost: false,
  massKg: 80,
  gravity: 3.71,
  rough: 0.2,
  gradX: 0,
  gradZ: 0,
}

describe('surface', () => {
  it('keeps Meridiani flatter than the Gale mound and the Valles floor below its wall', () => {
    expect(surfaceHeight('gale', 12, -6)).toBeGreaterThan(surfaceHeight('meridiani', 12, -6) + 3)
    expect(surfaceHeight('valles', 0, 0)).toBeLessThan(surfaceHeight('valles', 24, 0) - 3)
  })

  it('gains speed on a flat and stops when parked', () => {
    let state: DriveState = { x: 0, z: 0, yaw: 0, speed: 0 }
    for (let i = 0; i < 30; i++) state = stepDrive(state, flat, 0.05)
    expect(state.speed).toBeGreaterThan(0.4)
    for (let i = 0; i < 40; i++) state = stepDrive(state, { ...flat, throttle: 0, park: true }, 0.05)
    expect(Math.abs(state.speed)).toBeLessThan(0.05)
  })

  it('lets a light rover climb a grade that stops a heavy one', () => {
    const grade: DriveInput = { ...flat, throttle: 1, gradX: 0.62, gradZ: 0, gravity: 3.71, rough: 0.2 }
    const facing = Math.PI / 2
    let light: DriveState = { x: 0, z: 0, yaw: facing, speed: 0 }
    let heavy: DriveState = { x: 0, z: 0, yaw: facing, speed: 0 }
    for (let i = 0; i < 40; i++) {
      light = stepDrive(light, { ...grade, massKg: 42 }, 0.05)
      heavy = stepDrive(heavy, { ...grade, massKg: 420 }, 0.05)
    }
    expect(light.speed).toBeGreaterThan(0.2)
    expect(heavy.speed).toBeLessThan(0)
  })

  it('sheds speed under braking', () => {
    let state: DriveState = { x: 0, z: 0, yaw: 0, speed: 2 }
    for (let i = 0; i < 20; i++) state = stepDrive(state, { ...flat, throttle: 0, brake: true }, 0.05)
    expect(state.speed).toBeLessThan(0.4)
  })
})
