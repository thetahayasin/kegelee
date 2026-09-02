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
/** A MANUAL choice from Settings. Written only by setLanguage(). */
const LANGUAGE_KEY = '@app_language';

/**
 * The last language we successfully derived from the device.
 *
 * Deliberately a SEPARATE key from the manual override. Caching the
 * device-derived value under LANGUAGE_KEY looked like it fixed the empty
 * getLocales() race, but it also made that value indistinguishable from a
 * deliberate choice - so the app pinned itself to whatever language the
 * phone happened to be in at first launch and then ignored the phone
 * forever. Kept apart, the phone stays in charge until someone actually
 * picks a language, and this only stands in when the native module has
 * nothing to say.
 */
const DEVICE_LANGUAGE_KEY = '@device_language';

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
  // Object.hasOwn, not `in`. `in` walks the prototype chain, so a device
  // reporting a locale of "constructor" or "toString" resolved to a
  // "supported" language that does not exist and crashed the bundle load.
  if (Object.hasOwn(SUPPORTED_LANGUAGES, tag)) return tag as LanguageTag;

  const [base, region] = tag.split('-');
  if (base === 'es' && region && region.toUpperCase() !== 'ES') return 'es-419';
  if (base === 'pt') return 'pt-BR';
  /**
   * Norwegian is one language here and two (plus a macro tag) on devices.
   *
   * Android reports Bokmal as "nb" and Nynorsk as "nn"; only the macrolanguage
   * "no" matched the file we ship, so a Norwegian phone - which is almost
   * always set to nb-NO - fell through to English while a complete Norwegian
   * translation sat in the bundle unused.
   */
  if (base === 'nb' || base === 'nn') return 'no';
  /**
   * Every Chinese variant gets Simplified, including the Traditional ones.
   *
   * zh-Hant, zh-HK and zh-TW are genuinely different writing systems from
   * zh-Hans, and this is a compromise, not a translation decision: there is no
   * zh-Hant file in locales/ to send them to. Simplified is at least the same
   * language rather than English. If a Traditional bundle is ever added, this
   * is the line that routes to it.
   */
  if (base === 'zh') return 'zh-Hans';
  if (Object.hasOwn(SUPPORTED_LANGUAGES, base)) return base as LanguageTag;
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
  ar: () => require('./locales/ar.json'),
  cs: () => require('./locales/cs.json'),
  da: () => require('./locales/da.json'),
  de: () => require('./locales/de.json'),
  es: () => require('./locales/es.json'),
  'es-419': () => require('./locales/es-419.json'),
  fi: () => require('./locales/fi.json'),
  fr: () => require('./locales/fr.json'),
  he: () => require('./locales/he.json'),
  hi: () => require('./locales/hi.json'),
  hu: () => require('./locales/hu.json'),
  id: () => require('./locales/id.json'),
  it: () => require('./locales/it.json'),
  ja: () => require('./locales/ja.json'),
  ko: () => require('./locales/ko.json'),
  nl: () => require('./locales/nl.json'),
  no: () => require('./locales/no.json'),
  pl: () => require('./locales/pl.json'),
  'pt-BR': () => require('./locales/pt-BR.json'),
  ro: () => require('./locales/ro.json'),
  ru: () => require('./locales/ru.json'),
  sk: () => require('./locales/sk.json'),
  sv: () => require('./locales/sv.json'),
  th: () => require('./locales/th.json'),
  tr: () => require('./locales/tr.json'),
  uk: () => require('./locales/uk.json'),
  vi: () => require('./locales/vi.json'),
  'zh-Hans': () => require('./locales/zh-Hans.json'),
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
    return stored && Object.hasOwn(SUPPORTED_LANGUAGES, stored)
      ? (stored as LanguageTag)
      : null;
  } catch {
    return null;
  }
};

/**
 * Initialise translations. Call once, before the first render that shows text.
 *
 * Precedence: a manual choice from Settings, then whatever the phone is set to
 * right now, then the last language the phone reported. Someone who picked
 * English on a German phone meant it - but someone who never picked anything
 * should follow their phone, including after they change it.
 */
/**
 * What to show when a key resolves to nothing at all.
 *
 * Not the same answer in both builds, on purpose. In development the FULL key
 * is what you need: it tells you exactly which string to add and to which
 * file, and a humanised guess would hide the problem behind something that
 * looks deliberate. In production nobody should ever see a dotted key path in
 * the interface, so the last segment is un-camel-cased into something
 * readable - "settings.failedToResetProgress" becomes "Failed to reset
 * progress", which is wrong-ish English rather than a leaked identifier.
 */
export const missingKeyText = (key: string): string => {
  if (__DEV__) return key;
  const last = key.split('.').pop() ?? key;
  const words = last
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, (_m, a: string, b: string) => `${a} ${b.toLowerCase()}`)
    .trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * What initI18n has to tell its caller.
 *
 * `needsRestart` is true when applying the language flipped the layout
 * direction. React Native cannot mirror a running bundle - I18nManager only
 * takes effect on a fresh one - so a first launch on an Arabic or Hebrew phone
 * comes up left-to-right with right-to-left text in it until something
 * reloads. The caller owns that reload; this just reports that it is needed.
 */
export interface I18nInitResult {
  language: LanguageTag;
  needsRestart: boolean;
}

export const initI18n = async (): Promise<I18nInitResult> => {
  const manual = await getStoredLanguage();

  // getLocales() can come back EMPTY when the native module has not finished
  // initialising, which used to silently fall through to English - the app then
  // started in the wrong language and only came right after a restart. So treat
  // "the device did not answer" as its own case rather than as English.
  const deviceTag = getLocales()[0]?.languageTag ?? null;

  let language: LanguageTag;
  if (manual) {
    language = manual;
  } else if (deviceTag) {
    language = resolveLanguage(deviceTag);
    // Cache it for the silent-module case below. Under its own key, so it can
    // never be mistaken for a deliberate choice on a later launch.
    AsyncStorage.setItem(DEVICE_LANGUAGE_KEY, language).catch(() => {});
  } else {
    let cached: string | null = null;
    try {
      cached = await AsyncStorage.getItem(DEVICE_LANGUAGE_KEY);
    } catch {}
    language = cached && Object.hasOwn(SUPPORTED_LANGUAGES, cached)
      ? (cached as LanguageTag)
      : 'en';
  }

  // Hoisted so TypeScript keeps the narrowing: `language` is a let now, and an
  // inline `bundles[language] && bundles[language]()` no longer narrows between
  // the check and the call.
  const activeBundle = language !== 'en' ? bundles[language] : undefined;

  await i18n.use(initReactI18next).init({
    // The active language's bundle is registered BEFORE init rather than after,
    // so the very first render already has its strings. Adding it afterwards
    // left anything resolved in between showing English.
    resources: {
      en: { translation: en },
      ...(activeBundle ? { [language]: { translation: activeBundle() } } : {}),
    },
    lng: language,
    fallbackLng: 'en',
    // React already escapes everything it renders; i18next doing it again
    // turns apostrophes in French and Italian copy into &#39;.
    interpolation: { escapeValue: false },
    returnNull: false,
    // A key with no translation anywhere (not even English) must still render
    // as something. See missingKeyText for why dev and release differ.
    parseMissingKeyHandler: (key) => missingKeyText(key),
  });

  ensureBundle(language);
  return { language, needsRestart: applyDirection(language) };
};

export default i18n;
