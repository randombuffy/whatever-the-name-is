import { useState } from 'react';
import type { LandingSite } from '../mission/sites';
import { bestScore, loadRuns, runSiteName, saveRun, type RunRecord } from '../mission/history';
import { SKILL_CARGO, STORM_SOLS, bonusGoals, resilienceScore, shieldingOf, countKind, hasKind, projections, resourceDistanceFactor, type SettlementState } from '../mission/settlement';
import { paintShareCard, shareUrl, type ShareCard } from '../mission/share';
import { EvidenceTag } from './LandingHUD';
import { useT, type Translator } from '../i18n';
import { failureText, goalText, moduleList } from '../i18n/format';
import { voyageTune } from '../tune';

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function EnergyChart({ state }: { state: SettlementState }) {
  const tr = useT();
  const log = state.log;
  if (!log.length) return null;
  const max = Math.max(...log.map((entry) => Math.max(entry.generation, entry.demand, entry.capacity)), 1);
  const w = 100 / log.length;
  return (
    <figure className="energy-chart">
      <figcaption className="u">{tr.t('report.chart')} <span className="nu"><i className="key gen" /> {tr.t('report.chartGenerated')} <i className="key dem" /> {tr.t('report.chartDemanded')} <i className="key sto" /> {tr.t('report.chartStored')}</span></figcaption>
      <svg viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label={tr.t('report.chartAria')}>
        {log.map((entry, i) => (
          <g key={entry.sol}>
            {STORM_SOLS.includes(entry.sol) && <rect x={i * w} y={0} width={w} height={40} className="storm-band" />}
            <rect x={i * w + w * 0.18} y={40 - (entry.generation / max) * 38} width={w * 0.3} height={(entry.generation / max) * 38} className="bar-gen" />
            <rect x={i * w + w * 0.52} y={40 - (entry.demand / max) * 38} width={w * 0.3} height={(entry.demand / max) * 38} className="bar-dem" />
            {entry.shed.length > 0 && <circle cx={i * w + w / 2} cy={3} r={1.2} className="shed-dot" />}
          </g>
        ))}
        <polyline className="line-sto" points={log.map((entry, i) => `${i * w + w / 2},${40 - (entry.stored / max) * 38}`).join(' ')} />
      </svg>
      <div className="chart-axis">{log.map((entry) => <span key={entry.sol} className={STORM_SOLS.includes(entry.sol) ? 'is-storm' : ''}>{tr.t('report.axisSol', { sol: entry.sol })}</span>)}</div>
    </figure>
  );
}

