import type { LandingStage } from './landingMachine';
import type { SettlementPhase } from './settlement';
import type { Evidence } from './sites';

// Phase structure. All wording lives in the locale files:
//   timeline.<index>, phase.<PHASE>.title / .objective.* / .why.* / .learn.<n>, landingCopy.<STAGE>.*
export const TIMELINE_STEPS = 8;

export function timelineIndex(stage: LandingStage, phase: SettlementPhase | null): number {
  if (stage === 'APPROACH' || stage === 'SITE_SELECT') return 0;
  if (stage !== 'SETTLEMENT' || !phase || phase === 'ASSESS') return 1;
  return { HABITAT: 2, LIFE_SUPPORT: 3, POWER: 4, FOOD: 5, PROTECT: 6, CRISIS: 6, REPORT: 7 }[phase];
}

export interface PhaseCopy {
  number: number;
  // Evidence tag of each "science behind this" item, in order (text: phase.<PHASE>.learn.<n>).
  learn: Evidence[];
}

export const PHASES: Record<SettlementPhase, PhaseCopy> = {
  ASSESS: { number: 1, learn: ['OBSERVED', 'GAMEPLAY'] },
  HABITAT: { number: 2, learn: ['OBSERVED', 'MODELLED', 'GAMEPLAY'] },
  LIFE_SUPPORT: { number: 3, learn: ['OBSERVED', 'OBSERVED', 'GAMEPLAY'] },
  POWER: { number: 4, learn: ['OBSERVED', 'OBSERVED', 'GAMEPLAY'] },
  FOOD: { number: 5, learn: ['OBSERVED', 'GAMEPLAY'] },
  PROTECT: { number: 6, learn: ['MODELLED', 'OBSERVED', 'GAMEPLAY'] },
  CRISIS: { number: 7, learn: ['OBSERVED', 'MODELLED', 'GAMEPLAY', 'GAMEPLAY'] },
  REPORT: { number: 8, learn: [] },
};

// Landing stages that show an objective banner (text: landingCopy.<STAGE>.objective / .why).
export type LandingCopyStage = 'APPROACH' | 'SITE_SELECT' | 'ENTRY' | 'DESCENT' | 'TOUCHDOWN' | 'POST_LANDING';
export const hasLandingCopy = (stage: LandingStage): stage is LandingCopyStage => stage !== 'SETTLEMENT';
