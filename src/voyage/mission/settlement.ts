import { voyageTune } from '../tune';
import { CONTRACTS, type ContractId } from './contracts';
import type { LandingSite } from './sites';
import type { SkillGrade, Trajectory } from './landingMachine';

// Settlement simulation. Every number here is a GAMEPLAY ASSUMPTION unless a comment
// says otherwise: reserves are 0–100 training scales, energy is in abstract units.

export type ModuleKind = 'habitat' | 'solar' | 'life-support' | 'water' | 'greenhouse' | 'battery' | 'shield' | 'rover' | 'fission' | 'drill';

export interface OutpostModule {
  id: string;
  kind: ModuleKind;
  // Display names are derived from kind (+ serial for solar arrays) by the interface,
  // so they can be translated; the simulation never stores display text.
  serial?: number;
  active: boolean;
  level: number;
  position: [number, number];
  variant?: 'compact';
}

export type SettlementPhase = 'ASSESS' | 'HABITAT' | 'LIFE_SUPPORT' | 'POWER' | 'FOOD' | 'PROTECT' | 'CRISIS' | 'REPORT';
export type HabitatPad = 'plain' | 'outcrop';
export type FoodPlan = 'stored' | 'greenhouse' | 'hybrid';
export type StormResponse = 'safe-mode' | 'clean-panels' | 'ride-out';
export type FlareResponse = 'shelter' | 'work';
export type Outcome = 'operational' | 'degraded' | 'evacuated';
export type FailureId = 'oxygen' | 'water' | 'food' | 'habitat' | 'ecss' | 'dose';

// Sol log entries are ids + values; the interface turns them into text in any language.
// `tone` drives the alert/✓ styling (it used to be guessed from English words).
export type SolNote =
  | { id: 'shed'; tone: 'alert'; kinds: ModuleKind[] }
  | { id: 'sheltered'; tone: 'good' }
  | { id: 'flare'; tone: 'alert'; dose: number }
  | { id: 'storm'; tone: 'alert'; percent: number }
  | { id: 'cache'; tone: 'good' }
  | { id: 'failed'; tone: 'alert'; failure: FailureId };

export interface Resources {
  oxygen: number;
  water: number;
  food: number;
  energy: number; // stored energy units
  radiation: number; // cumulative dose, % of the gameplay mission allowance
  habitat: number; // structural integrity %
}

export interface SolRecord {
  sol: number;
  generation: number;
  demand: number;
  stored: number;
  capacity: number;
  shed: ModuleKind[];
  blackout: boolean;
  atmosphere: number;
  notes: SolNote[];
  resources: Resources;
}

export interface SettlementState {
  runId: string;
  phase: SettlementPhase;
  siteId: LandingSite['id'];
  trajectory: Trajectory;
  cargo: number;
  modules: OutpostModule[];
  resources: Resources;
  habitatPad: HabitatPad | null;
  food: FoodPlan | null;
  cache: boolean;
  cacheUsed: boolean;
  sol: number;
  stormWarned: boolean;
  stormResponse: StormResponse | null;
  panelDust: number;
  log: SolRecord[];
  lastShed: ModuleKind[];
  blackout: boolean;
  ecssOutage: boolean;
  outcome: Outcome | null;
  failure: FailureId | null;
  ecssOutSols: number;
  flareResponse: FlareResponse | null;
  flareDose: number;
  landingDamage: number;
  // Extra touchdown damage from the steering check. Added to landingDamage, never a replacement.
  skillGrade: Exclude<SkillGrade, 'pending'>;
  skillDamage: number;
  contractId: ContractId;
  repairs: number;
}

// ---- Layout (scene coordinates, metres-ish) ----
export const LANDING_SPOTS: Record<Trajectory, [number, number]> = { divert: [-3, -9], direct: [11, -17] };
export const RESOURCE_TARGET: [number, number] = [15, -24];
export const HAB_PADS: Record<HabitatPad, [number, number]> = { plain: [6, 4], outcrop: [-13, 6] };
export const RIDGE = { x: -23, z0: -4, z1: 20 };
const SOLAR_SLOTS: [number, number][] = [[20, -5], [20, 1.5], [20, 8], [26.5, -5], [26.5, 1.5]];
const FISSION_SPOT: [number, number] = [-34, -28];
const OFFSETS: Partial<Record<ModuleKind, [number, number]>> = {
  'life-support': [-5.8, -3.6], water: [5.8, -3.4], battery: [-6.2, 3.6], greenhouse: [6.2, 5.2],
};

