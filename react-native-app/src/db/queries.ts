import { getDBConnection } from './sqlite';
import { newClientId } from '../utils/clientId';
import { getLocalDateString } from '../utils/localDate';

export interface DBUser {
  id: number;
  name: string;
  email: string;
  google_id: string | null;
  is_admin: number;
  level_id: number;
  level_started_days: number;
  onboarded_at: string | null;
  timezone: string | null;
  api_token: string | null;
}

export interface DBWorkoutSession {
  id?: number;
  /**
   * Stamped when the row is written, so a retried push is recognised as the
   * same row rather than matched by a timestamp guess. Absent on rows that
   * arrived from a pull: those are already on the server.
   */
  client_id?: string | null;
  user_id: number;
  exercise_id: number | null;
  exercise_slug: string | null;
  level_id: number;
  duration_seconds: number;
  is_extra: number;
  started_at: string;
  completed_at: string;
  synced?: number;
}

export interface DBMeasurement {
  id?: number;
  client_id?: string | null;
  user_id: number;
  seconds: number;
  measured_at: string;
  synced?: number;
}

export interface DBReminder {
  id?: number;
  user_id: number;
  weekday: number;
  times: string[]; // parsed from JSON array
  is_enabled: number;
  synced?: number;
}

export interface DBTrainingDay {
  user_id: number;
  date: string;
  sessions_count: number;
  required_sessions: number;
  completed_at: string | null;
}

export interface DBPage {
  slug: string;
  title: string;
  content: string;
  sort_order: number;
  is_published: number;
}

export interface DBSubscription {
  id?: number;
  user_id: number;
  plan_id: number | null;
  plan_slug: string | null;
  status: string;
  store: string | null;
  purchase_token: string | null;
  google_order_id: string | null;
  trial_ends_at: string | null;
  started_at: string | null;
  ends_at: string | null;
  /**
   * Play is retrying a failed charge. While this date is in the future the
   * customer is still entitled even though `ends_at` has passed - reading the
   * expiry alone would shut the gate on somebody Google is still billing.
   */
  grace_period_ends_at: string | null;
  canceled_at: string | null;
  auto_renewing: number;
  /** Who the purchase belongs to at RevenueCat, echoed back on every push. */
  revenuecat_app_user_id?: string | null;
  /** The store SKU actually bought, which the backend verifies against. */
  store_product_id?: string | null;
}

// Helper to execute single queries
const query = async (sql: string, params: any[] = []): Promise<any[]> => {
  const db = await getDBConnection();
  const [results] = await db.executeSql(sql, params);
  const rows = [];
  for (let i = 0; i < results.rows.length; i++) {
    rows.push(results.rows.item(i));
  }
  return rows;
};

export const getDBUser = async (): Promise<DBUser | null> => {
  const users = await query('SELECT * FROM users LIMIT 1');
  return users.length > 0 ? users[0] : null;
};

/**
 * An explicitly passed `undefined` is not a value to write.
 *
 * The SQL here is built from whatever keys the caller handed over, so
 * `{ timezone: undefined }` used to produce `timezone = ?` bound to undefined -
 * which the bridge turns into NULL. A caller spreading a partial object
 * therefore ERASED columns it never meant to mention. `null` still means
 * "clear this", because that is a decision somebody made; undefined means
 * "I have nothing to say about this field".
 */
const definedKeys = <T extends object>(obj: T): Array<keyof T> =>
  (Object.keys(obj) as Array<keyof T>).filter((k) => obj[k] !== undefined);

