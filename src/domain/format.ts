export function kg(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return 'unavailable'
  return `${value.toFixed(digits)} kg`
}

export function mps(value: number): string {
  if (!Number.isFinite(value)) return 'unavailable'
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} km/s`
  return `${value.toFixed(0)} m/s`
}

export function watts(value: number): string {
  if (!Number.isFinite(value)) return 'unavailable'
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} kW`
  return `${value.toFixed(0)} W`
}

export function money(usd: number): string {
  if (!Number.isFinite(usd)) return 'unavailable'
  const sign = usd < 0 ? '-' : ''
  const abs = Math.abs(usd)
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)} billion`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)} million`
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

export function days(sec: number): string {
  if (!Number.isFinite(sec)) return 'unavailable'
  if (sec < 60) return `${Math.max(0, Math.round(sec))} s`
  if (sec < 3600) {
    const minutes = Math.floor(sec / 60)
    const seconds = Math.round(sec % 60)
    return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`
  }
  if (sec < 172800) return `${(sec / 3600).toFixed(1)} h`
  return `${(sec / 86400).toFixed(1)} days`
}

export function kelvin(value: number): string {
  if (!Number.isFinite(value)) return 'unavailable'
  return `${value.toFixed(0)} K`
}

export function db(value: number): string {
  if (!Number.isFinite(value)) return 'unavailable'
  return `${value.toFixed(1)} dB`
}

export function bits(value: number): string {
  if (!Number.isFinite(value)) return 'unavailable'
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)} Tbit`
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} Gbit`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} Mbit`
  return `${Math.round(value)} bit`
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return 'unavailable'
  return `${(value * 100).toFixed(0)}%`
}

export function clock(sec: number): string {
  if (!Number.isFinite(sec)) return 'unavailable'
  const daysWhole = Math.floor(sec / 86400)
  const hours = Math.floor((sec % 86400) / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  const secs = Math.floor(sec % 60)
  if (daysWhole > 0) return `Day ${daysWhole}, ${hours} h`
  if (hours > 0) return `${hours} h ${mins} min`
  if (mins > 0) return `${mins} min ${secs} s`
  return `${secs} s`
}
