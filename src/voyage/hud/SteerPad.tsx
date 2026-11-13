import { useEffect, useRef, useState } from 'react';
import { STEER_BAND, STEER_MS, gradeSteer, meanSteerExcess, stepSteer, type SteerGrade, type SteerSample } from '../mission/steer';
import { useT } from '../i18n';

export function SteerPad({ onOffset, onResult }: { onOffset: (value: number) => void; onResult: (grade: SteerGrade) => void }) {
  const tr = useT();
  const track = useRef<HTMLDivElement>(null);
  const sample = useRef<SteerSample>({ offset: 0, error: 0, samples: 0 });
  const dragging = useRef(false);
  const target = useRef(0);
  const key = useRef(0);
  const onOffsetRef = useRef(onOffset);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onOffsetRef.current = onOffset;
    onResultRef.current = onResult;
  });
  const [offset, setOffset] = useState(0);
  const [left, setLeft] = useState(1);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const start = last;
    let stopped = false;
    const tick = (now: number) => {
      if (stopped) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = now - start;
      const next = stepSteer(sample.current, elapsed, dt, { dragging: dragging.current, target: target.current, key: key.current });
      onOffsetRef.current(next);
      setOffset(next);
      setLeft(Math.max(0, 1 - elapsed / STEER_MS));
      if (elapsed >= STEER_MS) {
        onOffsetRef.current(0);
        onResultRef.current(gradeSteer(meanSteerExcess(sample.current)));
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      onOffsetRef.current(0);
    };
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { key.current = -1; event.preventDefault(); }
      if (event.key === 'ArrowRight') { key.current = 1; event.preventDefault(); }
    };
    const up = (event: KeyboardEvent) => {
      if ((event.key === 'ArrowLeft' && key.current < 0) || (event.key === 'ArrowRight' && key.current > 0)) key.current = 0;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const aim = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    target.current = Math.max(-1, Math.min(1, ratio * 2 - 1));
  };

  const marker = ((offset + 1) / 2) * 100;
  const bandLeft = ((1 - STEER_BAND) / 2) * 100;
  const bandWidth = STEER_BAND * 100;

  return (
    <section className="skill-pad hud-card" role="dialog" aria-label={tr.t('skill.aria')}>
      <div className="hud-kicker u">{tr.t('skill.band')}</div>
      <h2>{tr.m('skill.title')}</h2>
      <p>{tr.m('skill.hint')}</p>
      <div
        className="skill-track"
        dir="ltr"
        ref={track}
        role="slider"
        tabIndex={0}
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round(offset * 100)}
        aria-label={tr.t('skill.band')}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          aim(event.clientX);
        }}
        onPointerMove={(event) => { if (dragging.current) aim(event.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        <div className="skill-band" style={{ left: bandLeft + '%', width: bandWidth + '%' }} />
        <div className="skill-marker" style={{ left: marker + '%', transform: 'translateX(-50%)' }} />
      </div>
      <div className="skill-time" aria-hidden><span style={{ transform: `scaleX(${left})` }} /></div>
      <p className="hud-footnote">{tr.t('skill.gameplay')}</p>
    </section>
  );
}
