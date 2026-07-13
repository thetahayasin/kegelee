import { api } from './api';
import {
  getUnsyncedWorkoutSessions,
  getUnsyncedMeasurements,
  getUnsyncedReminders,
  markWorkoutSessionsSynced,
  markMeasurementsSynced,
  markRemindersSynced,
  saveDBUser,
  getDBUser,
  insertWorkoutSession,
  insertMeasurement,
  saveReminder,
  saveTrainingDay,
  saveSubscription,
  savePage,
  saveAppSetting,
} from '../db/queries';

export const syncNow = async (userId: number): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = await getDBUser();
    if (!user) {
      return { success: false, error: 'No authenticated user found' };
    }

    // 1. Gather Unsynced Local Data
    const unsyncedSessions = await getUnsyncedWorkoutSessions(userId);
    const unsyncedMeasurements = await getUnsyncedMeasurements(userId);
    const unsyncedReminders = await getUnsyncedReminders(userId);

    // Get system timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // Build push payload
    const pushPayload = {
      timezone,
      level_id: user.level_id,
      level_started_days: user.level_started_days,
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

    // Mark pushed items as synced in local DB
    if (unsyncedSessions.length > 0) {
      const sessionIds = unsyncedSessions.map((s) => s.id).filter((id): id is number => id !== undefined);
      await markWorkoutSessionsSynced(sessionIds);
    }
    if (unsyncedMeasurements.length > 0) {
      const measurementIds = unsyncedMeasurements.map((m) => m.id).filter((id): id is number => id !== undefined);
      await markMeasurementsSynced(measurementIds);
    }
    if (unsyncedReminders.length > 0) {
      const weekdays = unsyncedReminders.map((r) => r.weekday);
      await markRemindersSynced(userId, weekdays);
    }

    // 3. Pull from Laravel
    const pullRes = await api.pullState();
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

    // Re-hydrate pulled workout sessions
    for (const ws of data.workout_sessions || []) {
      // Find matching local exercise or record
      await insertWorkoutSession({
        user_id: userId,
        exercise_id: ws.exercise_id,
        exercise_slug: ws.exercise_slug || null,
        level_id: ws.level_id,
        duration_seconds: ws.duration_seconds,
        is_extra: ws.is_extra ? 1 : 0,
        started_at: new Date(new Date(ws.completed_at).getTime() - (ws.duration_seconds * 1000)).toISOString(),
        completed_at: ws.completed_at,
        synced: 1,
      });
    }

    // Re-hydrate training days
    for (const td of data.training_days || []) {
      await saveTrainingDay({
        user_id: userId,
        date: td.date,
        sessions_count: td.sessions_count,
        required_sessions: td.required_sessions,
        completed_at: td.completed_at,
      });
    }

    // Re-hydrate measurements
    for (const m of data.measurements || []) {
      await insertMeasurement(userId, m.seconds, 1);
    }

    // Re-hydrate reminders
    for (const r of data.reminders || []) {
      await saveReminder(userId, r.weekday, r.times, r.is_enabled ? 1 : 0, 1);
    }

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

    // 4. Pull Content (pages and settings)
    const contentRes = await api.pullContent();
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
      // Save app settings
      if (content.settings) {
        for (const [key, val] of Object.entries(content.settings)) {
          await saveAppSetting(key, val ? '1' : '0', 'bool');
        }
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Sync failed' };
  }
};
