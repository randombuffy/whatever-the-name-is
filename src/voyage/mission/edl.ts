// Reference entry–descent–landing profile used for the on-screen readouts.
// Milestones are rounded from NASA's published Mars 2020 (Perseverance) EDL timeline:
// entry at ~20,000 km/h, parachute at ~11 km and ~1,500 km/h, heat shield release
// ~20 s later, backshell separation near 2 km. Our vehicle is a conceptual legged
// lander (the Phoenix 2008 / InSight 2018 architecture), so these readouts are an
// educational approximation, not flight telemetry. Visual altitude is compressed.

// Event ids are translated by the interface (edl.ev.<id>).
export type EdlEvent = 'entryInterface' | 'peakHeating' | 'peakDeceleration' | 'guidedEntry' | 'parachuteDeploy'
  | 'parachuteInflation' | 'heatShieldReleased' | 'radarNavigation' | 'backshellSeparation' | 'poweredDescent'
  | 'finalApproach' | 'touchdown' | 'engineCutoff';

export interface EdlSample { altitudeKm: number; speedKmh: number; event: EdlEvent }

type Key = [t: number, altitudeKm: number, speedKmh: number];

const lerpKeys = (keys: Key[], t: number) => {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < keys.length; i += 1) {
    if (clamped <= keys[i][0]) {
      const [t0, a0, s0] = keys[i - 1];
      const [t1, a1, s1] = keys[i];
      const f = (clamped - t0) / (t1 - t0 || 1);
      return { altitudeKm: a0 + (a1 - a0) * f, speedKmh: s0 + (s1 - s0) * f };
    }
  }
  const last = keys[keys.length - 1];
  return { altitudeKm: last[1], speedKmh: last[2] };
};

const ENTRY_KEYS: Key[] = [[0, 125, 19800], [0.3, 60, 18500], [0.55, 32, 9000], [0.8, 16, 3000], [1, 11, 1510]];
const DESCENT_KEYS: Key[] = [[0, 11, 1510], [0.1, 9.5, 520], [0.46, 2.1, 320], [0.55, 1.4, 230], [0.85, 0.25, 100], [1, 0.02, 12]];
const TOUCHDOWN_KEYS: Key[] = [[0, 0.02, 12], [0.45, 0, 8.6], [0.47, 0, 0], [1, 0, 0]];

export function entrySample(t: number): EdlSample {
  const value = lerpKeys(ENTRY_KEYS, t);
  const event: EdlEvent = t < 0.12 ? 'entryInterface' : t < 0.42 ? 'peakHeating' : t < 0.7 ? 'peakDeceleration' : t < 0.94 ? 'guidedEntry' : 'parachuteDeploy';
  return { ...value, event };
}

export function descentSample(t: number): EdlSample {
  const value = lerpKeys(DESCENT_KEYS, t);
  const event: EdlEvent = t < 0.1 ? 'parachuteInflation' : t < 0.16 ? 'heatShieldReleased' : t < 0.46 ? 'radarNavigation' : t < 0.52 ? 'backshellSeparation' : 'poweredDescent';
  return { ...value, event };
}

export function touchdownSample(t: number): EdlSample {
  const value = lerpKeys(TOUCHDOWN_KEYS, t);
  const event: EdlEvent = t < 0.45 ? 'finalApproach' : t < 0.55 ? 'touchdown' : 'engineCutoff';
  return { ...value, event };
}

// Mutable store written by the 3D scene every frame and read by the HUD with
// requestAnimationFrame, so readouts update smoothly without React re-renders.
export const edlLive: EdlSample & { progress: number; awaitingDecision: boolean } = {
  altitudeKm: 125, speedKmh: 19800, event: 'entryInterface', progress: 0, awaitingDecision: false,
};
