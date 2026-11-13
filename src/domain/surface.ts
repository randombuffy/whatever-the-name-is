export interface DriveState {
  x: number
  z: number
  yaw: number
  speed: number
}

export interface DriveInput {
  throttle: number
  steer: number
  brake: boolean
  park: boolean
  boost: boolean
  massKg: number
  gravity: number
  rough: number
  gradX: number
  gradZ: number
}

function crater(x: number, z: number, cx: number, cz: number, radius: number, depth: number): number {
  const d = Math.hypot(x - cx, z - cz) / radius
  if (d > 1.45) return 0
  const bowl = d < 1 ? (d * d - 1) * depth : 0
  const rim = Math.exp(-(d - 1) * (d - 1) * 22) * depth * 0.28
  return bowl + rim
}

function waves(x: number, z: number, amp: number): number {
  return Math.sin(x * 0.09) * amp + Math.cos(z * 0.07) * amp * 0.7 + Math.sin((x + z) * 0.04) * amp * 0.45
}

/** Metres of relief for the landing region. Each site keeps a different shape. */
export function surfaceHeight(siteId: string, x: number, z: number): number {
  let h = waves(x, z, 0.85)
  h += crater(x, z, 22, -14, 11, 2.2)
  h += crater(x, z, -28, 18, 8, 1.4)
  h += crater(x, z, -8, -26, 6, 1.1)
  if (siteId === 'meridiani' || siteId === 'mare' || siteId === 'europa-plain' || siteId === 'equator') h *= 0.28
  if (siteId === 'utopia') h *= 0.45
  if (siteId === 'jezero') {
    const radius = Math.hypot(x, z)
    h += Math.sin(Math.atan2(z, x) * 6) * Math.exp(-radius / 36) * 1.8
    h += crater(x, z, -6, 4, 16, 1.6)
  }
  if (siteId === 'gale') h += 6.5 * Math.exp(-((x - 12) ** 2 + (z + 6) ** 2) / 420)
  if (siteId === 'valles' || siteId === 'chaos') {
    const wall = Math.min(9, Math.abs(x) * 0.14)
    const floor = Math.exp(-(x * x) / 70) * (siteId === 'chaos' ? 3.2 : 6.5)
    h = h * 0.35 + wall - floor
  }
  if (siteId === 'farside' || siteId === 'pole' || siteId === 'boulders') h += waves(x * 1.4, z * 1.2, 1.1)
  const radial = Math.hypot(x, z)
  if (radial > 78) h += (radial - 78) * 0.055 + Math.sin(Math.atan2(z, x) * 8) * 2.4
  return h
}

/**
 * Heightfield rover step. Force, mass, slope, and slip change the speed.
 * Drive speed is faster than a real rover so the landing region can be crossed.
 */
export function stepDrive(state: DriveState, input: DriveInput, dt: number): DriveState {
  const step = Math.min(0.05, Math.max(0, dt))
  const along = input.gradX * Math.sin(state.yaw) + input.gradZ * Math.cos(state.yaw)
  const slope = Math.hypot(input.gradX, input.gradZ)
  const slip = Math.min(1, slope / 0.7 + input.rough * 0.25)
  const traction = 1 - slip * 0.55
  const force = 240 + input.massKg * 0.35
  const throttle = input.park ? 0 : Math.max(-1, Math.min(1, input.throttle))
  let accel = (throttle * force * traction) / Math.max(20, input.massKg)
  accel -= input.gravity * along * 0.9
  if (input.brake) accel -= Math.sign(state.speed || throttle) * 5
  const cap = input.boost ? 3.4 : 1.35
  let speed = input.park ? state.speed * Math.exp(-step * 14) : (state.speed + accel * step) * Math.exp(-step * (0.55 + input.rough * 0.35))
  speed = Math.max(-0.8, Math.min(cap, speed))
  if (input.park && Math.abs(speed) < 0.08) speed = 0
  else if (!input.park && Math.abs(speed) < 0.02 && Math.abs(throttle) < 0.05) speed = 0
  const steer = input.park ? 0 : Math.max(-1, Math.min(1, input.steer))
  const turn = steer * Math.min(1.4, Math.abs(speed) / 1.1) * (1.05 - slip * 0.4)
  const yaw = state.yaw + turn * step * (speed >= 0 ? 1 : -1)
  const slide = input.park ? 0 : slip * input.gravity * 0.12 * step
  return {
    x: state.x + Math.sin(yaw) * speed * step - input.gradX * slide,
    z: state.z + Math.cos(yaw) * speed * step - input.gradZ * slide,
    yaw,
    speed,
  }
}
