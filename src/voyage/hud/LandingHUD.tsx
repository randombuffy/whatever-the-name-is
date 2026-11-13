import { useEffect, useRef, useState } from 'react';
import { SITES, siteById, type Evidence, type FactRow, type LandingSite, type SiteId } from '../mission/sites';
import { edlLive } from '../mission/edl';
import type { ContractId } from '../mission/contracts';
import type { LandingState, Trajectory } from '../mission/landingMachine';
import { SKILL_CARGO, SKILL_DAMAGE, landingDamageFor, resourceDistanceFactor } from '../mission/settlement';
import { useT, type Translator } from '../i18n';
import { edlEventText, evidenceLabel, evidenceLetter, siteFact, siteText } from '../i18n/format';
import { voyageTune } from '../tune';
import { ContractPicker } from './ContractPicker';
import { SoundToggle } from './SoundToggle';

export function EvidenceTag({ tag }: { tag: Evidence }) {
  const tr = useT();
  return <span className={'evidence-tag u is-' + tag.toLowerCase()}>{evidenceLabel(tr, tag)}</span>;
}

// Shown next to NASA links in languages other than English.
export function SourcesLanguageNote() {
  const tr = useT();
  return tr.locale === 'en' ? null : <span className="sources-language">{tr.t('common.sourcesInEnglish')}</span>;
}

const TagLetter = ({ tr, tag }: { tr: Translator; tag: Evidence }) => (
  <span className={'tag-letter is-' + tag.toLowerCase()} title={tr.upper(evidenceLabel(tr, tag))}>{evidenceLetter(tr, tag)}</span>
);

export function ApproachCard({ contract, onContract, onContinue }: { contract: ContractId; onContract: (id: ContractId) => void; onContinue: () => void }) {
  const tr = useT();
  return (
    <section className="mission-brief hud-sheet" aria-label={tr.t('approach.aria')}>
      <div className="mission-marker u"><b>01</b> {tr.t('approach.phase')} <i>/</i> {tr.t('approach.mission')}</div>
      <p className="sheet-label u">{tr.t('approach.label')}</p>
      <h2 className="sheet-objective">{tr.t('approach.objective')}</h2>
      <ContractPicker value={contract} onChange={onContract} />
      <p className="hud-footnote">{tr.m('approach.departureNote')}</p>
      <dl className="readout-list">
        <div><dt>{tr.t('approach.vehicle')}</dt><dd>{tr.t('approach.vehicleValue')}</dd></div>
        <div><dt>{tr.t('approach.next')}</dt><dd>{tr.t('approach.nextValue')}</dd></div>
      </dl>
      <div className="sheet-actions">
        <p className="hud-footnote">{tr.t('approach.footnote')}</p>
        <button className="primary-action" onClick={onContinue}><span className="u">{tr.t('common.continue')}</span><b className="flip">→</b></button>
      </div>
    </section>
  );
}

const ROWS: FactRow[] = ['hazards', 'elevation', 'resources', 'energy', 'confidence'];

export const SITE_LETTER: Record<SiteId, string> = { jezero: 'A', utopia: 'B', elysium: 'C' };

