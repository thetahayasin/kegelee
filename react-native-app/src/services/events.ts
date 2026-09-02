import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDBConnection } from '../db/sqlite';

/**
 * What the reader did, queued for the next sync.
 *
 * The app already records what someone HAS - days completed, a level, a
 * subscription. None of that answers the questions that keep coming up: did
 * they finish the quiz or bail at question two, did the tour help or get
 * dismissed on the first card, which padlock were they pressing when they went
 * to the paywall.
 *
 * Written to SQLite rather than fired at the network, for the same reason
 * every other write in this app is: most of a session happens with the phone
 * in a pocket, and an event that needs a connection at the moment it happens
 * is an event you only ever collect from people on wifi.
 *
 * Deliberately small. A closed list of names, one `subject` saying WHAT the
 * event was about, one `detail` saying WHICH KIND it was, and a bag of meta
 * nobody groups by. Two short columns rather than one plus a JSON blob is what
 * keeps every report a plain GROUP BY.
 */

/**
 * The closed vocabulary. Must match UserEvent::NAMES on the server.
 *
 * Only the names a CLIENT can produce are listed. The server records several
 * more of its own - account_created, logged_in, email_code_*, subscription_* -
 * from places only it can see (a verified email, a RevenueCat webhook), and no
 * call site here could ever emit them. An unknown name is dropped by the push
 * endpoint rather than rejected, so the two sides can ship independently.
 */
export type EventName =
  // Lifecycle
  | 'app_opened'
  // Account
  | 'signup_started'
  | 'logged_out'
  // Onboarding
  | 'onboarding_step'
  | 'quiz_completed'
  | 'quiz_skipped'
  | 'lesson_started'
  | 'lesson_completed'
  | 'tour_completed'
  | 'tour_skipped'
  // Training
  | 'workout_started'
  | 'workout_completed'
  | 'workout_abandoned'
  | 'level_changed'
  | 'exercise_previewed'
  | 'measurement_taken'
  | 'lock_tapped'
  // Money
  | 'paywall_viewed'
  | 'paywall_dismissed'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_failed'
  | 'restore_attempted'
  | 'restore_finished'
  | 'subscription_managed'
  // Engagement
  | 'notification_permission'
  | 'reminders_set'
  | 'reminder_tapped'
  | 'language_changed'
  | 'appearance_changed'
  // Health
  | 'error_boundary_hit';

/**
 * The user_id a row gets when nobody is signed in yet.
 *
 * Not null, and not "discard the event". Everything interesting about a first
 * run - the quiz, the three basics lessons, the first look at the plans -
 * happens before there is an account to file it under, and for the whole life
 * of this module those events were written nowhere at all. 0 is a user id no
 * account can have, so the rows are inert: getUnsyncedEvents always filters on
 * a real id, so nothing can push them, and claimGuestEvents rewrites them to
 * the account the moment one exists.
 */
export const GUEST_USER_ID = 0;

/**
 * A client-side id, so a retried push cannot record the same thing twice.
 *
 * Not a real uuid v4 - there is no crypto source wired up here and this does
 * not need to be unguessable, only unique within one account. Time plus two
 * random blocks is comfortably enough for that.
 */
const newClientId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

/**
 * Who is signed in right now, published by AuthContext.
 *
 * Kept in memory so the places that have no access to the auth context - a
 * class component's crash handler, a notification tap handled outside React -
 * can still attribute an event without reaching into SQLite on a path that is
 * already going wrong.
 */
let currentUserId: number | null = null;

export const setCurrentUserId = (id: number | null | undefined): void => {
  currentUserId = id ?? null;
};

/**
 * The signed-in account according to the local database.
 *
 * The fallback for the two callers that can run BEFORE AuthContext has
 * restored the session (the cold-start app_opened) or entirely outside the
 * React tree (a notification tapped while the app was killed, handled by the
 * headless background task, where module state is fresh). The local database
 * only ever holds one user row, so LIMIT 1 is the whole query.
 */