export function decisionsFor(tr: Translator, state: SettlementState, site: LandingSite) {
  const shedSols = state.log.filter((entry) => entry.shed.length > 0).length;
  const blackoutSols = state.log.filter((entry) => entry.blackout).length;
  const stormShed = state.log.filter((entry) => STORM_SOLS.includes(entry.sol) && entry.shed.length > 0);
  const p = projections(state);
  const first = state.log[0]?.resources;
  const last = state.resources;
  const arrays = countKind(state, 'solar');
  const protection = [hasKind(state, 'shield') ? tr.t('report.protection.berm') : null, state.cache ? tr.t('report.protection.cache') : null].filter(Boolean).join(tr.t('report.protection.joiner'));
  return [
    { id: 'contract', label: tr.t('report.row.contract'), choice: tr.t(`report.contract.${state.contractId}`), result: tr.t(`report.contract.result.${state.contractId}`) },
    { id: 'site', label: tr.t('report.row.site'), choice: site.name, result: tr.t('report.site.result', { hazard: tr.t(`report.site.hazard.${site.id}`), percent: Math.round(site.solarFactor * 100), water: site.iceAccess >= 1 ? tr.t('report.site.waterStrong') : tr.t('report.site.waterWeak') }) },
    { id: 'descent', label: tr.t('report.row.descent'), choice: state.trajectory === 'direct' ? tr.t('report.descent.direct') : tr.t('report.descent.divert'), result: state.trajectory === 'direct' ? (state.landingDamage ? tr.t('report.descent.directDamage', { damage: state.landingDamage, factor: resourceDistanceFactor('direct') }) : tr.t('report.descent.directSafe', { factor: resourceDistanceFactor('direct') })) : tr.t('report.descent.divertResult', { factor: resourceDistanceFactor('divert') }) },
    { id: 'skill', label: tr.t('report.row.skill'), choice: tr.t(`report.skill.${state.skillGrade}`), result: state.skillGrade === 'rough' || state.skillGrade === 'hard' ? tr.t(state.skillGrade === 'rough' ? 'report.skill.resultRough' : 'report.skill.resultHard', { damage: state.skillDamage, cargo: SKILL_CARGO[state.skillGrade] }) : tr.t(state.skillGrade === 'clear' ? 'report.skill.resultClear' : 'report.skill.resultNeutral') },
    { id: 'habitat', label: tr.t('report.row.habitat'), choice: state.habitatPad === 'outcrop' ? tr.t('report.habitat.outcrop') : tr.t('report.habitat.plain'), result: state.habitatPad === 'outcrop' ? tr.t('report.habitat.outcropResult') : tr.t('report.habitat.plainResult') },
    { id: 'water', label: tr.t('report.row.water'), choice: hasKind(state, 'drill') ? tr.t('report.water.drill') : tr.t('report.water.recycler'), result: first ? tr.t('report.water.change', { from: Math.round(first.water), to: Math.round(last.water) }) : tr.t('report.water.level', { to: Math.round(last.water) }) },
    { id: 'power', label: tr.t('report.row.power'), choice: tr.p('report.power.arrays', arrays) + (hasKind(state, 'battery') ? tr.t('report.power.battery') : '') + (hasKind(state, 'fission') ? tr.t('report.power.fission') : ''), result: shedSols ? tr.p('report.power.short', shedSols) + (blackoutSols ? tr.p('report.power.blackouts', blackoutSols) : '') + '.' : tr.t('report.power.ok') },
    { id: 'food', label: tr.t('report.row.food'), choice: state.food === 'stored' ? tr.t('report.food.stored') : state.food === 'greenhouse' ? tr.t('report.food.greenhouse') : tr.t('report.food.hybrid'), result: p.foodSols === null ? tr.t('report.food.rising', { food: Math.round(last.food) }) : tr.t('report.food.lasts', { food: Math.round(last.food), sols: p.foodSols }) },
    { id: 'protection', label: tr.t('report.row.protection'), choice: protection || tr.t('report.protection.none'), result: tr.t('report.protection.result', { rate: tr.n(p.doseRate, 1), sols: p.solsToDoseLimit }) + (state.cacheUsed ? tr.t('report.protection.cacheOpened') : '') },
    { id: 'flare', label: tr.t('report.row.flare'), choice: state.flareResponse === 'shelter' ? tr.t('report.flare.shelter') : state.flareResponse === 'work' ? tr.t('report.flare.work') : tr.t('report.flare.none'), result: state.flareResponse ? tr.t('report.flare.result', { dose: Math.round(state.flareDose), shielding: Math.round(shieldingOf(state) * 100), total: Math.round(state.resources.radiation) }) + (state.resources.radiation >= 50 ? tr.t('report.flare.caution') : tr.t('report.flare.end')) : tr.t('report.flare.notReached') },
    { id: 'storm', label: tr.t('report.row.storm'), choice: state.stormResponse ? tr.t(`report.storm.${state.stormResponse}`) : tr.t('report.storm.none'), result: stormShed.length ? tr.t('report.storm.shed', { loads: moduleList(tr, [...new Set(stormShed.flatMap((entry) => entry.shed))]) }) : tr.t('report.storm.ok') },
  ];
}

const STAT_KEYS = ['oxygen', 'water', 'food', 'habitat', 'radiation'] as const;

