import type { SiteId } from './sites';

// Mission contracts change the briefing and the starting cargo or reserves only.
// Storm timing, flare dose, site hazards and NASA facts stay as they are.
// Every delta below is a GAMEPLAY assumption.

export type ContractId = 'science' | 'endurance' | 'speed';

export interface ContractSpec {
  id: ContractId;
  suggestedSite: SiteId;
  cargoDelta: number;
  waterDelta: number;
  foodDelta: number;
}

export const CONTRACTS: Record<ContractId, ContractSpec> = {
  science: { id: 'science', suggestedSite: 'jezero', cargoDelta: 0, waterDelta: 0, foodDelta: 0 },
  endurance: { id: 'endurance', suggestedSite: 'utopia', cargoDelta: -2, waterDelta: -10, foodDelta: -8 },
  speed: { id: 'speed', suggestedSite: 'elysium', cargoDelta: -6, waterDelta: 0, foodDelta: 0 },
};

export const DEFAULT_CONTRACT: ContractId = 'science';

export const isContractId = (value: unknown): value is ContractId =>
  value === 'science' || value === 'endurance' || value === 'speed';
