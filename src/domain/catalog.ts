import type { ComponentSpec } from './types'

const band = {
  tempMinK: 253,
  tempMaxK: 323,
  hazard: 0.01,
}

function base(partial: Partial<ComponentSpec> & Pick<ComponentSpec, 'id' | 'name' | 'subsystem' | 'summary' | 'massKg' | 'costUsd'>): ComponentSpec {
  return {
    powerDrawW: 0,
    powerGenW: 0,
    powerScale: 'solar',
    energyWh: 0,
    thrustN: 0,
    ispS: 0,
    onboardPropellantKg: 0,
    tankCapacityKg: 0,
    propellant: 'none',
    feedsMainEngine: false,
    hazardPerYear: band.hazard,
    tempMinK: band.tempMinK,
    tempMaxK: band.tempMaxK,
    heatW: 0,
    radiatorM2: 0,
    absorptivityDrop: 0,
    txPowerW: 0,
    antennaGainDbi: 0,
    frequencyHz: 0,
    dataRateBps: 0,
    storageBits: 0,
    sciencePoints: 0,
    instrument: null,
    mount: 'bus',
    ...partial,
  }
}

/**
 * Illustrative catalog. Figures are game values chosen so the trade-offs are real.
 * They are not vendor quotes and not NASA flight-hardware specifications.
 * Add a part by appending an object. The engineering engine only reads these fields.
 */
