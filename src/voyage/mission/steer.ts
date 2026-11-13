// Powered-descent steering check. GAMEPLAY only: it never replaces the
// divert / direct decision and it cannot skip a landing stage.

export const STEER_MS = 8000;
export const STEER_BAND = 0.22;

export type SteerGrade = 'clear' | 'rough' | 'hard';

export interface SteerSample {
  offset: number;
  error: number;
  samples: number;
}

export interface SteerInput {
  dragging: boolean;
  target: number;
  key: number;
}

export function steerGust(elapsedMs: number) {
  return Math.sin(elapsedMs / 520) * 1.6 + Math.sin(elapsedMs / 190) * 0.9;
}

// `target` is where the pointer is holding the lander (−1..1). `key` is −1, 0 or 1
// from the arrow keys. With no input the gust walks the offset out of the safe band.
export function stepSteer(sample: SteerSample, elapsedMs: number, dt: number, input: SteerInput) {
  const gust = steerGust(elapsedMs);
  let offset = sample.offset + gust * dt * 0.85;
  if (input.dragging) offset += (input.target - offset) * dt * 12;
  else offset += input.key * dt * 2.4;
  offset = Math.max(-1, Math.min(1, offset));
  sample.offset = offset;
  sample.error += Math.max(0, Math.abs(offset) - STEER_BAND);
  sample.samples += 1;
  return offset;
}

export function gradeSteer(meanExcess: number): SteerGrade {
  if (meanExcess < 0.045) return 'clear';
  if (meanExcess < 0.16) return 'rough';
  return 'hard';
}

export function meanSteerExcess(sample: SteerSample) {
  return sample.error / Math.max(1, sample.samples);
}
