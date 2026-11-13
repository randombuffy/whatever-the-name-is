import { TIMELINE_STEPS } from '../mission/phases';
import { useT, type MessageKey } from '../i18n';

export function MissionTimeline({ current, minimal = false }: { current: number; minimal?: boolean }) {
  const tr = useT();
  return (
    <nav className={'mission-timeline' + (minimal ? ' is-minimal' : '')} aria-label={tr.t('timeline.aria')}>
      <ol>
        {Array.from({ length: TIMELINE_STEPS }, (_, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'next';
          return (
            <li key={index} className={'timeline-step is-' + state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="timeline-index">{state === 'done' ? '✓' : String(index + 1).padStart(2, '0')}</span>
              <span className="timeline-label u">{tr.t(`timeline.${index}` as MessageKey)}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
