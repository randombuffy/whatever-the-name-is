import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useReducer, useState, type CSSProperties } from 'react';
import type { CameraFocus } from './WorldScene';
import { bedFor, missionAudio } from './audio/missionAudio';
import { approachLive, type ApproachSegment } from './scene/approachLive';
import { CONTRACTS, type ContractId } from './mission/contracts';
import { INITIAL_LANDING, isCinematic, landingReducer, type LandingStage, type Trajectory } from './mission/landingMachine';
import { clearShareHash, readShareFromLocation, type ShareCard } from './mission/share';
import { siteById, type SiteId } from './mission/sites';
import {
  COSTS, DOSE_CAUTION, FLARE_SOL, LANDING_SPOTS, MODULE_INFO, flareDoseFor, shieldingOf, SETTLEMENT_LENGTH, UPGRADABLE, capacityOf, countKind, createSettlement, forecast, hasKind, settlementReducer, solarOutput,
  upgradeCost, warningsFor, BATTERY_BANK, type HabitatPad, type SettlementAction, type FlareResponse, type SettlementState, type StormResponse,
} from './mission/settlement';
import { hasLandingCopy, timelineIndex } from './mission/phases';
import { LanguagePicker } from './hud/LanguagePicker';
import { MissionTimeline } from './hud/MissionTimeline';
import { ApproachCard, CinematicHUD, EvidenceTag, LandingConfirmed, PostLandingCard, SiteSelectPanel } from './hud/LandingHUD';
import { ColdOpen } from './hud/ColdOpen';
import { ShareView } from './hud/ShareView';
import { SoundToggle } from './hud/SoundToggle';
import { SteerPad } from './hud/SteerPad';
import { PhasePanel } from './hud/PhasePanel';
import { MissionReport } from './hud/MissionReport';
import { SourcesPanel } from './hud/SourcesPanel';
import { GLOSSARY_IDS, ReadingContext, useReadingPreference } from './hud/reading';
import { I18nContext, createTranslator, useT } from './i18n';
import { moduleDescription, moduleName, noteText, warningText } from './i18n/format';
import type { SpacecraftConfig } from '../domain/types';

const WorldScene = lazy(() => import('./WorldScene').then(({ WorldScene: Scene }) => ({ default: Scene })));

type ResourceId = 'oxygen' | 'water' | 'food' | 'energy' | 'radiation' | 'habitat';

const RESOURCE_INFO: Record<ResourceId, { icon: string; color: string }> = {
  habitat: { icon: '⌂', color: '#f2b39a' },
  oxygen: { icon: '◌', color: '#a7d8f4' },
  water: { icon: '◉', color: '#8dd9dc' },
  energy: { icon: 'ϟ', color: '#f5c37c' },
  food: { icon: '✳', color: '#c6df8c' },
  radiation: { icon: '⌁', color: '#d8a4e8' },
};

// Resources are revealed as the systems that affect them come online.
const REVEAL: Record<SettlementState['phase'], ResourceId[]> = {
  ASSESS: ['habitat'], HABITAT: ['habitat'], LIFE_SUPPORT: ['habitat', 'oxygen', 'water'], POWER: ['habitat', 'oxygen', 'water', 'energy'],
  FOOD: ['habitat', 'oxygen', 'water', 'energy', 'food'], PROTECT: ['habitat', 'oxygen', 'water', 'energy', 'food', 'radiation'],
  CRISIS: ['habitat', 'oxygen', 'water', 'energy', 'food', 'radiation'], REPORT: ['habitat', 'oxygen', 'water', 'energy', 'food', 'radiation'],
};

type RootAction = SettlementAction | { type: 'CLEAR' };
const rootReducer = (state: SettlementState | null, action: RootAction): SettlementState | null => {
  if (action.type === 'CLEAR') return null;
  if (action.type === 'REPLACE') return action.state;
  return state ? settlementReducer(state, action) : state;
};

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const onChange = () => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const VITAL_GROUPS: { id: 'lifeSupport' | 'power' | 'crewSafety'; ids: ResourceId[] }[] = [
  { id: 'lifeSupport', ids: ['oxygen', 'water', 'food'] },
  { id: 'power', ids: ['energy'] },
  { id: 'crewSafety', ids: ['habitat', 'radiation'] },
];

function ResourceReadout({ id, value, suffix, trend }: { id: ResourceId; value: number; suffix?: string; trend?: number }) {
  const tr = useT();
  const info = RESOURCE_INFO[id];
  const stressed = id === 'radiation' ? value >= 60 : value <= 25;
  const worse = id === 'radiation' ? (trend ?? 0) > 0.5 : (trend ?? 0) < -0.5;
  return (
    <div className={'resource-readout' + (stressed ? ' is-stressed' : '')} style={{ '--resource-color': info.color } as CSSProperties}>
      <div className="resource-readout-top">
        <span className="resource-name">{tr.t(`resource.${id}`)}</span>
        <span className="resource-number">{tr.n(Math.round(value))}<small>%</small></span>
        {trend !== undefined && Math.abs(trend) >= 0.5 && <span className={'resource-trend num' + (worse ? ' is-worse' : '')} title={tr.t('vitals.trendTitle')}>{trend > 0 ? '▲' : '▼'}{tr.n(Math.abs(Math.round(trend)))}</span>}
      </div>
      <div className="resource-track"><span style={{ width: Math.max(0, Math.min(100, value)) + '%' }} /></div>
      {suffix && <div className="resource-suffix">{suffix}</div>}
    </div>
  );
}

