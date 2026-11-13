const ALIAS: Record<string, string> = {
  arrowup: 'w',
  arrowdown: 's',
  arrowleft: 'a',
  arrowright: 'd',
}

/** Arrow keys do the same job as WASD. Arrows no longer scroll the page. */
export function trackMove(keys: Set<string>, event: KeyboardEvent): string {
  const raw = event.key === ' ' ? ' ' : event.key.toLowerCase()
  const alias = ALIAS[raw]
  if (alias) event.preventDefault()
  if (event.type === 'keydown') {
    keys.add(raw)
    if (alias) keys.add(alias)
  } else {
    keys.delete(raw)
    if (alias) keys.delete(alias)
  }
  return raw
}
