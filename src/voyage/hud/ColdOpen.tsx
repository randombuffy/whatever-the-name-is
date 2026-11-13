import type { ApproachSegment } from '../scene/approachLive';
import { useT } from '../i18n';

// Shown over the approach flight until the briefing card is allowed in.
// Pointer events stay off so Skip and the language control keep working.
// The line follows the picture: Earth, then the cruise, then Mars.
export function ColdOpen({ segment }: { segment: ApproachSegment }) {
  const tr = useT();
  const kicker = segment === 'earth' ? 'earthlaunch.kicker' : segment === 'transit' ? 'transit.kicker' : 'coldopen.kicker';
  const title = segment === 'earth' ? 'earthlaunch.title' : segment === 'transit' ? 'transit.title' : 'coldopen.title';
  const line = segment === 'earth' ? 'earthlaunch.line' : segment === 'transit' ? 'transit.line' : 'coldopen.line';
  return (
    <div className="cold-open">
      <p className="u">{tr.t(kicker)}</p>
      <h2>{tr.t(title)}</h2>
      <p>{tr.m(line)}</p>
    </div>
  );
}