// Optional starting state. Only used by automated text/regression checks; the app itself
// always starts with <App /> and these defaults.
export interface AppTestSeed {
  landing?: typeof INITIAL_LANDING;
  settlement?: SettlementState | null;
  ui?: Partial<{ help: boolean; sources: boolean; build: boolean; report: boolean; selectedId: string | null; focusSite: SiteId }>;
}

export interface VoyageAppProps {
  seed?: AppTestSeed;
  onFile?: () => void;
  craft?: SpacecraftConfig | null;
  missionId?: string;
  skin?: 'voyage' | 'astra';
}

function App({ seed, onFile, craft = null, missionId = 'mars', skin = 'voyage' }: VoyageAppProps = {}) {
  const reducedMotion = usePrefersReducedMotion();
  const [reading, toggleReading] = useReadingPreference();
  const i18n = useContext(I18nContext);
  // App provides the reading level below, so it builds its own translator from state.
  const tr = useMemo(() => createTranslator(i18n.locale, i18n.messages, reading), [i18n, reading]);
  const [landing, dispatchLanding] = useReducer(landingReducer, seed?.landing ?? INITIAL_LANDING);
  const [settlement, dispatch] = useReducer(rootReducer, seed?.settlement ?? null);
  const [focusSite, setFocusSite] = useState<SiteId>(seed?.ui?.focusSite ?? 'jezero');
  const [selectedId, setSelectedId] = useState<string | null>(seed?.ui?.selectedId ?? null);
  const [buildOpen, setBuildOpen] = useState(seed?.ui?.build ?? false);
  const [sourcesOpen, setSourcesOpen] = useState(seed?.ui?.sources ?? false);
  const [helpOpen, setHelpOpen] = useState(seed?.ui?.help ?? false);
  const [reportOpen, setReportOpen] = useState(seed?.ui?.report ?? false);
  const [notice, setNotice] = useState('');
  const [steer, setSteer] = useState(0);
  const [shared, setShared] = useState<ShareCard | null>(() => readShareFromLocation());
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [approachWatch, setApproachWatch] = useState<{ run: number; segment: ApproachSegment }>({ run: -1, segment: 'earth' });
  const approachSegment: ApproachSegment = approachWatch.run === landing.run ? approachWatch.segment : 'earth';
  const briefingKey = `${landing.run}:${reducedMotion ? 1 : 0}`;
  const briefingReady = Boolean(seed) || landing.stage !== 'APPROACH' || readyKey === briefingKey;

  const site = siteById(landing.siteId ?? focusSite);
  const stage = landing.stage;
  const cinematic = isCinematic(stage);
  const inSettlement = stage === 'SETTLEMENT' && settlement !== null;

  const announce = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? '' : current)), 2600);
  }, []);

  // The approach picture reports its own beat. The briefing waits until Mars is in frame,
  // with a long fallback so a stalled scene can still be skipped or continued.
  useEffect(() => {
    if (landing.stage !== 'APPROACH') return;
    const timer = window.setInterval(() => {
      const next = approachLive.segment;
      setApproachWatch((current) => (current.run === landing.run && current.segment === next ? current : { run: landing.run, segment: next }));
    }, 80);
    return () => window.clearInterval(timer);
  }, [landing.stage, landing.run]);

  useEffect(() => {
    if (landing.stage !== 'APPROACH' || seed) return;
    const key = `${landing.run}:${reducedMotion ? 1 : 0}`;
    const delay = approachSegment === 'mars' ? (reducedMotion ? 400 : 2500) : (reducedMotion ? 4000 : 45000);
    const timer = window.setTimeout(() => setReadyKey(key), delay);
    return () => window.clearTimeout(timer);
  }, [landing.stage, landing.run, reducedMotion, seed, approachSegment]);

  useEffect(() => {
    const audio = missionAudio();
    if (stage === 'ENTRY') audio.cue('plasma');
    else if (stage === 'DESCENT') audio.cue('chute');
    else if (stage === 'TOUCHDOWN') audio.cue('engine');
    else if (stage === 'POST_LANDING') audio.cue('thump');
  }, [stage, landing.run]);

  // Reduced motion and any touchdown that ends before a grade is recorded stay neutral.
  // This must resolve before the settlement is created, and it never picks a trajectory.
  useEffect(() => {
    if (landing.skillGrade !== 'pending') return;
    const neutralNow = (reducedMotion && (landing.stage === 'TOUCHDOWN' || landing.stage === 'POST_LANDING')) || landing.stage === 'POST_LANDING';
    if (neutralNow) dispatchLanding({ type: 'SKILL_RESULT', grade: 'neutral' });
  }, [reducedMotion, landing.stage, landing.skillGrade]);

  // Create the settlement exactly once per landing (never on a replay).
  useEffect(() => {
    if (landing.landed && !landing.replay && !settlement && landing.siteId && landing.trajectory && landing.skillGrade !== 'pending') {
      dispatch({ type: 'REPLACE', state: createSettlement(siteById(landing.siteId), landing.trajectory, { skill: landing.skillGrade, contract: landing.contractId }) });
    }
  }, [landing.landed, landing.replay, landing.siteId, landing.trajectory, landing.skillGrade, landing.contractId, settlement]);

  const act = useCallback((action: SettlementAction) => dispatch(action), []);
  const onStageComplete = useCallback((completed: LandingStage, run: number) => dispatchLanding({ type: 'STAGE_COMPLETE', stage: completed, run }), []);
  const onPadSelect = useCallback((pad: HabitatPad) => dispatch({ type: 'PLACE_HABITAT', pad }), []);
  const chooseTrajectory = useCallback((trajectory: Trajectory) => dispatchLanding({ type: 'CHOOSE_TRAJECTORY', trajectory }), []);

  const restart = () => {
    dispatch({ type: 'CLEAR' });
    dispatchLanding({ type: 'RESET' });
    setFocusSite(CONTRACTS.science.suggestedSite);
    setSteer(0);
    setReportOpen(false);
    setSelectedId(null);
    setBuildOpen(false);
  };
  const chooseContract = (contractId: ContractId) => {
    dispatchLanding({ type: 'CHOOSE_CONTRACT', contractId });
    setFocusSite(CONTRACTS[contractId].suggestedSite);
  };
  const onSkill = useCallback((grade: 'clear' | 'rough' | 'hard') => dispatchLanding({ type: 'SKILL_RESULT', grade }), []);
  const replay = () => {
    setSteer(0);
    setReportOpen(false);
    setSelectedId(null);
    setBuildOpen(false);
    dispatchLanding({ type: 'REPLAY' });
  };

  const flarePending = Boolean(settlement && settlement.phase === 'CRISIS' && settlement.sol === FLARE_SOL - 1 && !settlement.flareResponse && !settlement.failure);
  const stormPending = Boolean(settlement && settlement.phase === 'CRISIS' && settlement.sol === 2 && !settlement.stormResponse) || flarePending;
  const flareIncoming = Boolean(settlement && settlement.phase === 'CRISIS' && settlement.sol === FLARE_SOL - 1 && settlement.flareResponse);
  const storm = Boolean(settlement && settlement.phase !== 'REPORT' && settlement.stormWarned && settlement.sol >= 2 && settlement.sol < 5) && stage === 'SETTLEMENT';

  useEffect(() => {
    const audio = missionAudio();
    audio.setReduced(reducedMotion);
    audio.setBed(bedFor(stage, storm, approachSegment));
  }, [stage, storm, reducedMotion, approachSegment]);
  const selectedModule = settlement?.modules.find((module) => module.id === selectedId) ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'Escape') {
        setBuildOpen(false);
        setSourcesOpen(false);
        setHelpOpen(false);
        setSelectedId(null);
      } else if (event.key.toLowerCase() === 'b' && inSettlement && settlement?.phase === 'CRISIS' && !stormPending) {
        setBuildOpen((open) => !open);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inSettlement, settlement?.phase, stormPending]);

  const advanceSol = () => {
    if (!settlement || stormPending) return;
    setSelectedId(null);
    dispatch({ type: 'ADVANCE_SOL', site });
  };

  const respondToFlare = (response: FlareResponse) => {
    dispatch({ type: 'FLARE_RESPONSE', response });
    announce(response === 'shelter' ? tr.t('notice.shelter') : tr.t('notice.work'));
  };

  const respondToStorm = (response: StormResponse) => {
    dispatch({ type: 'STORM_RESPONSE', response });
    announce(response === 'safe-mode' ? tr.t('notice.safeMode') : response === 'clean-panels' ? tr.t('notice.rover') : tr.t('notice.rideOut'));
  };

  const timeline = timelineIndex(stage, settlement?.phase ?? null);
  const focus = useMemo<CameraFocus | null>(() => {
    if (!settlement) return null;
    const hab = settlement.modules.find((module) => module.kind === 'habitat')?.position ?? [6, 4];
    const lander = LANDING_SPOTS[settlement.trajectory];
    switch (settlement.phase) {
      case 'ASSESS': return { key: 'ASSESS', x: lander[0], z: lander[1], distance: 30 };
      case 'HABITAT': return { key: 'HABITAT', x: -3.5, z: 4, distance: 36 };
      case 'LIFE_SUPPORT': return { key: 'LIFE_SUPPORT', x: hab[0], z: hab[1] - 1, distance: 26 };
      case 'POWER': return { key: 'POWER', x: (hab[0] + 22 * 2) / 3, z: 1.5, distance: 40 };
      case 'FOOD': return { key: 'FOOD', x: hab[0] + 2.5, z: hab[1] + 2.3, distance: 26 };
      case 'PROTECT': return { key: 'PROTECT', x: hab[0], z: hab[1], distance: 24 };
      default: return { key: 'CRISIS', x: 4, z: 0, distance: 54 };
    }
  }, [settlement]);
  const warnings = settlement && inSettlement ? warningsFor(settlement, site) : [];
  const f = settlement ? forecast(settlement, site) : null;
  const lastRecord = settlement?.log.at(-1);
  const pad = (value: number) => String(value).padStart(2, '0');
  // Full sentences per equipment combination, so every language can phrase them naturally.
  const fission = Boolean(settlement && hasKind(settlement, 'fission'));
  const battery = Boolean(settlement && hasKind(settlement, 'battery'));
  const rideOutKey = fission ? (battery ? 'storm.rideOutFissionBattery' : 'storm.rideOutFissionLander') : battery ? 'storm.rideOutBattery' : 'storm.rideOutLander';

  return (
    <ReadingContext.Provider value={reading}>
    <main className={'mars-app' + (skin === 'astra' ? ' outpost-stage' : '') + ' stage-' + stage.toLowerCase() + (storm ? ' is-storm' : '')}>
      <div className="world-layer">
        <Suspense fallback={<div className="scene-startup u"><span />{tr.t('app.loading')}</div>}>
          <WorldScene
            tr={tr}
            landing={landing}
            focusSite={focusSite}
            onFocusSite={setFocusSite}
            settlement={settlement}
            storm={storm}
            selectedId={selectedId}
            reducedMotion={reducedMotion}
            overview={reportOpen}
            onSelect={(id) => { setSelectedId(id); if (id) setBuildOpen(false); }}
            onPadSelect={onPadSelect}
            onStageComplete={onStageComplete}
            focus={focus}
            steer={steer}
            craft={craft}
            missionId={missionId}
          />
        </Suspense>
      </div>
      <div className={'world-grain' + (storm ? ' storm-grain' : '')} />
      {storm && <div className="storm-wash" />}
      {flareIncoming && <div className="flare-wash" />}
      {(stage === 'ENTRY' || stage === 'DESCENT' || (stage === 'POST_LANDING' && landing.skipped)) && <div key={stage + landing.run} className={'stage-fade fade-' + stage.toLowerCase()} />}

      {/* ---------- Navigation ---------- */}
      {skin === 'astra' ? (
        <header className={'outpost-bar' + (cinematic ? ' is-cinematic' : '')}>
          <div className="outpost-lock">
            <strong>Mission Control</strong>
            <small>{site.name}</small>
          </div>
          <div className="outpost-stamp">
            <span className="signal-dot" />
            {settlement && inSettlement ? tr.t(`phase.${settlement.phase}.title`) : tr.t('nav.landing')}
            <span className="stamp-divider">/</span>
            <strong>{tr.t('common.sol', { sol: pad(settlement?.sol ?? 0) })}</strong>
          </div>
          <div className="outpost-actions">
            {settlement && <span className={'crew-chip u ' + (warnings.some((w) => w.level === 'critical') ? 'risk' : 'secure')}><span />{warnings.some((w) => w.level === 'critical') ? tr.t('nav.crewAtRisk') : tr.t('nav.crewSecure')}</span>}
            {inSettlement && <button type="button" className="word slim" onClick={replay} title={tr.t('nav.replayTitle')}>{tr.t('nav.replay')}</button>}
            <SoundToggle />
            <LanguagePicker />
            <button type="button" className={'word slim' + (reading === 'simple' ? ' fill' : '')} onClick={reading === 'simple' ? undefined : toggleReading}>{tr.t('nav.reading.simple')}</button>
            <button type="button" className={'word slim' + (reading === 'detailed' ? ' fill' : '')} onClick={reading === 'detailed' ? undefined : toggleReading}>{tr.t('nav.reading.detailed')}</button>
            <button type="button" className="word slim" title={tr.t('nav.help')} aria-label={tr.t('nav.help')} onClick={() => setHelpOpen(!helpOpen)}>?</button>
            <button type="button" className="word slim" title={tr.t('nav.science')} aria-label={tr.t('nav.science')} onClick={() => setSourcesOpen(true)}>Notes</button>
          </div>
        </header>
      ) : cinematic || stage === 'APPROACH' || stage === 'SITE_SELECT' ? (
        <header className="cinematic-brand"><div className="brand-lockup"><div className="brand-orbit"><span /></div><div><strong>MARS <em>2100</em></strong><small className="u">{tr.t('brand.tagline')}</small></div></div></header>
      ) : (
        <header className="topbar">
          <div className="brand-lockup"><div className="brand-orbit"><span /></div><div><strong>MARS <em>2100</em></strong><small className="u">{tr.t('brand.subtitle')}</small></div></div>
          <div className="mission-stamp u"><span className="signal-dot" />{site.name}<span className="stamp-divider">/</span>{settlement && inSettlement ? tr.t(`phase.${settlement.phase}.title`) : tr.t('nav.landing')}<span className="stamp-divider">/</span><strong>{tr.t('common.sol', { sol: pad(settlement?.sol ?? 0) })}</strong></div>
          <div className="top-actions">
            {settlement && <span className={'crew-chip u ' + (warnings.some((w) => w.level === 'critical') ? 'risk' : 'secure')}><span />{warnings.some((w) => w.level === 'critical') ? tr.t('nav.crewAtRisk') : tr.t('nav.crewSecure')}</span>}
            {inSettlement && <button className="text-button u" onClick={replay} title={tr.t('nav.replayTitle')}>{tr.t('nav.replay')}</button>}
            <SoundToggle />
            <LanguagePicker />
            <button className="reading-toggle" onClick={toggleReading} aria-label={reading === 'simple' ? tr.t('nav.reading.ariaSimple') : tr.t('nav.reading.ariaDetailed')} title={tr.t('nav.reading.title')}><span className={'u' + (reading === 'simple' ? ' is-on' : '')}>{tr.t('nav.reading.simple')}</span><span className={'u' + (reading === 'detailed' ? ' is-on' : '')}>{tr.t('nav.reading.detailed')}</span></button>
            <button className="icon-button" title={tr.t('nav.help')} aria-label={tr.t('nav.help')} onClick={() => setHelpOpen(!helpOpen)}>?</button>
            <button className="icon-button" title={tr.t('nav.science')} aria-label={tr.t('nav.science')} onClick={() => setSourcesOpen(true)}>⌘</button>
          </div>
        </header>
      )}

      <MissionTimeline current={timeline} minimal={cinematic} />

      {/* ---------- Landing sequence ---------- */}
      {stage === 'APPROACH' && !briefingReady && <ColdOpen segment={approachSegment} />}
      {stage === 'APPROACH' && briefingReady && <ApproachCard contract={landing.contractId} onContract={chooseContract} onContinue={() => dispatchLanding({ type: 'CONTINUE' })} />}
      {(stage === 'APPROACH' || stage === 'SITE_SELECT') && (
        <div className="corner-controls">
          <SoundToggle />
          <LanguagePicker />
          {stage === 'APPROACH' && <button className="skip-button u" type="button" onClick={() => dispatchLanding({ type: 'SKIP' })}>{tr.t('approach.skip')} <span>⏭</span></button>}
        </div>
      )}
      {stage === 'SITE_SELECT' && <SiteSelectPanel focus={focusSite} contract={landing.contractId} onContract={chooseContract} onFocus={setFocusSite} onConfirm={(id) => dispatchLanding({ type: 'CONFIRM_SITE', siteId: id })} />}
      {stage === 'TOUCHDOWN' && landing.skillGrade === 'pending' && !reducedMotion && <SteerPad onOffset={setSteer} onResult={onSkill} />}
      {cinematic && <CinematicHUD landing={landing} onSkip={() => dispatchLanding({ type: 'SKIP' })} onChoose={chooseTrajectory} />}
      {stage === 'POST_LANDING' && (
        <>
          <div className="confirm-fade"><LandingConfirmed /></div>
          <PostLandingCard landing={landing} onBegin={() => dispatchLanding({ type: 'BEGIN_SURFACE_OPS' })} />
        </>
      )}
      {hasLandingCopy(stage) && stage !== 'POST_LANDING' && stage !== 'SITE_SELECT' && stage !== 'APPROACH' && (
        <div className="objective-banner"><b>{tr.t(`landingCopy.${stage}.objective`)}</b><span>{tr.t(`landingCopy.${stage}.why`)}</span></div>
      )}

      {/* ---------- Settlement ---------- */}
      {inSettlement && settlement && (
        <div className="mission-ui">
          <section className="resource-dock" aria-label={tr.t('vitals.aria')}>
            {VITAL_GROUPS.map((group) => {
              const ids = group.ids.filter((id) => REVEAL[settlement.phase].includes(id));
              if (!ids.length) return null;
              const previous = settlement.log.length > 1 ? settlement.log[settlement.log.length - 2].resources : null;
              const trendOf = (id: ResourceId) => (previous && lastRecord ? lastRecord.resources[id] - previous[id] : undefined);
              return (
                <div className="vital-group" key={group.id}>
                  <span className="vital-group-label u">{tr.t(`vitals.${group.id}`)}</span>
                  {ids.map((id) => id === 'energy'
                    ? <ResourceReadout key={id} id={id} value={(settlement.resources.energy / capacityOf(settlement)) * 100} suffix={f ? tr.t('vitals.energySuffix', { generation: f.generation, demand: f.demand }) : undefined} trend={previous && lastRecord ? ((lastRecord.stored - previous.energy) / capacityOf(settlement)) * 100 : undefined} />
                    : <ResourceReadout key={id} id={id} value={settlement.resources[id]} trend={trendOf(id)} />)}
                </div>
              );
            })}
            <div className="cargo-readout"><small className="u">{tr.t('vitals.cargo')}</small><strong>{tr.n(settlement.cargo)}</strong></div>
          </section>

          <PhasePanel state={settlement} site={site} dispatch={act} onOpenReport={() => { dispatch({ type: 'OPEN_REPORT' }); setReportOpen(true); }} />

          {warnings.length > 0 && (
            <aside className="warning-stack" aria-live="polite">
              {warnings.slice(0, 2).map((warning) => {
                const text = warningText(tr, warning);
                return <div key={warning.id} className={'warning-item is-' + warning.level}><b>{warning.level === 'critical' ? '⚠ ' : '! '}{text.title}</b><small>{text.action}</small></div>;
              })}
            </aside>
          )}

          {settlement.modules.length > 1 && (
            <div className="right-rail">
              <div className="rail-label u">{tr.t('rail.systems')} <span>{settlement.modules.filter((module) => module.active).length}/{settlement.modules.length}</span></div>
              {settlement.modules.map((module) => {
                const shed = settlement.lastShed.includes(module.kind) || (module.kind === 'habitat' && settlement.blackout);
                return (
                  <button className={'rail-module' + (module.active && !shed ? ' online' : ' offline') + (selectedId === module.id ? ' chosen' : '')} key={module.id} onClick={() => { setSelectedId(module.id); setBuildOpen(false); }}>
                    <span className="rail-glyph">{MODULE_INFO[module.kind].glyph}</span>
                    <span className="rail-module-name">{moduleName(tr, module)}<small className="u">{shed ? tr.t('status.noPower') : module.active ? tr.t('status.online') : tr.t('status.standby')}</small></span>
                    <span className="rail-arrow flip">↗</span>
                  </button>
                );
              })}
            </div>
          )}

          {(settlement.phase === 'POWER' || settlement.phase === 'FOOD' || settlement.phase === 'PROTECT' || settlement.phase === 'CRISIS') && f && (
            <div className="lower-left energy-card">
              <div className="telemetry-tag u"><span className="live-dot" /> {tr.t('energy.title')}</div>
              <div className="weather-line"><span className="weather-icon">{storm ? '〰' : '☀'}</span><div><b className="u">{storm ? tr.t('energy.dustStorm') : settlement.sol >= 5 && settlement.sol < SETTLEMENT_LENGTH ? tr.t('energy.dustClearing') : tr.t('energy.clearSky')}</b><small className="u">{tr.t('energy.weatherDetail', { sunlight: Math.round(f.atmosphere * 100), panels: Math.round(settlement.panelDust * 100) })}</small></div></div>
              <div className="telemetry-readout"><span className="u">{tr.t('energy.generation')}</span><b>{tr.n(f.generation)} <i>{tr.t('energy.unitsPerSol')}</i></b></div>
              <div className="telemetry-readout"><span className="u">{tr.t('energy.demand')}</span><b>{tr.n(f.demand)} <i>{tr.t('energy.unitsPerSol')}</i></b></div>
              <div className="telemetry-readout"><span className="u">{tr.t('energy.stored')}</span><b className="num">{tr.n(Math.round(settlement.resources.energy))} <i>/ {tr.n(capacityOf(settlement))}</i></b></div>
              {settlement.log.length > 0 && (
                <div className="energy-history" aria-label={tr.t('energy.historyAria')}>
                  {settlement.log.map((entry) => (
                    <i key={entry.sol} className={(entry.shed.length ? 'is-shed' : '') + (entry.atmosphere < 0.5 ? ' is-storm' : '')} style={{ height: Math.max(6, (entry.stored / entry.capacity) * 100) + '%' }} title={tr.t('energy.historyTitle', { sol: entry.sol, stored: Math.round(entry.stored), capacity: entry.capacity })} />
                  ))}
                  <span className="u">{tr.t('energy.historyLabel')}</span>
                </div>
              )}
              <div className="telemetry-source"><EvidenceTag tag="GAMEPLAY" /><button className="u" onClick={() => setSourcesOpen(true)}>{tr.t('energy.dataNotes')}</button></div>
            </div>
          )}

          {settlement.phase === 'CRISIS' && (
            <div className="bottom-dock">
              <div className="sol-status"><span className="sol-index u">{tr.t('dock.sol')}<br /><b>{pad(settlement.sol)}</b></span><div className="sol-bars">{Array.from({ length: SETTLEMENT_LENGTH }, (_, i) => <i key={i} className={(i < settlement.sol ? 'is-past' : '') + ([2, 3, 4].includes(i) ? ' is-storm' : '') + (i === FLARE_SOL - 1 ? ' is-flare' : '')} />)}</div><small className="u">{settlement.failure ? tr.t('dock.failed') : flareIncoming ? tr.t('dock.solarIncoming') : storm ? tr.t('dock.stormActive') : tr.t('dock.ofSols', { count: SETTLEMENT_LENGTH })}</small></div>
              <div className="bottom-separator" />
              <button className="build-dock-button" onClick={() => { setBuildOpen(!buildOpen); setSelectedId(null); }} disabled={stormPending}><span className="build-plus">＋</span><span className="u">{tr.t('dock.spareCargo')}<small>{tr.p('dock.units', settlement.cargo)}</small></span><kbd>B</kbd></button>
              <div className="bottom-separator" />
              <button className="advance-button" onClick={advanceSol} disabled={stormPending || settlement.sol >= SETTLEMENT_LENGTH || settlement.outcome === 'evacuated'}><span className="u">{tr.t('dock.advance')}</span><b className="flip">→</b></button>
              <button className="report-button" onClick={() => { dispatch({ type: 'OPEN_REPORT' }); setReportOpen(true); }} disabled={!(settlement.sol >= SETTLEMENT_LENGTH || settlement.outcome === 'evacuated')}><span className="u">{tr.t('dock.reportLine1')}<br />{tr.t('dock.reportLine2')}</span><b className="flip">↗</b></button>
            </div>
          )}

          {selectedModule && (
            <aside className="module-inspector">
              <button className="panel-close" onClick={() => setSelectedId(null)} aria-label={tr.t('inspector.closeAria')}>×</button>
              <div className="inspector-kicker u">{tr.t('inspector.kicker')} <span>·</span> {settlement.lastShed.includes(selectedModule.kind) ? tr.t('status.noPower') : selectedModule.active ? tr.t('status.nominal') : tr.t('status.standby')}</div>
              <div className="inspector-heading"><span>{MODULE_INFO[selectedModule.kind].glyph}</span><div><h2>{moduleName(tr, selectedModule)}</h2><p>{moduleDescription(tr, selectedModule.kind, { units: BATTERY_BANK })}</p></div></div>
              <div className="inspector-metrics">
                <div><small className="u">{tr.t('inspector.status')}</small><b className={(selectedModule.active && !settlement.lastShed.includes(selectedModule.kind) ? 'metric-good' : 'metric-off') + ' u'}>{settlement.lastShed.includes(selectedModule.kind) ? tr.t('status.shed') : selectedModule.active ? tr.t('status.online') : tr.t('status.paused')}</b></div>
                <div><small className="u">{tr.t('inspector.level')}</small><b>0{tr.n(selectedModule.level)}</b></div>
                <div><small className="u">{tr.t('inspector.crew')}</small><b className="u">{selectedModule.kind === 'habitat' ? tr.t('inspector.crewInside') : tr.t('inspector.crewRemote')}</b></div>
              </div>
              <div className="inspector-actions">
                {UPGRADABLE.includes(selectedModule.kind) && (
                  <button className="inspector-primary u" onClick={() => { dispatch({ type: 'UPGRADE_MODULE', id: selectedModule.id }); announce(tr.t('notice.upgraded', { name: moduleName(tr, selectedModule) })); }} disabled={settlement.cargo < upgradeCost(selectedModule) || selectedModule.level >= 3}>{tr.t('inspector.upgrade')} <span>{tr.t('inspector.upgradeCost', { cost: upgradeCost(selectedModule) })}</span></button>
                )}
                {!['habitat', 'shield', 'battery'].includes(selectedModule.kind) && (
                  <button className="inspector-secondary u" onClick={() => { dispatch({ type: 'TOGGLE_MODULE', id: selectedModule.id }); announce(tr.t(selectedModule.active ? 'notice.paused' : 'notice.restarted', { name: moduleName(tr, selectedModule) })); }}>{selectedModule.active ? (selectedModule.kind === 'rover' ? tr.t('inspector.recallRover') : tr.t('inspector.pause')) : selectedModule.kind === 'rover' ? tr.t('inspector.cleanArrays') : tr.t('inspector.restart')}</button>
                )}
              </div>
            </aside>
          )}

          {buildOpen && settlement.phase === 'CRISIS' && (
            <section className="build-panel">
              <div className="build-panel-head"><div><div className="inspector-kicker u">{tr.t('build.kicker')}</div><h2>{tr.t('build.title')}</h2></div><button className="panel-close" onClick={() => setBuildOpen(false)} aria-label={tr.t('common.close')}>×</button></div>
              <div className="build-cargo"><span className="u">{tr.t('build.available')}</span><b>{tr.n(settlement.cargo)}</b></div>
              <div className="build-offers">
                <button className="build-offer" disabled={settlement.cargo < COSTS.solar || countKind(settlement, 'solar') >= 5} onClick={() => { dispatch({ type: 'BUILD_SPARE', kind: 'solar' }); announce(tr.t('notice.spareSolar')); }}><span className="offer-glyph">☼</span><span className="offer-copy"><b>{tr.t('build.solar')}</b><small>{tr.t('build.solarDetail')}</small></span><span className="offer-cost">⌑ {tr.n(COSTS.solar)}</span></button>
                <button className="build-offer" disabled={hasKind(settlement, 'battery') || settlement.cargo < COSTS.battery} onClick={() => { dispatch({ type: 'BUILD_SPARE', kind: 'battery' }); announce(tr.t('notice.batteryInstalled')); }}><span className="offer-glyph">▤</span><span className="offer-copy"><b>{tr.t('build.battery')}</b><small>{hasKind(settlement, 'battery') ? tr.t('build.batteryInstalled') : tr.t('build.batteryDetail')}</small></span><span className="offer-cost">⌑ {tr.n(COSTS.battery)}</span></button>
                <button className="build-offer" disabled={settlement.cargo < COSTS.repair || settlement.resources.habitat >= 100} onClick={() => { dispatch({ type: 'REPAIR' }); announce(tr.t('notice.repaired')); }}><span className="offer-glyph">✚</span><span className="offer-copy"><b>{tr.t('build.repair')}</b><small>{tr.t('build.repairDetail')}</small></span><span className="offer-cost">⌑ {tr.n(COSTS.repair)}</span></button>
              </div>
              <div className="build-footnote">{tr.t('build.footnote')}</div>
            </section>
          )}

          {lastRecord && settlement.phase === 'CRISIS' && lastRecord.notes.length > 0 && (
            <aside className="event-feed" aria-label={tr.t('feed.aria')}>
              {lastRecord.notes.slice(0, 3).map((note) => <div key={lastRecord.sol + note.id} className={'feed-item' + (note.tone === 'alert' ? ' feed-alert' : ' feed-good')}><span>{note.tone === 'alert' ? '!' : '✓'}</span><div><b className="u">{tr.t('common.sol', { sol: pad(lastRecord.sol) })}</b><small>{noteText(tr, note)}</small></div></div>)}
            </aside>
          )}
        </div>
      )}

      {helpOpen && (
        <section className="help-panel"><button className="panel-close" onClick={() => setHelpOpen(false)} aria-label={tr.t('help.closeAria')}>×</button><div className="inspector-kicker u">{tr.t('help.kicker')}</div><h2>{tr.t('help.title')}</h2><p>{tr.m('help.p1')}</p><p>{tr.m('help.p2')}</p><p>{tr.m('help.p3')}</p><div className="inspector-kicker glossary-title u">{tr.t('help.glossary')}</div><dl className="glossary">{GLOSSARY_IDS.map((id) => <div key={id}><dt>{tr.t(`glossary.${id}.term`)}</dt><dd>{tr.t(`glossary.${id}.meaning`)}</dd></div>)}</dl></section>
      )}

      {flarePending && settlement && (
        <div className="modal-scrim">
          <section className="crisis-modal flare-modal" role="dialog" aria-label={tr.t('flare.aria')}>
            <div className="crisis-eyebrow u"><span className="alert-mark">!</span> {tr.t('crisis.eyebrow', { sol: '05' })}</div>
            <h2>{tr.t('flare.title')}</h2>
            <p>{tr.m('flare.body')}</p>
            <div className="crisis-impact">
              <div><span>⬡</span><small className="u">{tr.t('flare.shielding')}</small><b className="u">{tr.t(hasKind(settlement, 'shield') ? 'flare.shieldingBerm' : 'flare.shieldingNoBerm', { percent: Math.round(shieldingOf(settlement) * 100) })}{settlement.habitatPad === 'outcrop' ? ' ' + tr.t('flare.shieldingRidge') : ''}</b></div>
              <div><span>⌁</span><small className="u">{tr.t('flare.doseSoFar')}</small><b className="u">{tr.t('flare.doseValue', { dose: Math.round(settlement.resources.radiation), caution: DOSE_CAUTION })}</b></div>
            </div>
            <button className="crisis-choice" onClick={() => respondToFlare('shelter')}><span className="choice-glyph">⌂</span><span><b className="u">{tr.m('flare.shelter')}</b><small>{tr.m(hasKind(settlement, 'shield') ? 'flare.shelterBerm' : 'flare.shelterNoBerm')}</small></span><strong className="u">{tr.t('flare.doseCost', { dose: flareDoseFor(settlement, 'shelter') })}</strong></button>
            <button className="crisis-choice" onClick={() => respondToFlare('work')}><span className="choice-glyph">◇</span><span><b className="u">{tr.t('flare.work')}</b><small>{tr.m('flare.workDetail')}</small></span><strong className="u">{tr.t('flare.doseCost', { dose: flareDoseFor(settlement, 'work') })}</strong></button>
            <div className="crisis-foot"><EvidenceTag tag="OBSERVED" /> {tr.t('flare.observed')} <EvidenceTag tag="GAMEPLAY" /> {tr.t('flare.gameplay')}</div>
          </section>
        </div>
      )}

      {stormPending && !flarePending && settlement && (
        <div className="modal-scrim">
          <section className="crisis-modal" role="dialog" aria-label={tr.t('storm.aria')}>
            <div className="crisis-eyebrow u"><span className="alert-mark">!</span> {tr.t('crisis.eyebrow', { sol: '02' })}</div>
            <h2>{tr.t('storm.title')}</h2>
            <p>{tr.m('storm.body')}</p>
            <div className="crisis-impact">
              <div><span>☼</span><small className="u">{tr.t('storm.generation')}</small><b className="u">{tr.t('storm.generationValue', { power: Math.round(solarOutput(settlement, site, 0.35, 0.82) + (hasKind(settlement, 'fission') ? 9 : 0)) })}</b></div>
              <div><span>ϟ</span><small className="u">{tr.t('storm.demandStorage')}</small><b className="u">{tr.t('storm.demandStorageValue', { demand: f?.demand ?? 0, capacity: capacityOf(settlement) })}</b></div>
            </div>
            <button className="crisis-choice" onClick={() => respondToStorm('safe-mode')}><span className="choice-glyph">⌂</span><span><b className="u">{tr.t('storm.safeMode')}</b><small>{tr.m('storm.safeModeDetail')}</small></span><strong className="u">{tr.t('storm.safeModeCost')}</strong></button>
            <button className="crisis-choice" onClick={() => respondToStorm('clean-panels')}><span className="choice-glyph">◇</span><span><b className="u">{tr.t('storm.rover')}</b><small>{tr.m('storm.roverDetail')}</small></span><strong className="u">{tr.t('storm.roverCost')}</strong></button>
            <button className="crisis-choice" onClick={() => respondToStorm('ride-out')}><span className="choice-glyph">≡</span><span><b className="u">{tr.t('storm.rideOut')}</b><small>{tr.m(rideOutKey)}</small></span><strong className="u">{tr.t('storm.rideOutCost')}</strong></button>
            <div className="crisis-foot"><EvidenceTag tag="MODELLED" /> {tr.t('storm.modelled')} <EvidenceTag tag="OBSERVED" /> {tr.t('storm.observed')}</div>
          </section>
        </div>
      )}

      {reportOpen && settlement && (settlement.phase === 'REPORT') && (
        <MissionReport state={settlement} site={site} onClose={() => setReportOpen(false)} onSources={() => setSourcesOpen(true)} onReplay={replay} onRestart={restart} />
      )}
      {!reportOpen && inSettlement && settlement?.phase === 'REPORT' && (
        <button className="report-reopen primary-action" onClick={() => setReportOpen(true)}><span className="u">{tr.t('dock.viewReport')}</span><b className="flip">↗</b></button>
      )}

      {sourcesOpen && <SourcesPanel onClose={() => setSourcesOpen(false)} />}
      {shared && <ShareView card={shared} onClose={() => { setShared(null); clearShareHash(); }} />}

      {onFile && (
        <button type="button" className={skin === 'astra' ? 'word fill outpost-file' : 'report-reopen primary-action'} style={skin === 'astra' ? undefined : { left: 16, right: 'auto' }} onClick={onFile}>
          <span className="u">File with Mission Control</span>
        </button>
      )}
      {!cinematic && (
        <footer className="mission-footer">
          <div className="controls-hint u"><span>{tr.t('footer.drag')}</span> {tr.t('footer.orbit')} <i>·</i> <span>{tr.t('footer.scroll')}</span> {tr.t('footer.zoom')} <i>·</i> {tr.t('footer.select')}</div>
          {skin !== 'astra' && <span className="mission-credit u">{tr.t('footer.credit')} <i>/</i> {tr.t('brand.subtitle')} <i>/</i> {tr.t('brand.tagline')}</span>}
          <button className="u" onClick={() => setSourcesOpen(true)}>{tr.t('footer.science')}</button>
        </footer>
      )}
      {notice && <div className="toast-message" role="status"><span>·</span>{notice}</div>}
    </main>
    </ReadingContext.Provider>
  );
}

export default App;