export const SETTLEMENT_LENGTH = 7; // sols simulated in the survival phase
export const STORM_SOLS = [3, 4, 5];
// A solar particle event arrives on sol 6; the warning comes at the end of sol 5.
export const FLARE_SOL = 6;
export const DOSE_CAUTION = 50;
export const DOSE_LIMIT = 100;
const FLARE_BASE_DOSE = 40;
const ATMOSPHERE: Record<number, number> = { 3: 0.42, 4: 0.28, 5: 0.36, 6: 0.72, 7: 0.9 };
export const START_CARGO = 26;
export const LANDER_BATTERY = 24;
export const BATTERY_BANK = 40;

export const COSTS = {
  outcropPrep: 2, drill: 4, solar: 3, battery: 4, fission: 8,
  stored: 3, hybrid: 4, greenhouse: 5, berm: 3, cache: 3, repair: 3,
} as const;

export const MODULE_INFO: Record<ModuleKind, { glyph: string }> = {
  habitat: { glyph: '⌂' }, solar: { glyph: '☼' }, 'life-support': { glyph: '◌' }, water: { glyph: '◉' }, greenhouse: { glyph: '✳' },
  battery: { glyph: '▤' }, shield: { glyph: '⬡' }, rover: { glyph: '◇' }, fission: { glyph: '⚛' }, drill: { glyph: '⛏' },
};

let uid = 0;
const makeModule = (kind: ModuleKind, position: [number, number], extra: Partial<OutpostModule> = {}): OutpostModule => ({
  id: kind + '-' + (uid += 1), kind, active: true, level: 1, position, ...extra,
});

export const hasKind = (state: SettlementState, kind: ModuleKind) => state.modules.some((module) => module.kind === kind);
export const countKind = (state: SettlementState, kind: ModuleKind) => state.modules.filter((module) => module.kind === kind).length;
export const capacityOf = (state: SettlementState) => LANDER_BATTERY + (hasKind(state, 'battery') ? BATTERY_BANK : 0);

export function landingDamageFor(site: LandingSite, trajectory: Trajectory) {
  if (trajectory === 'divert') return 0;
  return site.hazard === 3 ? 16 : site.hazard === 2 ? 7 : 0;
}

// GAMEPLAY. Added on top of landingDamageFor. Neutral and clear apply nothing,
// so skip, reduced motion and a steady descent do not punish the outpost.
export const SKILL_DAMAGE: Record<Exclude<SkillGrade, 'pending'>, number> = {
  clear: 0, neutral: 0, rough: 4, hard: 8,
};
export const SKILL_CARGO: Record<Exclude<SkillGrade, 'pending'>, number> = {
  clear: 0, neutral: 0, rough: 1, hard: 2,
};

export const resourceDistanceFactor = (trajectory: Trajectory) => (trajectory === 'direct' ? 1.2 : 0.7);

const bound = (value: number) => Math.max(0, Math.min(100, value));

export interface SettlementStart {
  skill?: Exclude<SkillGrade, 'pending'>;
  contract?: ContractId;
}

export function createSettlement(site: LandingSite, trajectory: Trajectory, start: SettlementStart = {}): SettlementState {
  const damage = landingDamageFor(site, trajectory);
  const skill = start.skill ?? 'neutral';
  const contract = CONTRACTS[start.contract ?? 'science'];
  const skillDamage = SKILL_DAMAGE[skill];
  const lander = LANDING_SPOTS[trajectory];
  return {
    runId: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    phase: 'ASSESS', siteId: site.id, trajectory, cargo: Math.max(0, START_CARGO + contract.cargoDelta - SKILL_CARGO[skill] + voyageTune.cargoBias),
    modules: [makeModule('rover', [lander[0] - 5, lander[1] + 2.5], { active: false })],
    resources: {
      oxygen: 90,
      water: bound(80 + contract.waterDelta),
      food: bound(60 + contract.foodDelta),
      energy: LANDER_BATTERY,
      radiation: 0,
      habitat: bound(100 - damage - skillDamage - voyageTune.landingPenalty),
    },
    habitatPad: null, food: null, cache: false, cacheUsed: false, sol: 0, stormWarned: false,
    stormResponse: null, panelDust: 1, log: [], lastShed: [], blackout: false, ecssOutage: false,
    outcome: null, failure: null, ecssOutSols: 0, flareResponse: null, flareDose: 0,
    landingDamage: damage, skillGrade: skill, skillDamage, contractId: contract.id, repairs: 0,
  };
}

