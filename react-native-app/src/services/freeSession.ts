import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The one free training session a guest gets before being asked to pay.
 *
 * The funnel used to end the third basics lesson by opening the plans sheet,
 * which asked for money from someone who had never used the thing. Worse, the
 * first lesson explicitly promises "then you do your first real exercise,
 * guided by the circle" and nothing delivered it. This is that session: a real
 * day-one workout, the real completion screen, and the subscribe ask placed
 * immediately after the accomplishment rather than before any of it.
 *
 * Device-local by design. A guest has no account to hang a server-side flag
 * on, and reinstalling to get a second free session is a lot of effort to
 * avoid a paywall the second session would only push them back towards.
 */
const KEY = '@free_session_used_guest';

/** Day-one of level 1: the session a brand-new subscriber would actually get,
 *  not a shortened demo. Showing the real thing is the argument. */
export const FREE_SESSION_LEVEL = 1;

/** Marked on COMPLETION, not on start. Quitting thirty seconds in should not
 *  burn the one chance to see what the app does - that would cost exactly the
 *  conversion this whole flow exists to win. */
export const markFreeSessionUsed = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // A failed write means they may get a second free session. Harmless next
    // to the alternative: throwing here would break the completion screen.
  }
};

export const hasUsedFreeSession = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    // Unreadable storage: offer the session. Erring towards letting someone
    // try the product is the whole point of it existing.
    return false;
  }
};
