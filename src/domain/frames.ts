export interface Metres {
  x: number
  y: number
  z: number
}

/**
 * Frames used by the campaign.
 * The cruise state is heliocentric ecliptic metres, with y out of the ecliptic.
 * The chase view rebases onto the ship so the camera never sits at astronomical coordinates.
 * The pad and the surface use local metres, and north is +Z.
 */
export function rebase(point: Metres, origin: Metres): Metres {
  return { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z }
}
