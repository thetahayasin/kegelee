import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from './api';
import i18n from '../i18n';
import { getUnsyncedEvents, markEventsSynced } from './events';
import { getInstallId } from '../utils/installId';
import { APP_VERSION } from '../constants/version';

/**
 * Meta is stored as a JSON string and sent as an object. A row written by an
 * older build, or one truncated by a crash mid-write, must not be able to
 * throw here and take the whole sync down with it.
 */
const safeJson = (raw: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};
import { applyReminderSchedule } from './reminders';
import { rememberServerVerdict } from './entitlement';
import { reportError } from './errors';
import { purchaseRecordedAt } from './billing';
import { ONBOARDING_PUSH_KEY } from '../context/AuthContext';
import {
  getUnsyncedWorkoutSessions,
  getUnsyncedMeasurements,
  getUnsyncedReminders,
  markWorkoutSessionsSynced,
  markMeasurementsSynced,
  markRemindersSynced,
  saveDBUser,
  getDBUser,
  bulkUpsertPulledWorkoutSessions,
  bulkUpsertPulledMeasurements,
  bulkSaveTrainingDays,
  dedupeWorkoutSessions,
  dedupeMeasurements,
  saveReminder,
  saveSubscription,
  getSubscriptions,
  savePage,
  saveAppSetting,
} from '../db/queries';
import type { DBSubscription, DBWorkoutSession, DBMeasurement } from '../db/queries';

type SyncResult = { success: boolean; error?: string; skipped?: boolean };

// Collapse concurrent syncs for the same user onto one in-flight promise.
// syncNow is fired from several places at once (screen focus, pull-to-refresh,
// post-workout push, login), and running them in parallel races on the same
// SQLite tables. Overlapping callers now share the running sync's result.
const inFlight = new Map<number, Promise<SyncResult>>();

// Wall-clock of the last SUCCESSFUL sync per user, for syncIfStale.
const lastSyncAt = new Map<number, number>();

// Fired after every successful sync, once the pulled state (including
// subscriptions) is in SQLite. AuthContext listens to re-evaluate the
// subscription gate - the RN equivalent of the web re-checking
// isSubscribed() on every navigation (RTDN cancellations land via pull).
/**
 * `serverSubscribed` is the backend's own answer, straight from the pull, and
 * is `undefined` when the payload did not carry one. The three states are all
 * different and a boolean cannot hold them: true and false are verdicts to act
 * on, undefined is an older backend saying nothing, which must keep the
 * previous row-derived behaviour rather than read as "not subscribed".
 */
type SyncCompleteListener = (userId: number, serverSubscribed?: boolean) => void;
const syncCompleteListeners = new Set<SyncCompleteListener>();

export const onSyncComplete = (cb: SyncCompleteListener): (() => void) => {
  syncCompleteListeners.add(cb);
  return () => {
    syncCompleteListeners.delete(cb);
  };
};

/**
 * Fired when the server rejects this device's credentials outright.
 *
 * Every other sync failure is treated as "try again later", which is right: a
 * tunnel, a dead wifi router or a 500 must never cost someone access to
 * training they paid for. But that rule was applied to 401 as well, and a 401
 * is not a maybe - it means the token is not valid for anyone, which is what a
 * deleted account looks like from here.
 *
 * The effect was that deleting a user server-side left the app fully working:
 * the local subscription row still had a future ends_at, the gate kept reading
 * it, and every sync failed silently. The session only ended if the person
 * happened to log out by hand. This is the signal that ends it for them.
 */
type AuthFailureListener = (userId: number) => void;
const authFailureListeners = new Set<AuthFailureListener>();

export const onAuthFailure = (cb: AuthFailureListener): (() => void) => {
  authFailureListeners.add(cb);
  return () => {
    authFailureListeners.delete(cb);
  };
};

/**
 * 401 and 403 only.
 *
 * NOT status 0 (the request never landed - offline, DNS, timeout) and NOT 5xx
 * (the server is broken, not the account). Widening this would hand every
 * flaky network the power to sign people out, which is a far worse bug than
 * the one it fixes.
 */
const isAuthRejection = (status?: number) => status === 401 || status === 403;

const emitAuthFailure = (userId: number) => {
  authFailureListeners.forEach((fn) => {
    try {
      fn(userId);
    } catch {}
  });
};

/**
 * Re-fetch the legal pages in whatever language i18n is now set to.
 *
 * Called after the user picks a new language. The full sync also carries the
 * locale, but waiting for the next one would leave Terms and the privacy
 * policy in the previous language until something else triggered a sync -
 * visibly stale right at the moment the user just told us what they read.
 *
 * Content-only and failure-tolerant: nothing here is worth interrupting a
 * language switch over, and the next sync repeats it anyway.
 */
