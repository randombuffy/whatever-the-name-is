import { CATALOG, getSpec } from './catalog'
import { hashString, nextRandom } from './reliability'
import type { ComponentSpec, MissionDef, SpacecraftConfig, Subsystem } from './types'

/**
 * Seeded assembly in the spirit of Shipwright's name-to-ship generator.
 * Shipwright picked one authored hull. This picks a bus, engine, tank, power source,
 * antenna and the required instruments, then lets the engineering model judge them.
 * The seed is the call sign. The same call sign rebuilds the same parts.
 */
export function assembleFromCallSign(callSign: string, mission: MissionDef): SpacecraftConfig {
  let rng = hashString(callSign.trim().toLowerCase() || mission.id) || 1
  const take = (pool: ComponentSpec[]): ComponentSpec => {
    const roll = nextRandom(rng)
    rng = roll.state
    return pool[Math.floor(roll.value * pool.length)]
  }
  const of = (subsystem: Subsystem) => CATALOG.filter((spec) => spec.subsystem === subsystem)
  const bus = mission.maxMassKg > 2000 ? take(of('structure').filter((spec) => spec.id.startsWith('bus'))) : take(of('structure').filter((spec) => spec.id === 'bus-small' || spec.id === 'bus-probe' || spec.id === 'bus-12u'))
  const engines = of('propulsion').filter((spec) => spec.feedsMainEngine && (mission.id === 'europa' ? spec.propellant === 'electric' : spec.propellant === 'chemical' && spec.thrustN >= 20))
  const engine = take(engines)
  const tanks = of('fuel').filter((spec) => spec.propellant === engine.propellant)
  const tank = take(tanks)
  const power = mission.destinationAu > 3 ? take(of('power').filter((spec) => spec.powerScale === 'constant' || spec.powerGenW >= 2000)) : take(of('power').filter((spec) => spec.powerGenW > 0 && spec.powerGenW <= 2000))
  const battery = take(of('power').filter((spec) => spec.energyWh > 0))
  const antenna = mission.destinationAu > 3 ? getSpec('antenna-hga-l')! : mission.destinationAu > 1.3 ? getSpec('antenna-hga')! : take(of('communications').filter((spec) => spec.antennaGainDbi > 0))
  const ids = [bus.id, engine.id, tank.id, power.id, battery.id, 'transponder', 'acs', antenna.id, 'mli', 'radiator-s']
  for (const instrument of mission.requiredInstruments) {
    const match = CATALOG.find((spec) => spec.instrument === instrument)
    if (match) ids.push(match.id)
  }
  return {
    name: callSign.trim() || 'Unnamed',
    parts: ids.map((specId, index) => ({
      instanceId: `${specId}-g${index}`,
      specId,
      fill: 1,
      enabled: true,
      mount: getSpec(specId)?.mount ?? 'bus',
    })),
  }
}
