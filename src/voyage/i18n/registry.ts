import type { LocaleMessages } from './index';

// Supported languages. Names are written in each language itself (endonyms) and are
// never translated. A language appears in the picker only once its message file exists
// (see LOADERS), so players never pick a language that would silently show English.

export type LocaleCode =
  | 'en' | 'id' | 'es' | 'zh-Hans' | 'ar' | 'fr' | 'ja' | 'ko' | 'de' | 'pt-BR' | 'ru' | 'hi' | 'tr' | 'it' | 'vi'
  | 'qps' | 'qps-ar'; // development pseudo-locales: long text / right-to-left

export interface LocaleInfo {
  code: LocaleCode;
  name: string;
  short: string;
  dir: 'ltr' | 'rtl';
  // Locale used for numbers, plurals and upper-casing. Arabic uses Western digits (0–9).
  numberLocale: string;
  // Value for <html lang>; selects the per-language fonts and rules in Mission.css.
  htmlLang: string;
  // Extra Google Font for scripts the base fonts (Inter, Space Grotesk, JetBrains Mono)
  // do not cover. Downloaded only when the language is chosen.
  font?: string;
}

export const LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', short: 'EN', dir: 'ltr', numberLocale: 'en', htmlLang: 'en' },
  { code: 'id', name: 'Bahasa Indonesia', short: 'ID', dir: 'ltr', numberLocale: 'id', htmlLang: 'id' },
  { code: 'es', name: 'Español', short: 'ES', dir: 'ltr', numberLocale: 'es', htmlLang: 'es' },
  { code: 'zh-Hans', name: '简体中文', short: 'ZH', dir: 'ltr', numberLocale: 'zh-Hans', htmlLang: 'zh-Hans', font: 'Noto Sans SC' },
  { code: 'ar', name: 'العربية', short: 'AR', dir: 'rtl', numberLocale: 'ar-u-nu-latn', htmlLang: 'ar', font: 'Noto Sans Arabic' },
  { code: 'fr', name: 'Français', short: 'FR', dir: 'ltr', numberLocale: 'fr', htmlLang: 'fr' },
  { code: 'ja', name: '日本語', short: 'JA', dir: 'ltr', numberLocale: 'ja', htmlLang: 'ja', font: 'Noto Sans JP' },
  { code: 'ko', name: '한국어', short: 'KO', dir: 'ltr', numberLocale: 'ko', htmlLang: 'ko', font: 'Noto Sans KR' },
  { code: 'de', name: 'Deutsch', short: 'DE', dir: 'ltr', numberLocale: 'de', htmlLang: 'de' },
  { code: 'pt-BR', name: 'Português (Brasil)', short: 'PT', dir: 'ltr', numberLocale: 'pt-BR', htmlLang: 'pt-BR' },
  { code: 'ru', name: 'Русский', short: 'RU', dir: 'ltr', numberLocale: 'ru', htmlLang: 'ru' },
  { code: 'hi', name: 'हिन्दी', short: 'HI', dir: 'ltr', numberLocale: 'hi-u-nu-latn', htmlLang: 'hi', font: 'Noto Sans Devanagari' },
  { code: 'tr', name: 'Türkçe', short: 'TR', dir: 'ltr', numberLocale: 'tr', htmlLang: 'tr' },
  { code: 'it', name: 'Italiano', short: 'IT', dir: 'ltr', numberLocale: 'it', htmlLang: 'it' },
  { code: 'vi', name: 'Tiếng Việt', short: 'VI', dir: 'ltr', numberLocale: 'vi', htmlLang: 'vi' },
  { code: 'qps', name: 'Pseudo (test)', short: 'QPS', dir: 'ltr', numberLocale: 'en', htmlLang: 'qps-ploc' },
  { code: 'qps-ar', name: 'Pseudo RTL (test)', short: 'QAR', dir: 'rtl', numberLocale: 'ar-u-nu-latn', htmlLang: 'ar', font: 'Noto Sans Arabic' },
];

export const localeInfo = (code: LocaleCode) => LOCALES.find((locale) => locale.code === code) ?? LOCALES[0];

type Loader = () => Promise<LocaleMessages>;

// English is bundled with the app; every other language is loaded only when chosen.
// Add a line here when a translation file is ready.
const LOADERS: Partial<Record<LocaleCode, Loader>> = {
  id: () => import('./locales/id').then((module) => module.id),
  es: () => import('./locales/es').then((module) => module.es),
  'zh-Hans': () => import('./locales/zh-Hans').then((module) => module.zhHans),
  ar: () => import('./locales/ar').then((module) => module.ar),
  fr: () => import('./locales/fr').then((module) => module.fr),
  ja: () => import('./locales/ja').then((module) => module.ja),
  ko: () => import('./locales/ko').then((module) => module.ko),
  de: () => import('./locales/de').then((module) => module.de),
  'pt-BR': () => import('./locales/pt-BR').then((module) => module.ptBR),
  ru: () => import('./locales/ru').then((module) => module.ru),
  hi: () => import('./locales/hi').then((module) => module.hi),
  tr: () => import('./locales/tr').then((module) => module.tr),
  it: () => import('./locales/it').then((module) => module.it),
  vi: () => import('./locales/vi').then((module) => module.vi),
  ...(import.meta.env?.DEV
    ? {
        qps: () => import('./locales/qps').then((module) => module.qps),
        'qps-ar': () => import('./locales/qps').then((module) => module.qpsAr),
      }
    : {}),
};

export const availableLocales = (): LocaleInfo[] => LOCALES.filter((locale) => locale.code === 'en' || LOADERS[locale.code]);

export function loadLocale(code: LocaleCode): Promise<LocaleMessages> | null {
  return LOADERS[code]?.() ?? null;
}

const STORAGE_KEY = 'mars2100.lang';

export function storedLocale(): LocaleCode | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return availableLocales().some((locale) => locale.code === value) ? (value as LocaleCode) : null;
  } catch {
    return null;
  }
}

export function rememberLocale(code: LocaleCode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Not remembered; the choice still applies for this session.
  }
}

// Matches the browser's preferred languages against the available ones:
// exact tag first (pt-BR), then the base language (pt → pt-BR, zh → zh-Hans, ar-EG → ar).
export function matchLocale(preferred: readonly string[], available: readonly LocaleCode[]): LocaleCode {
  for (const tag of preferred) {
    const lower = tag.toLowerCase();
    const exact = available.find((code) => code.toLowerCase() === lower);
    if (exact) return exact;
    const base = lower.split('-')[0];
    const byBase = available.find((code) => code.toLowerCase().split('-')[0] === base);
    if (byBase) return byBase;
  }
  return 'en';
}

export const detectLocale = (preferred: readonly string[]) =>
  matchLocale(preferred, availableLocales().map((locale) => locale.code).filter((code) => !code.startsWith('qps')));

// Adds the language's Google Font stylesheet once. Fonts are split by Google into
// unicode-range files, so only the characters actually shown are downloaded.
export function loadLocaleFont(code: LocaleCode) {
  const family = localeInfo(code).font;
  if (!family || typeof document === 'undefined') return;
  const id = 'font-' + family.replace(/\s+/g, '-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}
