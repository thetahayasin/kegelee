/**
 * One answer to "is this account entitled right now", and one place that
 * decides it.
 *
 * The gate used to be a piece of React state that many things could RAISE -
 * a completed purchase, a RevenueCat push, a foreground refresh, the sign-in
 * payload, a launch-time reconcile - and exactly one thing could LOWER: the
 * listener on a completed sync. So a device that had been told "yes" once and
 * then never completed another sync stayed unlocked indefinitely, while the
 * Settings screen, which reads the local rows directly, correctly showed no
 * subscription. The two disagreed because they were answering from different
 * places.
 *
 * The rule here is a STATE, not a transition, and it is cheap enough to ask on
 * every trigger: a SQLite read and an AsyncStorage read, no network. Because
 * it is time-aware it also falls on its own, which is what makes a lapse close
 * the gate on a device that is offline, has not synced, or has simply been
 * sitting open since before the subscription ended.
 *
 * Three layers, in order:
 *
 *   1. Admins, who bypass the gate to preview the app (the same rule as the
 *      web's EnsureSubscribed middleware).
 *   2. The server's own verdict, while it is fresh. The backend sends
 *      `is_subscribed` on every pull; that outranks this device's copy of the
 *      rows, because the copy can be stale in the one direction that matters -
 *      a pull whose subscriptions section failed to apply leaves a row the
 *      server has already expired, and nothing local can notice.
 *   3. The local rows, plus a bounded window for a purchase the server has not
 *      acknowledged yet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getActiveSubscription,
  subscriptionEntitlementEndsAt,
} from '../db/queries';
import type { DBSubscription } from '../db/queries';

/**
 * How long an optimistic, server-unconfirmed purchase keeps access.
 *
 * recordCompletedPurchase grants immediately, so nobody waits on a round trip
 * to start training. The backend acknowledges through the sync push and the
 * RevenueCat webhook, and an acknowledged row comes back from the pull with a
 * plan_id set.
 *
 * 72h is far beyond any legitimate acknowledgement delay - the push goes out
 * seconds after the purchase - while bounding a grant the server never
 * recognises to three days instead of the twelve months a yearly plan's
 * ends_at would otherwise allow. Erring long is deliberate: the cost of
 * waiting is a few free days, the cost of being early is locking out someone
 * who actually paid.
 */
export const UNVERIFIED_GRACE_MS = 72 * 60 * 60 * 1000;

/**
 * How long the server's own verdict outranks the local rows.
 *
 * It has to expire. A verdict that never went stale would be the same bug in a
 * new place: a `true` recorded on the day someone cancelled would keep the app
 * unlocked for as long as it sat unused, and a `false` recorded during a
 * backend incident would keep a paying customer out. After this window the
 * verdict is ignored and the local rows - which carry real dates and therefore
 * lapse on their own - decide again.
 *
 * Seven days is far longer than the gap between syncs on any device in normal
 * use (one runs on nearly every foreground), so in practice the verdict in
 * play is minutes old.
 */
export const VERDICT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * When THIS device recorded a purchase, as opposed to when the subscription
 * originally began.
 *
 * The rule grants unconfirmed access for a grace window while the backend
 * catches up, and it used to measure that window from the row's started_at.
 * That field carries RevenueCat's originalPurchaseDate - the FIRST ever
 * purchase on the account - so for anyone resubscribing, restoring, switching
 * plans or reinstalling it is months old. The window was therefore already
 * expired the instant they paid: the gate opened, the next sync read a
 * months-old started_at with a still-null plan_id, and closed it again. The
 * paywall came back, kept polling, and only stuck once the server confirmed
 * the row - which is the "it fixes itself after a few restarts" report.
 *
 * Recorded separately so the grace window measures the thing it is actually
 * about: how long ago we took the money without the server agreeing yet.
 */
const grantKey = (userId: number | string) => `@purchase_recorded_at_${userId}`;

export const markPurchaseRecorded = async (userId: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(grantKey(userId), String(Date.now()));
  } catch {
    // The rule falls back to the rows without it; never worth throwing here.
  }
};

export const purchaseRecordedAt = async (userId: number): Promise<number | null> => {
  try {
    const v = await AsyncStorage.getItem(grantKey(userId));
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

const verdictKey = (userId: number | string) => `@entitlement_verdict_${userId}`;

interface StoredVerdict {
  subscribed: boolean;
  at: number;
}

/**
 * Remember what the backend said, so it still counts after this sync's
 * listeners have run.
 *
 * The verdict used to be applied once, to a React state, and then forgotten.
 * Anything that re-derived the gate afterwards - a cold start, a foreground,
 * the expiry timer - went back to the local rows and could reach the opposite
 * conclusion.
 */
export const rememberServerVerdict = async (
  userId: number,
  subscribed: boolean | undefined,
): Promise<void> => {
  // `undefined` is a backend that does not send the field. That is silence,
  // not a verdict, and it must not overwrite the last real one.
  if (typeof subscribed !== 'boolean') return;
  try {
    const stored: StoredVerdict = { subscribed, at: Date.now() };
    await AsyncStorage.setItem(verdictKey(userId), JSON.stringify(stored));
  } catch {
    // The resolver falls back to the local rows without it.
  }
};

/**
 * Drop the stored verdict.
 *
 * Called when a purchase completes, because a `false` recorded moments before
 * someone paid is about to be contradicted by the row we are writing, and
 * waiting for the next sync to say so would leave the customer looking at a
 * paywall they have just bought their way past. Also called on sign-out, so
 * one account's verdict can never decide the next person's access.
 */
export const forgetServerVerdict = async (userId: number | string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(verdictKey(userId));
  } catch {}
};

/**
 * Everything this rule remembers about one account, gone.
 *
 * For sign-out. Both keys are per-account, so leaving them behind means a
 * device that has had two people signed in carries one of them a stored "yes"
 * and an optimistic purchase window into the other's session - and the
 * resolver, which cannot tell a re-used id from a returning customer, would
 * honour both.
 */
export const forgetEntitlementState = async (userId: number | string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(verdictKey(userId));
    await AsyncStorage.removeItem(grantKey(userId));
  } catch {}
};

