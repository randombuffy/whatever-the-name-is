import { useContext } from 'react';
import { I18nContext, useT } from '../i18n';
import { availableLocales, localeInfo, type LocaleCode } from '../i18n/registry';

// Compact "EN ▾" language control. A native <select> sits invisibly on top, so keyboard,
// screen readers and phone pickers all work as usual. Language names are endonyms.
export function LanguagePicker({ className = '' }: { className?: string }) {
  const tr = useT();
  const { locale, setLocale } = useContext(I18nContext);
  const locales = availableLocales();
  if (locales.length < 2) return null;
  const label = tr.t('nav.language');
  return (
    <label className={'language-picker ' + className} title={label}>
      <span className="language-short" aria-hidden="true">{localeInfo(locale).short} <i>▾</i></span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as LocaleCode)} aria-label={locale === 'en' ? label : `${label} · Language`}>
        {locales.map((option) => (
          <option key={option.code} value={option.code} lang={option.code === 'qps' ? 'en' : option.code} dir={option.dir}>{option.name}</option>
        ))}
      </select>
    </label>
  );
}
