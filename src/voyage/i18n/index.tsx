import { createContext, useContext, useMemo } from 'react';
import { en } from './locales/en';
import { ReadingContext, type ReadingMode } from '../hud/reading';
import { localeInfo, type LocaleCode } from './registry';

// Lightweight typed i18n.
// - `en` is the source of truth: every key and its English text live in locales/en.ts.
// - Other locales must provide every English key (checked by `tsc`) and may add extra
//   plural categories (e.g. ".few", ".many") that their language needs.
// - Missing keys fall back to English at runtime, never to an empty string or a key name.
// - Messages are written in natural case. Upper-case display is done with CSS (class "u")
//   so that each language uppercases with its own rules (e.g. Turkish i → İ).

export type MessageKey = keyof typeof en;
export type LocaleMessages = { [K in MessageKey]: string } & Record<string, string>;
type ModeBase<K> = K extends `${infer B}.simple` ? B : never;
export type ModeKey = ModeBase<MessageKey>;
type PluralBase<K> = K extends `${infer B}.other` ? B : never;
export type PluralKey = PluralBase<MessageKey>;
export type Params = Record<string, string | number>;

export type { LocaleCode, LocaleInfo } from './registry';

export interface Translator {
  locale: LocaleCode;
  /** Plain message. */
  t: (key: MessageKey, params?: Params) => string;
  /** Message with SIMPLE / DETAILED variants, picked by the reading level. */
  m: (key: ModeKey, params?: Params) => string;
  /** Plural message: picks "<key>.<category>" for the count, falling back to "<key>.other". */
  p: (key: PluralKey, count: number, params?: Params) => string;
  /** Locale number formatting. `fixed` forces that many decimals. */
  n: (value: number, fixed?: number) => string;
  /** Joins already-translated items with the locale's list separator. */
  list: (items: string[]) => string;
  /** Locale-aware upper case, for places CSS cannot reach (attributes, tooltips). */
  upper: (text: string) => string;
}

// Right-to-left text (Arabic) with Western digits: ratios ("12 / 100"), ranges ("50–85%"), signed values
// ("−15%", "+5.7") and percentages ("42%") stay one left-to-right unit inside the
// sentence, as CLDR formats them for Arabic. Without this the bidi algorithm shows
// "100 / 12" or "%15−". Uses invisible isolate marks; the visible text is unchanged.
const LRI = '⁦', PDI = '⁩';
const VALUE = String.raw`(?:\{\w+\}|\d+(?:[.,]\d+)*)`;
const NUMBER = String.raw`[−+±]?${VALUE}(?:\s?%)?`;
const LTR_RUN = new RegExp([String.raw`${NUMBER}\s*/\s*${NUMBER}`, String.raw`${NUMBER}\s?[–-]\s?${NUMBER}`, String.raw`[−+±]${VALUE}(?:\s?%)?`, String.raw`${VALUE}\s?%`].join('|'), 'g');
export const bidiSafe = (template: string) => template.replace(LTR_RUN, (run) => LRI + run + PDI);

const interpolate = (template: string, params: Params | undefined, format: (value: number) => string) =>
  params ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? (typeof params[name] === 'number' ? format(params[name] as number) : String(params[name])) : match)) : template;

export function createTranslator(locale: LocaleCode, messages: Partial<LocaleMessages>, reading: ReadingMode): Translator {
  const info = localeInfo(locale);
  const numberFormats = new Map<number, Intl.NumberFormat>();
  const n = (value: number, fixed?: number) => {
    const key = fixed ?? -1;
    let format = numberFormats.get(key);
    if (!format) {
      format = new Intl.NumberFormat(info.numberLocale, fixed === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: fixed, maximumFractionDigits: fixed });
      numberFormats.set(key, format);
    }
    return format.format(value);
  };
  const rtl = info.dir === 'rtl';
  const prepared = new Map<string, string>();
  const prepare = (template: string) => {
    if (!rtl) return template;
    let safe = prepared.get(template);
    if (safe === undefined) prepared.set(template, (safe = bidiSafe(template)));
    return safe;
  };
  const lookup = (key: string): string => prepare(messages[key] ?? (en as Record<string, string>)[key] ?? key);
  const t = (key: MessageKey, params?: Params) => interpolate(lookup(key), params, n);
  const plurals = new Intl.PluralRules(info.numberLocale);
  return {
    locale,
    t,
    m: (key, params) => t(`${key}.${reading}` as MessageKey, params),
    p: (key, count, params) => {
      const category = `${key}.${plurals.select(count)}`;
      const exact = messages[category] ?? (en as Record<string, string>)[category];
      const template = exact !== undefined ? prepare(exact) : lookup(`${key}.other`);
      return interpolate(template, { count, ...params }, n);
    },
    n,
    list: (items) => items.join(lookup('common.listSeparator')),
    upper: (text) => text.toLocaleUpperCase(info.numberLocale),
  };
}

export interface I18nValue { locale: LocaleCode; messages: Partial<LocaleMessages>; setLocale: (code: LocaleCode) => void }

export const I18nContext = createContext<I18nValue>({ locale: 'en', messages: en, setLocale: () => {} });

export function useT(): Translator {
  const { locale, messages } = useContext(I18nContext);
  const reading = useContext(ReadingContext);
  return useMemo(() => createTranslator(locale, messages, reading), [locale, messages, reading]);
}