export const refreshContentForCurrentLocale = async (): Promise<void> => {
  try {
    const res = await api.pullContent(i18n.language);
    if (!res.ok || !res.data) return;
    for (const page of res.data.pages || []) {
      await savePage(
        {
          slug: page.slug,
          title: page.title,
          content: page.content,
          sort_order: page.sort_order,
          is_published: 1,
        },
        i18n.language,
      );
    }
  } catch {}
};

// The duplicate-heal is a legacy cleanup for installs bloated before the
// dedup fix; the bulk upserts themselves can no longer create duplicates, so
// scanning the tables once per app launch is enough.
let healedThisRun = false;

/**
 * Run one part of the pull, and let the rest of the sync survive it failing.
 *
 * The pull was a straight run of awaits, so the FIRST one to throw abandoned
 * everything after it - and one of them did throw, on every upgraded install:
 * `pages` had no `locale` column, savePage's INSERT failed, and the whole
 * sync unwound into the outer catch. Subscriptions are applied after pages, so
 * the visible symptom was not "legal pages are stale", it was people losing
 * access to a subscription they were paying for.
 *
 * One section failing is now exactly that: one section. Nothing here can be
 * the reason a different section did not run.
 */
const applySection = async (name: string, fn: () => Promise<void>): Promise<void> => {
  try {
    await fn();
  } catch (e) {
    reportError(e, `sync:${name}`);
  }
};

// Row shapes the push endpoint expects. Extracted so the drain loop below
// sends byte-identical payloads to the first push rather than a second,
// slightly different mapping that has to be kept in step by hand.
const sessionPayload = (s: DBWorkoutSession) => ({
  // Fixed when the row was written, so a retried push is recognised as the
  // same session rather than deduplicated by a timestamp guess.
  client_id: s.client_id,
  exercise_slug: s.exercise_slug,
  duration_seconds: s.duration_seconds,
  completed_at_iso: s.completed_at,
  is_extra: s.is_extra === 1,
});

const measurementPayload = (m: DBMeasurement) => ({
  client_id: m.client_id,
  seconds: m.seconds,
  measured_at_iso: m.measured_at,
});

const eventPayload = (e: {
  client_id: string;
  name: string;
  subject: string | null;
  detail: string | null;
  meta: string | null;
  occurred_at: string;
}) => ({
  client_id: e.client_id,
  name: e.name,
  subject: e.subject,
  // The second grouping column. Sent beside subject rather than folded into
  // meta so a report can group on it without parsing JSON per row.
  detail: e.detail,
  meta: e.meta ? safeJson(e.meta) : null,
  occurred_at_iso: e.occurred_at,
});

/**
 * What this install is, sent once per push.
 *
 * Facts about the DEVICE, not about any one event, so they ride on the
 * envelope instead of being copied into the meta of every row - which is how
 * "which app version is this crash from" ends up being a question you can only
 * answer for the events you happened to think of at the time.
 *
 * The server keys these by (user, install_id) and updates a last-seen stamp,
 * so a phone that is reinstalled counts as a new device and one that simply
 * updates does not.
 */
const devicePayload = async () => ({
  install_id: await getInstallId(),
  platform: Platform.OS,
  // A number on Android, a string on iOS. The column is text either way.
  os_version: String(Platform.Version),
  app_version: APP_VERSION,
  locale: i18n.language,
});

/**
 * The server accepts at most ten subscriptions in a push, and rejects the
 * WHOLE request when there are more.
 *
 * Local subscription rows only ever accumulate. Every plan change, every
 * resubscribe, every restore is a new purchase token and therefore a new row;
 * reconcileLocalSubscriptions marks the dead ones 'expired' but nothing has
 * ever deleted one. Push them all and a device that has been through eleven
 * purchases sends eleven, gets a 422, and - because the push runs first and
 * returns early - takes the pull down with it. Workouts, measurements and
 * events stop moving too, in both directions, permanently, for a subscription
 * the account may have finished with months ago. Clearing the app's storage is
 * the only thing that has ever fixed it, which is exactly what it looked like.
 *
 * Ten is the server's number, so nine leaves a margin for it to change without
 * this quietly becoming the bug again.
 */
const MAX_PUSHED_SUBSCRIPTIONS = 9;

/**
 * Which rows to spend that budget on.
 *
 * The push exists to tell the backend about purchases made ON THE DEVICE, so
 * the rows worth sending are the ones it may not have: plan_id is set by a
 * pull, so a null one has never been acknowledged and is exactly what this is
 * for. After that, most recent first - an old expired row is the least
 * interesting thing on the device, and the newest is the one someone is
 * probably in the middle of buying.
 */
