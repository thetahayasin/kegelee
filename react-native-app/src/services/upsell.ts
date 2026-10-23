/**
 * When the app may ASK a free account to subscribe, unprompted.
 *
 * Everything the reader taps on their own - a padlocked exercise, the level
 * picker, the reminders row, Manage Plan - opens the paywall every time,
 * because they asked. This file is only about the asks the APP starts, and it
 * exists so there are few of them, each at a moment that earns it:
 *
 *   1. The welcome offer: once per account, ever, right after the Training
 *      tour ends - the first time the reader is looking at their own plan,
 *      with the trial at its most relevant.
 *   2. The post-session offer: when a finished session no longer moves the
 *      plan (the free day cap). At most once a day. It used to open after
 *      EVERY session past the cap - twice a day, every day - which is the
 *      surest way to turn a willing reader into an uninstall.
 *
 * Stored per account in AsyncStorage. A failed read answers "no": missing an
 * ask is cheap, asking twice is not.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalDateString } from './progression';

const welcomeKey = (userId: number) => `@upsell_welcome_shown_${userId}`;
const sessionKey = (userId: number) => `@upsell_session_offer_day_${userId}`;

/**
 * Take the one welcome offer, if it has not been taken yet.
 *
 * Marks it as shown at the moment it is claimed, before the paywall opens, so
 * two quick calls (a focus and a tour callback landing together) can never
 * both win.
 */
export const claimWelcomeOffer = async (userId: number): Promise<boolean> => {
  try {
    if (await AsyncStorage.getItem(welcomeKey(userId))) return false;
    await AsyncStorage.setItem(welcomeKey(userId), String(Date.now()));
    return true;
  } catch {
    return false;
  }
};

/** Take today's post-session offer, if today has not had one. */
export const claimSessionOffer = async (userId: number): Promise<boolean> => {
  try {
    const today = getLocalDateString();
    if ((await AsyncStorage.getItem(sessionKey(userId))) === today) return false;
    await AsyncStorage.setItem(sessionKey(userId), today);
    return true;
  } catch {
    return false;
  }
};

/** Forget this account's offers, so the next person on the device starts fresh. */
export const forgetUpsellState = async (userId: number | string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(`@upsell_welcome_shown_${userId}`);
    await AsyncStorage.removeItem(`@upsell_session_offer_day_${userId}`);
  } catch {}
};
