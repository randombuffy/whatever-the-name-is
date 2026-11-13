import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { en } from './locales/en';
import { I18nContext, createTranslator, type I18nValue, type LocaleMessages } from './index';
import { detectLocale, loadLocale, loadLocaleFont, localeInfo, rememberLocale, storedLocale, type LocaleCode } from './registry';

interface Active { locale: LocaleCode; messages: Partial<LocaleMessages> }

const ENGLISH: Active = { locale: 'en', messages: en };

function initialLocale(): LocaleCode {
  const stored = storedLocale();
  if (stored) return stored;
  if (typeof navigator === 'undefined') return 'en';
  return detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language ?? 'en']);
}

// Holds the active language. Switching only swaps the messages in context: the mission,
// camera and 3D scene stay mounted, so nothing restarts. While another language loads,
// the previous one stays on screen.
export function I18nProvider({ children, manageDocument = true }: { children: ReactNode; manageDocument?: boolean }) {
  const [active, setActive] = useState<Active>(ENGLISH);
  const request = useRef(0);

  // Loads a language file; only the most recent request may switch the language.
  const load = useCallback((code: LocaleCode) => {
    const ticket = ++request.current;
    loadLocaleFont(code); // in parallel with the messages, so text rarely flashes in a fallback font
    loadLocale(code)
      ?.then((messages) => {
        if (ticket === request.current) setActive({ locale: code, messages });
      })
      .catch(() => {
        // Keep the current language if a file fails to load (e.g. offline).
      });
  }, []);

  // Start in the remembered or browser language.
  useEffect(() => {
    const code = initialLocale();
    if (code !== 'en') load(code);
  }, [load]);

  const setLocale = useCallback((code: LocaleCode) => {
    rememberLocale(code);
    if (code === 'en') {
      request.current++;
      setActive(ENGLISH);
    } else {
      load(code);
    }
  }, [load]);

  useEffect(() => {
    if (!manageDocument) return;
    const info = localeInfo(active.locale);
    const root = document.documentElement;
    root.lang = info.htmlLang;
    root.dir = info.dir;
    const tr = createTranslator(active.locale, active.messages, 'detailed');
    document.title = tr.t('app.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', tr.t('app.description'));
  }, [active, manageDocument]);

  const value = useMemo<I18nValue>(() => ({ locale: active.locale, messages: active.messages, setLocale }), [active, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