const habitatAt = (state: SettlementState): [number, number] => HAB_PADS[state.habitatPad ?? 'plain'];
const near = (state: SettlementState, kind: ModuleKind): [number, number] => {
  const hab = habitatAt(state);
  const offset = OFFSETS[kind] ?? [0, 0];
  return [hab[0] + offset[0], hab[1] + offset[1]];
};

// ---- Phase actions ----
export type SettlementAction =
  | { type: 'CONFIRM_ASSESSMENT' }
  | { type: 'PLACE_HABITAT'; pad: HabitatPad }
  | { type: 'ACTIVATE_LIFE_SUPPORT'; kind: 'life-support' | 'water' }
  | { type: 'TOGGLE_DRILL' }
  | { type: 'SET_ARRAYS'; count: number }
  | { type: 'TOGGLE_BATTERY' }
  | { type: 'TOGGLE_FISSION' }
  | { type: 'CHOOSE_FOOD'; plan: FoodPlan }
  | { type: 'TOGGLE_BERM' }
  | { type: 'TOGGLE_CACHE' }
  | { type: 'CONFIRM_PHASE' }
  | { type: 'ADVANCE_SOL'; site: LandingSite }
  | { type: 'STORM_RESPONSE'; response: StormResponse }
  | { type: 'FLARE_RESPONSE'; response: FlareResponse }
  | { type: 'TOGGLE_MODULE'; id: string }
  | { type: 'UPGRADE_MODULE'; id: string }
  | { type: 'BUILD_SPARE'; kind: 'solar' | 'battery' }
  | { type: 'REPAIR' }
  | { type: 'OPEN_REPORT' }
  | { type: 'REPLACE'; state: SettlementState };

const NEXT_PHASE: Record<SettlementPhase, SettlementPhase> = {
  ASSESS: 'HABITAT', HABITAT: 'LIFE_SUPPORT', LIFE_SUPPORT: 'POWER', POWER: 'FOOD', FOOD: 'PROTECT', PROTECT: 'CRISIS', CRISIS: 'REPORT', REPORT: 'REPORT',
};

export function phaseReady(state: SettlementState): boolean {
  switch (state.phase) {
    case 'ASSESS': return true;
    case 'HABITAT': return state.habitatPad !== null;
    case 'LIFE_SUPPORT': return hasKind(state, 'life-support') && hasKind(state, 'water');
    case 'POWER': return countKind(state, 'solar') > 0 || hasKind(state, 'fission');
    case 'FOOD': return state.food !== null;
    case 'PROTECT': return true;
    case 'CRISIS': return state.sol >= SETTLEMENT_LENGTH || state.outcome === 'evacuated';
    case 'REPORT': return true;
  }
}

const without = (state: SettlementState, kind: ModuleKind) => state.modules.filter((module) => module.kind !== kind);