const storedUserId = async (): Promise<number | null> => {
  try {
    const db = await getDBConnection();
    const [res] = await db.executeSql('SELECT id FROM users LIMIT 1');
    if (res.rows.length === 0) return null;
    const id = Number(res.rows.item(0)?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

const resolveUserId = async (): Promise<number | null> =>
  currentUserId ?? (await storedUserId());

/**
 * How long one app_opened suppresses the next.
 *
 * Android reports 'active' for every transient interruption - the notification
 * shade, a permission dialog, the recents switcher - so an untreated foreground
 * event counts a dozen "opens" for one sitting, and "people who opened the app
 * today" stops meaning anything. Half an hour is well inside a normal gap
 * between real sessions and well outside the shade-pull noise.
 */
const APP_OPENED_THROTTLE_MS = 30 * 60 * 1000;
const APP_OPENED_KEY = '@last_app_opened';

// Module state is only half the answer: a cold start begins with an empty
// module, so an app killed and reopened ten minutes later would count twice
// without the persisted copy.
let lastOpenedAt = 0;

const appOpenedThrottled = async (now: number): Promise<boolean> => {
  if (lastOpenedAt === 0) {
    try {
      const stored = Number(await AsyncStorage.getItem(APP_OPENED_KEY));
      if (Number.isFinite(stored) && stored > 0) lastOpenedAt = stored;
    } catch {}
  }

  // A clock moved backwards (timezone travel, a manual change) would otherwise
  // park the throttle in the future and suppress every open until it caught
  // up. Treat it as a fresh start instead.
  const elapsed = now - lastOpenedAt;
  if (lastOpenedAt > 0 && elapsed >= 0 && elapsed < APP_OPENED_THROTTLE_MS) {
    return true;
  }

  lastOpenedAt = now;
  AsyncStorage.setItem(APP_OPENED_KEY, String(now)).catch(() => {});
  return false;
};

/**
 * Record one event.
 *
 * Never throws and never blocks the caller: this is instrumentation, and an
 * instrument that can break the thing it is measuring is worse than no
 * instrument. Every call site fires and forgets.
 */
export const track = async (
  userId: number | null | undefined,
  name: EventName,
  subject?: string | null,
  detail?: string | null,
  meta?: Record<string, unknown> | null,
): Promise<void> => {
  try {
    if (name === 'app_opened' && (await appOpenedThrottled(Date.now()))) return;

    const db = await getDBConnection();
    await db.executeSql(
      `INSERT INTO user_events (client_id, user_id, name, subject, detail, meta, occurred_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        newClientId(),
        // A guest still gets a row - see GUEST_USER_ID.
        userId || GUEST_USER_ID,
        name,
        subject ?? null,
        detail ?? null,
        meta ? JSON.stringify(meta) : null,
        new Date().toISOString(),
      ],
    );
  } catch {
    // Swallowed on purpose. See above.
  }
};

/** track() for callers with no access to the auth context. */
export const trackCurrent = (
  name: EventName,
  subject?: string | null,
  detail?: string | null,
  meta?: Record<string, unknown> | null,
): Promise<void> => track(currentUserId, name, subject, detail, meta);

/**
 * "The app came to the foreground", from either direction.
 *
 * One entry point for both so the 30-minute throttle sees every open: a cold
 * start followed immediately by an AppState 'active' is one session, not two.
 * The id is resolved rather than passed because the cold-start caller runs
 * before the session has been restored.
 */
export const trackAppOpened = async (
  subject: 'cold' | 'foreground',
): Promise<void> => {
  await track(await resolveUserId(), 'app_opened', subject);
};

/** Notifee ids for the weekly training reminders. See services/reminders. */
const REMINDER_ID_PREFIX = 'reminder_';

/**
 * A tapped reminder, from the foreground handler or the background one.
 *
 * Shared so the two handlers cannot drift: the prefix test is the only thing
 * separating "they came back because we asked them to" from a tap on any other
 * notification this app might one day post.
 */
export const trackReminderTapped = async (
  notificationId?: string | null,
): Promise<void> => {
  if (!notificationId || !notificationId.startsWith(REMINDER_ID_PREFIX)) return;
  await track(await resolveUserId(), 'reminder_tapped', null, null, {
    id: notificationId,
  });
};

/**
 * Hand every guest row to the account that just came into existence.
 *
 * Called at sign-in, BEFORE the first sync, so the onboarding a person did as
 * a guest arrives at the server attached to them rather than never arriving at
 * all. Anyone who never creates an account stays uncounted - that limitation
 * is stated on the report itself.
 */
export const claimGuestEvents = async (userId: number): Promise<void> => {
  if (!userId) return;
  try {
    const db = await getDBConnection();
    await db.executeSql('UPDATE user_events SET user_id = ? WHERE user_id = ?', [
      userId,
      GUEST_USER_ID,
    ]);
  } catch {}
};

/**
 * Drop what no account ever claimed.
 *
 * Run at logout, after the flush. Guest rows are not scoped to any account, so
 * clearUserData cannot touch them - and leaving them behind would hand one
 * person's onboarding to whoever signs in on the device next.
 */
export const deleteGuestEvents = async (): Promise<void> => {
  try {
    const db = await getDBConnection();
    await db.executeSql('DELETE FROM user_events WHERE user_id = ?', [GUEST_USER_ID]);
  } catch {}
};

export interface OutboxEvent {
  id: number;
  client_id: string;
  name: EventName;
  subject: string | null;
  detail: string | null;
  meta: string | null;
  occurred_at: string;
}

/**
 * The queue, oldest first.
 *
 * Capped. A device that has been offline for a month, or one where a sync has
 * been failing quietly, should not eventually try to post ten thousand rows in
 * one request and fail forever on the size of it.
 *
 * The user_id filter is also what keeps guest rows out of every push: they are
 * filed under 0, and nothing ever asks for user 0.
 */
export const getUnsyncedEvents = async (userId: number): Promise<OutboxEvent[]> => {
  try {
    const db = await getDBConnection();
    const res = await db.executeSql(
      `SELECT id, client_id, name, subject, detail, meta, occurred_at
         FROM user_events
        WHERE user_id = ? AND synced = 0
        ORDER BY occurred_at ASC
        LIMIT 200`,
      [userId],
    );
    const out: OutboxEvent[] = [];
    for (let i = 0; i < res[0].rows.length; i++) out.push(res[0].rows.item(i));
    return out;
  } catch {
    return [];
  }
};

/**
 * Mark as sent, then drop what has been sent and is old.
 *
 * Kept briefly rather than deleted on the spot so that a push which the server
 * accepted but whose response never arrived does not lose the events - the
 * next sync re-sends them, and the server's (user_id, client_id) uniqueness
 * makes that harmless.
 */
export const markEventsSynced = async (ids: number[]): Promise<void> => {
  if (ids.length === 0) return;
  try {
    const db = await getDBConnection();
    const holes = ids.map(() => '?').join(',');
    await db.executeSql(
      `UPDATE user_events SET synced = 1 WHERE id IN (${holes})`,
      ids,
    );
    await db.executeSql(
      `DELETE FROM user_events
        WHERE synced = 1 AND occurred_at < datetime('now', '-7 days')`,
    );
  } catch {}
};
