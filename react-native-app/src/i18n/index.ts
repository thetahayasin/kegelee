import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

/**
 * Languages the app ships strings for.
 *
 * Keys are the base language tag (no region) except where the regional split
 * is a genuinely different translation: pt-BR and es-419 read differently
 * enough from pt-PT and es-ES that sharing one file would be worse than not
 * translating at all.
 */
export const SUPPORTED_LANGUAGES = {
  en: 'English',
  ar: 'العربية',
  cs: 'Čeština',
  da: 'Dansk',
  de: 'Deutsch',
  es: 'Español',
  'es-419': 'Español (Latinoamérica)',
  fi: 'Suomi',
  fr: 'Français',
  he: 'עברית',
  hi: 'हिन्दी',
  hu: 'Magyar',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  nl: 'Nederlands',
  no: 'Norsk',
  pl: 'Polski',
  'pt-BR': 'Português (Brasil)',
  ro: 'Română',
  ru: 'Русский',
  sk: 'Slovenčina',
  sv: 'Svenska',
  th: 'ไทย',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
  'zh-Hans': '简体中文',
} as const;

export type LanguageTag = keyof typeof SUPPORTED_LANGUAGES;

/** Scripts written right to left. Drives layout mirroring, not just text. */
const RTL_LANGUAGES: LanguageTag[] = ['ar', 'he'];

export const isRTLLanguage = (tag: string): boolean =>
  RTL_LANGUAGES.includes(tag.split('-')[0] as LanguageTag);

/** Where a manual language choice from Settings is remembered. */
const LANGUAGE_KEY = '@app_language';

/**
 * Resolve a device locale to a language we actually ship.
 *
 * expo-localization reports full tags ("pt-BR", "es-MX", "en-GB"). Match the
 * exact tag first so pt-BR and es-419 win where they exist, then fall back to
 * the base language, then to English. Spanish is special-cased: every Latin
 * American region should get es-419 rather than the Spain translation.
 */
export const resolveLanguage = (tag: string | null | undefined): LanguageTag => {
  if (!tag) return 'en';
  if (tag in SUPPORTED_LANGUAGES) return tag as LanguageTag;

  const [base, region] = tag.split('-');
  if (base === 'es' && region && region.toUpperCase() !== 'ES') return 'es-419';
  if (base === 'pt') return 'pt-BR';
  if (base === 'zh') return 'zh-Hans';
  if (base in SUPPORTED_LANGUAGES) return base as LanguageTag;
  return 'en';
};

/**
 * Translation bundles.
 *
 * English is imported statically so the app always has a complete set to fall
 * back to, even if a locale file is missing a key. The rest are added by
 * loadLanguage() only when actually selected - bundling 28 JSON files into the
 * startup path would cost every user memory for strings 27 of them never read.
 */
const bundles: Partial<Record<LanguageTag, () => any>> = {
  de: () => require('./locales/de.json'),
  es: () => require('./locales/es.json'),
  'es-419': () => require('./locales/es-419.json'),
  fr: () => require('./locales/fr.json'),
  it: () => require('./locales/it.json'),
  nl: () => require('./locales/nl.json'),
  pl: () => require('./locales/pl.json'),
  'pt-BR': () => require('./locales/pt-BR.json'),
};

const ensureBundle = (tag: LanguageTag) => {
  if (tag === 'en' || i18n.hasResourceBundle(tag, 'translation')) return;
  try {
    const load = bundles[tag];
    if (load) i18n.addResourceBundle(tag, 'translation', load(), true, true);
  } catch {
    // A missing or malformed locale file must never crash startup; i18next
    // falls through to English key by key.
  }
};

/**
 * Apply text direction for a language.
 *
 * Returns true when the direction CHANGED, because React Native cannot flip
 * layout direction on a live bundle: I18nManager only takes effect after a
 * reload. Callers use the return value to prompt for a restart rather than
 * leaving the user with mirrored text in an unmirrored layout.
 */
export const applyDirection = (tag: LanguageTag): boolean => {
  const shouldBeRTL = isRTLLanguage(tag);
  if (I18nManager.isRTL === shouldBeRTL) return false;
  I18nManager.allowRTL(shouldBeRTL);
  I18nManager.forceRTL(shouldBeRTL);
  return true;
};

/** Switch language at runtime and remember the choice. */
export const setLanguage = async (tag: LanguageTag): Promise<{ needsRestart: boolean }> => {
  ensureBundle(tag);
  await i18n.changeLanguage(tag);
  await AsyncStorage.setItem(LANGUAGE_KEY, tag).catch(() => {});
  return { needsRestart: applyDirection(tag) };
};

/** The stored override, or null when the device locale should decide. */
export const getStoredLanguage = async (): Promise<LanguageTag | null> => {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    return stored && stored in SUPPORTED_LANGUAGES ? (stored as LanguageTag) : null;
  } catch {
    return null;
  }
};

/**
 * Initialise translations. Call once, before the first render that shows text.
 *
 * A manual choice always beats the device locale - someone who picked English
 * on a German phone meant it.
 */
export const initI18n = async (): Promise<LanguageTag> => {
  const stored = await getStoredLanguage();
  const deviceTag = getLocales()[0]?.languageTag ?? 'en';
  const language = stored ?? resolveLanguage(deviceTag);

  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: language,
    fallbackLng: 'en',
    // React already escapes everything it renders; i18next doing it again
    // turns apostrophes in French and Italian copy into &#39;.
    interpolation: { escapeValue: false },
    returnNull: false,
    // A key with no translation should render the English text, not the key.
    parseMissingKeyHandler: (key) => key.split('.').pop() ?? key,
  });

  ensureBundle(language);
  applyDirection(language);
  return language;
};

export default i18n;