export function SiteSelectPanel({ focus, contract, onContract, onFocus, onConfirm }: { focus: SiteId; contract: ContractId; onContract: (id: ContractId) => void; onFocus: (id: SiteId) => void; onConfirm: (id: SiteId) => void }) {
  const tr = useT();
  const site = siteById(focus);
  return (
    <section className="site-eval hud-sheet" aria-label={tr.t('site.aria')}>
      <div className="mission-marker u"><b>01</b> {tr.t('approach.phase')} <i>/</i> {tr.t('site.marker')}</div>
      <h2 className="eval-question">{tr.t('site.question')}</h2>
      <p className="site-why">{tr.t('site.why')}</p>
      <ContractPicker value={contract} onChange={onContract} />

      <div className="eval-focus" aria-live="polite">
        <span className="eval-coords">{SITE_LETTER[site.id]} · {site.coords} · {siteText(tr, site, 'region')}</span>
        <h3>{site.name}</h3>
        <p className="eval-summary">{siteText(tr, site, 'summary')}</p>
        <dl className="eval-tradeoff">
          <div className="is-gain"><dt>{tr.t('site.gains')}</dt><dd>{siteText(tr, site, 'gains')}</dd></div>
          <div className="is-risk"><dt>{tr.t('site.risks')}</dt><dd>{siteText(tr, site, 'risks')}</dd></div>
        </dl>
      </div>

      <table className="eval-matrix">
        <caption className="sr-only">{tr.t('site.caption')}</caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">{tr.t('site.criterion')}</span></th>
            {SITES.map((item) => (
              <th scope="col" key={item.id} className={item.id === focus ? 'is-focus' : ''}>
                <button onClick={() => onFocus(item.id)} aria-pressed={item.id === focus}>
                  <i>{SITE_LETTER[item.id]}</i>{item.shortName}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row}>
              <th scope="row">{tr.t(`site.row.${row}`)}</th>
              {SITES.map((item) => (
                <td key={item.id} className={(item.id === focus ? 'is-focus' : '') + (row === 'hazards' ? ' hazard-' + item.hazard : '')} onClick={() => onFocus(item.id)}>
                  {siteFact(tr, item, row, 'short')}<sup className={'tag-letter is-' + item.facts[row].tag.toLowerCase()} title={tr.upper(evidenceLabel(tr, item.facts[row].tag))}>{evidenceLetter(tr, item.facts[row].tag)}</sup>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="eval-legend"><span className="tag-letter is-observed">{evidenceLetter(tr, 'OBSERVED')}</span> {tr.t('site.legend.observed')} <span className="tag-letter is-modelled">{evidenceLetter(tr, 'MODELLED')}</span> {tr.t('site.legend.modelled')} <span className="tag-letter is-gameplay">{evidenceLetter(tr, 'GAMEPLAY')}</span> {tr.t('site.legend.gameplay')}</p>

      <details className="eval-notes">
        <summary>{tr.p('site.evidenceSummary', site.sources.length, { site: site.name })}</summary>
        <ul>
          {ROWS.map((row) => (
            <li key={row}><b>{tr.t(`site.row.${row}`)}</b> {siteFact(tr, site, row, 'value')} <EvidenceTag tag={site.facts[row].tag} /><p>{siteFact(tr, site, row, 'note')}</p></li>
          ))}
        </ul>
        <div className="site-sources">
          {site.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} <span className="flip">↗</span></a>)}
          <SourcesLanguageNote />
        </div>
      </details>

      <div className="sheet-actions">
        <p className="hud-footnote">{tr.t('site.footnote')}</p>
        <button className="primary-action" onClick={() => onConfirm(site.id)}><span className="u">{tr.t('site.confirm', { site: site.name })}</span><b className="flip">→</b></button>
      </div>
    </section>
  );
}

// Polls the scene's live EDL store at 10 Hz for React-level state; numbers update every frame.
function useEdlFlags(active: boolean) {
  const [flags, setFlags] = useState({ awaiting: false, event: edlLive.event });
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setFlags((prev) => (prev.awaiting === edlLive.awaitingDecision && prev.event === edlLive.event ? prev : { awaiting: edlLive.awaitingDecision, event: edlLive.event }));
    }, 100);
    return () => window.clearInterval(timer);
  }, [active]);
  return flags;
}