export function settlementReducer(state: SettlementState, action: SettlementAction): SettlementState {
  switch (action.type) {
    case 'REPLACE':
      return action.state;

    case 'CONFIRM_ASSESSMENT':
      return state.phase === 'ASSESS' ? { ...state, phase: 'HABITAT' } : state;

    case 'PLACE_HABITAT': {
      if (state.phase !== 'HABITAT') return state;
      const refund = state.habitatPad === 'outcrop' ? COSTS.outcropPrep : 0;
      const cost = action.pad === 'outcrop' ? COSTS.outcropPrep : 0;
      if (state.cargo + refund < cost) return state;
      const modules = [...without(state, 'habitat'), makeModule('habitat', HAB_PADS[action.pad])];
      return { ...state, habitatPad: action.pad, cargo: state.cargo + refund - cost, modules };
    }

    case 'ACTIVATE_LIFE_SUPPORT': {
      if (state.phase !== 'LIFE_SUPPORT' || hasKind(state, action.kind)) return state;
      return { ...state, modules: [...state.modules, makeModule(action.kind, near(state, action.kind))] };
    }

    case 'TOGGLE_DRILL': {
      if (state.phase !== 'LIFE_SUPPORT') return state;
      if (hasKind(state, 'drill')) return { ...state, modules: without(state, 'drill'), cargo: state.cargo + COSTS.drill };
      if (state.cargo < COSTS.drill) return state;
      return { ...state, modules: [...state.modules, makeModule('drill', RESOURCE_TARGET)], cargo: state.cargo - COSTS.drill };
    }

    case 'SET_ARRAYS': {
      if (state.phase !== 'POWER') return state;
      const current = countKind(state, 'solar');
      const target = Math.max(0, Math.min(4, action.count));
      const delta = (target - current) * COSTS.solar;
      if (delta > state.cargo) return state;
      const kept = state.modules.filter((module) => module.kind !== 'solar');
      const arrays = Array.from({ length: target }, (_, i) => makeModule('solar', SOLAR_SLOTS[i], { serial: i + 1 }));
      return { ...state, modules: [...kept, ...arrays], cargo: state.cargo - delta };
    }

    case 'TOGGLE_BATTERY': {
      if (state.phase !== 'POWER') return state;
      if (hasKind(state, 'battery')) {
        return { ...state, modules: without(state, 'battery'), cargo: state.cargo + COSTS.battery, resources: { ...state.resources, energy: Math.min(state.resources.energy, LANDER_BATTERY) } };
      }
      if (state.cargo < COSTS.battery) return state;
      return { ...state, modules: [...state.modules, makeModule('battery', near(state, 'battery'))], cargo: state.cargo - COSTS.battery, resources: { ...state.resources, energy: LANDER_BATTERY + BATTERY_BANK } };
    }

    case 'TOGGLE_FISSION': {
      if (state.phase !== 'POWER') return state;
      if (hasKind(state, 'fission')) return { ...state, modules: without(state, 'fission'), cargo: state.cargo + COSTS.fission };
      if (state.cargo < COSTS.fission) return state;
      return { ...state, modules: [...state.modules, makeModule('fission', FISSION_SPOT)], cargo: state.cargo - COSTS.fission };
    }

    case 'CHOOSE_FOOD': {
      if (state.phase !== 'FOOD') return state;
      const refund = state.food ? COSTS[state.food] : 0;
      const cost = COSTS[action.plan];
      if (state.cargo + refund < cost) return state;
      const kept = without(state, 'greenhouse');
      const modules = action.plan === 'stored' ? kept : [...kept, makeModule('greenhouse', near(state, 'greenhouse'), action.plan === 'hybrid' ? { variant: 'compact' } : {})];
      const extraFood = (plan: FoodPlan | null) => (plan === 'stored' ? 30 : plan === 'hybrid' ? 15 : 0);
      const food = Math.min(100, state.resources.food - extraFood(state.food) + extraFood(action.plan));
      return { ...state, food: action.plan, cargo: state.cargo + refund - cost, modules, resources: { ...state.resources, food } };
    }

    case 'TOGGLE_BERM': {
      if (state.phase !== 'PROTECT') return state;
      if (hasKind(state, 'shield')) return { ...state, modules: without(state, 'shield'), cargo: state.cargo + COSTS.berm };
      if (state.cargo < COSTS.berm) return state;
      return { ...state, modules: [...state.modules, makeModule('shield', habitatAt(state))], cargo: state.cargo - COSTS.berm };
    }

    case 'TOGGLE_CACHE': {
      if (state.phase !== 'PROTECT') return state;
      if (state.cache) return { ...state, cache: false, cargo: state.cargo + COSTS.cache };
      if (state.cargo < COSTS.cache) return state;
      return { ...state, cache: true, cargo: state.cargo - COSTS.cache };
    }

    case 'CONFIRM_PHASE':
      if (!phaseReady(state) || state.phase === 'REPORT' || state.phase === 'CRISIS') return state;
      return { ...state, phase: NEXT_PHASE[state.phase] };

    case 'OPEN_REPORT':
      return state.phase === 'CRISIS' && phaseReady(state) ? { ...state, phase: 'REPORT' } : state;

    case 'ADVANCE_SOL':
      return advanceSol(state, action.site);

    case 'STORM_RESPONSE': {
      if (state.phase !== 'CRISIS' || state.stormResponse) return state;
      let modules = state.modules;
      if (action.response === 'safe-mode') modules = modules.map((module) => (module.kind === 'greenhouse' || module.kind === 'drill') ? { ...module, active: false } : module);
      if (action.response === 'clean-panels') modules = modules.map((module) => module.kind === 'rover' ? { ...module, active: true } : module);
      return { ...state, stormResponse: action.response, modules };
    }

    case 'FLARE_RESPONSE':
      if (state.phase !== 'CRISIS' || state.sol !== FLARE_SOL - 1 || state.flareResponse) return state;
      return { ...state, flareResponse: action.response };

    case 'TOGGLE_MODULE': {
      const target = state.modules.find((module) => module.id === action.id);
      if (!target || target.kind === 'habitat' || target.kind === 'shield') return state;
      return { ...state, modules: state.modules.map((module) => module.id === action.id ? { ...module, active: !module.active } : module) };
    }

    case 'UPGRADE_MODULE': {
      const target = state.modules.find((module) => module.id === action.id);
      if (!target || !UPGRADABLE.includes(target.kind)) return state;
      const cost = upgradeCost(target);
      if (state.cargo < cost || target.level >= 3) return state;
      return { ...state, cargo: state.cargo - cost, modules: state.modules.map((module) => module.id === action.id ? { ...module, level: module.level + 1 } : module) };
    }

    case 'BUILD_SPARE': {
      if (state.phase !== 'CRISIS') return state;
      if (action.kind === 'solar') {
        const count = countKind(state, 'solar');
        if (count >= SOLAR_SLOTS.length || state.cargo < COSTS.solar) return state;
        return { ...state, cargo: state.cargo - COSTS.solar, modules: [...state.modules, makeModule('solar', SOLAR_SLOTS[count], { serial: count + 1 })] };
      }
      if (hasKind(state, 'battery') || state.cargo < COSTS.battery) return state;
      return { ...state, cargo: state.cargo - COSTS.battery, modules: [...state.modules, makeModule('battery', near(state, 'battery'))] };
    }

    case 'REPAIR': {
      if (state.cargo < COSTS.repair || state.resources.habitat >= 100) return state;
      return { ...state, cargo: state.cargo - COSTS.repair, repairs: state.repairs + 1, resources: { ...state.resources, habitat: Math.min(100, state.resources.habitat + 15) } };
    }
  }
}