const selectSubscriptionsToPush = (rows: DBSubscription[]): DBSubscription[] =>
  rows
    .filter((s) => !!s.purchase_token)
    .sort((a, b) => {
      const aUnacked = a.plan_id == null ? 0 : 1;
      const bUnacked = b.plan_id == null ? 0 : 1;
      if (aUnacked !== bUnacked) return aUnacked - bUnacked;
      return (Date.parse(b.started_at || '') || 0) - (Date.parse(a.started_at || '') || 0);
    })
    .slice(0, MAX_PUSHED_SUBSCRIPTIONS);

const subscriptionPayload = (s: DBSubscription, userId: number) => ({
  store: s.store || 'revenuecat',
  // The id the purchase is actually filed under at RevenueCat. It is only the
  // local user id for purchases this device made itself; a row restored from
  // another install, or bought before an account merge, belongs to a different
  // customer, and sending our own id made the backend verify the receipt
  // against the wrong one.
  revenuecat_app_user_id: s.revenuecat_app_user_id || String(userId),
  // The SKU that was bought, which is how the backend resolves the plan when
  // the slug it was sold under has since been renamed.
  store_product_id: s.store_product_id || null,
  purchase_token: s.purchase_token,
  plan_slug: s.plan_slug,
  google_order_id: s.google_order_id,
  store_transaction_id: s.google_order_id,
  status: s.status,
  started_at: s.started_at,
  ends_at: s.ends_at,
  // Play is retrying the card and access continues until this date. Without
  // it the backend sees only an expiry in the past and concludes the customer
  // lapsed, which is the opposite of what a grace period means.
  grace_period_ends_at: s.grace_period_ends_at || null,
  auto_renewing: s.auto_renewing === 1,
});

/**
 * Which of the rows we just sent the server is finished with.
 *
 * The push used to be all-or-nothing: a 200 marked every row in the request
 * synced, so anything the server quietly dropped - an event past its date
 * clamp, a row that failed its own validation - was recorded here as delivered
 * and then deleted a week later, having never existed anywhere else. The
 * response now names what it took, per collection, and only those are marked.
 *
 * A row the server leaves out stays queued and goes out again next time, which
 * the client ids make harmless - and which is the point for the one case that
 * is not permanent: an app that ships ahead of the backend writes events the
 * backend does not recognise yet, and those keep until it does.
 *
 * A response with no `accepted` block at all, or one missing a collection, is
 * an older backend rather than a rejection: mark everything, exactly as before.
 */
const acceptedFilter = <T>(
  accepted: unknown,
  key: (row: T) => string | number | null | undefined,
): ((row: T) => boolean) => {
  if (!Array.isArray(accepted)) return () => true;
  // Compared as strings so a numeric id and its decimal spelling match.
  const taken = new Set(accepted.map((v) => String(v)));
  return (row) => taken.has(String(key(row)));
};

/** The `accepted` block of a push response, if the backend sends one. */
const acceptedBlock = (res: { data?: any }): any =>
  res?.data && typeof res.data === 'object' ? res.data.accepted : undefined;

/**
 * How many EXTRA push rounds a single sync will make.
 *
 * getUnsyncedWorkoutSessions and friends return at most one batch, so a device
 * that trained offline for a month cannot clear its queue in one request. It
 * drains here instead, bounded: five rounds is 2500 rows, far more than any
 * real backlog, and the bound is what stops a server that accepts a push
 * without marking anything synced from spinning this loop forever.
 */
const MAX_PUSH_ROUNDS = 5;

export const syncNow = (userId: number): Promise<SyncResult> => {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const run = runSync(userId).finally(() => inFlight.delete(userId));
  inFlight.set(userId, run);
  return run;
};

/**
 * Passive sync for screen-focus triggers: skips entirely when a sync finished
 * less than maxAgeMs ago, so tab-hopping doesn't hammer the network and re-run
 * the full pull pipeline every focus. User-intent syncs (pull-to-refresh,
 * post-workout, login) should keep calling syncNow directly.
 */
export const syncIfStale = (userId: number, maxAgeMs = 60_000): Promise<SyncResult> => {
  const last = lastSyncAt.get(userId) || 0;
  if (Date.now() - last < maxAgeMs) {
    return Promise.resolve({ success: true, skipped: true });
  }
  return syncNow(userId);
};

