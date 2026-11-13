/** Cap the drawing buffer. A 2× display stays at 1.5 instead of filling every pixel. */
export function viewRatio(reduced = false): number {
  if (reduced) return 1
  return Math.min(1.5, window.devicePixelRatio || 1)
}