export function MissionReport({ state, site, onClose, onSources, onReplay, onRestart }: { state: SettlementState; site: LandingSite; onClose: () => void; onSources: () => void; onReplay: () => void; onRestart: () => void }) {
  const tr = useT();
  const r = state.resources;
  const outcome = state.outcome ?? 'degraded';
  const score = resilienceScore(state);
  const rows = decisionsFor(tr, state, site);
  const goals = bonusGoals(state);
  const goalsMet = goals.filter((goal) => goal.status === 'met').length;
  // Saved once per run (idempotent by run id), so reopening the report never duplicates it.
  const [history] = useState(() => {
    const previous = loadRuns().filter((run) => run.id !== state.runId);
    const current: RunRecord = { id: state.runId, finishedAt: new Date().toISOString(), site: site.name, siteId: site.id, outcome, score, sol: state.sol, goalsMet, dose: Math.round(r.radiation) };
    return { previousBest: bestScore(previous), runs: saveRun(current), isFirst: previous.length === 0 };
  });
  const personalBest = outcome !== 'evacuated' && !history.isFirst && (history.previousBest === null || score > history.previousBest);
  const sol = String(state.sol).padStart(2, '0');
  const [copied, setCopied] = useState<'summary' | 'link' | ''>('');
  const [copyNote, setCopyNote] = useState('');
  const outcomeLabel = outcome === 'evacuated' ? tr.t('report.runs.failed') : outcome === 'operational' ? tr.t('report.outcome.operational') : tr.t('report.outcome.degraded');
  const card: ShareCard = {
    v: 1, site: site.id, trajectory: state.trajectory, outcome, score, goalsMet, contract: state.contractId, skill: state.skillGrade, sol: state.sol,
  };
  const summary = tr.t('share.summary', {
    site: site.name,
    trajectory: state.trajectory === 'direct' ? tr.t('report.descent.direct') : tr.t('report.descent.divert'),
    outcome: outcomeLabel,
    score,
    contract: tr.t(`report.contract.${state.contractId}`),
  });
  const markCopied = (kind: 'summary' | 'link') => {
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => (current === kind ? '' : current)), 2200);
  };
  const afterCopy = (ok: boolean, kind: 'summary' | 'link') => {
    if (!ok) { setCopied(''); setCopyNote(tr.t('report.shareFail')); return; }
    setCopyNote('');
    markCopied(kind);
  };
  const copySummary = () => { void copyText(summary).then((ok) => afterCopy(ok, 'summary')); };
  const copyLink = () => { void copyText(shareUrl(card)).then((ok) => afterCopy(ok, 'link')); };
  const saveCard = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const painted = paintShareCard(canvas, {
      dir: document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr',
      kicker: tr.t('share.kicker'),
      title: voyageTune.title,
      rows: [
        { label: tr.t('report.runs.site'), value: site.name, ltr: true },
        { label: tr.t('report.runs.outcome'), value: outcomeLabel },
        { label: tr.t('report.runs.score'), value: tr.n(score), ltr: true },
        { label: tr.t('report.runs.goals'), value: tr.t('share.goals', { met: goalsMet, total: goals.length }) },
      ],
      footer: tr.t('share.cardFooter'),
    });
    if (!painted) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mars-2100-card.png';
      link.click();
      URL.revokeObjectURL(url);
    });
  };
  return (
    <div className="modal-scrim report-scrim">
      <section className="mission-report" role="dialog" aria-label={tr.t('report.aria')}>
        <div className="report-overline u"><span className={'status-light outcome-' + outcome} /> {tr.t('report.overline')} <span>{tr.t('report.overlineSite', { site: site.name, sol })}</span></div>
        <div className="report-title">
          <div><div className="hud-kicker u">{outcome === 'evacuated' ? tr.t('report.outcomeFailed', { sol }) : tr.t('report.outcome', { outcome: tr.t(`report.outcome.${outcome}`) })}</div><h2>{tr.t(`report.title.${outcome}`)}</h2>{state.failure && <p className="report-failure">{tr.t('report.cause', { reason: failureText(tr, state.failure) })}</p>}</div>
          <div className="survival-score">{personalBest && <em className="best-badge u">{tr.t('report.best')}</em>}<b>{tr.n(score)}</b><span className="u">{outcome === 'evacuated' ? <>{tr.t('report.reservesLine1')}<br />{tr.t('report.reservesLine2')}</> : <>{tr.t('report.scoreLine1')}<br />{tr.t('report.scoreLine2')}</>}</span></div>
        </div>
        <div className="report-grid">
          <div>
            <EnergyChart state={state} />
            <div className="report-stats">
              {STAT_KEYS.map((key) => {
                const value = r[key];
                const previous = state.log.length > 1 ? state.log[state.log.length - 2].resources[key] : value;
                const status = key === 'radiation' ? (value >= 100 ? 'overLimit' : value >= 50 ? 'high' : 'withinPlan') : value < 30 ? 'low' : value - previous < -0.5 ? 'declining' : 'stable';
                return <div key={key}><small className="u">{tr.t(`report.stat.${key}`)}</small><b>{tr.n(Math.round(value))}<i>%</i></b><span className={(status === 'stable' || status === 'withinPlan' ? 'report-good' : status === 'declining' ? 'report-warn' : 'report-low') + ' u'}>{tr.t(`report.status.${status}`)}</span></div>;
              })}
            </div>
          </div>
          <ol className="decision-list">
            {rows.map((row) => (
              <li key={row.id}><small>{row.label}</small><b>{row.choice}</b><p>{row.result}</p></li>
            ))}
          </ol>
        </div>
        <div className="report-extras">
          <div>
            <div className="extras-title u">{tr.t('report.goals', { met: goalsMet, total: goals.length })}</div>
            <ul className="goal-list">
              {goals.map((goal) => {
                const text = goalText(tr, goal, state);
                return <li key={goal.id} className={'is-' + goal.status}><i aria-hidden>{goal.status === 'met' ? '★' : '✕'}</i><b>{text.label}</b><span>{text.detail}</span></li>;
              })}
            </ul>
          </div>
          <div>
            <div className="extras-title u">{tr.t('report.runs')}</div>
            <table className="run-table">
              <thead><tr><th scope="col">{tr.t('report.runs.number')}</th><th scope="col">{tr.t('report.runs.site')}</th><th scope="col">{tr.t('report.runs.outcome')}</th><th scope="col">{tr.t('report.runs.score')}</th><th scope="col">{tr.t('report.runs.goals')}</th></tr></thead>
              <tbody>
                {history.runs.slice(0, 5).map((run, index) => (
                  <tr key={run.id} className={run.id === state.runId ? 'is-current' : ''}>
                    <td className="u">{run.id === state.runId ? tr.t('report.runs.now') : tr.n(index + 1)}</td>
                    <td>{runSiteName(run)}</td>
                    <td className={'outcome-' + run.outcome + ' u'}>{run.outcome === 'evacuated' ? tr.t('report.runs.failed') : tr.t(`report.outcome.${run.outcome}`)}</td>
                    <td>{tr.n(run.score)}</td>
                    <td>{tr.t('report.runs.goalsValue', { met: run.goalsMet })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="extras-hint">{history.runs.length < 2 ? tr.t('report.runs.hintFirst') : tr.t('report.runs.hintMore')}</p>
          </div>
        </div>
        <div className="report-footer">
          <span><EvidenceTag tag="GAMEPLAY" /> {tr.t('report.footer')} <EvidenceTag tag="OBSERVED" /> {tr.t('report.footerObserved')}</span>
          <div>
            <button className="report-source-button u" type="button" onClick={copySummary}>{copied === 'summary' ? tr.t('report.shareCopied') : tr.t('report.shareCopy')}</button>
            <button className="report-source-button u" type="button" onClick={copyLink}>{copied === 'link' ? tr.t('report.shareLinkCopied') : tr.t('report.shareLink')}</button>
            <button className="report-source-button u" type="button" onClick={saveCard}>{tr.t('report.shareCard')}</button>
            {copyNote && <span className="extras-hint">{copyNote}</span>}
            <button className="report-source-button u" type="button" onClick={onSources}>{tr.t('report.science')}</button>
            <button className="report-source-button u" type="button" onClick={onReplay}>{tr.t('report.replay')}</button>
            <button className="primary-action report-restart" type="button" onClick={onRestart}><span className="u">{tr.t('report.newMission')}</span><b>↻</b></button>
          </div>
        </div>
        <button className="report-close" onClick={onClose} aria-label={tr.t('report.closeAria')}>×</button>
      </section>
    </div>
  );
}
