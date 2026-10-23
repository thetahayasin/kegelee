/**
 * expo-localization reporting the language under capture.
 *
 * The app also gets the same tag as a stored manual choice, but answering
 * here too means the "follow the phone" path agrees with it.
 */
const tag = () => new URLSearchParams(window.location.search).get('lang') || 'en';
export const getLocales = () => [{ languageTag: tag(), languageCode: tag().split('-')[0] }];
export const getCalendars = () => [{ timeZone: 'UTC', uses24hourClock: true, firstWeekday: 2 }];
