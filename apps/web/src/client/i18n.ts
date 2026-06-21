import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Desktop locale files – provides all keys used by embedded desktop UI components
import desktopEn from '../../../desktop/src/renderer/i18n/locales/en.json';
import desktopZh from '../../../desktop/src/renderer/i18n/locales/zh.json';

// Web-specific locale additions (auth, dashboard, sync, etc.)
import webEn from './locales/en.json';
import webZh from './locales/zh.json';

type LocaleObj = Record<string, unknown>;

function deepMerge(base: LocaleObj, override: LocaleObj): LocaleObj {
  const result: LocaleObj = { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key];
    const ov = override[key];
    if (
      typeof ov === 'object' && ov !== null &&
      typeof bv === 'object' && bv !== null
    ) {
      result[key] = deepMerge(bv as LocaleObj, ov as LocaleObj);
    } else {
      result[key] = ov;
    }
  }
  return result;
}

const resources = {
  en:     { translation: deepMerge(desktopEn as LocaleObj, webEn as LocaleObj) },
  zh:     { translation: deepMerge(desktopZh as LocaleObj, webZh as LocaleObj) },
};

const browserLanguage = navigator.language.startsWith('zh') ? 'zh' : 'en';

const savedLanguage = (() => {
  try {
    const stored = localStorage.getItem('prompthub-settings');
    if (stored) {
      const parsed = JSON.parse(stored) as { state?: { language?: string } };
      return parsed.state?.language ?? null;
    }
  } catch { /* ignore */ }
  return null;
})();

const supportedLanguages = Object.keys(resources);
const initialLanguage =
  (savedLanguage && supportedLanguages.includes(savedLanguage) ? savedLanguage : null) ??
  (supportedLanguages.includes(browserLanguage) ? browserLanguage : 'en');

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export const changeLanguage = (lang: string) => { i18n.changeLanguage(lang); };

export default i18n;
