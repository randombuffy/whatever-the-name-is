import { EvidenceTag, SourcesLanguageNote } from './LandingHUD';
import type { Evidence } from '../mission/sites';
import { useT } from '../i18n';

// Entry text: sources.<id>.title / .text. Link labels are the English titles of NASA pages.
type EntryId = 'environment' | 'edl' | 'sites' | 'tech' | 'radiation' | 'transit' | 'modelled' | 'gameplay' | 'attention';
interface Entry { id: EntryId; tag: Evidence; links: { label: string; url: string }[] }

const ENTRIES: Entry[] = [
  {
    id: 'environment', tag: 'OBSERVED',
    links: [
      { label: 'NASA Science · Mars facts', url: 'https://science.nasa.gov/mars/facts/' },
      { label: 'NASA GSFC · Mars fact sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
    ],
  },
  {
    id: 'edl', tag: 'OBSERVED',
    links: [
      { label: 'NASA · Perseverance parachute deployment', url: 'https://science.nasa.gov/resource/perseverance-deploys-its-parachute-illustration/' },
      { label: 'NASA · Terrain Relative Navigation', url: 'https://www.nasa.gov/directorates/stmd/impact-story-terrain-relative-navigation/' },
    ],
  },
  {
    id: 'sites', tag: 'OBSERVED',
    links: [
      { label: 'NASA · Jezero crater elevation', url: 'https://science.nasa.gov/photojournal/jezero-crater-elevation-graph/' },
      { label: 'NASA/JPL · InSight landing site', url: 'https://www.jpl.nasa.gov/news/press_kits/insight/landing/mission/landing-site' },
      { label: 'NASA/JPL · Utopia Planitia ice deposit', url: 'https://www.jpl.nasa.gov/news/mars-ice-deposit-holds-as-much-water-as-lake-superior/' },
      { label: 'NASA PDS · MOLA topography archive', url: 'https://pds-geosciences.wustl.edu/missions/mgs/megdr.html' },
      { label: 'USGS · Mars Viking colorized global mosaic', url: 'https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m' },
    ],
  },
  {
    id: 'tech', tag: 'OBSERVED',
    links: [
      { label: 'NASA · ISS water recovery milestone', url: 'https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/' },
      { label: 'NASA/JPL · MOXIE completes its mission', url: 'https://www.jpl.nasa.gov/news/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/' },
      { label: 'NASA · KRUSTY fission test', url: 'https://www.nasa.gov/news-release/demonstration-proves-nuclear-fission-system-can-provide-space-exploration-power/' },
      { label: 'NASA · Dust storms and safe mode', url: 'https://science.nasa.gov/resource/mars-report-dust-storms-on-mars/' },
    ],
  },
  {
    id: 'radiation', tag: 'OBSERVED',
    links: [
      { label: 'NASA/JPL · Solar storm doubles radiation at the Martian surface', url: 'https://www.jpl.nasa.gov/news/large-solar-storm-sparks-global-aurora-and-doubles-radiation-levels-on-the-martian-surface/' },
    ],
  },
  {
    id: 'transit', tag: 'MODELLED',
    links: [
      { label: 'NASA Visible Earth · Blue Marble', url: 'https://visibleearth.nasa.gov/collection/1484/blue-marble' },
      { label: 'NASA GSFC · Earth fact sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html' },
      { label: 'NASA · Artemis', url: 'https://www.nasa.gov/humans-in-space/artemis/' },
    ],
  },
  {
    id: 'modelled', tag: 'MODELLED',
    links: [],
  },
  {
    id: 'gameplay', tag: 'GAMEPLAY',
    links: [],
  },
  {
    id: 'attention', tag: 'GAMEPLAY',
    links: [],
  },
];

export function SourcesPanel({ onClose }: { onClose: () => void }) {
  const tr = useT();
  return (
    <div className="modal-scrim source-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="source-panel" role="dialog" aria-label={tr.t('sources.aria')}>
        <button className="panel-close" onClick={onClose} aria-label={tr.t('sources.closeAria')}>×</button>
        <div className="hud-kicker u">{tr.t('sources.kicker')}</div>
        <h2>{tr.t('sources.title')}</h2>
        <p className="source-intro">{tr.t('sources.intro')}</p>
        {ENTRIES.map((entry) => (
          <div className="source-entry" key={entry.id}>
            <EvidenceTag tag={entry.tag} />
            <div>
              <b>{tr.t(`sources.${entry.id}.title`)}</b>
              <p>{tr.t(`sources.${entry.id}.text`)}</p>
              {entry.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} <span className="flip">↗</span></a>)}
            </div>
          </div>
        ))}
        <SourcesLanguageNote />
        <div className="source-footer u"><span>{tr.t('sources.footerLeft')}</span><span>{tr.t('sources.footerRight')}</span></div>
      </section>
    </div>
  );
}
