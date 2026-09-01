import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TourStep } from '../components/TourOverlay';
import { track } from './events';

/**
 * Which guided tours this identity has already seen.
 *
 * Per identity, like the free session marker: a guest gets the session tour on
 * their demo, and the account they later create gets the app tour on its first
 * entry, which are two different explanations for two different moments. One
 * global flag would have shown whichever came first and swallowed the other.
 *
 * Marked SEEN on skip as well as on finish. A tour that returns because you
 * dismissed it is not a tour, it is a nag, and this one appears at the two
 * moments a person is least willing to be interrupted twice.
 */
export type TourId = 'session' | 'home' | 'progress' | 'schedule' | 'profile';

const keyFor = (tour: TourId, userId?: number | null) =>
  userId ? `@tour_${tour}_${userId}` : `@tour_${tour}_guest`;

export const hasSeenTour = async (tour: TourId, userId?: number | null): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(keyFor(tour, userId))) === '1';
  } catch {
    // Unreadable storage: treat it as seen. Showing a tour twice to someone
    // who has already read it is more annoying than never showing it, and the
    // app is perfectly usable without one.
    return true;
  }
};

export const markTourSeen = async (
  tour: TourId,
  userId?: number | null,
  completed = true,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(keyFor(tour, userId), '1');
  } catch {}
  // Whether it was read or dismissed is the whole question about a tour, and
  // the local flag cannot answer it - it records only that we stopped asking.
  track(userId, completed ? 'tour_completed' : 'tour_skipped', tour);
};

/**
 * The first-entry tour, shown once the subscription gate opens.
 *
 * Three steps, not eight. A tour is a cost the reader pays before getting what
 * they just bought, and the honest job here is only to explain the things that
 * are not obvious: that a day takes two sessions, where training starts, and
 * that the locked exercises arrive on their own.
 */
export const HOME_TOUR: TourStep[] = [
  { id: 'ring', titleKey: 'tour.homeRingTitle', bodyKey: 'tour.homeRingBody' },
  { id: 'start', titleKey: 'tour.homeStartTitle', bodyKey: 'tour.homeStartBody' },
  { id: 'unlocks', titleKey: 'tour.homeUnlockTitle', bodyKey: 'tour.homeUnlockBody' },
];

/**
 * The tab tours.
 *
 * One per tab, shown the first time that tab is opened rather than all at
 * once on first entry. Five tours back to back would be a wall between
 * someone and the thing they just paid for; arriving where they apply, they
 * are two cards about the screen already in front of you.
 *
 * Two steps each, not three. These screens are mostly self-evident - the only
 * things worth saying are the ones a person would otherwise have to discover
 * by accident.
 */
export const PROGRESS_TOUR: TourStep[] = [
  { id: 'measure', titleKey: 'tour.progressMeasureTitle', bodyKey: 'tour.progressMeasureBody' },
  { id: 'chart', titleKey: 'tour.progressChartTitle', bodyKey: 'tour.progressChartBody' },
];

export const SCHEDULE_TOUR: TourStep[] = [
  { id: 'reminders', titleKey: 'tour.scheduleRemindersTitle', bodyKey: 'tour.scheduleRemindersBody' },
  { id: 'calendar', titleKey: 'tour.scheduleMonthTitle', bodyKey: 'tour.scheduleMonthBody' },
];

/**
 * One step, not two.
 *
 * The second card pointed at the settings list and said that the subscription,
 * the language and the account live there - a list of headings the reader can
 * already see, on a screen they opened deliberately. A tour step has to earn
 * its interruption by saying something not already on the screen.
 */
export const PROFILE_TOUR: TourStep[] = [
  { id: 'level', titleKey: 'tour.profileLevelTitle', bodyKey: 'tour.profileLevelBody' },
];

/**
 * The session tour, shown once on a person's FIRST real session.
 *
 * It used to run on the demo session, and the demo is gone - but the need it
 * met is not. The circle IS the product and it explains nothing on its own: a
 * ring that fills and empties means squeeze and relax only once somebody says
 * so, and for most people this is the first guided pelvic floor exercise they
 * have ever seen.
 *
 * Once only, and never again - interrupting a session someone is part-way
 * into a habit with, to explain a thing they already understand, is worse
 * than saying nothing.
 */
export const SESSION_TOUR: TourStep[] = [
  { id: 'ring', titleKey: 'tour.sessionRingTitle', bodyKey: 'tour.sessionRingBody' },
  { id: 'list', titleKey: 'tour.sessionListTitle', bodyKey: 'tour.sessionListBody' },
  { id: 'pause', titleKey: 'tour.sessionPauseTitle', bodyKey: 'tour.sessionPauseBody' },
];