export const UPGRADABLE: ModuleKind[] = ['solar', 'life-support', 'water', 'greenhouse'];
export const upgradeCost = (module: OutpostModule) => 3 + module.level;

// ---- Per-sol model ----
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

export function solarOutput(state: SettlementState, site: LandingSite, atmosphere: number, panelDust = state.panelDust) {
  const shade = state.habitatPad === 'outcrop' ? 0.96 : 1;
  return state.modules
    .filter((module) => module.kind === 'solar' && module.active)
    .reduce((total, module) => total + 12 * (1 + 0.25 * (module.level - 1)), 0) * site.solarFactor * atmosphere * panelDust * shade;
}

export function loadsFor(state: SettlementState): { kind: ModuleKind; demand: number }[] {
  const get = (kind: ModuleKind) => state.modules.find((module) => module.kind === kind);
  const loads: { kind: ModuleKind; demand: number }[] = [];
  const add = (kind: ModuleKind, demand: (module: OutpostModule) => number) => {
    const module = get(kind);
    if (module && module.active) loads.push({ kind, demand: demand(module) });
  };
  add('life-support', (module) => 6 + 2 * (module.level - 1));
  add('habitat', () => 7);
  add('water', (module) => 3 + (module.level - 1));
  add('rover', () => 3);
  add('drill', () => 5);
  add('greenhouse', (module) => (module.variant === 'compact' ? 4 : 8 + 3 * (module.level - 1)));
  return loads;
}

export const shieldingOf = (state: SettlementState) => (hasKind(state, 'shield') ? 0.5 : 0) + (state.habitatPad === 'outcrop' ? 0.15 : 0);

