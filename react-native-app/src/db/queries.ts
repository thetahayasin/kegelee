import { getDBConnection } from './sqlite';

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
    `INSERT INTO workout_sessions (user_id, exercise_id, exercise_slug, level_id, duration_seconds, is_extra, started_at, completed_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    'INSERT INTO measurements (user_id, seconds, measured_at, synced) VALUES (?, ?, ?, ?)',
    [userId, seconds, new Date().toISOString(), synced]
  );
};

export const getUnsyncedMeasurements = async (userId: number): Promise<DBMeasurement[]> => {
  return query('SELECT * FROM measurements WHERE user_id = ? AND synced = 0', [userId]);
};

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

export const getActiveSubscription = async (userId: number): Promise<DBSubscription | null> => {
  const now = new Date().toISOString();
  const subs = await query(
    `SELECT * FROM subscriptions 
     WHERE user_id = ? 
     AND (
       (status IN ('trialing', 'active') AND (ends_at IS NULL OR ends_at > ?))
       OR (status = 'canceled' AND ends_at > ?)
     )
     ORDER BY id DESC LIMIT 1`,
    [userId, now, now]
  );
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

export const savePage = async (page: DBPage): Promise<void> => {
  const db = await getDBConnection();
  await db.executeSql(
    `INSERT OR REPLACE INTO pages (slug, title, content, sort_order, is_published)
     VALUES (?, ?, ?, ?, ?)`,
    [page.slug, page.title, page.content, page.sort_order, page.is_published]
  );
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
  levelId: number
): Promise<void> => {
  const db = await getDBConnection();
  
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const userRows = await query('SELECT level_id FROM users WHERE id = ? LIMIT 1', [userId]);
  const lvlId = userRows.length > 0 ? userRows[0].level_id : levelId;
  
  const levelsInfo: Record<number, number> = { 1: 3, 2: 3, 3: 4, 4: 5, 5: 6 };
  const required = levelsInfo[lvlId] || 2;

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
    `INSERT INTO workout_sessions (user_id, exercise_id, exercise_slug, level_id, duration_seconds, is_extra, started_at, completed_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
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

  const newCount = sessionsCount + 1;
  const completedAt = wasComplete || newCount >= required
    ? (tdRows.length > 0 ? tdRows[0].completed_at || new Date().toISOString() : new Date().toISOString())
    : null;

  await db.executeSql(
    'UPDATE training_days SET sessions_count = ?, completed_at = ? WHERE user_id = ? AND date = ?',
    [newCount, completedAt, userId, dateStr]
  );
};