function LiveTelemetry() {
  const tr = useT();
  const altitude = useRef<HTMLElement>(null);
  const speed = useRef<HTMLElement>(null);
  const event = useRef<HTMLElement>(null);
  // Latest translator for the animation loop, so a language switch applies immediately.
  const trRef = useRef(tr);
  useEffect(() => { trRef.current = tr; }, [tr]);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const current = trRef.current;
      if (altitude.current) altitude.current.textContent = edlLive.altitudeKm >= 1 ? current.t('edl.unit.km', { value: current.n(edlLive.altitudeKm, 1) }) : current.t('edl.unit.m', { value: Math.max(0, Math.round(edlLive.altitudeKm * 1000)) });
      if (speed.current) speed.current.textContent = current.t('edl.unit.kmh', { value: Math.round(edlLive.speedKmh) });
      if (event.current) event.current.textContent = edlEventText(current, edlLive.event);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="edl-telemetry" aria-live="off">
      <div><small className="u">{tr.t('edl.altitude')}</small><b ref={altitude}>—</b></div>
      <div><small className="u">{tr.t('edl.speed')}</small><b ref={speed}>—</b></div>
      <div className="edl-event"><small className="u">{tr.t('edl.event')}</small><b className="u" ref={event}>—</b></div>
    </div>
  );
}

export function CinematicHUD({ landing, onSkip, onChoose }: { landing: LandingState; onSkip: () => void; onChoose: (trajectory: Trajectory) => void }) {
  const tr = useT();
  const flags = useEdlFlags(true);
  const steps = [tr.t('edl.step.entry'), tr.t('edl.step.descent'), tr.t('edl.step.landing')];
  const current = landing.stage === 'ENTRY' ? 0 : landing.stage === 'DESCENT' ? 1 : 2;
  const site = siteById(landing.siteId);
  const confirmed = landing.stage === 'TOUCHDOWN' && flags.event === 'engineCutoff';
  return (
    <>
      <div className="edl-phase" role="status">
        <div className="edl-mission u">{voyageTune.title} <span>·</span> {site.name}{landing.replay && <em> · {tr.t('common.replay')}</em>}</div>
        <ol className="edl-steps u">
          {steps.map((step, index) => (
            <li key={index} className={index < current ? 'is-done' : index === current ? 'is-current' : ''}>{step}{index < steps.length - 1 && <i aria-hidden><span className="flip">→</span></i>}</li>
          ))}
        </ol>
      </div>
      <LiveTelemetry />
      <div className="edl-disclaimer"><span className="u">{tr.t('edl.disclaimerLead')}</span> · {tr.t('edl.disclaimer')}</div>
      <div className="corner-controls">
        <SoundToggle />
        <button className="skip-button u" type="button" onClick={onSkip}>{landing.trajectory ? tr.t('edl.skipLanding') : tr.t('edl.skipToDecision')} <span>⏭</span></button>
      </div>
      {landing.stage === 'DESCENT' && !landing.trajectory && flags.awaiting && <TrajectoryDecision site={site} onChoose={onChoose} />}
      {landing.stage === 'DESCENT' && landing.trajectory && <div className="edl-choice-chip u">{landing.trajectory === 'divert' ? tr.t('edl.chip.divert') : tr.t('edl.chip.direct')}</div>}
      {confirmed && <LandingConfirmed />}
    </>
  );
}

function TrajectoryDecision({ site, onChoose }: { site: LandingSite; onChoose: (trajectory: Trajectory) => void }) {
  const tr = useT();
  const damage = landingDamageFor(site, 'direct');
  return (
    <section className="decision-card hud-card" role="dialog" aria-label={tr.t('decision.aria')}>
      <div className="hud-kicker alert u">{tr.t('decision.kicker')}</div>
      <h2>{tr.t('decision.title')}</h2>
      <p>{tr.t('decision.body')}</p>
      <button className="decision-option" onClick={() => onChoose('divert')}>
        <span className="decision-glyph">⤳</span>
        <span><b className="u">{tr.t('decision.divert')}</b><small>{tr.t('decision.divertDetail', { factor: resourceDistanceFactor('divert') })}</small></span>
      </button>
      <button className="decision-option" onClick={() => onChoose('direct')}>
        <span className="decision-glyph">↓</span>
        <span><b className="u">{tr.t('decision.direct')}</b><small>{tr.t('decision.directDetail', { factor: resourceDistanceFactor('direct') })} {damage ? tr.t('decision.directDamage', { damage }) : tr.t('decision.directSafe')}</small></span>
      </button>
      <p className="hud-footnote"><EvidenceTag tag="OBSERVED" /> {tr.t('decision.observed')} <EvidenceTag tag="GAMEPLAY" /> {tr.t('decision.gameplay')}</p>
    </section>
  );
}

