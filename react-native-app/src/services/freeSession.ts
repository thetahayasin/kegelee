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
// Per identity, not one global flag. A guest keeps their own; once there is an
// account the session belongs to that account, so signing in does not silently
// consume the guest's chance and two accounts on one phone each get theirs.
const keyFor = (userId?: number | null) =>
  userId ? `@free_session_used_${userId}` : '@free_session_used_guest';

/** Day-one of level 1: the session a brand-new subscriber would actually get,
 *  not a shortened demo. Showing the real thing is the argument. */
export const FREE_SESSION_LEVEL = 1;

/** Marked on COMPLETION, not on start. Quitting thirty seconds in should not
 *  burn the one chance to see what the app does - that would cost exactly the
 *  conversion this whole flow exists to win. */
export const markFreeSessionUsed = async (userId?: number | null): Promise<void> => {
  try {
    await AsyncStorage.setItem(keyFor(userId), '1');
  } catch {
    // A failed write means they may get a second free session. Harmless next
    // to the alternative: throwing here would break the completion screen.
  }
};

export const hasUsedFreeSession = async (userId?: number | null): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) === '1';
  } catch {
    // Unreadable storage: offer the session. Erring towards letting someone
    // try the product is the whole point of it existing.
    return false;
  }
};

/**
 * Carry the guest's spent session onto the account they just made.
 *
 * Guest lesson progress already migrates at sign-in; the session did not, so
 * someone who used their free session as a guest and then created an account
 * was offered a second one under the new key - and the funnel asked them to
 * train again before it would ask them to pay, which delays the only moment
 * that converts.
 *
 * The guest marker is cleared either way, for the same reason the lesson
 * progress is: it belongs to this account now, and leaving it behind would
 * charge it to whoever signs in on this device next - or deny the next guest a
 * session they never had.
 */
export const migrateFreeSessionToAccount = async (userId: number): Promise<void> => {
  try {
    const guestUsed = (await AsyncStorage.getItem(keyFor(null))) === '1';
    if (guestUsed) {
      await AsyncStorage.setItem(keyFor(userId), '1');
    }
    await AsyncStorage.removeItem(keyFor(null));
  } catch {
    // Worst case the account is offered a session the guest already used.
  }
};

/**
 * Where leaving the free session WITHOUT finishing it lands - declining the
 * offer, or quitting mid-workout.
 *
 * Every one of those exits used to reset to a bare `[Knowledge]`, which is
 * correct for a guest and a trap for an account. The free session is reached
 * by RESETTING the stack, so on the subscription gate that reset threw the
 * Paywall away: Knowledge became the only route, its back button vanished with
 * nothing beneath it, its Subscribe button was hidden precisely because the
 * session was still unspent, and the Log out escape hatch lives on the paywall
 * that had just been discarded. A signed-in account that said "not now" to a
 * free session could therefore neither pay nor sign out - the one funnel state
 * with no way forward and no way back.
 *
 * Keeping the paywall underneath costs nothing on either path and makes Back,
 * the Subscribe button and Log out all work again.
 *
 * Guests land on the basics with the sticky Subscribe bar still on screen, and
 * deliberately WITHOUT `subscribe: true`: the plans sheet is not the right
 * answer to someone who has a free session still waiting for them.
 */
export const freeSessionExitReset = (isAuthenticated: boolean) =>
  isAuthenticated
    ? { index: 1, routes: [{ name: 'Paywall' }, { name: 'Knowledge' }] }
    : { index: 0, routes: [{ name: 'Knowledge' }] };
