import { useState, type ReactNode } from 'react';
import { PHASES } from '../mission/phases';
import type { LandingSite } from '../mission/sites';
import {
  BATTERY_BANK, COSTS, FLARE_SOL, bonusGoals, missionRules, LANDER_BATTERY, SETTLEMENT_LENGTH, capacityOf, countKind, forecast, hasKind, loadsFor,
  phaseReady, resourceDistanceFactor, solarOutput, type FoodPlan, type HabitatPad, type SettlementAction, type SettlementState,
} from '../mission/settlement';
import { EvidenceTag } from './LandingHUD';
import { useT, type MessageKey, type Translator } from '../i18n';
import { goalText, loadName, ruleText, siteResourceInline } from '../i18n/format';

type Dispatch = (action: SettlementAction) => void;

function Choice({ selected, disabled, onClick, glyph, title, detail, cost, children }: { selected?: boolean; disabled?: boolean; onClick: () => void; glyph: string; title: ReactNode; detail: string; cost?: string; children?: ReactNode }) {
  const tr = useT();
  return (
    <button className={'phase-choice' + (selected ? ' is-selected' : '')} onClick={onClick} disabled={disabled} aria-pressed={selected}>
      <span className="choice-glyph" aria-hidden>{glyph}</span>
      <span className="phase-choice-copy"><b>{title}</b><small>{detail}</small>{children}</span>
      <span className="choice-side">{cost && <strong className="u">{cost}</strong>}<em className="u" aria-hidden>{selected ? '● ' + tr.t('choice.set') : '○'}</em></span>
    </button>
  );
}

function Row({ icon, tone, label, value, note }: { icon: string; tone: 'ok' | 'warn'; label: string; value: string; note?: string }) {
  return <li><span className={tone}>{icon}</span><span>{label} <b>{value}</b>{note && <small>{note}</small>}</span></li>;
}

function objectiveFor(state: SettlementState, tr: Translator): string {
  switch (state.phase) {
    case 'HABITAT': return state.habitatPad ? tr.m('obj.habitatDone') : tr.m('obj.habitatPick');
    case 'LIFE_SUPPORT':
      if (!hasKind(state, 'water')) return tr.m('obj.water');
      if (!hasKind(state, 'life-support')) return tr.m('obj.oxygen');
      return tr.m('obj.lifeDone');
    case 'POWER': return countKind(state, 'solar') || hasKind(state, 'fission') ? tr.m('obj.powerCheck') : tr.m('obj.powerNone');
    case 'FOOD': return state.food ? tr.m('obj.foodSet') : tr.m('obj.foodPick');
    case 'CRISIS':
      if (state.outcome === 'evacuated') return tr.m('obj.failed');
      if (state.sol >= SETTLEMENT_LENGTH) return tr.m('obj.weekDone');
      if (state.sol === 2 && !state.stormResponse) return tr.m('obj.storm');
      if (state.sol === FLARE_SOL - 1 && !state.flareResponse) return tr.m('obj.flare');
      if (state.blackout || state.lastShed.includes('life-support')) return tr.m('obj.restorePower');
      if (state.sol >= 2 && state.sol < 5) return tr.m('obj.stormHold');
      if (state.sol >= 5 && state.modules.some((module) => (module.kind === 'greenhouse' || module.kind === 'drill') && !module.active)) return tr.m('obj.restart');
      return state.sol < 2 ? tr.m('obj.watch') : tr.m('obj.reach', { sol: SETTLEMENT_LENGTH });
    default: return tr.m(`phase.${state.phase}.objective`);
  }
}

function BonusGoals({ state, live }: { state: SettlementState; live: boolean }) {
  const tr = useT();
  const goals = bonusGoals(state);
  return (
    <div className="mission-rules bonus-goals" aria-label={tr.t('goals.aria')}>
      <span className="rules-title u">{tr.t('goals.title', { met: goals.filter((goal) => goal.status === 'met').length, total: goals.length })}{live ? '' : tr.t('goals.plan')}</span>
      {goals.map((goal) => {
        const text = goalText(tr, goal, state);
        return <div key={goal.id} className={'rule goal is-' + goal.status}><i aria-hidden>{goal.status === 'met' ? '★' : goal.status === 'missed' ? '✕' : '○'}</i><span>{text.label}</span><b>{text.detail}</b></div>;
      })}
    </div>
  );
}

