import type { Outcome } from './settlement';
import { SITES, type SiteId } from './sites';

// Past mission runs, kept in this browser only so players can compare attempts.
// Storage can be unavailable (private mode, blocked site data); every access is guarded
// and the game works the same without it.

export interface RunRecord {
  id: string;
  finishedAt: string;
  // Older runs stored only the English site name; new runs also store the id.
  site: string;
  siteId?: SiteId;
  outcome: Outcome;
  score: number;
  sol: number;
  goalsMet: number;
  dose: number;
}

const KEY = 'mars2100.runs.v1';
const LIMIT = 8;

const isRun = (value: unknown): value is RunRecord => {
  const run = value as RunRecord;
  return Boolean(run) && typeof run.id === 'string' && typeof run.site === 'string' && typeof run.score === 'number' && typeof run.goalsMet === 'number';
};

export function loadRuns(): RunRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRun) : [];
  } catch {
    return [];
  }
}

// Saving the same run twice (for example when the report is reopened) replaces it.
export function saveRun(run: RunRecord): RunRecord[] {
  const runs = [run, ...loadRuns().filter((item) => item.id !== run.id)].slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(runs));
  } catch {
    // Not persisted; the list is still shown for this session.
  }
  return runs;
}

// Short site label for a run, using the id when present and the stored name for older runs.
export const runSiteName = (run: RunRecord) => (run.siteId ? SITES.find((site) => site.id === run.siteId) : SITES.find((site) => site.name === run.site))?.shortName ?? run.site;

export const bestScore = (runs: RunRecord[]) => runs.filter((run) => run.outcome !== 'evacuated').reduce<number | null>((best, run) => (best === null || run.score > best ? run.score : best), null);
