import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { scheduleReminders } from './reminders';
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
    const [unsyncedSessions, unsyncedMeasurements, unsyncedReminders, basicsRaw] =
      await Promise.all([
        getUnsyncedWorkoutSessions(userId),
        getUnsyncedMeasurements(userId),
        getUnsyncedReminders(userId),
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
    } catch (e) {}

    // Build push payload
    const pushPayload = {
      timezone,
      level_id: user.level_id,
      level_started_days: user.level_started_days,
      completed_lessons: localBasicsDone,
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
      subscriptions: [], // Subscriptions verify directly or through RTDN. Play purchases push token
    };

    // 2. Push to Laravel
    const pushRes = await api.pushState(pushPayload);
    if (!pushRes.ok) {
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
    const [pullRes, contentRes] = await Promise.all([api.pullState(), api.pullContent()]);
    await markSynced;
    if (!pullRes.ok) {
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
    const remoteBasicsDone = data.completed_lessons || [];
    try {
      const currentRaw = await AsyncStorage.getItem(`@basics_done_${userId}`);
      const currentLocal: string[] = currentRaw ? JSON.parse(currentRaw) : [];
      const mergedBasicsDone = Array.from(new Set([...currentLocal, ...remoteBasicsDone]));
      await AsyncStorage.setItem(`@basics_done_${userId}`, JSON.stringify(mergedBasicsDone));
    } catch (e) {}

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
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Sync failed' };
  }
};