export const saveDBUser = async (user: Partial<DBUser>): Promise<void> => {
  const db = await getDBConnection();
  const keys = definedKeys(user);
  if (keys.length === 0) return;
  const values = keys.map((key) => user[key]);
  const existing = await getDBUser();
  if (existing) {
    const sets = keys.map((key) => `${key} = ?`).join(', ');
    await db.executeSql(`UPDATE users SET ${sets} WHERE id = ?`, [...values, existing.id]);
  } else {
    const placeholders = keys.map(() => '?').join(', ');
    await db.executeSql(
      `INSERT INTO users (${keys.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }
};

/** Every table whose rows belong to one account. */
const USER_SCOPED_TABLES = [
  'workout_sessions',
  'training_days',
  'measurements',
  'reminders',
  'subscriptions',
  'user_events',
] as const;

/**
 * Drop one account's local rows.
 *
 * Scoped by user_id rather than truncating the tables. The unscoped version
 * was wrong in both directions: it missed `user_events` entirely, so a queued
 * behaviour log outlived the account that produced it and was pushed under the
 * next person to sign in on the device; and `DELETE FROM subscriptions` threw
 * away rows for anyone else the database happened to hold.
 *
 * The id is optional because the local database only ever holds one signed-in
 * user, and the callers that clear "the current account" should not have to
 * know its id. With no user row there is nothing to clear.
 */
export const clearUserData = async (userId?: number): Promise<void> => {
  const db = await getDBConnection();
  const id = userId ?? (await getDBUser())?.id;
  if (id === undefined || id === null) return;
  await db.transaction((tx: any) => {
    for (const table of USER_SCOPED_TABLES) {
      tx.executeSql(`DELETE FROM ${table} WHERE user_id = ?`, [id]);
    }
    tx.executeSql('DELETE FROM users WHERE id = ?', [id]);
  });
};

/**
 * "Reset progress": erase the training record, keep the account.
 *
 * Deliberately narrower than clearUserData. Someone starting their plan over
 * has not asked to be signed out, to lose the subscription they are paying
 * for, or to have their reminder schedule wiped - and re-entering all of that
 * is exactly the friction that turns a reset into an uninstall.
 */
export const clearProgressData = async (userId: number): Promise<void> => {
  const db = await getDBConnection();
  await db.transaction((tx: any) => {
    for (const table of ['workout_sessions', 'training_days', 'measurements', 'user_events']) {
      tx.executeSql(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
  });
};

export const getWorkoutSessionsCount = async (userId: number): Promise<number> => {
  const res = await query('SELECT COUNT(*) as cnt FROM workout_sessions WHERE user_id = ?', [userId]);
  return res[0]?.cnt || 0;
};

export const getWorkoutSessions = async (userId: number, limit = 200): Promise<DBWorkoutSession[]> => {
  return query(
    'SELECT * FROM workout_sessions WHERE user_id = ? ORDER BY completed_at DESC LIMIT ?',
    [userId, limit]
  );
};

export const insertWorkoutSession = async (session: DBWorkoutSession): Promise<void> => {
  const db = await getDBConnection();
  await db.executeSql(
    `INSERT INTO workout_sessions (client_id, user_id, exercise_id, exercise_slug, level_id, duration_seconds, is_extra, started_at, completed_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newClientId(),
      session.user_id,
      session.exercise_id,
      session.exercise_slug,
      session.level_id,
      session.duration_seconds,
      session.is_extra,
      session.started_at,
      session.completed_at,
      session.synced ?? 0,
    ]
  );
};

/**
 * One push worth of unsynced rows, oldest first.
 *
 * Capped because the payload is a single JSON body: a device that trained
 * offline for weeks, or one whose pushes have been failing, would otherwise
 * build a request large enough to time out - and a push that times out never
 * marks anything synced, so the queue only grows and the sync never recovers.
 * The sync engine drains the rest in further passes.
 */
const PUSH_BATCH_LIMIT = 500;

export const getUnsyncedWorkoutSessions = async (userId: number): Promise<DBWorkoutSession[]> => {
  return query(
    'SELECT * FROM workout_sessions WHERE user_id = ? AND synced = 0 ORDER BY id ASC LIMIT ?',
    [userId, PUSH_BATCH_LIMIT]
  );
};

export const markWorkoutSessionsSynced = async (ids: number[]): Promise<void> => {
  if (ids.length === 0) return;
  const db = await getDBConnection();
  const placeholders = ids.map(() => '?').join(', ');
  await db.executeSql(`UPDATE workout_sessions SET synced = 1 WHERE id IN (${placeholders})`, ids);
};

export const getCompletedDaysCount = async (userId: number): Promise<number> => {
  const res = await query(
    'SELECT COUNT(*) as cnt FROM training_days WHERE user_id = ? AND completed_at IS NOT NULL',
    [userId]
  );
  return res[0]?.cnt || 0;
};

export const getCompletedDaysBeforeDate = async (userId: number, dateStr: string): Promise<number> => {
  const res = await query(
    'SELECT COUNT(*) as cnt FROM training_days WHERE user_id = ? AND completed_at IS NOT NULL AND date < ?',
    [userId, dateStr]
  );
  return res[0]?.cnt || 0;
};

export const getTrainingDay = async (userId: number, dateStr: string): Promise<DBTrainingDay | null> => {
  const days = await query('SELECT * FROM training_days WHERE user_id = ? AND date = ?', [
    userId,
    dateStr,
  ]);
  return days.length > 0 ? days[0] : null;
};

export const createOrGetTrainingDay = async (
  userId: number,
  dateStr: string,
  requiredSessions: number
): Promise<DBTrainingDay> => {
  const existing = await getTrainingDay(userId, dateStr);
  if (existing) {
    return existing;
  }
  const db = await getDBConnection();
  await db.executeSql(
    'INSERT OR IGNORE INTO training_days (user_id, date, sessions_count, required_sessions, completed_at) VALUES (?, ?, ?, ?, ?)',
    [userId, dateStr, 0, requiredSessions, null]
  );
  return {
    user_id: userId,
    date: dateStr,
    sessions_count: 0,
    required_sessions: requiredSessions,
    completed_at: null,
  };
};

export const incrementTrainingDaySessions = async (
  userId: number,
  dateStr: string,
  requiredSessions: number
): Promise<DBTrainingDay> => {
  const db = await getDBConnection();
  const day = await createOrGetTrainingDay(userId, dateStr, requiredSessions);
  const newCount = day.sessions_count + 1;
  const completedAt =
    day.completed_at || newCount >= day.required_sessions
      ? day.completed_at || new Date().toISOString()
      : null;

  await db.executeSql(
    'UPDATE training_days SET sessions_count = ?, completed_at = ? WHERE user_id = ? AND date = ?',
    [newCount, completedAt, userId, dateStr]
  );

  return {
    ...day,
    sessions_count: newCount,
    completed_at: completedAt,
  };
};

// Force training day updates (specifically when syncing from the backend)
export const saveTrainingDay = async (day: DBTrainingDay): Promise<void> => {
  const db = await getDBConnection();
  await db.executeSql(
    `INSERT OR REPLACE INTO training_days (user_id, date, sessions_count, required_sessions, completed_at)
     VALUES (?, ?, ?, ?, ?)`,
    [day.user_id, day.date, day.sessions_count, day.required_sessions, day.completed_at]
  );
};

export const getMeasurements = async (userId: number, limit = 100): Promise<DBMeasurement[]> => {
  return query(
    'SELECT * FROM measurements WHERE user_id = ? ORDER BY measured_at DESC LIMIT ?',
    [userId, limit]
  );
};

export const getMaxMeasurement = async (userId: number): Promise<number> => {
  const res = await query('SELECT MAX(seconds) as maxSec FROM measurements WHERE user_id = ?', [userId]);
  return res[0]?.maxSec || 0;
};

export const insertMeasurement = async (userId: number, seconds: number, synced = 0): Promise<void> => {
  const db = await getDBConnection();
  await db.executeSql(
    'INSERT INTO measurements (client_id, user_id, seconds, measured_at, synced) VALUES (?, ?, ?, ?, ?)',
    [newClientId(), userId, seconds, new Date().toISOString(), synced]
  );
};

export const getUnsyncedMeasurements = async (userId: number): Promise<DBMeasurement[]> => {
  return query(
    'SELECT * FROM measurements WHERE user_id = ? AND synced = 0 ORDER BY id ASC LIMIT ?',
    [userId, PUSH_BATCH_LIMIT]
  );
};

// --- Server-authoritative rehydration (used by sync) ---
// The /user/pull endpoint returns the last 200 sessions / 100 measurements in
// FULL on every sync, so a plain INSERT would pile up a fresh copy of every row
// each time. These bulk upserts read the existing time keys ONCE, then insert
// only the missing rows inside a single transaction - one write-lock and one
// disk sync per sync run instead of two bridge round-trips per row.

// Normalise a timestamp to its whole second for identity comparison: a locally
// recorded row ("...:00.123Z") and its server-pulled copy ("...:00+00:00") are
// the same instant in different ISO formats. The backend de-dupes within a 5s
// window, so the whole second uniquely identifies a row for a given user.
const timeBucket = (t: string): string => {
  const parsed = Date.parse(t);
  return isNaN(parsed) ? String(t) : String(Math.floor(parsed / 1000));
};

export const bulkUpsertPulledWorkoutSessions = async (
  userId: number,
  rows: DBWorkoutSession[]
): Promise<void> => {
  if (rows.length === 0) return;
  const db = await getDBConnection();
  const [res] = await db.executeSql(
    'SELECT completed_at FROM workout_sessions WHERE user_id = ?',
    [userId]
  );
  const existing = new Set<string>();
  for (let i = 0; i < res.rows.length; i++) {
    existing.add(timeBucket(res.rows.item(i).completed_at));
  }
  const missing = rows.filter((s) => {
    const key = timeBucket(s.completed_at);
    if (existing.has(key)) return false;
    existing.add(key); // also guards against duplicates within the batch
    return true;
  });
  if (missing.length === 0) return;
  await db.transaction((tx: any) => {
    for (const s of missing) {
      tx.executeSql(
        `INSERT INTO workout_sessions (user_id, client_id, exercise_id, exercise_slug, level_id, duration_seconds, is_extra, started_at, completed_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.user_id,
          // Kept when the server sends it back, so a row that round-tripped
          // still carries the id that identifies it, rather than becoming
          // anonymous the moment it is re-pulled.
          s.client_id ?? null,
          s.exercise_id,
          s.exercise_slug,
          s.level_id,
          s.duration_seconds,
          s.is_extra,
          s.started_at,
          s.completed_at,
          s.synced ?? 1,
        ]
      );
    }
  });
};

export const bulkUpsertPulledMeasurements = async (
  userId: number,
  rows: { seconds: number; measured_at: string }[]
): Promise<void> => {
  if (rows.length === 0) return;
  const db = await getDBConnection();
  const [res] = await db.executeSql(
    'SELECT measured_at FROM measurements WHERE user_id = ?',
    [userId]
  );
  const existing = new Set<string>();
  for (let i = 0; i < res.rows.length; i++) {
    existing.add(timeBucket(res.rows.item(i).measured_at));
  }
  const missing = rows.filter((m) => {
    const key = timeBucket(m.measured_at);
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  if (missing.length === 0) return;
  await db.transaction((tx: any) => {
    for (const m of missing) {
      tx.executeSql(
        'INSERT INTO measurements (user_id, seconds, measured_at, synced) VALUES (?, ?, ?, 1)',
        [userId, m.seconds, m.measured_at]
      );
    }
  });
};

// Server-authoritative day rows: replace them all in one transaction.
export const bulkSaveTrainingDays = async (days: DBTrainingDay[]): Promise<void> => {
  if (days.length === 0) return;
  const db = await getDBConnection();
  await db.transaction((tx: any) => {
    for (const day of days) {
      tx.executeSql(
        `INSERT OR REPLACE INTO training_days (user_id, date, sessions_count, required_sessions, completed_at)
         VALUES (?, ?, ?, ?, ?)`,
        [day.user_id, day.date, day.sessions_count, day.required_sessions, day.completed_at]
      );
    }
  });
};

// Idempotent heal for databases already bloated by the pre-fix
// duplicate-on-every-pull behaviour: collapse duplicate rows (same user, same
// completion time) down to the earliest one. Matching is done on the whole
// second in JS rather than on the raw string, because a locally recorded row
// ("...:00.123Z") and its server-pulled copy ("...:00+00:00") describe the same
// instant in different ISO formats. Runs cheaply as a no-op once tables are
// clean. Measurements recorded before the fix carried a now() timestamp and are
// indistinguishable from real ones, so they are intentionally left untouched.
const dedupeBySecond = async (table: 'workout_sessions' | 'measurements', timeCol: string): Promise<void> => {
  const db = await getDBConnection();
  const [res] = await db.executeSql(`SELECT id, user_id, ${timeCol} AS t FROM ${table} ORDER BY id ASC`);
  const seen = new Set<string>();
  const dupIds: number[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    const row = res.rows.item(i);
    const key = `${row.user_id}:${timeBucket(row.t)}`;
    if (seen.has(key)) {
      dupIds.push(row.id);
    } else {
      seen.add(key);
    }
  }
  if (dupIds.length > 0) {
    const placeholders = dupIds.map(() => '?').join(',');
    await db.executeSql(`DELETE FROM ${table} WHERE id IN (${placeholders})`, dupIds);
  }
};

export const dedupeWorkoutSessions = (): Promise<void> => dedupeBySecond('workout_sessions', 'completed_at');
export const dedupeMeasurements = (): Promise<void> => dedupeBySecond('measurements', 'measured_at');

export const markMeasurementsSynced = async (ids: number[]): Promise<void> => {
  if (ids.length === 0) return;
  const db = await getDBConnection();
  const placeholders = ids.map(() => '?').join(', ');
  await db.executeSql(`UPDATE measurements SET synced = 1 WHERE id IN (${placeholders})`, ids);
};

export const getReminders = async (userId: number): Promise<DBReminder[]> => {
  const rows = await query('SELECT * FROM reminders WHERE user_id = ? ORDER BY weekday', [userId]);
  return rows.map((r) => ({
    ...r,
    times: JSON.parse(r.times || '[]'),
  }));
};

export const saveReminder = async (
  userId: number,
  weekday: number,
  times: string[],
  isEnabled: number,
  synced = 0
): Promise<void> => {
  const db = await getDBConnection();
  await db.executeSql(
    `INSERT OR REPLACE INTO reminders (user_id, weekday, times, is_enabled, synced)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, weekday, JSON.stringify(times), isEnabled, synced]
  );
};

export const getUnsyncedReminders = async (userId: number): Promise<DBReminder[]> => {
  const rows = await query('SELECT * FROM reminders WHERE user_id = ? AND synced = 0', [userId]);
  return rows.map((r) => ({
    ...r,
    times: JSON.parse(r.times || '[]'),
  }));
};

/**
 * Mark the rows that were actually pushed, by row id.
 *
 * Matching on weekday was a lost-write: the push carries a snapshot, and a
 * user editing Tuesday's times while that request is in flight writes a NEW
 * row state with synced = 0. Marking "Tuesday" on the way back stamped the
 * edit as synced too, and the server never heard about it. Ids only ever name
 * the rows the sync actually read, and saveReminder replaces the row - so an
 * edit mid-flight gets a different id and is left pending, which is right.
 */
export const markRemindersSynced = async (ids: number[]): Promise<void> => {
  if (ids.length === 0) return;
  const db = await getDBConnection();
  const placeholders = ids.map(() => '?').join(', ');
  await db.executeSql(
    `UPDATE reminders SET synced = 1 WHERE id IN (${placeholders})`,
    ids
  );
};

export const getSubscriptions = async (userId: number): Promise<DBSubscription[]> => {
  return query('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC', [userId]);
};

/**
 * How far past `ends_at` an auto-renewing subscription still counts as active.
 *
 * Google Play renews on its own clock, and the news then has to travel: Play
 * RTDN -> RevenueCat -> our webhook -> the row this device pulls down. That
 * chain is usually seconds, but it is neither instant nor guaranteed. So a row
 * whose ends_at has just slipped past is NOT evidence that someone stopped
 * paying; on a row Play still reports as auto-renewing it much more likely
 * means "already renewed, not delivered here yet".
 *
 * 'past_due' rides along with 'canceled' in the clause above for a different
 * reason: it means Google is still retrying the card, and Play's grace period
 * is by definition the window where the subscriber keeps access. Cutting them
 * off there locks out someone Play still considers a paying customer.
 *
 * A day of slack covers that lag, and it is bounded on both sides. Someone who
 * actually cancels comes back with auto_renewing = 0 and status 'canceled',
 * which this clause deliberately does not cover. A genuine payment failure
 * puts the account into Play's own grace period, during which Play itself
 * expects the app to keep serving. Erring long costs at most one free day;
 * erring short locks out someone whose card was charged minutes ago.
 */
const RENEWAL_LAG_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * How long past `ends_at` a 'past_due' row keeps access when the server did
 * not tell us when Play's own grace period ends.
 *
 * Google Play's grace period for a subscription is configured per app and tops
 * out at 30 days. `grace_period_ends_at` is the real answer whenever we have
 * it; this is the fallback for a row written before that column existed, or by
 * a backend that does not send it. Erring long costs at most a month of access
 * to someone Play was still trying to bill.
 */
const PAST_DUE_FALLBACK_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A timestamp as milliseconds, or null when there isn't one.
 *
 * Every date in this table arrives as a string from one of three writers - the
 * store SDK, a Laravel pull, and this app's own `new Date().toISOString()` -
 * and they do not agree on a format. '2026-01-01T00:00:00.000000Z' (Laravel's
 * microseconds) and '2026-01-01T00:00:00+00:00' are the same instant as
 * '2026-01-01T00:00:00.000Z', but SQLite compares them as TEXT, so `ends_at >
 * ?` was answering a question about alphabetical order. Comparison happens on
 * numbers here instead.
 */
const msOrNull = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
};

/**
 * Whether one row still grants access, at time `now`.
 *
 * Kept as a plain function over a row rather than a WHERE clause so the rules
 * are testable and so the date comparisons above can happen in JS.
 *
 * 'paused' and 'on_hold' are deliberately absent. Both mean Play has stopped
 * the subscription - a voluntary pause, or a payment that failed all the way
 * through the grace period - and in both the customer is not entitled. They
 * are named here rather than merely falling through the bottom because the
 * backend has started sending them, and a reader needs to know that is on
 * purpose.
 */
const subscriptionEntitles = (sub: DBSubscription, now: number): boolean => {
  const status = String(sub.status || '').toLowerCase();
  const endsAt = msOrNull(sub.ends_at);

  if (status === 'trialing' || status === 'active') {
    // No expiry at all is an open-ended entitlement.
    if (endsAt === null) return true;
    if (endsAt > now) return true;
    // Play renews on its own clock and the news has to travel (Play RTDN ->
    // RevenueCat -> our webhook -> this device's next pull). An expiry that
    // just slipped past on a row Play still reports as auto-renewing is far
    // more likely "already renewed, not delivered here yet" than a lapse.
    return Number(sub.auto_renewing) === 1 && endsAt > now - RENEWAL_LAG_GRACE_MS;
  }

  // Cancelled, but paid up to the end of the period. That entitlement is real
  // until the date passes.
  if (status === 'canceled') return endsAt !== null && endsAt > now;

  // Google is still retrying the card. Play's grace period is by definition
  // the window where the subscriber keeps access, so cutting them off inside
  // it locks out someone Play still considers a paying customer.
  if (status === 'past_due') {
    const graceEnds = msOrNull(sub.grace_period_ends_at);
    if (graceEnds !== null) return graceEnds > now;
    return endsAt !== null && endsAt + PAST_DUE_FALLBACK_GRACE_MS > now;
  }

  return false;
};

/**
 * The instant at which `subscriptionEntitles` stops being true for this row.
 *
 * The gate used to be told only "is this row entitling right now", which is
 * enough to decide what to render and not enough to decide anything about the
 * future. Two things need the future: the timer that closes the gate while the
 * app sits open, and the reminder schedule, which hands notifications to the
 * OS days in advance and therefore has to know how far ahead it is still
 * allowed to promise anything.
 *
 * Derived from `subscriptionEntitles` rather than restating it: every branch
 * below is the boundary of the matching branch above, so the two cannot drift.
 *
 * `null` means no deadline at all - an open-ended entitlement. `0` means this
 * row never entitles, whatever the clock says.
 */
export const subscriptionEntitlementEndsAt = (sub: DBSubscription): number | null => {
  const status = String(sub.status || '').toLowerCase();
  const endsAt = msOrNull(sub.ends_at);

  if (status === 'trialing' || status === 'active') {
    if (endsAt === null) return null;
    // An auto-renewing row is entitled through the renewal-lag allowance, so
    // its boundary is the far end of that window rather than `ends_at` itself.
    return Number(sub.auto_renewing) === 1 ? endsAt + RENEWAL_LAG_GRACE_MS : endsAt;
  }

  if (status === 'canceled') return endsAt ?? 0;

  if (status === 'past_due') {
    const graceEnds = msOrNull(sub.grace_period_ends_at);
    if (graceEnds !== null) return graceEnds;
    return endsAt === null ? 0 : endsAt + PAST_DUE_FALLBACK_GRACE_MS;
  }

  return 0;
};

export const getActiveSubscription = async (userId: number): Promise<DBSubscription | null> => {
  const now = Date.now();
  const rows: DBSubscription[] = await query(
    'SELECT * FROM subscriptions WHERE user_id = ?',
    [userId]
  );
  const entitling = rows.filter((row) => subscriptionEntitles(row, now));
  if (entitling.length === 0) return null;
  // Furthest expiry first (a null one is open-ended, so it outranks every
  // date), then the newest row. Ordering by id alone let a stale row that
  // happened to be written later win over the one that actually runs longest.
  entitling.sort((a, b) => {
    const aEnds = msOrNull(a.ends_at) ?? Number.POSITIVE_INFINITY;
    const bEnds = msOrNull(b.ends_at) ?? Number.POSITIVE_INFINITY;
    if (aEnds !== bEnds) return bEnds - aEnds;
    return (b.id ?? 0) - (a.id ?? 0);
  });
  return entitling[0];
};

/**
 * Whether this subscription can still be CHANGED at the store, as opposed to
 * merely still granting access.
 *
 * getActiveSubscription deliberately keeps returning a cancelled row until
 * ends_at passes, and it is right to: that entitlement is paid for and real
 * until the period ends. Google Play draws the line somewhere else. A cancelled
 * subscription has no future renewal left to replace, so launching the
 * plan-change flow against one fails with Play's own "we were unable to change
 * your plan" - which is how re-subscribing after a cancellation turned into a
 * dead end. What that customer needs is a plain purchase, which is exactly what
 * Play's resubscribe is.
 *
 * So: still entitled, but no longer switchable.
 */
export const subscriptionIsRenewing = (sub: DBSubscription | null | undefined): boolean =>
  !!sub && Number(sub.auto_renewing) === 1 && sub.status !== 'canceled';

/**
 * A purchase token identifies a subscription AT THE STORE, not on this device.
 *
 * `userId` is optional only so existing callers keep compiling; pass it. A
 * device that has had two accounts signed in holds both their rows, and
 * matching on the token alone reads (or worse, overwrites) whichever came
 * first. That is somebody else's subscription.
 */
export const getSubscriptionByToken = async (
  token: string,
  userId?: number,
): Promise<DBSubscription | null> => {
  const subs = userId === undefined
    ? await query('SELECT * FROM subscriptions WHERE purchase_token = ? LIMIT 1', [token])
    : await query(
        'SELECT * FROM subscriptions WHERE purchase_token = ? AND user_id = ? LIMIT 1',
        [token, userId],
      );
  return subs.length > 0 ? subs[0] : null;
};

/**
 * Dates normalised on the way IN, so every reader compares like with like.
 *
 * The three writers of this table (the store SDK, the Laravel pull, and this
 * app) each produce a different ISO spelling of the same instant. Normalising
 * at the boundary means the column holds one format, and a comparison against
 * it - here or in the backend - cannot depend on which path wrote the row.
 */
const SUBSCRIPTION_DATE_FIELDS = ['ends_at', 'trial_ends_at', 'grace_period_ends_at'];

const normaliseDate = (value: unknown): unknown => {
  if (value === null || value === undefined || value === '') return null;
  const t = Date.parse(String(value));
  // Unparseable is stored verbatim rather than nulled: losing a date we simply
  // failed to read is worse than keeping one nothing can compare.
  return Number.isFinite(t) ? new Date(t).toISOString() : value;
};

export const saveSubscription = async (userId: number, sub: Partial<DBSubscription>): Promise<void> => {
  const db = await getDBConnection();

  // user_id comes from the argument, never from the payload, and `id` is the
  // table's own. Undefined values are absent fields, not instructions to null
  // a column (see definedKeys).
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(sub)) {
    if (key === 'id' || key === 'user_id') continue;
    const value = (sub as Record<string, unknown>)[key];
    if (value === undefined) continue;
    clean[key] = SUBSCRIPTION_DATE_FIELDS.includes(key) ? normaliseDate(value) : value;
  }
  const keys = Object.keys(clean);
  if (keys.length === 0) return;
  const values = keys.map((key) => clean[key]);

  if (sub.purchase_token) {
    // One statement, resolved by the (user_id, purchase_token) unique index.
    // The previous read-then-write raced with itself: two syncs landing the
    // same token together both missed the probe and both inserted, which is
    // how a single purchase ended up on several rows.
    const columns = ['user_id', ...keys];
    const placeholders = columns.map(() => '?').join(', ');
    const updates = keys
      .filter((key) => key !== 'purchase_token')
      .map((key) => `${key} = excluded.${key}`)
      .join(', ');
    try {
      await db.executeSql(
        `INSERT INTO subscriptions (${columns.join(', ')}) VALUES (${placeholders})
         ON CONFLICT(user_id, purchase_token) DO ${updates ? `UPDATE SET ${updates}` : 'NOTHING'}`,
        [userId, ...values]
      );
      return;
    } catch {
      /**
       * ON CONFLICT needs the unique index to exist, and on one device in
       * however many it will not.
       *
       * The migration that creates it has to delete duplicate rows first, and
       * a database that cannot complete that step (a disk error, a lock held
       * by another connection) leaves the index absent - at which point
       * SQLite rejects the statement above outright with "ON CONFLICT clause
       * does not match any PRIMARY KEY or UNIQUE constraint".
       *
       * Falling through to the older read-then-write keeps that device
       * writing subscriptions. It is racier, which is exactly why it is the
       * fallback and not the default, but losing a purchase row is worse than
       * a rare duplicate one - and getActiveSubscription now picks the row
       * that runs longest rather than whichever came last.
       */
      const existing = await query(
        'SELECT id FROM subscriptions WHERE user_id = ? AND purchase_token = ? ORDER BY id DESC LIMIT 1',
        [userId, sub.purchase_token]
      );
      if (existing.length > 0) {
        const sets = keys.map((key) => `${key} = ?`).join(', ');
        await db.executeSql(
          `UPDATE subscriptions SET ${sets} WHERE id = ?`,
          [...values, existing[0].id]
        );
      } else {
        await db.executeSql(
          `INSERT INTO subscriptions (${columns.join(', ')}) VALUES (${placeholders})`,
          [userId, ...values]
        );
      }
      return;
    }
  }

  /**
   * A row with no purchase token still has an identity.
   *
   * SQLite treats NULLs as distinct in a unique index, so the statement above
   * would insert a new row every single time - and the pull re-sends every
   * subscription on every sync, so a token-less row (a manual grant, a
   * promotional plan, a store that gave us no token) piled up one duplicate
   * per sync forever. (user_id, plan_slug, started_at) is what actually
   * identifies such a row.
   */
  const existing = await query(
    `SELECT id FROM subscriptions
     WHERE user_id = ? AND purchase_token IS NULL AND plan_slug IS ? AND started_at IS ?
     ORDER BY id DESC LIMIT 1`,
    [userId, clean.plan_slug ?? null, clean.started_at ?? null]
  );

  if (existing.length > 0) {
    const sets = keys.map((key) => `${key} = ?`).join(', ');
    await db.executeSql(
      `UPDATE subscriptions SET ${sets} WHERE id = ?`,
      [...values, existing[0].id]
    );
    return;
  }

  const columns = ['user_id', ...keys];
  const placeholders = columns.map(() => '?').join(', ');
  await db.executeSql(
    `INSERT INTO subscriptions (${columns.join(', ')}) VALUES (${placeholders})`,
    [userId, ...values]
  );
};

export const getPages = async (): Promise<DBPage[]> => {
  return query('SELECT * FROM pages WHERE is_published = 1 ORDER BY sort_order');
};

export const getPage = async (slug: string): Promise<DBPage | null> => {
  const pages = await query('SELECT * FROM pages WHERE slug = ? LIMIT 1', [slug]);
  return pages.length > 0 ? pages[0] : null;
};

/**
 * `locale` is not optional in practice, only in the type.
 *
 * The table holds ONE row per slug - slug is UNIQUE - so a page cached in
 * English is the same row as the same page in German. Without recording which
 * language the row is in, a reader who switched language got the old text back
 * out of the cache and no way to tell it was stale. Writing it here is what
 * lets getPageInLocale treat a mismatch as a miss.
 */
export const savePage = async (page: DBPage, locale?: string): Promise<void> => {
  const db = await getDBConnection();
  await db.executeSql(
    `INSERT OR REPLACE INTO pages (slug, title, content, sort_order, is_published, locale)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [page.slug, page.title, page.content, page.sort_order, page.is_published, locale ?? null]
  );
};

/**
 * A cached page, but only if it is in the language being asked for.
 *
 * A plain `WHERE slug = ?` is what made the legal pages ignore a language
 * change: the screen re-read on every change, found the row it had cached in
 * the previous language, and showed it. It appeared to fix itself if you left
 * the screen and came back, because by then a background content sync had
 * overwritten the row - which is a race, not a fix.
 */
export const getPageInLocale = async (
  slug: string,
  locale: string,
): Promise<string | null> => {
  const rows = await query(
    'SELECT content FROM pages WHERE slug = ? AND locale = ? LIMIT 1',
    [slug, locale],
  );
  return rows.length > 0 && rows[0].content ? rows[0].content : null;
};

export const getAppSetting = async (key: string, defaultValue = ''): Promise<string> => {
  const res = await query('SELECT value FROM app_settings WHERE key = ? LIMIT 1', [key]);
  return res.length > 0 ? res[0].value : defaultValue;
};

export const saveAppSetting = async (key: string, value: string, type = 'string'): Promise<void> => {
  const db = await getDBConnection();
  await db.executeSql(
    'INSERT OR REPLACE INTO app_settings (key, value, type) VALUES (?, ?, ?)',
    [key, value, type]
  );
};

export const recordCompletedSession = async (
  userId: number,
  exerciseSlug: string | null,
  durationSeconds: number,
  levelId: number,
  /**
   * The highest number of COMPLETED days this account may accumulate.
   *
   * Passed for a free account and left undefined for a subscriber. The
   * workout itself is always recorded - a session someone did is a fact, and
   * they should see it - but once the cap is reached the DAY stops being
   * completed, which is what freezes plan position, exercise unlocks and the
   * streak. Subscribing simply stops passing this, and the plan carries on
   * from the day they had actually reached rather than restarting.
   */
  opts?: { maxCompletedDays?: number },
): Promise<void> => {
  const db = await getDBConnection();
  
  const userRows = await query('SELECT level_id, timezone FROM users WHERE id = ? LIMIT 1', [userId]);
  const lvlId = userRows.length > 0 ? userRows[0].level_id : levelId;

  // The user's timezone, NOT the device clock. Every reader of training_days
  // (getTodayProgress, currentDayNumber, the Progress tab) keys off
  // getLocalDateString(user.timezone); building the date differently here
  // wrote the session to one date row while the app looked for it under
  // another, so the day never showed as complete and no tick appeared.
  const dateStr = getLocalDateString(userRows.length > 0 ? userRows[0].timezone : null);

  // FIXED at 2 sessions/day (backend AppConfig::SESSIONS_PER_DAY) - the level
  // changes session length, never the per-day count. A level-based map here
  // once made the local day never complete (no tick, no "Training Day
  // Complete!") until the backend's own row synced down.
  const required = 2;

  const tdRows = await query('SELECT * FROM training_days WHERE user_id = ? AND date = ?', [userId, dateStr]);
  const sessionsCount = tdRows.length > 0 ? tdRows[0].sessions_count : 0;
  const wasComplete = tdRows.length > 0 && tdRows[0].completed_at !== null;

  // Days already completed BEFORE today. Today is excluded on purpose: a day
  // that is mid-way through must be allowed to finish, or a free account
  // would be cut off partway through the very day that takes it to the cap.
  //
  // Read up here with the others so that every write below can happen inside
  // one transaction. It is unaffected by those writes - it counts other dates.
  const cap = opts?.maxCompletedDays;
  let dayCapReached = false;
  if (cap !== undefined) {
    const doneRows = await query(
      'SELECT COUNT(*) as c FROM training_days WHERE user_id = ? AND completed_at IS NOT NULL AND date <> ?',
      [userId, dateStr],
    );
    dayCapReached = (doneRows[0]?.c ?? 0) >= cap;
  }

  const newCount = sessionsCount + 1;
  const completedAt = dayCapReached
    // At the cap the workout is still recorded below; the day just never
    // closes, so nothing downstream advances.
    ? (tdRows.length > 0 ? tdRows[0].completed_at : null)
    : wasComplete || newCount >= required
      ? (tdRows.length > 0 ? tdRows[0].completed_at || new Date().toISOString() : new Date().toISOString())
      : null;

  /**
   * All three writes, or none of them.
   *
   * They were three separate statements, and the app kills the process at
   * exactly the wrong moment more often than it looks: a session ends, the
   * user immediately backgrounds the phone, Android reclaims. Landing the
   * workout row without the day update left a session that never counted
   * towards its own day; landing the day update without the workout row
   * showed a day as complete with nothing behind it. The transaction makes
   * the pair atomic, and pays for itself in write cost too - one disk sync
   * instead of three.
   */
  await db.transaction((tx: any) => {
    if (tdRows.length === 0) {
      tx.executeSql(
        'INSERT OR IGNORE INTO training_days (user_id, date, sessions_count, required_sessions, completed_at) VALUES (?, ?, ?, ?, ?)',
        [userId, dateStr, 0, required, null]
      );
    }

    tx.executeSql(
      `INSERT INTO workout_sessions (client_id, user_id, exercise_id, exercise_slug, level_id, duration_seconds, is_extra, started_at, completed_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        newClientId(),
        userId,
        null,
        exerciseSlug,
        lvlId,
        durationSeconds,
        wasComplete ? 1 : 0,
        new Date(Date.now() - durationSeconds * 1000).toISOString(),
        new Date().toISOString()
      ]
    );

    // required_sessions is written too, healing any row created while the old
    // level-based requirement map was in effect (it stored 3-6 and made
    // progress read "1/3" until the backend row synced over it).
    tx.executeSql(
      'UPDATE training_days SET sessions_count = ?, required_sessions = ?, completed_at = ? WHERE user_id = ? AND date = ?',
      [newCount, required, completedAt, userId, dateStr]
    );
  });
};

