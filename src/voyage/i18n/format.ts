import type { Translator } from './index';
import type { EdlEvent } from '../mission/edl';
import type { FactRow, LandingSite } from '../mission/sites';
import type { BonusGoal, FailureId, MissionRule, ModuleKind, OutpostModule, SettlementState, SolNote, Warning } from '../mission/settlement';
import type { Evidence } from '../mission/sites';

// Turns simulation ids + values into text. Kept in one place so every screen
// (HUD, 3D labels, report) words the same thing the same way in every language.

export const evidenceLabel = (tr: Translator, tag: Evidence) => tr.t(`common.evidence.${tag}`);
export const evidenceLetter = (tr: Translator, tag: Evidence) => tr.t(`common.evidenceLetter.${tag}`);

export const moduleLabel = (tr: Translator, kind: ModuleKind) => tr.t(`module.${kind}.label`);
export const moduleInline = (tr: Translator, kind: ModuleKind) => tr.t(`module.${kind}.inline`);
export const moduleList = (tr: Translator, kinds: ModuleKind[]) => tr.list(kinds.map((kind) => moduleInline(tr, kind)));
export const moduleDescription = (tr: Translator, kind: ModuleKind, values: { units: number }) => tr.t(`module.${kind}.description`, values);

export function moduleName(tr: Translator, module: OutpostModule) {
  if (module.kind === 'solar') return tr.t('module.solar.name', { serial: String(module.serial ?? 1).padStart(2, '0') });
  if (module.kind === 'greenhouse' && module.variant === 'compact') return tr.t('module.greenhouse.compactName');
  return tr.t(`module.${module.kind}.name`);
}

type LoadKind = 'life-support' | 'habitat' | 'water' | 'rover' | 'drill' | 'greenhouse';
export const loadName = (tr: Translator, kind: ModuleKind) => tr.t(`module.${kind as LoadKind}.load`);

export const failureText = (tr: Translator, failure: FailureId) => tr.t(`failure.${failure}`);

export function noteText(tr: Translator, note: SolNote) {
  switch (note.id) {
    case 'shed': return tr.t('note.shed', { loads: moduleList(tr, note.kinds) });
    case 'sheltered': return tr.t('note.sheltered');
    case 'flare': return tr.t('note.flare', { dose: note.dose });
    case 'storm': return tr.t('note.storm', { percent: note.percent });
    case 'cache': return tr.t('note.cache');
    case 'failed': return tr.t('note.failed', { label: tr.upper(tr.t('note.failedLabel')), reason: failureText(tr, note.failure) });
  }
}

export function warningText(tr: Translator, warning: Warning): { title: string; action: string } {
  const powerAction = () => {
    const kinds = warning.pauseKinds ?? [];
    const pause = kinds.length ? tr.t('warning.pause', { loads: moduleList(tr, kinds) }) : tr.t('warning.allOff');
    return warning.spare ? pause + ' ' + tr.t('warning.spare') : pause;
  };
  switch (warning.id) {
    case 'ecssLast': return { title: tr.t('warning.ecssLast'), action: powerAction() };
    case 'ecss': return { title: tr.t('warning.ecss'), action: powerAction() };
    case 'blackout': return { title: tr.t('warning.blackout'), action: powerAction() };
    case 'dose': return { title: tr.t('warning.dose', { dose: warning.dose ?? 0 }), action: tr.t('warning.doseAction') };
    case 'powerLow': return { title: tr.t('warning.powerLow'), action: tr.t('warning.powerLowAction') };
    case 'oxygenLow': return { title: tr.t('warning.oxygenLow'), action: tr.t('warning.oxygenLowAction') };
    case 'waterLow': return { title: tr.t('warning.waterLow'), action: tr.t('warning.waterLowAction') };
    case 'foodLow': return { title: tr.t('warning.foodLow'), action: tr.t('warning.foodLowAction') };
    case 'habitatLow': return { title: tr.t('warning.habitatLow'), action: tr.t('warning.habitatLowAction', { cost: warning.cost ?? 0 }) };
  }
}

export function ruleText(tr: Translator, rule: MissionRule): { label: string; detail: string } {
  switch (rule.id) {
    case 'supplies': return { label: tr.t('rules.supplies'), detail: tr.t('rules.suppliesDetail', rule.values) };
    case 'ecss': return { label: tr.t('rules.ecss'), detail: tr.t('rules.ecssDetail', rule.values) };
    case 'habitat': return { label: tr.t('rules.habitat'), detail: tr.t('rules.habitatDetail', rule.values) };
    case 'dose': return { label: tr.t('rules.dose'), detail: tr.t('rules.doseDetail', rule.values) };
  }
}

export function goalText(tr: Translator, goal: BonusGoal, state: SettlementState): { label: string; detail: string } {
  switch (goal.id) {
    case 'lean': return { label: tr.t('goals.lean'), detail: tr.t('goals.leanDetail', goal.values) };
    case 'dose': return { label: tr.t('goals.dose'), detail: tr.t('goals.doseDetail', goal.values) };
    case 'lights': return { label: tr.t('goals.lights'), detail: tr.p('goals.lightsDetail', goal.values.count) };
    case 'food': return { label: tr.t('goals.food'), detail: state.food === 'stored' ? tr.t('goals.foodStored') : tr.t('goals.foodRising') };
  }
}

export const siteText = (tr: Translator, site: LandingSite, field: 'region' | 'summary' | 'gains' | 'risks' | 'hazardLevel') => tr.t(`site.${site.id}.${field}`);

export function siteFact(tr: Translator, site: LandingSite, row: FactRow, part: 'short' | 'value' | 'note') {
  // The confidence level is shown in capitals inside the sentence (e.g. "HIGH · active rover since 2021").
  const level = tr.upper(tr.t(`site.${site.id}.fact.confidence.level`));
  return tr.t(`site.${site.id}.fact.${row}.${part}`, { percent: site.sunlightPercent, level });
}

export const siteResourceInline = (tr: Translator, site: LandingSite) => tr.t(`site.${site.id}.fact.resources.inline`);

export const edlEventText = (tr: Translator, event: EdlEvent) => tr.t(`edl.ev.${event}`);