const TIMELINE_NUMBER: Record<SettlementState['phase'], string> = { ASSESS: '02', HABITAT: '03', LIFE_SUPPORT: '04', POWER: '05', FOOD: '06', PROTECT: '07', CRISIS: '07', REPORT: '08' };

export function PhasePanel({ state, site, dispatch, onOpenReport }: { state: SettlementState; site: LandingSite; dispatch: Dispatch; onOpenReport: () => void }) {
  const copy = PHASES[state.phase];
  const tr = useT();
  const [learn, setLearn] = useState(false);
  const ready = phaseReady(state);
  const spending = ['HABITAT', 'LIFE_SUPPORT', 'POWER', 'FOOD', 'PROTECT', 'CRISIS'].includes(state.phase);
  return (
    <section className={'phase-panel hud-sheet phase-' + state.phase.toLowerCase()} aria-label={tr.t('phase.aria')}>
      <div className="mission-marker u">
        <b>{TIMELINE_NUMBER[state.phase]}</b> {tr.t('phase.label', { number: copy.number })} <i>/</i> {tr.t(`phase.${state.phase}.title`)}
        {spending && <span className="marker-aside">{tr.t('phase.cargo', { cargo: state.cargo })}</span>}
      </div>
      <h2 className="sheet-objective">{objectiveFor(state, tr)}</h2>
      <p className="phase-why"><b>{tr.t('phase.why')}</b> {tr.m(`phase.${state.phase}.why`)}</p>
      <div className="phase-body">
        <PhaseBody state={state} site={site} dispatch={dispatch} />
      </div>
      <div className="sheet-actions">
        {copy.learn.length > 0 ? <button className="learn-toggle" aria-expanded={learn} onClick={() => setLearn(!learn)}>{learn ? tr.t('phase.learnHide') : tr.t('phase.learnShow')}</button> : <span />}
        {state.phase !== 'CRISIS' && state.phase !== 'REPORT' && (
          <button className="primary-action" disabled={!ready} onClick={() => dispatch(state.phase === 'ASSESS' ? { type: 'CONFIRM_ASSESSMENT' } : { type: 'CONFIRM_PHASE' })}>
            <span className="u">{state.phase === 'ASSESS' ? tr.t('phase.confirmStatus') : state.phase === 'PROTECT' ? tr.t('phase.startClock') : tr.t('common.continue')}</span><b className="flip">→</b>
          </button>
        )}
        {state.phase === 'CRISIS' && ready && <button className="primary-action" onClick={onOpenReport}><span className="u">{tr.t('phase.openReport')}</span><b className="flip">→</b></button>}
      </div>
      {learn && copy.learn.length > 0 && <ul className="phase-learn">{copy.learn.map((tag, index) => <li key={index}><EvidenceTag tag={tag} /> {tr.t(`phase.${state.phase}.learn.${index}` as MessageKey)}</li>)}</ul>}
    </section>
  );
}

function PowerBalance({ state, site }: { state: SettlementState; site: LandingSite }) {
  const tr = useT();
  const f = forecast(state, site);
  const storm = Math.round(solarOutput(state, site, 0.35, 0.82) + (hasKind(state, 'fission') ? 9 : 0));
  const max = Math.max(f.generation, f.demand, 1);
  return (
    <div className="power-balance">
      <div className="balance-row"><span>{tr.m('balance.made')} · {state.phase === 'CRISIS' ? tr.t('balance.nextSol') : tr.t('balance.clearSky')}</span><i><em style={{ width: (f.generation / max) * 100 + '%' }} /></i><b>{tr.n(f.generation)}</b></div>
      <div className="balance-row demand"><span>{tr.m('balance.used')}</span><i><em style={{ width: (f.demand / max) * 100 + '%' }} /></i><b>{tr.n(f.demand)}</b></div>
      <div className="balance-note">
        {f.generation >= f.demand ? tr.m('balance.surplus') : tr.m('balance.deficit')} {tr.m('balance.storm')} <b>{tr.n(storm)}</b> {tr.m('balance.unit')} {tr.m('balance.storage')} {tr.n(capacityOf(state))} {tr.m('balance.unit')}
      </div>
    </div>
  );
}

