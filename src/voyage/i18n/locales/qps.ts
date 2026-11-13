import { en } from './en';
import type { LocaleMessages } from '../index';

// Development-only pseudo-locales (never shipped).
// - qps: accented letters, ~40% extra length and [brackets], so untranslated text,
//   clipped labels and broken layouts are easy to spot.
// - qps-ar: English spelled with Arabic letters, shown right-to-left, to check the
//   mirrored layout, Arabic font, letter joining and number direction. Arrows are
//   written the way an Arabic translator would (← ↖).
// {placeholders} are kept intact in both.

const ACCENTS: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', y: 'ý',
  A: 'Å', E: 'É', I: 'Î', O: 'Ø', U: 'Û', C: 'Ç', N: 'Ñ', Y: 'Ý',
};

const pseudo = (text: string) => {
  if (!text.trim()) return text;
  const accented = text
    .split(/(\{\w+\})/)
    .map((part) => (/^\{\w+\}$/.test(part) ? part : part.replace(/[a-zA-Z]/g, (letter) => ACCENTS[letter] ?? letter)))
    .join('');
  const padding = '~'.repeat(Math.max(1, Math.round(text.length * 0.4)));
  return `[${accented} ${padding}]`;
};

export const qps = Object.fromEntries(
  Object.entries(en).map(([key, value]) => [key, key === 'common.listSeparator' ? value : pseudo(value)]),
) as LocaleMessages;

const ARABIC: Record<string, string> = {
  a: 'ا', b: 'ب', c: 'ك', d: 'د', e: 'ي', f: 'ف', g: 'غ', h: 'ه', i: 'ي', j: 'ج', k: 'ك', l: 'ل', m: 'م',
  n: 'ن', o: 'و', p: 'ب', q: 'ق', r: 'ر', s: 'س', t: 'ت', u: 'و', v: 'ف', w: 'و', x: 'كس', y: 'ي', z: 'ز',
};
const ARROWS: Record<string, string> = { '→': '←', '↗': '↖' };

const pseudoArabic = (text: string) =>
  text
    .split(/(\{\w+\})/)
    .map((part) => (/^\{\w+\}$/.test(part) ? part : part.replace(/[a-zA-Z]|[→↗]/g, (char) => ARROWS[char] ?? ARABIC[char.toLowerCase()] ?? char)))
    .join('');

export const qpsAr = Object.fromEntries(
  Object.entries(en).map(([key, value]) => [key, key === 'common.listSeparator' ? '، ' : pseudoArabic(value)]),
) as LocaleMessages;