export const CATALOG: ComponentSpec[] = [
  base({ id: 'bus-12u', name: '12U spacecraft bus', subsystem: 'structure', summary: 'Small bus with avionics, for short missions near Earth.', massKg: 9, costUsd: 1_400_000, powerDrawW: 18, heatW: 8, hazardPerYear: 0.03, mount: 'bus' }),
  base({ id: 'bus-small', name: 'Smallsat bus', subsystem: 'structure', summary: 'Bus sized for lunar and near-Earth work, including command and data handling.', massKg: 72, costUsd: 7_500_000, powerDrawW: 42, heatW: 20, hazardPerYear: 0.02, mount: 'bus' }),
  base({ id: 'bus-probe', name: 'Interplanetary probe bus', subsystem: 'structure', summary: 'Heavier bus with a stronger structure and a larger avionics allocation.', massKg: 210, costUsd: 24_000_000, powerDrawW: 85, heatW: 40, hazardPerYear: 0.015, mount: 'bus' }),
  base({ id: 'bus-deep', name: 'Deep space bus', subsystem: 'structure', summary: 'Long-life bus. The mass and power draw are the price of the reliability.', massKg: 460, costUsd: 55_000_000, powerDrawW: 130, heatW: 60, hazardPerYear: 0.012, tempMinK: 243, tempMaxK: 323, mount: 'bus' }),
  base({ id: 'frame', name: 'Secondary structure', subsystem: 'structure', summary: 'Extra frame for tanks and instruments. Mass with no performance of its own.', massKg: 6, costUsd: 400_000, mount: 'bus' }),

  base({ id: 'acs', name: 'Attitude thruster set', subsystem: 'propulsion', summary: 'Small chemical thrusters with their own propellant, for corrections under a few tens of metres per second.', massKg: 2.4, costUsd: 450_000, powerDrawW: 8, thrustN: 4, ispS: 220, onboardPropellantKg: 3.5, propellant: 'chemical', feedsMainEngine: false, hazardPerYear: 0.02, mount: 'nadir' }),
  base({ id: 'cold-gas', name: 'Cold gas thruster', subsystem: 'propulsion', summary: 'Simple and light. Specific impulse is poor, so propellant mass grows quickly.', massKg: 1.8, costUsd: 220_000, thrustN: 1.2, ispS: 68, propellant: 'cold-gas', feedsMainEngine: true, hazardPerYear: 0.012, mount: 'aft' }),
  base({ id: 'monoprop', name: 'Monopropellant engine', subsystem: 'propulsion', summary: 'Hydrazine monopropellant. Modest thrust and specific impulse.', massKg: 3.6, costUsd: 900_000, powerDrawW: 15, thrustN: 22, ispS: 228, propellant: 'chemical', feedsMainEngine: true, hazardPerYear: 0.02, mount: 'aft' }),
  base({ id: 'biprop-450', name: 'Bipropellant engine, 450 N', subsystem: 'propulsion', summary: 'Storable bipropellant. The workhorse for lunar and Mars departure burns.', massKg: 16, costUsd: 4_200_000, powerDrawW: 35, thrustN: 450, ispS: 321, propellant: 'chemical', feedsMainEngine: true, hazardPerYear: 0.025, mount: 'aft' }),
  base({ id: 'biprop-4k', name: 'Bipropellant engine, 4 kN', subsystem: 'propulsion', summary: 'Higher thrust shortens the burn. The engine itself is heavy and costly.', massKg: 62, costUsd: 11_000_000, powerDrawW: 90, thrustN: 4000, ispS: 332, propellant: 'chemical', feedsMainEngine: true, hazardPerYear: 0.03, mount: 'aft' }),
  base({ id: 'ion', name: 'Ion thruster', subsystem: 'propulsion', summary: 'High specific impulse, very low thrust, high electrical demand. Useless without kilowatts.', massKg: 14, costUsd: 6_500_000, powerDrawW: 1450, thrustN: 0.085, ispS: 3200, propellant: 'electric', feedsMainEngine: true, hazardPerYear: 0.03, mount: 'aft' }),
  base({ id: 'hall', name: 'Hall thruster', subsystem: 'propulsion', summary: 'More thrust than the ion engine, lower specific impulse, still power hungry.', massKg: 20, costUsd: 8_000_000, powerDrawW: 1900, thrustN: 0.22, ispS: 1650, propellant: 'electric', feedsMainEngine: true, hazardPerYear: 0.028, mount: 'aft' }),

  base({ id: 'tank-40', name: 'Chemical tank, 40 kg', subsystem: 'fuel', summary: 'Small storable tank. Dry mass is low. Capacity usually is not enough for a lunar injection.', massKg: 5, costUsd: 180_000, tankCapacityKg: 40, propellant: 'chemical', hazardPerYear: 0.006, mount: 'aft' }),
  base({ id: 'tank-160', name: 'Chemical tank, 160 kg', subsystem: 'fuel', summary: 'Mid-size tank. A common fix when delta-v is short and the mass limit still has room.', massKg: 14, costUsd: 420_000, tankCapacityKg: 160, propellant: 'chemical', hazardPerYear: 0.006, mount: 'aft' }),
  base({ id: 'tank-500', name: 'Chemical tank, 500 kg', subsystem: 'fuel', summary: 'Large storable tank. Watch the launch mass.', massKg: 38, costUsd: 900_000, tankCapacityKg: 500, propellant: 'chemical', hazardPerYear: 0.007, mount: 'aft' }),
  base({ id: 'tank-1500', name: 'Chemical tank, 1500 kg', subsystem: 'fuel', summary: 'Very large tank. The propellant dominates the mass budget.', massKg: 95, costUsd: 2_100_000, tankCapacityKg: 1500, propellant: 'chemical', hazardPerYear: 0.008, mount: 'aft' }),
  base({ id: 'tank-xe-30', name: 'Xenon tank, 30 kg', subsystem: 'fuel', summary: 'Electric-propulsion tank. A little xenon goes a long way only if the thruster can actually run.', massKg: 9, costUsd: 1_200_000, tankCapacityKg: 30, propellant: 'electric', hazardPerYear: 0.008, mount: 'aft' }),
  base({ id: 'tank-xe-120', name: 'Xenon tank, 120 kg', subsystem: 'fuel', summary: 'Deep-space electric tank. Pair it with a power source that still works far from the Sun.', massKg: 24, costUsd: 2_800_000, tankCapacityKg: 120, propellant: 'electric', hazardPerYear: 0.008, mount: 'aft' }),

  base({ id: 'panel-150', name: 'Solar array, 150 W', subsystem: 'power', summary: 'Rated at 1 AU, full sun. Output falls with the square of heliocentric distance.', massKg: 3.2, costUsd: 380_000, powerGenW: 150, powerScale: 'solar', hazardPerYear: 0.015, mount: 'port' }),
  base({ id: 'panel-600', name: 'Solar array, 600 W', subsystem: 'power', summary: 'Rated at 1 AU in clean sun. Output falls with the square of distance, and dust on a Mars panel takes another share of what is left. A radioisotope supply does not have that loss.', massKg: 10, costUsd: 1_100_000, powerGenW: 600, powerScale: 'solar', hazardPerYear: 0.016, mount: 'port' }),
  base({ id: 'panel-2000', name: 'Solar array, 2 kW', subsystem: 'power', summary: 'Large array. Mass and cost rise faster than the convenience of the extra watts.', massKg: 32, costUsd: 3_400_000, powerGenW: 2000, powerScale: 'solar', hazardPerYear: 0.018, mount: 'port' }),
  base({ id: 'panel-8000', name: 'Solar array, 8 kW', subsystem: 'power', summary: 'Enough to run a Hall thruster near Earth. At Jupiter the same array is a trickle.', massKg: 110, costUsd: 9_500_000, powerGenW: 8000, powerScale: 'solar', hazardPerYear: 0.02, mount: 'port' }),
  base({ id: 'battery-200', name: 'Battery, 200 Wh', subsystem: 'power', summary: 'Covers a short eclipse of a modest hotel load. Not a propulsion battery.', massKg: 2.2, costUsd: 160_000, energyWh: 200, hazardPerYear: 0.02, mount: 'bus' }),
  base({ id: 'battery-1500', name: 'Battery, 1.5 kWh', subsystem: 'power', summary: 'Eclipse margin for a heavier load, or a short electric-thrust interruption.', massKg: 11, costUsd: 640_000, energyWh: 1500, hazardPerYear: 0.02, mount: 'bus' }),
  base({ id: 'battery-6000', name: 'Battery, 6 kWh', subsystem: 'power', summary: 'Heavy storage. Useful when generation is bursty. It does not replace a power source.', massKg: 38, costUsd: 1_800_000, energyWh: 6000, hazardPerYear: 0.022, mount: 'bus' }),
  base({ id: 'rtg', name: 'Radioisotope supply', subsystem: 'power', summary: 'Turns the heat of radioactive decay into a steady 110 W through thermocouples. Output does not follow sunlight, distance, or dust. The decay heat still has to be rejected. This is not a battery.', massKg: 48, costUsd: 28_000_000, powerGenW: 110, powerScale: 'constant', hazardPerYear: 0.008, heatW: 180, mount: 'aft' }),
  base({ id: 'fission', name: 'Illustrative fission supply', subsystem: 'power', summary: 'Constant 2.8 kW. Heavy, expensive, and the practical way to run electric propulsion at Jupiter in this game. Not a reactor design.', massKg: 260, costUsd: 90_000_000, powerGenW: 2800, powerScale: 'constant', hazardPerYear: 0.01, heatW: 4000, radiatorM2: 4, mount: 'aft' }),

  base({ id: 'transponder', name: 'Deep space transponder', subsystem: 'communications', summary: 'Radio and recorder. An antenna still has to close the link. The recorder holds data until a contact.', massKg: 3.8, costUsd: 1_600_000, powerDrawW: 22, storageBits: 2.5e11, dataRateBps: 0, hazardPerYear: 0.012, mount: 'bus' }),
  base({ id: 'antenna-lga', name: 'Low-gain antenna', subsystem: 'communications', summary: 'Wide beam, small gain. Fine near Earth. It will not carry a Mars science return.', massKg: 0.5, costUsd: 120_000, powerDrawW: 6, txPowerW: 8, antennaGainDbi: 3, frequencyHz: 2.2e9, dataRateBps: 4_000, hazardPerYear: 0.008, mount: 'zenith' }),
  base({ id: 'antenna-mga', name: 'Medium-gain antenna', subsystem: 'communications', summary: 'A compromise. Better than a low-gain patch, lighter than a dish.', massKg: 2.2, costUsd: 480_000, powerDrawW: 18, txPowerW: 20, antennaGainDbi: 16, frequencyHz: 8.4e9, dataRateBps: 40_000, hazardPerYear: 0.01, mount: 'zenith' }),
  base({ id: 'antenna-hga', name: 'High-gain antenna, 0.8 m class', subsystem: 'communications', summary: 'X-band dish. The usual answer when the link margin at the destination is negative.', massKg: 6.5, costUsd: 1_400_000, powerDrawW: 35, txPowerW: 45, antennaGainDbi: 30, frequencyHz: 8.4e9, dataRateBps: 250_000, hazardPerYear: 0.012, mount: 'zenith' }),
  base({ id: 'antenna-hga-l', name: 'High-gain antenna, 2.5 m class', subsystem: 'communications', summary: 'Large dish for the outer solar system. Mass, power and cost all move together.', massKg: 24, costUsd: 4_800_000, powerDrawW: 80, txPowerW: 80, antennaGainDbi: 42, frequencyHz: 8.4e9, dataRateBps: 1_500_000, hazardPerYear: 0.014, mount: 'zenith' }),

  base({ id: 'camera', name: 'Imaging camera', subsystem: 'science', summary: 'Context images. Required on every mission in this set.', massKg: 2.4, costUsd: 800_000, powerDrawW: 12, dataRateBps: 1_500_000, sciencePoints: 25, instrument: 'camera', hazardPerYear: 0.01, mount: 'forward' }),
  base({ id: 'spectrometer', name: 'Imaging spectrometer', subsystem: 'science', summary: 'Composition. Heavier and thirstier than the camera, and worth it when the objective asks.', massKg: 6.5, costUsd: 2_200_000, powerDrawW: 28, dataRateBps: 600_000, sciencePoints: 40, instrument: 'spectrometer', hazardPerYear: 0.014, mount: 'forward' }),
  base({ id: 'magnetometer', name: 'Magnetometer', subsystem: 'science', summary: 'Light instrument on a short boom. Low power, modest data.', massKg: 1.4, costUsd: 450_000, powerDrawW: 4, dataRateBps: 20_000, sciencePoints: 18, instrument: 'magnetometer', hazardPerYear: 0.01, mount: 'forward' }),
  base({ id: 'radar', name: 'Sounding radar', subsystem: 'science', summary: 'High power and high data rate. A real mass and energy commitment.', massKg: 16, costUsd: 5_200_000, powerDrawW: 90, dataRateBps: 4_000_000, sciencePoints: 45, instrument: 'radar', hazardPerYear: 0.02, mount: 'nadir' }),
  base({ id: 'particle', name: 'Particle detector', subsystem: 'science', summary: 'Charged-particle measurements. Required at Europa in this scenario set.', massKg: 4.2, costUsd: 1_300_000, powerDrawW: 14, dataRateBps: 80_000, sciencePoints: 30, instrument: 'particle', hazardPerYear: 0.012, mount: 'forward' }),
  base({ id: 'payload', name: 'Science payload bay', subsystem: 'science', summary: 'A general instrument package. Points without satisfying a named instrument requirement.', massKg: 12, costUsd: 2_600_000, powerDrawW: 20, dataRateBps: 800_000, sciencePoints: 22, instrument: 'payload', hazardPerYear: 0.015, mount: 'forward' }),

  base({ id: 'mli', name: 'Multilayer insulation', subsystem: 'thermal', summary: 'Lowers absorbed sunlight. It does not reject heat from the electronics by itself.', massKg: 2.2, costUsd: 250_000, absorptivityDrop: 0.22, hazardPerYear: 0.004, mount: 'bus' }),
  base({ id: 'radiator-s', name: 'Radiator, 0.6 m²', subsystem: 'thermal', summary: 'Small radiator. Usually enough near Earth if the electrical load is modest.', massKg: 3.4, costUsd: 320_000, radiatorM2: 0.6, hazardPerYear: 0.008, mount: 'starboard' }),
  base({ id: 'radiator-l', name: 'Radiator, 2.4 m²', subsystem: 'thermal', summary: 'Needed when a power supply or a radar dumps a lot of heat.', massKg: 11, costUsd: 900_000, radiatorM2: 2.4, hazardPerYear: 0.01, mount: 'starboard' }),
  base({ id: 'heaters', name: 'Heater circuit', subsystem: 'thermal', summary: 'Electrical heat for the cold case. It spends the power you saved by flying far from the Sun.', massKg: 2, costUsd: 180_000, powerDrawW: 45, heatW: 40, hazardPerYear: 0.01, mount: 'bus' }),

  base({ id: 'heatshield', name: 'Heat shield', subsystem: 'thermal', summary: 'Ablative cover for entry. It is dead mass from launch until the atmosphere, and it still counts in delta-v.', massKg: 78, costUsd: 4_200_000, tempMaxK: 1600, hazardPerYear: 0.01, mount: 'aft' }),
  base({ id: 'chute', name: 'Parachute', subsystem: 'structure', summary: 'Opens in an atmosphere and cuts the sink rate. An airless landing does not get this help.', massKg: 16, costUsd: 1_100_000, hazardPerYear: 0.012, mount: 'forward' }),
  base({ id: 'descent', name: 'Descent stage', subsystem: 'structure', summary: 'The powered stage under the payload. Its dry mass is carried through cruise, so the same tanks buy less delta-v.', massKg: 240, costUsd: 18_000_000, powerDrawW: 40, hazardPerYear: 0.02, mount: 'aft' }),
  base({ id: 'legs', name: 'Landing legs', subsystem: 'structure', summary: 'Legs and crushables. Light next to the stage, and still part of the launch mass.', massKg: 28, costUsd: 900_000, hazardPerYear: 0.01, mount: 'aft' }),
  base({ id: 'rover-light', name: 'Scout rover', subsystem: 'science', summary: 'A small rover for the surface. It rides as payload the whole way, so it costs delta-v before it drives a metre.', massKg: 42, costUsd: 6_000_000, powerDrawW: 28, sciencePoints: 20, instrument: 'rover', dataRateBps: 200_000, hazardPerYear: 0.02, mount: 'forward' }),
  base({ id: 'rover-heavy', name: 'Laboratory rover', subsystem: 'science', summary: 'A 420 kg laboratory rover in this catalog, so the mass trade is visible on a small stack. A real Perseverance-class rover is nearer a tonne and flies on a larger vehicle.', massKg: 420, costUsd: 32_000_000, powerDrawW: 90, sciencePoints: 48, instrument: 'rover', dataRateBps: 1_500_000, hazardPerYear: 0.018, mount: 'forward' }),
  base({ id: 'heli', name: 'Mars helicopter', subsystem: 'science', summary: 'Ingenuity class. A few kilograms that scout ground the rover cannot cross. It needs an atmosphere thick enough to fly in.', massKg: 1.8, costUsd: 2_400_000, powerDrawW: 12, sciencePoints: 12, instrument: 'helicopter', hazardPerYear: 0.03, mount: 'zenith' }),
  base({ id: 'drill', name: 'Drill', subsystem: 'science', summary: 'Reaches under the weathered rind. Ancient-water and geology cases both want a sample that the surface has not cooked.', massKg: 8, costUsd: 2_800_000, powerDrawW: 40, sciencePoints: 16, instrument: 'drill', dataRateBps: 80_000, hazardPerYear: 0.02, mount: 'forward' }),
  base({ id: 'weather', name: 'Weather station', subsystem: 'science', summary: 'Pressure, temperature, and wind through the sol. The atmosphere objective is mostly this instrument plus a spectrometer.', massKg: 3.1, costUsd: 900_000, powerDrawW: 8, sciencePoints: 14, instrument: 'weather', dataRateBps: 20_000, hazardPerYear: 0.012, mount: 'zenith' }),
  base({ id: 'soil', name: 'Soil analyser', subsystem: 'science', summary: 'Fines, salts, and anything a crew would have to live with. Habitation work leans on it.', massKg: 6.4, costUsd: 1_800_000, powerDrawW: 22, sciencePoints: 18, instrument: 'soil', dataRateBps: 60_000, hazardPerYear: 0.014, mount: 'forward' }),
  base({ id: 'rock', name: 'Rock analyser', subsystem: 'science', summary: 'Composition of a face you can point at. Geology without it is a photograph.', massKg: 5.2, costUsd: 1_600_000, powerDrawW: 18, sciencePoints: 18, instrument: 'rock', dataRateBps: 90_000, hazardPerYear: 0.014, mount: 'forward' }),
  base({ id: 'radiation', name: 'Radiation detector', subsystem: 'science', summary: 'Dose through the sol. A habitation case that skips it does not know what a crew would absorb.', massKg: 2.2, costUsd: 700_000, powerDrawW: 6, sciencePoints: 14, instrument: 'radiation', dataRateBps: 15_000, hazardPerYear: 0.01, mount: 'zenith' }),
  base({ id: 'arm', name: 'Robotic arm', subsystem: 'science', summary: 'Puts the drill and the analysers on a rock. Without it those instruments stay on the deck.', massKg: 14, costUsd: 3_200_000, powerDrawW: 25, sciencePoints: 8, instrument: 'arm', hazardPerYear: 0.016, mount: 'forward' }),
  base({ id: 'cache', name: 'Sample cache', subsystem: 'science', summary: 'Holds cores for a later pickup. Mass and a little science, no power draw of its own.', massKg: 9, costUsd: 1_400_000, sciencePoints: 10, instrument: 'sample', hazardPerYear: 0.008, mount: 'aft' }),
]

const byId = new Map(CATALOG.map((spec) => [spec.id, spec]))

export function getSpec(id: string): ComponentSpec | undefined {
  return byId.get(id)
}

export function specsIn(subsystem: ComponentSpec['subsystem']): ComponentSpec[] {
  return CATALOG.filter((spec) => spec.subsystem === subsystem)
}