// Sheltering inside the habitat puts its walls (and any berm) between crew and the
// particles; working outside leaves the crew mostly exposed. Gameplay values.
export function flareDoseFor(state: SettlementState, response: FlareResponse) {
  const shielding = shieldingOf(state);
  return Math.round((response === 'shelter' ? FLARE_BASE_DOSE * (1 - shielding) * 0.55 : FLARE_BASE_DOSE * (1 - shielding * 0.3)) * 10) / 10;
}

export const atmosphereFor = (sol: number) => ATMOSPHERE[sol] ?? 1;
export const stormActiveOn = (sol: number) => STORM_SOLS.includes(sol);

export function forecast(state: SettlementState, site: LandingSite) {
  const nextSol = state.sol + 1;
  const atmosphere = state.phase === 'CRISIS' ? atmosphereFor(nextSol) : 1;
  const generation = solarOutput(state, site, atmosphere) + (state.modules.some((module) => module.kind === 'fission' && module.active) ? 9 : 0);
  const demand = loadsFor(state).reduce((total, load) => total + load.demand, 0);
  return { generation: round1(generation), demand: round1(demand), capacity: capacityOf(state), atmosphere };
}

function advanceSol(state: SettlementState, site: LandingSite): SettlementState {
  if (state.phase !== 'CRISIS' || state.outcome === 'evacuated' || state.sol >= SETTLEMENT_LENGTH) return state;
  if (state.sol === 2 && !state.stormResponse) return state; // waits for the storm decision
  if (state.sol === FLARE_SOL - 1 && !state.flareResponse) return state; // waits for the flare decision
  const sol = state.sol + 1;
  const notes: SolNote[] = [];
  const atmosphere = atmosphereFor(sol);
  const storm = stormActiveOn(sol);
  const cleaning = state.modules.some((module) => module.kind === 'rover' && module.active);
  let panelDust = state.panelDust;
  if (storm) panelDust = Math.max(0.55, panelDust - 0.12);
  if (cleaning) panelDust = Math.max(panelDust, 0.96);

  const fission = state.modules.some((module) => module.kind === 'fission' && module.active) ? 9 : 0;
  const generation = solarOutput(state, site, atmosphere, panelDust) + fission;
  const capacity = capacityOf(state);
  let available = state.resources.energy + generation;
  const shed: ModuleKind[] = [];
  const powered = new Set<ModuleKind>();
  let demand = 0;
  for (const load of loadsFor(state)) {
    demand += load.demand;
    if (available >= load.demand) {
      available -= load.demand;
      powered.add(load.kind);
    } else {
      shed.push(load.kind);
    }
  }
  const stored = Math.min(capacity, available);
  const blackout = shed.includes('habitat');
  const ecssDown = shed.includes('life-support');
  if (shed.length) notes.push({ id: 'shed', tone: 'alert', kinds: [...shed] });

  const level = (kind: ModuleKind) => state.modules.find((module) => module.kind === kind)?.level ?? 1;
  const greenhouse = state.modules.find((module) => module.kind === 'greenhouse');
  const r = state.resources;
  let oxygen = r.oxygen - 9 + (powered.has('life-support') ? 10 + 2 * (level('life-support') - 1) : 0);
  let water = r.water - 7
    + (powered.has('water') ? 5 + 1.5 * (level('water') - 1) : 0)
    + (powered.has('drill') ? 7 * site.iceAccess * resourceDistanceFactor(state.trajectory) : 0)
    - (powered.has('greenhouse') ? (greenhouse?.variant === 'compact' ? 1.5 : 3) : 0);
  const flare = sol === FLARE_SOL;
  const sheltering = flare && state.flareResponse === 'shelter';
  if (sheltering) {
    // Crew stay inside: nobody tends crops or the extractor this sol.
    water -= powered.has('drill') ? 7 * site.iceAccess * resourceDistanceFactor(state.trajectory) : 0;
    notes.push({ id: 'sheltered', tone: 'good' });
  }
  const crops = powered.has('greenhouse') && sol >= 3 && !sheltering ? (greenhouse?.variant === 'compact' ? 5 : 10 + 3 * (level('greenhouse') - 1)) : 0;
  const food = r.food - 6 + crops;
  const shielding = shieldingOf(state);
  const flareDose = flare && state.flareResponse ? flareDoseFor(state, state.flareResponse) : 0;
  const radiation = r.radiation + 4 * (1 - shielding) + flareDose;
  if (flare) notes.push({ id: 'flare', tone: 'alert', dose: Math.round(flareDose) });
  let habitat = r.habitat - (storm ? (state.habitatPad === 'outcrop' ? 1 : 3) : 0) - (blackout ? 6 : 0);
  if (storm) notes.push({ id: 'storm', tone: 'alert', percent: Math.round(atmosphere * 100) });

  let cacheUsed = state.cacheUsed;
  if (state.cache && !cacheUsed && (oxygen < 25 || water < 25)) {
    oxygen += 25;
    water += 25;
    cacheUsed = true;
    notes.push({ id: 'cache', tone: 'good' });
  }
  oxygen = clamp(oxygen);
  water = clamp(water);
  habitat = clamp(habitat);

  const resources: Resources = { oxygen, water, food: clamp(food), energy: round1(stored), radiation: clamp(radiation), habitat };
  const ecssOutSols = ecssDown ? state.ecssOutSols + 1 : 0;
  const failure = failureReason(resources, ecssOutSols);
  const record: SolRecord = { sol, generation: round1(generation), demand: round1(demand), stored: round1(stored), capacity, shed, blackout, atmosphere, notes, resources };
  const ecssOutage = state.ecssOutage || ecssDown;
  let outcome: Outcome | null = null;
  if (failure) {
    outcome = 'evacuated';
    notes.push({ id: 'failed', tone: 'alert', failure });
  } else if (sol >= SETTLEMENT_LENGTH) {
    const low = oxygen < 25 || water < 25 || resources.food < 20 || habitat < 40 || resources.radiation >= DOSE_CAUTION;
    outcome = ecssOutage || low || state.log.some((entry) => entry.blackout) || blackout ? 'degraded' : 'operational';
  }
  return {
    ...state, sol, panelDust, resources, cacheUsed, log: [...state.log, record], lastShed: shed, blackout,
    stormWarned: state.stormWarned || sol === 2, ecssOutage, ecssOutSols, outcome, failure,
    flareDose: state.flareDose + flareDose,
  };
}