/**
 * Get everything this account has not yet sent to the server, before its rows
 * are deleted. Returns whether the outbox is now empty.
 *
 * Logout used to flush the analytics events and only those, which is why the
 * confirmation had to warn that "anything not yet synced will be lost". It
 * was telling the truth: a workout finished on a train, or a measurement taken
 * in a lift, sat in the outbox and clearUserData dropped it. Asking somebody
 * to accept losing their own training as the price of signing out is not a
 * warning, it is an unfinished feature with a dialog in front of it.
 *
 * A full syncNow still cannot be used here - it pulls state back down and
 * writes it into the very tables the caller is tearing down - but the push
 * half was always safe on its own, and is what should have been running.
 *
 * `true` means there is nothing left to lose. The caller decides what to do
 * with a `false`; it must never stop the logout, because somebody on a plane
 * has to be able to sign out of a phone they are handing over.
 */
export const flushPendingWork = async (userId: number, timezone: string): Promise<boolean> => {
  if (!userId) return true;
  try {
    await drainPendingPushes(userId, timezone);
    const [sessions, measurements, events] = await Promise.all([
      getUnsyncedWorkoutSessions(userId),
      getUnsyncedMeasurements(userId),
      getUnsyncedEvents(userId),
    ]);
    return sessions.length === 0 && measurements.length === 0 && events.length === 0;
  } catch {
    return false;
  }
};

/**
 * Send the queued events and nothing else.
 *
 * Kept for callers that only have instrumentation to get rid of. Logout uses
 * flushPendingWork above, which covers the training data too.
 *
 * Needs nothing but the id: no user row is read, so it still works after the
 * session has been half dismantled. Silent on every failure, like the rest of
 * this instrumentation - a logout must never fail because a report did.
 */
export const flushEvents = async (userId: number): Promise<void> => {
  if (!userId) return;
  try {
    const events = await getUnsyncedEvents(userId);
    if (events.length === 0) return;
    const res = await api.pushState({ events: events.map(eventPayload) });
    if (!res.ok) return;
    const took = acceptedFilter<{ client_id: string }>(
      acceptedBlock(res)?.events,
      (e) => e.client_id,
    );
    await markEventsSynced(events.filter(took).map((e) => e.id));
  } catch {}
};

/**
 * How long a locally recorded purchase is protected from the reconcile below.
 *
 * A purchase completes on the DEVICE and reaches our backend by two
 * independent routes - this sync's push, and RevenueCat's webhook - neither of
 * which is instant. So a token the pull does not mention is briefly ambiguous:
 * it might be a subscription that ended somewhere else, or the one the
 * customer paid for ninety seconds ago that nothing server-side has processed
 * yet. Expiring the second kind takes away access somebody just bought.
 *
 * Was 24 hours, which was far past the point of protecting anything. Both
 * routes land within seconds; nothing legitimate takes hours. What a day
 * actually bought was a day in which a CANCELLATION could not be applied,
 * because `recordedAt` is one stamp for the whole device - so a purchase made
 * this morning froze every row on the phone until tomorrow, and cancelling
 * minutes later did nothing no matter how many times the app was reopened.
 * Half an hour is already generous for a round trip measured in seconds.
 */
const PURCHASE_SETTLE_MS = 30 * 60 * 1000;

/**
 * Retire local subscription rows the server no longer knows about.
 *
 * The pull is authoritative and complete: it returns every subscription the
 * account has. A local row whose token is absent from it is a row the backend
 * has dropped, refunded, revoked or never accepted - and without this it sat
 * in SQLite with its original future `ends_at` forever, quietly entitling
 * somebody the server considers unsubscribed. Nothing else ever deleted it,
 * because every other write path only ever adds or updates.
 *
 * Only runs when the payload actually CARRIES a subscriptions array. An older
 * backend that omits the key entirely is silence, not "you have none", and
 * treating it as the latter would clear every paying customer on this device.
 */
const reconcileLocalSubscriptions = async (
  userId: number,
  remote: unknown,
): Promise<void> => {
  if (!Array.isArray(remote)) return;

  const serverTokens = new Set(
    remote
      .map((s: any) => s?.purchase_token)
      .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0),
  );

  const locals = await getSubscriptions(userId);
  // When this device last recorded a purchase of its own. Preferred over the
  // row's started_at, which carries the store's ORIGINAL purchase date and is
  // months old for anyone restoring, resubscribing or switching plans.
  const recordedAt = await purchaseRecordedAt(userId).catch(() => null);
  const now = Date.now();

  for (const row of locals) {
    if (!row.purchase_token) continue;
    if (serverTokens.has(row.purchase_token)) continue;
    if (String(row.status || '').toLowerCase() === 'expired') continue;

    /**
     * The grace is for a purchase the SERVER HAS NOT SEEN YET, and only that.
     *
     * A row with a plan_id came back from a pull, which means the backend knew
     * this token and set it. If the same backend now returns a complete list
     * without it, that is not "we have not caught up" - it is an answer. The
     * old rule gave those rows the settle window too, so a cancellation could
     * not be applied while any purchase on the device was recent, which is
     * exactly the case where someone cancels shortly after subscribing.
     *
     * recordCompletedPurchase writes plan_id: null, so our own optimistic rows
     * - the ones this window exists for - still get it.
     */
    if (row.plan_id == null) {
      const settledFrom = recordedAt ?? Date.parse(row.started_at || '');
      if (Number.isFinite(settledFrom) && now - settledFrom < PURCHASE_SETTLE_MS) continue;
    }

    const endsAt = Date.parse(row.ends_at || '');
    await saveSubscription(userId, {
      purchase_token: row.purchase_token,
      status: 'expired',
      auto_renewing: 0,
      // Pull a future expiry back to now, so nothing reading the date alone
      // keeps handing out access the status no longer grants.
      ends_at:
        Number.isFinite(endsAt) && endsAt > now
          ? new Date(now).toISOString()
          : row.ends_at ?? new Date(now).toISOString(),
    });
  }
};

