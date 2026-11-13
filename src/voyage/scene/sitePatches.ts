// Sharper map patches around each landing site, laid over the globe during entry, when the
// camera is close enough for the global 4096 × 2048 map to look soft. Each patch covers
// ±12° of latitude and the same ground distance east–west (12° / cos latitude).
// Used by the app (SpaceScene) and by scripts/build-mars-textures.mjs, so both agree exactly.

export const PATCH_HALF_DEGREES = 12;

export interface SitePatch { south: number; north: number; west: number; east: number }

export function patchAround(lat: number, lon: number): SitePatch {
  const halfLon = PATCH_HALF_DEGREES / Math.cos((lat * Math.PI) / 180);
  return { south: lat - PATCH_HALF_DEGREES, north: lat + PATCH_HALF_DEGREES, west: lon - halfLon, east: lon + halfLon };
}
