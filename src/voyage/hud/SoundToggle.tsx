import { useState } from 'react';
import { missionAudio } from '../audio/missionAudio';
import { useT } from '../i18n';

export function SoundToggle() {
  const tr = useT();
  const [muted, setMuted] = useState(() => missionAudio().muted);
  const label = muted ? tr.t('audio.ariaUnmute') : tr.t('audio.ariaMute');
  return (
    <button
      className="icon-button sound-toggle"
      type="button"
      aria-pressed={!muted}
      aria-label={label}
      title={muted ? tr.t('audio.unmute') : tr.t('audio.mute')}
      onClick={() => {
        missionAudio().unlock();
        setMuted(missionAudio().toggleMuted());
      }}
    >
      <span aria-hidden>{muted ? '×' : '♪'}</span>
    </button>
  );
}
