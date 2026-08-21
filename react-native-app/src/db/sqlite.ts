import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

export const getDBConnection = async () => {
  return SQLite.openDatabase({
    name: 'kegelee.db',
    location: 'default',
  });
};

export const initDB = async () => {
  const db = await getDBConnection();

  // Write-ahead logging: readers never block on the sync engine's writes, and
  // bursts of inserts hit disk once instead of per-statement. Best-effort - the
  // journal mode persists in the db file, and a failure just keeps the default.
  try {
    await db.executeSql('PRAGMA journal_mode=WAL;');
  } catch {}

  await db.transaction((tx: any) => {
    // 1. Users table
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        google_id TEXT,
        is_admin INTEGER DEFAULT 0,
        level_id INTEGER DEFAULT 1,
        level_started_days INTEGER DEFAULT 0,
        onboarded_at TEXT,
        timezone TEXT,
        api_token TEXT
      );
    `);

    // 2. Workout Sessions table
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS workout_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        exercise_id INTEGER,
        exercise_slug TEXT,
        level_id INTEGER,
        duration_seconds INTEGER,
        is_extra INTEGER DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        synced INTEGER DEFAULT 0
      );
    `);

    // 3. Training Days table
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS training_days (
        user_id INTEGER,
        date TEXT,
        sessions_count INTEGER DEFAULT 0,
        required_sessions INTEGER DEFAULT 2,
        completed_at TEXT,
        PRIMARY KEY (user_id, date)
      );
    `);

    // 4. Measurements table
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        seconds REAL,
        measured_at TEXT,
        synced INTEGER DEFAULT 0
      );
    `);

    // 5. Reminders table
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        weekday INTEGER,
        times TEXT, -- JSON array of strings
        is_enabled INTEGER DEFAULT 0,
        synced INTEGER DEFAULT 0,
        UNIQUE(user_id, weekday)
      );
    `);

    // 6. Subscriptions table
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        plan_id INTEGER,
        plan_slug TEXT,
        status TEXT,
        store TEXT,
        purchase_token TEXT,
        google_order_id TEXT,
        trial_ends_at TEXT,
        started_at TEXT,
        ends_at TEXT,
        canceled_at TEXT,
        auto_renewing INTEGER DEFAULT 1
      );
    `);

    // 7. Pages table (offline pages content sync)
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE,
        title TEXT,
        content TEXT,
        sort_order INTEGER DEFAULT 0,
        is_published INTEGER DEFAULT 1
      );
    `);

    // 8. Settings table (device specific app configuration)
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        type TEXT
      );
    `);
    
    // Indexes for the hot query paths: every screen filters by user_id (often
    // ordered by the time column), and the sync engine scans for synced = 0.
    // IF NOT EXISTS keeps re-runs free.
    tx.executeSql('CREATE INDEX IF NOT EXISTS idx_ws_user_completed ON workout_sessions (user_id, completed_at);');
    tx.executeSql('CREATE INDEX IF NOT EXISTS idx_ws_user_synced ON workout_sessions (user_id, synced);');
    tx.executeSql('CREATE INDEX IF NOT EXISTS idx_m_user_measured ON measurements (user_id, measured_at);');
    tx.executeSql('CREATE INDEX IF NOT EXISTS idx_m_user_synced ON measurements (user_id, synced);');
    tx.executeSql('CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions (user_id);');
    tx.executeSql('CREATE INDEX IF NOT EXISTS idx_sub_token ON subscriptions (purchase_token);');

    // Seed default settings if empty
    tx.executeSql(`
      INSERT OR IGNORE INTO app_settings (key, value, type) VALUES 
      ('circle_glow_enabled', '1', 'bool'),
      ('circle_size', '300', 'int'),
      ('circle_track_width', '16', 'int'),
      ('haptics_enabled', '1', 'bool'),
      ('circle_animation_speed', '0.12', 'float'),
      ('circle_glow_speed', '0.45', 'float'),
      ('circle_time_scale', '0.7', 'float'),
      ('onboarding_enabled', '1', 'bool');
    `);
  });
};
