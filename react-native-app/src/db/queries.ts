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
  canceled_at: string | null;
  auto_renewing: number;
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

export const saveDBUser = async (user: Partial<DBUser>): Promise<void> => {
  const db = await getDBConnection();
  const existing = await getDBUser();
  if (existing) {
    const keys = Object.keys(user) as Array<keyof DBUser>;
    const sets = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => user[key]);
    await db.executeSql(`UPDATE users SET ${sets} WHERE id = ?`, [...values, existing.id]);
  } else {
    const keys = Object.keys(user) as Array<keyof DBUser>;
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((key) => user[key]);
    await db.executeSql(
      `INSERT INTO users (${keys.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }
};

export const clearUserData = async (): Promise<void> => {
  const db = await getDBConnection();
  await db.transaction((tx: any) => {
    tx.executeSql('DELETE FROM users');
    tx.executeSql('DELETE FROM workout_sessions');
    tx.executeSql('DELETE FROM training_days');
    tx.executeSql('DELETE FROM measurements');
    tx.executeSql('DELETE FROM reminders');
    tx.executeSql('DELETE FROM subscriptions');
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

export const getUnsyncedWorkoutSessions = async (userId: number): Promise<DBWorkoutSession[]> => {
  return query('SELECT * FROM workout_sessions WHERE user_id = ? AND synced = 0', [userId]);
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
  return query('SELECT * FROM measurements WHERE user_id = ? AND synced = 0', [userId]);
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
        `INSERT INTO workout_sessions (user_id, exercise_id, exercise_slug, level_id, duration_seconds, is_extra, started_at, completed_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.user_id,
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

export const markRemindersSynced = async (userId: number, weekdays: number[]): Promise<void> => {
  if (weekdays.length === 0) return;
  const db = await getDBConnection();
  const placeholders = weekdays.map(() => '?').join(', ');
  await db.executeSql(
    `UPDATE reminders SET synced = 1 WHERE user_id = ? AND weekday IN (${placeholders})`,
    [userId, ...weekdays]
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

export const getActiveSubscription = async (userId: number): Promise<DBSubscription | null> => {
  const now = new Date().toISOString();
  const renewalGraceFloor = new Date(Date.now() - RENEWAL_LAG_GRACE_MS).toISOString();
  const subs = await query(
    `SELECT * FROM subscriptions 
     WHERE user_id = ? 
     AND (
       (status IN ('trialing', 'active') AND (ends_at IS NULL OR ends_at > ?))
       OR (status IN ('canceled', 'past_due') AND ends_at > ?)
       OR (status IN ('trialing', 'active') AND auto_renewing = 1 AND ends_at > ?)
     )
     ORDER BY id DESC LIMIT 1`,
    [userId, now, now, renewalGraceFloor]
  );
  return subs.length > 0 ? subs[0] : null;
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

export const getSubscriptionByToken = async (token: string): Promise<DBSubscription | null> => {
  const subs = await query('SELECT * FROM subscriptions WHERE purchase_token = ? LIMIT 1', [token]);
  return subs.length > 0 ? subs[0] : null;
};

export const saveSubscription = async (userId: number, sub: Partial<DBSubscription>): Promise<void> => {
  const db = await getDBConnection();
  const existing = sub.purchase_token 
    ? await query('SELECT * FROM subscriptions WHERE purchase_token = ? LIMIT 1', [sub.purchase_token])
    : [];

  const keys = Object.keys(sub) as Array<keyof DBSubscription>;
  if (existing.length > 0) {
    const sets = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => sub[key]);
    await db.executeSql(
      `UPDATE subscriptions SET ${sets} WHERE purchase_token = ?`,
      [...values, sub.purchase_token]
    );
  } else {
    const columns = ['user_id', ...keys];
    const placeholders = columns.map(() => '?').join(', ');
    const values = [userId, ...keys.map((key) => sub[key])];
    await db.executeSql(
      `INSERT INTO subscriptions (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }
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
  let sessionsCount = 0;
  let wasComplete = false;

  if (tdRows.length > 0) {
    sessionsCount = tdRows[0].sessions_count;
    wasComplete = tdRows[0].completed_at !== null;
  } else {
    await db.executeSql(
      'INSERT OR IGNORE INTO training_days (user_id, date, sessions_count, required_sessions, completed_at) VALUES (?, ?, ?, ?, ?)',
      [userId, dateStr, 0, required, null]
    );
  }

  await db.executeSql(
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

  // Days already completed BEFORE today. Today is excluded on purpose: a day
  // that is mid-way through must be allowed to finish, or a free account
  // would be cut off partway through the very day that takes it to the cap.
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
    // At the cap the workout is still recorded above; the day just never
    // closes, so nothing downstream advances.
    ? (tdRows.length > 0 ? tdRows[0].completed_at : null)
    : wasComplete || newCount >= required
      ? (tdRows.length > 0 ? tdRows[0].completed_at || new Date().toISOString() : new Date().toISOString())
      : null;

  // required_sessions is written too, healing any row created while the old
  // level-based requirement map was in effect (it stored 3-6 and made
  // progress read "1/3" until the backend row synced over it).
  await db.executeSql(
    'UPDATE training_days SET sessions_count = ?, required_sessions = ?, completed_at = ? WHERE user_id = ? AND date = ?',
    [newCount, required, completedAt, userId, dateStr]
  );
};

