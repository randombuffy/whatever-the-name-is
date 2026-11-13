import { useT } from '../i18n';
import { SITES } from '../mission/sites';
import type { ShareCard } from '../mission/share';

export function ShareView({ card, onClose }: { card: ShareCard; onClose: () => void }) {
  const tr = useT();
  const site = SITES.find((item) => item.id === card.site);
  const outcome = card.outcome === 'evacuated' ? tr.t('report.runs.failed') : tr.t(`report.outcome.${card.outcome}`);
  return (
    <div className="modal-scrim report-scrim">
      <section className="share-view" role="dialog" aria-label={tr.t('share.aria')}>
        <div className="hud-kicker u">{tr.t('share.kicker')}</div>
        <h2>{tr.t('share.title')}</h2>
        <p className="share-line">{tr.t('share.line', { site: site?.name ?? card.site, outcome, score: card.score })}</p>
        <dl className="readout-list">
          <div><dt>{tr.t('report.row.contract')}</dt><dd>{tr.t(`report.contract.${card.contract}`)}</dd></div>
          <div><dt>{tr.t('report.row.descent')}</dt><dd>{card.trajectory === 'direct' ? tr.t('report.descent.direct') : tr.t('report.descent.divert')}</dd></div>
          <div><dt>{tr.t('report.row.skill')}</dt><dd>{tr.t(`report.skill.${card.skill}`)}</dd></div>
          <div><dt>{tr.t('report.runs.goals')}</dt><dd>{tr.t('share.goals', { met: card.goalsMet, total: 4 })}</dd></div>
          <div><dt>{tr.t('common.sol', { sol: String(card.sol).padStart(2, '0') })}</dt><dd>{tr.n(card.score)}</dd></div>
        </dl>
        <div className="sheet-actions">
          <p className="hud-footnote">{tr.t('share.cardFooter')}</p>
          <button className="primary-action" type="button" onClick={onClose}><span className="u">{tr.t('share.close')}</span><b className="flip">→</b></button>
        </div>
        <button className="report-close" type="button" onClick={onClose} aria-label={tr.t('common.close')}>×</button>
      </section>
    </div>
  );
}