// Mission rules: any one of these ends the mission with the crew retreating to the lander.
function failureReason(r: Resources, ecssOutSols: number): FailureId | null {
  if (r.oxygen <= 0) return 'oxygen';
  if (r.water <= 0) return 'water';
  if (r.food <= 0) return 'food';
  if (r.habitat <= 0) return 'habitat';
  if (ecssOutSols >= 2) return 'ecss';
  if (r.radiation >= DOSE_LIMIT) return 'dose';
  return null;
}

export type RuleId = 'supplies' | 'ecss' | 'habitat' | 'dose';
export interface MissionRule { id: RuleId; status: 'ok' | 'risk' | 'failed'; values: Record<string, number> }

export function missionRules(state: SettlementState): MissionRule[] {
  const r = state.resources;
  const lowest = Math.min(r.oxygen, r.water, r.food);
  const tone = (failed: boolean, risk: boolean): MissionRule['status'] => (failed ? 'failed' : risk ? 'risk' : 'ok');
  return [
    { id: 'supplies', status: tone(lowest <= 0, lowest < 25), values: { value: Math.round(lowest) } },
    { id: 'ecss', status: tone(state.ecssOutSols >= 2, state.ecssOutSols === 1), values: { count: state.ecssOutSols } },
    { id: 'habitat', status: tone(r.habitat <= 0, r.habitat < 40), values: { value: Math.round(r.habitat) } },
    { id: 'dose', status: tone(r.radiation >= DOSE_LIMIT, r.radiation >= DOSE_CAUTION), values: { dose: Math.round(r.radiation), limit: DOSE_LIMIT } },
  ];
}

// Warnings are ids + values; the interface writes the sentence and the suggested action.
export type WarningId = 'ecssLast' | 'ecss' | 'blackout' | 'dose' | 'powerLow' | 'oxygenLow' | 'waterLow' | 'foodLow' | 'habitatLow';
export interface Warning {
  id: WarningId;
  level: 'critical' | 'warning';
  dose?: number;
  cost?: number;
  // For power emergencies: which non-essential loads are still running, and whether spare cargo can buy an array.
  pauseKinds?: ModuleKind[];
  spare?: boolean;
}

