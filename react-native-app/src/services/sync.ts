import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import i18n from '../i18n';
import { scheduleReminders } from './reminders';
import { freeSessionCompleted } from './freeSession';
import { ONBOARDING_PUSH_KEY } from '../context/AuthContext';
import {
  getUnsyncedWorkoutSessions,
  getUnsyncedMeasurements,
  getUnsyncedReminders,
  getReminders,
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
type SyncCompleteListener = (userId: number) => void;
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
      await savePage({
        slug: page.slug,
        title: page.title,
        content: page.content,
        sort_order: page.sort_order,
        is_published: 1,
      });
    }
  } catch {}
};

// The duplicate-heal is a legacy cleanup for installs bloated before the
// dedup fix; the bulk upserts themselves can no longer create duplicates, so
// scanning the tables once per app launch is enough.
let healedThisRun = false;

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

const runSync = async (userId: number): Promise<SyncResult> => {
  try {
    const user = await getDBUser();
    if (!user) {
      return { success: false, error: 'No authenticated user found' };
    }

    // 1. Gather Unsynced Local Data - independent reads, run them in parallel.
    const [unsyncedSessions, unsyncedMeasurements, unsyncedReminders, localSubs, basicsRaw] =
      await Promise.all([
        getUnsyncedWorkoutSessions(userId),
        getUnsyncedMeasurements(userId),
        getUnsyncedReminders(userId),
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
    const freeSessionDone = await freeSessionCompleted(userId).catch(() => false);

    const pushPayload = {
      timezone,
      level_id: user.level_id,
      level_started_days: user.level_started_days,
      completed_lessons: localBasicsDone,
      // The first-run profile and the demo, both recorded write-once on the
      // server. Re-sent until a pull confirms them, which is why both have to
      // be safe to receive twice.
      ...(pendingOnboarding ? { onboarding: pendingOnboarding } : {}),
      free_session_completed: freeSessionDone,
      workout_sessions: unsyncedSessions.map((s) => ({
        exercise_slug: s.exercise_slug,
        duration_seconds: s.duration_seconds,
        completed_at_iso: s.completed_at,
        is_extra: s.is_extra === 1,
      })),
      measurements: unsyncedMeasurements.map((m) => ({
        seconds: m.seconds,
        measured_at_iso: m.measured_at,
      })),
      reminders: unsyncedReminders.map((r) => ({
        weekday: r.weekday,
        times: r.times,
        is_enabled: r.is_enabled === 1,
      })),
      // In-app purchases (RevenueCat / store) complete on the DEVICE, so the backend
      // learns about them here. Every local purchase token is re-sent each sync
      // (the backend ignores tokens it already verified), which is what
      // delivers a purchase made offline - same as the web UserSyncService.
      subscriptions: localSubs
        .filter((s) => !!s.purchase_token)
        .map((s) => ({
          store: s.store || 'revenuecat',
          revenuecat_app_user_id: String(userId),
          purchase_token: s.purchase_token,
          plan_slug: s.plan_slug,
          google_order_id: s.google_order_id,
          store_transaction_id: s.google_order_id,
          status: s.status,
          started_at: s.started_at,
          ends_at: s.ends_at,
          auto_renewing: s.auto_renewing === 1,
        })),
    };

    // 2. Push to Laravel
    const pushRes = await api.pushState(pushPayload);
    if (!pushRes.ok) {
      if (isAuthRejection(pushRes.status)) emitAuthFailure(userId);
      return { success: false, error: `Push failed: ${pushRes.error}` };
    }

    // Mark pushed items as synced in local DB (independent tables - parallel),
    // while the pull requests below are already on the wire.
    const markSynced = Promise.all([
      markWorkoutSessionsSynced(
        unsyncedSessions.map((s) => s.id).filter((id): id is number => id !== undefined)
      ),
      markMeasurementsSynced(
        unsyncedMeasurements.map((m) => m.id).filter((id): id is number => id !== undefined)
      ),
      markRemindersSynced(userId, unsyncedReminders.map((r) => r.weekday)),
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

    // Update local user details in SQLite
    const remoteUser = data.user;
    await saveDBUser({
      name: remoteUser.name,
      email: remoteUser.email,
      level_id: remoteUser.level_id,
      level_started_days: remoteUser.level_started_days,
      onboarded_at: remoteUser.onboarded ? new Date().toISOString() : null,
      timezone: remoteUser.timezone,
    });

    // Heal duplicates left by the old duplicate-on-every-pull behaviour, once
    // per app run, BEFORE applying this pull (the bulk upserts below can't
    // create duplicates themselves).
    if (!healedThisRun) {
      healedThisRun = true;
      await Promise.all([dedupeWorkoutSessions(), dedupeMeasurements()]);
    }

    // Re-hydrate pulled state. Full-state pulls repeat every stored row each
    // sync, so these bulk-upsert by (user, time) - and each domain lands in a
    // single transaction instead of one bridge round-trip per row.
    await bulkUpsertPulledWorkoutSessions(
      userId,
      (data.workout_sessions || [])
        .filter((ws: any) => !!ws.completed_at)
        .map((ws: any) => ({
          user_id: userId,
          exercise_id: ws.exercise_id,
          exercise_slug: ws.exercise_slug || null,
          level_id: ws.level_id,
          duration_seconds: ws.duration_seconds,
          is_extra: ws.is_extra ? 1 : 0,
          started_at: new Date(new Date(ws.completed_at).getTime() - (ws.duration_seconds * 1000)).toISOString(),
          completed_at: ws.completed_at,
          synced: 1,
        }))
    );

    await bulkSaveTrainingDays(
      (data.training_days || []).map((td: any) => ({
        user_id: userId,
        date: td.date,
        sessions_count: td.sessions_count,
        required_sessions: td.required_sessions,
        completed_at: td.completed_at,
      }))
    );

    // Measurements keep the server's real measured_at (the old path stamped
    // every pulled row with now(), losing the true time and guaranteeing a new
    // duplicate on every sync).
    await bulkUpsertPulledMeasurements(
      userId,
      (data.measurements || []).filter((m: any) => !!m.measured_at)
    );

    // Re-hydrate reminders
    for (const r of data.reminders || []) {
      await saveReminder(userId, r.weekday, r.times, r.is_enabled ? 1 : 0, 1);
    }

    // Schedule reminders locally using Notifee - from the merged LOCAL DB state,
    // not the raw pull payload. The login-time sync runs in the background; if
    // the user saves reminders on the Schedule screen while a pull with no (or
    // stale) server reminders is still in flight, scheduling from the payload
    // would cancel and wipe what they just set. The local table already holds
    // pulled + locally saved reminders at this point, so it is the truth.
    const mergedReminders = await getReminders(userId);
    await scheduleReminders(
      mergedReminders.map((r) => ({
        weekday: r.weekday,
        times: r.times,
        isEnabled: r.is_enabled === 1,
      }))
    );

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
    try {
      const currentRaw = await AsyncStorage.getItem(`@basics_done_${userId}`);
      const currentLocal: string[] = currentRaw ? JSON.parse(currentRaw) : [];
      const mergedBasicsDone = Array.from(new Set([...currentLocal, ...remoteBasicsDone]));
      await AsyncStorage.setItem(`@basics_done_${userId}`, JSON.stringify(mergedBasicsDone));
    } catch {}

    // Re-hydrate subscriptions
    for (const s of data.subscriptions || []) {
      await saveSubscription(userId, {
        plan_id: s.plan_id,
        plan_slug: s.plan_slug,
        status: s.status,
        store: s.store,
        purchase_token: s.purchase_token,
        google_order_id: s.google_order_id,
        trial_ends_at: s.trial_ends_at,
        started_at: s.started_at,
        ends_at: s.ends_at,
        canceled_at: s.canceled_at,
        auto_renewing: s.auto_renewing ? 1 : 0,
      });
    }

    // 4. Apply Content (pages and settings) - fetched in parallel with the
    // state pull above.
    if (contentRes.ok && contentRes.data) {
      const content = contentRes.data;
      // Save static pages
      for (const page of content.pages || []) {
        await savePage({
          slug: page.slug,
          title: page.title,
          content: page.content,
          sort_order: page.sort_order,
          is_published: 1,
        });
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
    }

    lastSyncAt.set(userId, Date.now());
    syncCompleteListeners.forEach((cb) => {
      try {
        cb(userId);
      } catch {}
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Sync failed' };
  }
};