export function LandingConfirmed() {
  const tr = useT();
  return (
    <div className="landing-confirmed" role="status">
      <b className="u">{tr.t('landed.confirmed')}</b>
      <span className="u">{tr.t('landed.initialized')}</span>
    </div>
  );
}

export function PostLandingCard({ landing, onBegin }: { landing: LandingState; onBegin: () => void }) {
  const tr = useT();
  const site = siteById(landing.siteId);
  const trajectory = landing.trajectory ?? 'divert';
  const damage = landingDamageFor(site, trajectory);
  const skill = landing.skillGrade;
  const steered = !landing.replay && (skill === 'rough' || skill === 'hard');
  const tilt = trajectory === 'direct' && site.hazard === 3;
  const water = site.facts.resources.tag;
  return (
    <section className="touchdown-report hud-sheet" aria-label={tr.t('post.aria')}>
      <div className="mission-marker u"><b>02</b> {tr.t('nav.landing')} <i>/</i> {site.name} <i>/</i> {landing.replay ? tr.t('common.replay') : tr.t('common.sol', { sol: '00' })}</div>
      <h2 className="sheet-objective">{tr.t('post.title')}</h2>
      <dl className="readout-list">
        <div><dt>{tr.t('post.lander')}</dt><dd>{tilt ? tr.t('post.landerTilt') : tr.t('post.landerLevel')}</dd></div>
        <div><dt>{tr.t('post.touchdown')}</dt><dd>{trajectory === 'direct' ? tr.t('post.touchdownDirect') : tr.t('post.touchdownDivert')}</dd></div>
        <div><dt>{tr.t('post.habitat')}</dt><dd className={damage || steered ? 'is-warn' : ''}>{damage ? tr.t('post.habitatDamage', { damage }) : steered ? tr.t('post.habitatSkill', { damage: SKILL_DAMAGE[skill] }) : tr.t('post.habitatIntact')}</dd></div>
        {skill !== 'pending' && (
          <div><dt>{tr.t('post.skill')}</dt><dd>{landing.replay ? tr.t('post.skillReplay') : skill === 'rough' || skill === 'hard' ? tr.t(skill === 'rough' ? 'post.skill.rough' : 'post.skill.hard', { damage: SKILL_DAMAGE[skill], cargo: SKILL_CARGO[skill] }) : tr.t(skill === 'clear' ? 'post.skill.clear' : 'post.skill.neutral')}</dd></div>
        )}
        <div><dt>{tr.t('post.sunlight')}</dt><dd>{tr.t('post.sunlightValue', { percent: site.sunlightPercent })} <TagLetter tr={tr} tag="MODELLED" /></dd></div>
        <div><dt>{tr.t('post.water')}</dt><dd>{siteFact(tr, site, 'resources', 'short')} <TagLetter tr={tr} tag={water} /></dd></div>
        <div><dt>{tr.t('post.pressure')}</dt><dd>{tr.t('post.pressureValue')} <TagLetter tr={tr} tag="OBSERVED" /></dd></div>
      </dl>
      <div className="sheet-actions">
        <p className="hud-footnote">{tr.t('post.drag')}{landing.replay ? ' ' + tr.t('post.replayNote') : ''}</p>
        <button className="primary-action" onClick={onBegin}><span className="u">{landing.replay ? tr.t('post.return') : tr.t('post.begin')}</span><b className="flip">→</b></button>
      </div>
    </section>
  );
}