const readServerVerdict = async (userId: number): Promise<StoredVerdict | null> => {
  try {
    const raw = await AsyncStorage.getItem(verdictKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.subscribed !== 'boolean') return null;
    const at = Number(parsed.at);
    if (!Number.isFinite(at)) return null;
    // A clock set into the future would otherwise make a verdict immortal.
    if (at > Date.now()) return { subscribed: parsed.subscribed, at: Date.now() };
    if (Date.now() - at >= VERDICT_TTL_MS) return null;
    return { subscribed: parsed.subscribed, at };
  } catch {
    return null;
  }
};

export type EntitlementSource =
  /** An admin previewing the app. */
  | 'admin'
  /** The backend said so on its last successful pull. */
  | 'server'
  /** An entitling row in the local subscriptions table. */
  | 'subscription'
  /** A purchase this device recorded that the backend has not confirmed yet. */
  | 'unverified'
  /** Not entitled. */
  | 'none';

export interface Entitlement {
  active: boolean;
  source: EntitlementSource;
  /**
   * The next instant at which this answer could change without anything
   * happening - the moment a period ends, a grace window closes, or the stored
   * verdict goes stale. `null` when nothing is due to expire.
   *
   * Callers use it to wake up exactly when it matters instead of polling.
   */
  expiresAt: number | null;
  /** The row the answer came from, when it came from one. */
  subscription: DBSubscription | null;
}

const NOT_ENTITLED: Entitlement = {
  active: false,
  source: 'none',
  expiresAt: null,
  subscription: null,
};

/** The earliest of two deadlines, treating `null` as "no deadline". */
const soonest = (a: number | null, b: number | null): number | null => {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
};

export const resolveEntitlement = async (
  userId: number,
  isAdmin: boolean,
): Promise<Entitlement> => {
  if (isAdmin) {
    return { active: true, source: 'admin', expiresAt: null, subscription: null };
  }

  const [verdict, row] = await Promise.all([
    readServerVerdict(userId),
    getActiveSubscription(userId).catch(() => null),
  ]);

  const rowEndsAt = row ? subscriptionEntitlementEndsAt(row) : null;
  const verdictExpiresAt = verdict ? verdict.at + VERDICT_TTL_MS : null;

  if (verdict) {
    if (!verdict.subscribed) {
      // The server said no on a successful round trip. Nothing local overrules
      // that: a row the backend has already expired is exactly the shape of
      // evidence this layer exists to discard. It stops counting when the
      // verdict goes stale, hence the deadline.
      return {
        active: false,
        source: 'server',
        expiresAt: verdictExpiresAt,
        subscription: null,
      };
    }

    // The server said yes, whatever this device does or does not hold. A row
    // that has not arrived yet, or failed to apply, is not evidence against a
    // backend that has just said so. Access runs to whichever lasts longer -
    // the row's own period, or the verdict's freshness - and the deadline is
    // the first of the two so the caller re-checks at the right moment.
    return {
      active: true,
      source: row ? 'subscription' : 'server',
      expiresAt: soonest(verdictExpiresAt, rowEndsAt),
      subscription: row,
    };
  }

  if (row) {
    return {
      active: true,
      source: 'subscription',
      expiresAt: rowEndsAt,
      subscription: row,
    };
  }

  /**
   * A purchase this device took money for and the server has not confirmed.
   *
   * Bounded and stamped on disk rather than held in memory, so it survives a
   * restart and, more importantly, ENDS. The old optimistic grant was a `true`
   * written into React state with no expiry at all.
   *
   * A clock set into the future makes `now - grantedAt` negative, which is
   * also "inside the window" no matter how old the grant is; clamping the
   * grant to now caps that at the full window rather than eternity.
   */
  const recordedAt = await purchaseRecordedAt(userId).catch(() => null);
  if (recordedAt !== null && Number.isFinite(recordedAt)) {
    const grantedAt = Math.min(recordedAt, Date.now());
    const until = grantedAt + UNVERIFIED_GRACE_MS;
    if (until > Date.now()) {
      return { active: true, source: 'unverified', expiresAt: until, subscription: null };
    }
  }

  return NOT_ENTITLED;
};
