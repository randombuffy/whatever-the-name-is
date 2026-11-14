import type { ComponentType } from 'react'
import {
  Box,
  Flame,
  Fuel,
  Zap,
  Radio,
  Sparkles,
  Thermometer,
  ArrowDownToLine,
  Anchor,
  Wind,
  Sun,
  BatteryCharging,
  Camera,
  Scan,
  Activity,
  Radar,
  Package,
  Wrench,
  Shield,
  Compass,
} from 'lucide-react'
import type { ComponentSpec } from '../domain/types'

export type UiCategory =
  | 'structure'
  | 'propulsion'
  | 'fuel'
  | 'power'
  | 'communications'
  | 'science'
  | 'thermal'
  | 'landing'

export interface CategoryMeta {
  id: UiCategory
  label: string
  color: string
  bg: string
  border: string
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
}

export const CATEGORIES: Record<UiCategory, CategoryMeta> = {
  structure: {
    id: 'structure',
    label: 'Structure',
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.16)',
    border: 'rgba(148, 163, 184, 0.35)',
    icon: Box,
  },
  propulsion: {
    id: 'propulsion',
    label: 'Propulsion',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.16)',
    border: 'rgba(249, 115, 22, 0.35)',
    icon: Flame,
  },
  fuel: {
    id: 'fuel',
    label: 'Fuel',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.16)',
    border: 'rgba(56, 189, 248, 0.35)',
    icon: Fuel,
  },
  power: {
    id: 'power',
    label: 'Power',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.16)',
    border: 'rgba(234, 179, 8, 0.35)',
    icon: Zap,
  },
  communications: {
    id: 'communications',
    label: 'Comms',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.16)',
    border: 'rgba(34, 197, 94, 0.35)',
    icon: Radio,
  },
  science: {
    id: 'science',
    label: 'Science',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.16)',
    border: 'rgba(168, 85, 247, 0.35)',
    icon: Sparkles,
  },
  thermal: {
    id: 'thermal',
    label: 'Thermal',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.16)',
    border: 'rgba(239, 68, 68, 0.35)',
    icon: Thermometer,
  },
  landing: {
    id: 'landing',
    label: 'Landing',
    color: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.16)',
    border: 'rgba(20, 184, 166, 0.35)',
    icon: ArrowDownToLine,
  },
}

export const LANDING_PART_IDS = new Set(['chute', 'descent', 'legs'])

export function getPartCategory(spec: ComponentSpec): UiCategory {
  if (LANDING_PART_IDS.has(spec.id)) return 'landing'
  if (spec.subsystem === 'structure') return 'structure'
  if (spec.subsystem === 'propulsion') return 'propulsion'
  if (spec.subsystem === 'fuel') return 'fuel'
  if (spec.subsystem === 'power') return 'power'
  if (spec.subsystem === 'communications') return 'communications'
  if (spec.subsystem === 'science') return 'science'
  if (spec.subsystem === 'thermal') return 'thermal'
  return 'structure'
}

export function getPartIcon(specId: string): ComponentType<{ size?: number; className?: string; strokeWidth?: number }> {
  if (specId.startsWith('bus') || specId === 'frame') return Box
  if (specId === 'chute') return Wind
  if (specId === 'descent') return ArrowDownToLine
  if (specId === 'legs') return Anchor
  if (specId.startsWith('tank') || specId.startsWith('xenon')) return Fuel
  if (specId.startsWith('panel')) return Sun
  if (specId.startsWith('battery')) return BatteryCharging
  if (specId === 'rtg' || specId === 'fission') return Zap
  if (specId.startsWith('antenna') || specId === 'transponder') return Radio
  if (specId === 'camera') return Camera
  if (specId === 'spectrometer') return Scan
  if (specId === 'magnetometer') return Activity
  if (specId === 'radar') return Radar
  if (specId === 'payload') return Package
  if (specId === 'drill' || specId === 'arm') return Wrench
  if (specId.startsWith('radiator')) return Thermometer
  if (specId === 'heatshield' || specId === 'mli') return Shield
  if (specId === 'acs' || specId === 'cold-gas') return Compass
  return Flame
}

export function plainSpec(item: ComponentSpec): string {
  if (item.tankCapacityKg > 0) {
    return `Holds ${Math.round(item.tankCapacityKg)} kg fuel · Weighs ${Math.round(item.massKg)} kg`
  }
  if (item.thrustN > 0) {
    return `Thrust ${Math.round(item.thrustN)} N · Isp ${Math.round(item.ispS)} s`
  }
  if (item.powerGenW > 0) {
    return `Generates ${Math.round(item.powerGenW)} W · Weighs ${Math.round(item.massKg)} kg`
  }
  if (item.energyWh > 0) {
    return `Stores ${Math.round(item.energyWh)} Wh · Weighs ${Math.round(item.massKg)} kg`
  }
  if (item.powerDrawW > 0 && item.subsystem === 'communications') {
    return `Draws ${Math.round(item.powerDrawW)} W · Weighs ${Math.round(item.massKg)} kg`
  }
  if (item.id === 'chute') return `Atmospheric decelerator · Weighs ${Math.round(item.massKg)} kg`
  if (item.id === 'descent') return `Powered touchdown stage · Weighs ${Math.round(item.massKg)} kg`
  if (item.id === 'legs') return `Touchdown crushables · Weighs ${Math.round(item.massKg)} kg`
  return `Weighs ${Math.round(item.massKg)} kg`
}

export const JARGON_TOOLTIPS: Record<string, string> = {
  mass: 'Total launch weight including parts, fuel, and payload.',
  deltav: 'Delta-v (speed change): Total velocity boost engines can produce with loaded fuel.',
  isp: 'Specific Impulse (Isp): Engine fuel efficiency. Higher Isp gives more speed per kg of propellant.',
  power: 'Net electrical power: Generation from solar or nuclear minus active equipment draw.',
  signal: 'Signal strength (Link dB): Radio signal margin to Earth. Must be positive to receive science.',
  cost: 'Total budget expended on parts, fuel, and payload vs. mission allowance.',
  dryMass: 'Spacecraft weight with all fuel tanks completely empty.',
  propellant: 'Fuel and oxidizer burned by engines to accelerate.',
}