/**
 * Send whatever the capped first push left behind.
 *
 * Each round pushes one batch and marks it, then looks again; it stops the
 * moment a round finds nothing, the server rejects a push, or the round limit
 * is reached. Reminders are not drained here - there are at most seven of
 * them, so they can never overflow a batch.
 */
const drainPendingPushes = async (userId: number, timezone: string): Promise<void> => {
  for (let round = 1; round < MAX_PUSH_ROUNDS; round++) {
    const [sessions, measurements, events] = await Promise.all([
      getUnsyncedWorkoutSessions(userId),
      getUnsyncedMeasurements(userId),
      getUnsyncedEvents(userId),
    ]);
    if (sessions.length === 0 && measurements.length === 0 && events.length === 0) return;

    const res = await api.pushState({
      timezone,
      workout_sessions: sessions.map(sessionPayload),
      measurements: measurements.map(measurementPayload),
      events: events.map(eventPayload),
    });
    // A failure here is not a failed sync: the pull already landed and the
    // rows stay queued for the next run.
    if (!res.ok) return;

    const accepted = acceptedBlock(res);
    const tookSession = acceptedFilter<DBWorkoutSession>(
      accepted?.workout_sessions,
      (row) => row.client_id,
    );
    const tookMeasurement = acceptedFilter<DBMeasurement>(
      accepted?.measurements,
      (row) => row.client_id,
    );
    const tookEvent = acceptedFilter<{ client_id: string }>(
      accepted?.events,
      (row) => row.client_id,
    );

    await Promise.all([
      markWorkoutSessionsSynced(
        sessions
          .filter(tookSession)
          .map((s) => s.id)
          .filter((id): id is number => id !== undefined)
      ),
      markMeasurementsSynced(
        measurements
          .filter(tookMeasurement)
          .map((m) => m.id)
          .filter((id): id is number => id !== undefined)
      ),
      markEventsSynced(events.filter(tookEvent).map((e) => e.id)),
    ]);
  }
};