function PhaseBody({ state, site, dispatch }: { state: SettlementState; site: LandingSite; dispatch: Dispatch }) {
  const tr = useT();
  const cargo = state.cargo;
  const cost = (value: number) => '⌑ ' + tr.n(value);
  switch (state.phase) {
    case 'ASSESS': {
      const tilt = state.trajectory === 'direct' && site.hazard === 3;
      return (
        <>
        <ul className="status-list">
          <Row icon="✓" tone="ok" label={tr.t('assess.crew')} value={tr.t('assess.crewValue')} />
          <Row icon={tilt ? '!' : '✓'} tone={tilt ? 'warn' : 'ok'} label={tr.t('assess.lander')} value={tilt ? tr.t('assess.landerTilt') : tr.t('assess.landerLevel')} />
          <Row icon={state.landingDamage ? '!' : '✓'} tone={state.landingDamage ? 'warn' : 'ok'} label={tr.t('assess.habitat')} value={tr.t('assess.habitatValue', { percent: state.resources.habitat })} note={state.landingDamage ? tr.t('assess.habitatNote') : undefined} />
          <Row icon="⌑" tone="ok" label={tr.t('assess.cargo')} value={tr.t('assess.cargoValue', { cargo })} note={tr.m('assess.cargoNote')} />
          <Row icon="◉" tone="ok" label={tr.t('assess.target')} value={state.trajectory === 'direct' ? tr.t('assess.targetNear') : tr.t('assess.targetFar')} note={tr.m('assess.targetNote', { factor: resourceDistanceFactor(state.trajectory) })} />
        </ul>
        <BonusGoals state={state} live={false} />
        </>
      );
    }
    case 'HABITAT': {
      const pick = (pad: HabitatPad) => dispatch({ type: 'PLACE_HABITAT', pad });
      return (
        <>
          <Choice selected={state.habitatPad === 'plain'} onClick={() => pick('plain')} glyph="A" title={tr.t('habitat.plain')} detail={tr.m('habitat.plainDetail')} cost={tr.t('habitat.free')} />
          <Choice selected={state.habitatPad === 'outcrop'} disabled={cargo < COSTS.outcropPrep && state.habitatPad !== 'outcrop'} onClick={() => pick('outcrop')} glyph="B" title={tr.t('habitat.outcrop')} detail={tr.m('habitat.outcropDetail')} cost={cost(COSTS.outcropPrep)} />
          <p className="phase-hint">{tr.m('habitat.tip')}</p>
        </>
      );
    }
    case 'LIFE_SUPPORT': {
      const water = hasKind(state, 'water');
      const oxygen = hasKind(state, 'life-support');
      const drill = hasKind(state, 'drill');
      const yieldPerSol = tr.n(7 * site.iceAccess * resourceDistanceFactor(state.trajectory), 1);
      return (
        <>
          <Choice selected={water} onClick={() => dispatch({ type: 'ACTIVATE_LIFE_SUPPORT', kind: 'water' })} glyph="◉" title={water ? <>{tr.t('life.water')} · <span className="u">{tr.m('life.status')}</span></> : tr.m('life.waterOff')} detail={tr.m('life.waterDetail')} cost={water ? tr.t('life.on') : tr.t('life.core')} />
          <Choice selected={oxygen} disabled={!water} onClick={() => dispatch({ type: 'ACTIVATE_LIFE_SUPPORT', kind: 'life-support' })} glyph="◌" title={oxygen ? <>{tr.m('life.oxygenName')} · <span className="u">{tr.m('life.status')}</span></> : tr.m('life.oxygenOff')} detail={tr.m('life.oxygenDetail')} cost={oxygen ? tr.t('life.on') : tr.t('life.core')} />
          <Choice selected={drill} disabled={!oxygen || (!drill && cargo < COSTS.drill)} onClick={() => dispatch({ type: 'TOGGLE_DRILL' })} glyph="⛏" title={tr.m('life.drill')} detail={tr.m('life.drillDetail', { yield: yieldPerSol, site: site.name, evidence: siteResourceInline(tr, site) })} cost={cost(COSTS.drill)} />
        </>
      );
    }
    case 'POWER': {
      const arrays = countKind(state, 'solar');
      return (
        <>
          <div className="stepper">
            <span className="choice-glyph" aria-hidden>☼</span>
            <div><b>{tr.m('power.arrays')}</b><small>{tr.m('power.arraysDetail', { power: Math.round(12 * site.solarFactor), percent: Math.round(site.solarFactor * 100) })}</small></div>
            <button aria-label={tr.t('power.removeArray')} onClick={() => dispatch({ type: 'SET_ARRAYS', count: arrays - 1 })} disabled={arrays === 0}>−</button>
            <output>{tr.n(arrays)}</output>
            <button aria-label={tr.t('power.addArray')} onClick={() => dispatch({ type: 'SET_ARRAYS', count: arrays + 1 })} disabled={arrays >= 4 || cargo < COSTS.solar}>＋</button>
            <strong>{tr.t('power.each', { cost: COSTS.solar })}</strong>
          </div>
          <Choice selected={hasKind(state, 'battery')} disabled={!hasKind(state, 'battery') && cargo < COSTS.battery} onClick={() => dispatch({ type: 'TOGGLE_BATTERY' })} glyph="▤" title={tr.t('power.battery')} detail={tr.m('power.batteryDetail', { from: LANDER_BATTERY, to: LANDER_BATTERY + BATTERY_BANK })} cost={cost(COSTS.battery)} />
          <Choice selected={hasKind(state, 'fission')} disabled={!hasKind(state, 'fission') && cargo < COSTS.fission} onClick={() => dispatch({ type: 'TOGGLE_FISSION' })} glyph="⚛" title={tr.m('power.fission')} detail={tr.m('power.fissionDetail')} cost={cost(COSTS.fission)} />
          <PowerBalance state={state} site={site} />
          <p className="phase-hint">{tr.m('power.foodHint')}</p>
        </>
      );
    }
    case 'FOOD': {
      const pick = (plan: FoodPlan) => dispatch({ type: 'CHOOSE_FOOD', plan });
      const disabled = (plan: FoodPlan) => state.food !== plan && cargo + (state.food ? COSTS[state.food] : 0) < COSTS[plan];
      return (
        <>
          <Choice selected={state.food === 'stored'} disabled={disabled('stored')} onClick={() => pick('stored')} glyph="▦" title={tr.m('food.stored')} detail={tr.m('food.storedDetail')} cost={cost(COSTS.stored)} />
          <Choice selected={state.food === 'greenhouse'} disabled={disabled('greenhouse')} onClick={() => pick('greenhouse')} glyph="✳" title={tr.t('food.greenhouse')} detail={tr.m('food.greenhouseDetail')} cost={cost(COSTS.greenhouse)} />
          <Choice selected={state.food === 'hybrid'} disabled={disabled('hybrid')} onClick={() => pick('hybrid')} glyph="◐" title={tr.m('food.hybrid')} detail={tr.m('food.hybridDetail')} cost={cost(COSTS.hybrid)} />
          {state.food && <PowerBalance state={state} site={site} />}
        </>
      );
    }
    case 'PROTECT':
      return (
        <>
          <Choice selected={hasKind(state, 'shield')} disabled={!hasKind(state, 'shield') && cargo < COSTS.berm} onClick={() => dispatch({ type: 'TOGGLE_BERM' })} glyph="⬡" title={tr.m('protect.berm')} detail={tr.m('protect.bermDetail')} cost={cost(COSTS.berm)} />
          <Choice selected={state.cache} disabled={!state.cache && cargo < COSTS.cache} onClick={() => dispatch({ type: 'TOGGLE_CACHE' })} glyph="✚" title={tr.m('protect.cache')} detail={tr.m('protect.cacheDetail')} cost={cost(COSTS.cache)} />
          <p className="phase-hint">{tr.m('protect.weather')}</p>
          <p className="phase-hint">{tr.m('protect.leftover', { cargo })}</p>
        </>
      );
    case 'CRISIS': {
      const f = forecast(state, site);
      const loads = loadsFor(state);
      return (
        <>
          <div className="forecast-line"><span>{tr.m('crisis.tomorrow')}</span><b>{f.atmosphere < 1 ? <><span className="u">{tr.t('crisis.dust')}</span> · {tr.t('crisis.dustSunlight', { percent: Math.round(f.atmosphere * 100) })}</> : <span className="u">{tr.t('crisis.clear')}</span>}</b></div>
          <PowerBalance state={state} site={site} />
          <p className="phase-hint">{tr.m('crisis.running')}: {tr.list(loads.map((load) => loadName(tr, load.kind))) || tr.t('crisis.nothing')}. {tr.m('crisis.pauseHint')}</p>
          <div className="mission-rules" aria-label={tr.t('rules.aria')}>
            <span className="rules-title u">{tr.m('rules.title')}</span>
            {missionRules(state).map((rule) => {
              const text = ruleText(tr, rule);
              return <div key={rule.id} className={'rule is-' + rule.status}><i aria-hidden>{rule.status === 'ok' ? '✓' : rule.status === 'risk' ? '!' : '✕'}</i><span>{text.label}</span><b>{text.detail}</b></div>;
            })}
          </div>
          <BonusGoals state={state} live />
        </>
      );
    }
    default:
      return null;
  }
}