export function warningsFor(state: SettlementState, site: LandingSite): Warning[] {
  const list: Warning[] = [];
  const r = state.resources;
  const f = forecast(state, site);
  const capacity = capacityOf(state);
  const spare = state.cargo >= COSTS.solar;
  const pauseKinds = state.modules.filter((module) => module.active && (module.kind === 'greenhouse' || module.kind === 'drill' || module.kind === 'rover' || module.kind === 'water')).map((module) => module.kind);
  if (state.lastShed.includes('life-support')) list.push({ id: state.ecssOutSols === 1 ? 'ecssLast' : 'ecss', level: 'critical', pauseKinds, spare });
  if (state.blackout) list.push({ id: 'blackout', level: 'critical', pauseKinds, spare });
  if (r.radiation >= DOSE_CAUTION && !state.failure) list.push({ id: 'dose', level: r.radiation >= 80 ? 'critical' : 'warning', dose: Math.round(r.radiation) });
  if (state.phase === 'CRISIS' && r.energy / capacity < 0.3 && f.generation < f.demand) list.push({ id: 'powerLow', level: 'warning' });
  if (r.oxygen < 35) list.push({ id: 'oxygenLow', level: r.oxygen < 20 ? 'critical' : 'warning' });
  if (r.water < 30) list.push({ id: 'waterLow', level: r.water < 15 ? 'critical' : 'warning' });
  if (r.food < 25) list.push({ id: 'foodLow', level: r.food < 12 ? 'critical' : 'warning' });
  if (r.habitat < 55) list.push({ id: 'habitatLow', level: r.habitat < 35 ? 'critical' : 'warning', cost: COSTS.repair });
  return list;
}

// Outpost resilience: the average of every reserve at the end (dose counts inversely).
export function resilienceScore(state: SettlementState) {
  const r = state.resources;
  const capacity = state.log.at(-1)?.capacity ?? capacityOf(state);
  return Math.round((r.oxygen + r.water + r.food + Math.min(100, (r.energy / capacity) * 100) + r.habitat + (100 - r.radiation)) / 6);
}

// Optional bonus goals. They never change the simulation, only how a run is scored.
export const LEAN_CARGO = 6;
export const LOW_DOSE = 30;

export interface BonusGoal { id: 'lean' | 'dose' | 'lights' | 'food'; status: 'met' | 'open' | 'missed'; values: Record<string, number> }

export function bonusGoals(state: SettlementState): BonusGoal[] {
  const finished = state.outcome !== null;
  const failed = state.outcome === 'evacuated';
  // Missed as soon as it can no longer be achieved; met only when the week ends without failure.
  const judge = (missedAlready: boolean, metAtEnd: boolean): BonusGoal['status'] => {
    if (missedAlready || failed) return 'missed';
    if (!finished) return 'open';
    return metAtEnd ? 'met' : 'missed';
  };
  const shedSols = state.log.filter((entry) => entry.shed.length > 0).length;
  const last = state.log.at(-1);
  const previous = state.log.at(-2);
  const foodRising = Boolean(last && previous && last.resources.food >= previous.resources.food);
  return [
    { id: 'lean', status: judge(state.cargo < LEAN_CARGO, true), values: { min: LEAN_CARGO, cargo: state.cargo } },
    { id: 'dose', status: judge(state.resources.radiation >= LOW_DOSE, true), values: { max: LOW_DOSE, dose: Math.round(state.resources.radiation) } },
    { id: 'lights', status: judge(shedSols > 0, true), values: { count: shedSols } },
    { id: 'food', status: judge(state.food === 'stored', foodRising), values: {} },
  ];
}

// Projection beyond the simulated week, used in the report (gameplay extrapolation).
export function projections(state: SettlementState) {
  const doseRate = 4 * (1 - shieldingOf(state));
  const solsToDoseLimit = Math.round((100 - state.resources.radiation) / Math.max(doseRate, 0.1));
  const lastFood = state.log.length > 1 ? state.log[state.log.length - 1].resources.food - state.log[state.log.length - 2].resources.food : -6;
  const foodSols = lastFood >= 0 ? null : Math.round(state.resources.food / -lastFood);
  return { doseRate, solsToDoseLimit, foodSols };
}
