import { isContractId, type ContractId } from './contracts';
import type { SkillGrade } from './landingMachine';
import type { Outcome } from './settlement';
import type { SiteId } from './sites';

// A read-only postcard of a finished run. Nothing is sent to a server.
// Schema version is the first field so an unknown link can be ignored.

export const SHARE_VERSION = 1;

export interface ShareCard {
  v: 1;
  site: SiteId;
  trajectory: 'divert' | 'direct';
  outcome: Outcome;
  score: number;
  goalsMet: number;
  contract: ContractId;
  skill: Exclude<SkillGrade, 'pending'>;
  sol: number;
}

const SITES: readonly SiteId[] = ['jezero', 'utopia', 'elysium'];
const TRAJECTORIES = ['divert', 'direct'] as const;
const OUTCOMES: readonly Outcome[] = ['operational', 'degraded', 'evacuated'];
const SKILLS = ['clear', 'rough', 'hard', 'neutral'] as const;

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export function encodeShare(card: ShareCard): string {
  const json = JSON.stringify([
    card.v, card.site, card.trajectory, card.outcome, card.score, card.goalsMet, card.contract, card.skill, card.sol,
  ]);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(token: string): ShareCard | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed) || parsed.length !== 9 || parsed[0] !== SHARE_VERSION) return null;
    const [, site, trajectory, outcome, score, goalsMet, contract, skill, sol] = parsed;
    if (!SITES.includes(site as SiteId)) return null;
    if (!TRAJECTORIES.includes(trajectory as 'divert')) return null;
    if (!OUTCOMES.includes(outcome as Outcome)) return null;
    if (!isInt(score, 0, 100) || !isInt(goalsMet, 0, 4) || !isInt(sol, 0, 7)) return null;
    if (!isContractId(contract) || !SKILLS.includes(skill as 'clear')) return null;
    return {
      v: 1,
      site: site as SiteId,
      trajectory: trajectory as ShareCard['trajectory'],
      outcome: outcome as Outcome,
      score,
      goalsMet,
      contract,
      skill: skill as ShareCard['skill'],
      sol,
    };
  } catch {
    return null;
  }
}

export function readShareFromLocation(): ShareCard | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.startsWith('share=')) return null;
  const card = decodeShare(decodeURIComponent(hash.slice('share='.length)));
  if (!card) {
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(null, '', url);
  }
  return card;
}

export function shareUrl(card: ShareCard) {
  const url = new URL(window.location.href);
  url.hash = 'share=' + encodeShare(card);
  return url.toString();
}

export function clearShareHash() {
  const url = new URL(window.location.href);
  if (!url.hash.startsWith('#share=')) return;
  url.hash = '';
  window.history.replaceState(null, '', url);
}

export interface SharePaintRow {
  label: string;
  value: string;
  ltr?: boolean;
}

export function paintShareCard(
  canvas: HTMLCanvasElement,
  card: { dir: 'ltr' | 'rtl'; kicker: string; title: string; rows: SharePaintRow[]; footer: string },
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const width = canvas.width;
  const height = canvas.height;
  const rtl = card.dir === 'rtl';
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#1a110e';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#c1440e';
  ctx.beginPath();
  ctx.arc(rtl ? 170 : width - 170, 150, 108, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9e3105';
  ctx.beginPath();
  ctx.arc(rtl ? 130 : width - 210, 120, 28, 0, Math.PI * 2);
  ctx.fill();
  const x = rtl ? width - 72 : 72;
  const draw = (text: string, y: number, font: string, color: string, ltr = false) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.direction = ltr ? 'ltr' : rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillText(text, x, y);
  };
  draw(card.kicker, 86, '500 26px sans-serif', '#f0c38e');
  draw(card.title, 156, '600 58px sans-serif', '#f8f1e6');
  card.rows.forEach((row, index) => {
    const y = 250 + index * 78;
    draw(row.label, y, '500 20px sans-serif', 'rgba(237,221,199,0.62)');
    draw(row.value, y + 40, '600 34px sans-serif', '#fff8ee', row.ltr);
  });
  draw(card.footer, height - 42, '400 20px sans-serif', 'rgba(237,221,199,0.55)');
  return true;
}