const runSync = async (userId: number): Promise<SyncResult> => {
  try {
    const user = await getDBUser();
    if (!user) {
      return { success: false, error: 'No authenticated user found' };
    }

    // 1. Gather Unsynced Local Data - independent reads, run them in parallel.
    const [
      unsyncedSessions,
      unsyncedMeasurements,
      unsyncedReminders,
      unsyncedEvents,
      localSubs,
      basicsRaw,
    ] = await Promise.all([
      getUnsyncedWorkoutSessions(userId),
      getUnsyncedMeasurements(userId),
      getUnsyncedReminders(userId),
      getUnsyncedEvents(userId),
      getSubscriptions(userId),
      AsyncStorage.getItem(`@basics_done_${userId}`).catch(() => null),
    ]);

    // Get system timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // Locally completed basics lessons from AsyncStorage
    let localBasicsDone: string[] = [];
    try {
      if (basicsRaw) {
        localBasicsDone = JSON.parse(basicsRaw);
      }
    } catch {}

    // Build push payload
    // The onboarding profile waits in its own key until the server has it;
    // AuthContext moves it there the moment the quiz is consumed at sign-in.
    let pendingOnboarding: Record<string, unknown> | null = null;
    try {
      const rawOnboarding = await AsyncStorage.getItem(ONBOARDING_PUSH_KEY);
      pendingOnboarding = rawOnboarding ? JSON.parse(rawOnboarding) : null;
    } catch {}

    const pushPayload = {
      timezone,
      // Read here rather than at module load: the install id is only minted on
      // first use, and doing it inside the payload builder keeps the one
      // storage read on the sync's own path instead of the app's startup.
      device: await devicePayload(),
      level_id: user.level_id,
      level_started_days: user.level_started_days,
      completed_lessons: localBasicsDone,
      // The first-run profile, recorded write-once on the server and re-sent
      // until a pull confirms it - so it has to be safe to receive twice.
      ...(pendingOnboarding ? { onboarding: pendingOnboarding } : {}),
      workout_sessions: unsyncedSessions.map(sessionPayload),
      measurements: unsyncedMeasurements.map(measurementPayload),
      reminders: unsyncedReminders.map((r) => ({
        weekday: r.weekday,
        times: r.times,
        is_enabled: r.is_enabled === 1,
      })),
      // Behaviour. Sent with everything else rather than on its own schedule:
      // one request, and instrumentation that can never be the reason a sync
      // fails.
      events: unsyncedEvents.map(eventPayload),
      // In-app purchases (RevenueCat / store) complete on the DEVICE, so the backend
      // learns about them here. Every local purchase token is re-sent each sync
      // (the backend ignores tokens it already verified), which is what
      // delivers a purchase made offline - same as the web UserSyncService.
      subscriptions: selectSubscriptionsToPush(localSubs).map((s) => subscriptionPayload(s, userId)),
    };

    // 2. Push to Laravel
    const pushRes = await api.pushState(pushPayload);
    if (!pushRes.ok) {
      if (isAuthRejection(pushRes.status)) emitAuthFailure(userId);
      return { success: false, error: `Push failed: ${pushRes.error}` };
    }

    // Mark pushed items as synced in local DB (independent tables - parallel),
    // while the pull requests below are already on the wire. Only what the
    // server says it is finished with - see acceptedFilter. Anything it did not
    // acknowledge stays queued and goes out again on the next sync, which the
    // client ids make harmless.
    const accepted = acceptedBlock(pushRes);
    const tookSession = acceptedFilter<DBWorkoutSession>(
      accepted?.workout_sessions,
      (row) => row.client_id,
    );
    const tookMeasurement = acceptedFilter<DBMeasurement>(
      accepted?.measurements,
      (row) => row.client_id,
    );
    const tookEvent = acceptedFilter<{ client_id: string }>(
      accepted?.events,
      (row) => row.client_id,
    );
    // Reminders are the one collection with no client id: they upsert on
    // (user, weekday), so the weekday is the natural key and it is what the
    // server names them back with. The local row id never leaves this device
    // and could not be matched against anything the response carries.
    const tookReminder = acceptedFilter<{ weekday: number }>(
      accepted?.reminders,
      (row) => row.weekday,
    );

    const markSynced = Promise.all([
      markWorkoutSessionsSynced(
        unsyncedSessions
          .filter(tookSession)
          .map((s) => s.id)
          .filter((id): id is number => id !== undefined)
      ),
      markEventsSynced(unsyncedEvents.filter(tookEvent).map((e) => e.id)),
      markMeasurementsSynced(
        unsyncedMeasurements
          .filter(tookMeasurement)
          .map((m) => m.id)
          .filter((id): id is number => id !== undefined)
      ),
      markRemindersSynced(
        unsyncedReminders
          .filter(tookReminder)
          .map((r) => r.id)
          .filter((id): id is number => id !== undefined)
      ),
    ]);

    // 3. Pull user state and public content in parallel - two independent GETs,
    // so the sync takes one network round-trip instead of two in series.
    // Legal pages come back in the device's language. The `pages` table is
    // keyed by slug, so a language switch simply overwrites each row with the
    // new language's copy on the next sync - the device only ever needs the
    // one it is currently showing.
    const [pullRes, contentRes] = await Promise.all([
      api.pullState(),
      api.pullContent(i18n.language),
    ]);
    await markSynced;
    if (!pullRes.ok) {
      if (isAuthRejection(pullRes.status)) emitAuthFailure(userId);
      return { success: false, error: `Pull failed: ${pullRes.error}` };
    }

    const data = pullRes.data;

    /**
     * The backend's own verdict on entitlement, read here so everything below
     * can use it.
     *
     * Taken straight off the payload rather than from the rows this sync is
     * about to write: the whole point is to be right even on a sync where the
     * subscriptions section fails to apply, and applySection reports such a
     * failure without stopping the sync.
     *
     * `undefined` means the field was absent - an older backend saying nothing.
     * That is not the same as `false`, and nothing here may treat it as such.
     */
    const serverSaysSubscribed: boolean | undefined =
      typeof data?.user?.is_subscribed === 'boolean' ? data.user.is_subscribed : undefined;

    /**
     * Written down before anything below reads it.
     *
     * The verdict used to be handed to the sync-complete listeners at the very
     * end and applied once, to a React state, which meant everything that
     * re-derived the gate afterwards - a cold start, a foreground, the expiry
     * timer - went back to the local rows and could reach the opposite
     * conclusion. Storing it here makes it part of the state the shared
     * resolver reads, and puts it in place before the reminder section a few
     * lines down asks that resolver whether this account is still entitled.
     *
     * `undefined` is a backend that does not send the field. rememberServerVerdict
     * treats that as silence and leaves the last real answer alone.
     */
    await rememberServerVerdict(userId, serverSaysSubscribed);

    // Update local user details in SQLite. This is the CORE state - the level,
    // the plan position, the timezone every date in the app is computed in -
    // and the one part of the pull whose failure means the sync did not
    // happen. Everything after it is wrapped so that it cannot be.
    const remoteUser = data.user;

    /**
     * Did somebody change their level while this sync was in the air?
     *
     * The push at the top of this function sent the level read from SQLite
     * before the request went out, so the pull normally echoes back the very
     * value we sent and applying it is a no-op. The exception is a level picked
     * DURING the round trip: the server never saw it, so its answer is the old
     * one, and writing that back would silently undo a choice made seconds ago
     * - the local row loses it, and the next sync then pushes the reverted
     * value up as if it were intentional.
     *
     * Compare-and-set. The server stays authoritative for the level, which is
     * what lets it return a lapsed subscriber to their quiz level; it just does
     * not get to overwrite an edit it has not been told about yet. The local
     * value survives and goes up on the next push.
     */
    const localNow = await getDBUser().catch(() => null);
    const levelEditedMidSync =
      !!localNow && !!user && localNow.level_id !== user.level_id;
    await saveDBUser({
      name: remoteUser.name,
      email: remoteUser.email,
      ...(levelEditedMidSync
        ? {}
        : {
            level_id: remoteUser.level_id,
            level_started_days: remoteUser.level_started_days,
          }),
      // The server's own timestamp, verbatim.
      //
      // This used to be `onboarded ? new Date().toISOString() : null`, which
      // wrote "now" over the real date on EVERY sync - so the moment somebody
      // finished onboarding was destroyed the first time they came online, and
      // "member since" moved forward every day. The boolean is only a fallback
      // for a backend that does not send the field yet; when it does, the date
      // it sends is the answer.
      onboarded_at:
        typeof remoteUser.onboarded_at === 'string' && remoteUser.onboarded_at
          ? remoteUser.onboarded_at
          : remoteUser.onboarded
            ? new Date().toISOString()
            : null,
      timezone: remoteUser.timezone,
    });

    // Heal duplicates left by the old duplicate-on-every-pull behaviour, once
    // per app run, BEFORE applying this pull (the bulk upserts below can't
    // create duplicates themselves).
    if (!healedThisRun) {
      healedThisRun = true;
      await applySection('dedupe', async () => {
        await Promise.all([dedupeWorkoutSessions(), dedupeMeasurements()]);
      });
    }

    // Re-hydrate pulled state. Full-state pulls repeat every stored row each
    // sync, so these bulk-upsert by (user, time) - and each domain lands in a
    // single transaction instead of one bridge round-trip per row.
    await applySection('workout_sessions', () =>
      bulkUpsertPulledWorkoutSessions(
        userId,
        (data.workout_sessions || [])
          .filter((ws: any) => !!ws.completed_at)
          .map((ws: any) => ({
            user_id: userId,
            client_id: ws.client_id || null,
            exercise_id: ws.exercise_id,
            exercise_slug: ws.exercise_slug || null,
            level_id: ws.level_id,
            duration_seconds: ws.duration_seconds,
            is_extra: ws.is_extra ? 1 : 0,
            started_at: new Date(new Date(ws.completed_at).getTime() - (ws.duration_seconds * 1000)).toISOString(),
            completed_at: ws.completed_at,
            synced: 1,
          }))
      )
    );

    await applySection('training_days', () =>
      bulkSaveTrainingDays(
        (data.training_days || []).map((td: any) => ({
          user_id: userId,
          date: td.date,
          sessions_count: td.sessions_count,
          required_sessions: td.required_sessions,
          completed_at: td.completed_at,
        }))
      )
    );

    // Measurements keep the server's real measured_at (the old path stamped
    // every pulled row with now(), losing the true time and guaranteeing a new
    // duplicate on every sync).
    await applySection('measurements', () =>
      bulkUpsertPulledMeasurements(
        userId,
        (data.measurements || []).filter((m: any) => !!m.measured_at)
      )
    );

    await applySection('reminders', async () => {
      // Re-hydrate reminders
      for (const r of data.reminders || []) {
        await saveReminder(userId, r.weekday, r.times, r.is_enabled ? 1 : 0, 1);
      }

      /**
       * Then re-apply the whole rule, from the merged LOCAL state.
       *
       * Not from the raw pull payload: the login-time sync runs in the
       * background, and if somebody saves reminders on the Schedule screen
       * while a pull carrying no (or stale) server reminders is still in
       * flight, scheduling from the payload would cancel and wipe what they
       * just set. The local table holds pulled + locally saved rows by this
       * point, so it is the truth. applyReminderSchedule reads it.
       *
       * It also decides entitlement rather than this section doing it. What
       * used to be here was half the rule - skip on an explicit server `false`
       * - which left the other cases wrong: an older backend that sends no
       * verdict, or a device whose entitlement has since lapsed on its own
       * clock, both had their reminders put straight back on every pull, while
       * AuthContext was cancelling them once per state change. The sync ran far
       * more often, so the sync won, and a lapsed account went on being
       * notified by a screen it could no longer open.
       *
       * The rows stay in the table either way. Nothing is deleted, so
       * subscribing again restores the same schedule rather than asking
       * somebody to set their week up a second time.
       */
      const localUser = await getDBUser().catch(() => null);
      await applyReminderSchedule(userId, localUser?.is_admin === 1);
    });

    await applySection('basics', async () => {
      // Merge completed basics lessons from backend with the CURRENT local set,
      // re-read at write time - NOT localBasicsDone from the start of this sync.
      // The login-time sync runs while the user may be actively finishing lessons;
      // merging the stale start-of-sync copy (empty for a new account) would
      // overwrite - i.e. WIPE - lessons completed mid-sync, closing the basics
      // gate right as the user finishes it.
      // The server has the first-run profile now, so stop re-sending it. Keyed
      // on the PULL rather than on the push succeeding: the pull is the only
      // thing that proves it was stored rather than merely accepted.
      if (data.onboarding) {
        await AsyncStorage.removeItem(ONBOARDING_PUSH_KEY).catch(() => {});
      }

      const remoteBasicsDone = data.completed_lessons || [];
      const currentRaw = await AsyncStorage.getItem(`@basics_done_${userId}`);
      const currentLocal: string[] = currentRaw ? JSON.parse(currentRaw) : [];
      const mergedBasicsDone = Array.from(new Set([...currentLocal, ...remoteBasicsDone]));
      await AsyncStorage.setItem(`@basics_done_${userId}`, JSON.stringify(mergedBasicsDone));
    });

    await applySection('subscriptions', async () => {
      // Re-hydrate subscriptions
      for (const sub of data.subscriptions || []) {
        await saveSubscription(userId, {
          plan_id: sub.plan_id,
          plan_slug: sub.plan_slug,
          status: sub.status,
          store: sub.store,
          purchase_token: sub.purchase_token,
          google_order_id: sub.google_order_id,
          revenuecat_app_user_id: sub.revenuecat_app_user_id,
          store_product_id: sub.store_product_id,
          trial_ends_at: sub.trial_ends_at,
          started_at: sub.started_at,
          ends_at: sub.ends_at,
          grace_period_ends_at: sub.grace_period_ends_at,
          canceled_at: sub.canceled_at,
          auto_renewing: sub.auto_renewing ? 1 : 0,
        });
      }
      await reconcileLocalSubscriptions(userId, data.subscriptions);
    });

    // 4. Apply Content (pages and settings) - fetched in parallel with the
    // state pull above.
    await applySection('content', async () => {
      if (!contentRes.ok || !contentRes.data) return;
      const content = contentRes.data;
      // Save static pages
      for (const page of content.pages || []) {
        await savePage(
          {
            slug: page.slug,
            title: page.title,
            content: page.content,
            sort_order: page.sort_order,
            is_published: 1,
          },
          i18n.language,
        );
      }
      // Save app settings. Booleans store as '1'/'0'; anything else (e.g. the
      // google_web_client_id string) is stored verbatim.
      if (content.settings) {
        for (const [key, val] of Object.entries(content.settings)) {
          if (typeof val === 'boolean') {
            await saveAppSetting(key, val ? '1' : '0', 'bool');
          } else {
            await saveAppSetting(key, String(val ?? ''), 'string');
          }
        }
      }
    });

    // Anything the first push could not fit. Runs last so a backlog never
    // delays the pull that decides what the user sees.
    await applySection('drain', () => drainPendingPushes(userId, timezone));

    lastSyncAt.set(userId, Date.now());
    syncCompleteListeners.forEach((cb) => {
      try {
        cb(userId, serverSaysSubscribed);
      } catch {}
    });
    return { success: true };
  } catch (e: any) {
    reportError(e, 'sync:run');
    return { success: false, error: e.message || 'Sync failed' };
  }
};
