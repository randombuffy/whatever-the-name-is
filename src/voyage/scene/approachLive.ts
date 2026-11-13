// Shared approach beat. The landing machine stays on APPROACH the whole time;
// only the picture changes: Earth departure, compressed transit, then Mars closing.

import * as THREE from 'three';

export type ApproachSegment = 'earth' | 'transit' | 'mars';

// launchProgress runs 0 → 1 through the 'earth' picture (the launch from the pad).
export const approachLive: { segment: ApproachSegment; launchProgress: number } = { segment: 'earth', launchProgress: 0 };

// Scene radius of the Earth globe. Mars stays at PLANET_RADIUS in SpaceScene.
export const EARTH_RADIUS = 72;

// Kennedy Space Center is near this latitude and longitude (OBSERVED).
// The pad and the rocket built there are still a fictional gameplay stand-in.
export const LAUNCH_LAT = 28.57;
export const LAUNCH_LON = -80.65;

export function approachDurations(reduced: boolean) {
  // Reduced motion keeps the story order but keeps the prelude under one and a half seconds.
  return reduced ? { earth: 0.8, transit: 0.6 } : { earth: 9.5, transit: 7 };
}

// One sun for the whole space scene, so Earth, the rocket and Mars are lit from the same side.
export const SUN_DIRECTION = new THREE.Vector3(0.78, 0.46, 0.42).normalize();
