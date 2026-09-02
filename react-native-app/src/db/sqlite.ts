import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

export const getDBConnection = async () => {
  return SQLite.openDatabase({
    name: 'kegelee.db',
    location: 'default',
  });
};

/**
 * Add a column to a table that already exists, once.
 *
 * This app had no local migration path at all: initDB only ran CREATE TABLE IF
 * NOT EXISTS, so a table already on disk was left exactly as it was and any
 * new column silently never appeared. A schema change would work on a fresh
 * install and quietly not on a real phone, which is the worst shape a bug can
 * take - it passes every test you would think to write.
 *
 * PRAGMA table_info is the check because SQLite has no ADD COLUMN IF NOT
 * EXISTS. Best effort throughout: failing to add a column must never stop the
 * database opening, and a row without the key still syncs, it just falls back
 * to the server's older matching.
 */
const ensureColumn = async (
  db: any,
  table: string,
  column: string,
  definition: string,
): Promise<void> => {
  try {
    const [res] = await db.executeSql(`PRAGMA table_info(${table})`);
    for (let i = 0; i < res.rows.length; i++) {
      if (res.rows.item(i).name === column) return;
    }
    await db.executeSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch {
    // See above.
  }
};

/**
 * Schema changes an install that already has the tables still needs.
 *
 * Ordered, append-only, and applied by index: `migrations[0]` takes the
 * database from user_version 0 to 1, `migrations[1]` from 1 to 2, and so on.
 * PRAGMA user_version is stored inside the database file itself, so it
 * survives upgrades and tells us exactly which of these have already run.
 *
 * This list exists because the ad-hoc alternative failed in production. A
 * `locale` column was added to the `pages` CREATE TABLE and nowhere else, so
 * fresh installs had it and every upgraded phone did not - and the sync threw
 * on the first page it tried to write, silently, forever. A forgotten column
 * has to be a structural error (a migration that is not in the list) rather
 * than a line somebody remembered to add.
 *
 * Every step must be idempotent and safe to re-run: a step that throws leaves
 * user_version where it was, so the next launch tries it again.
 */
const migrations: Array<(db: any) => Promise<void>> = [
  // 0 -> 1: the client ids that make a retried push idempotent.
  async (db) => {
    await ensureColumn(db, 'workout_sessions', 'client_id', 'TEXT');
    await ensureColumn(db, 'measurements', 'client_id', 'TEXT');
  },

  // 1 -> 2: columns added to CREATE TABLE bodies after those tables shipped.
  async (db) => {
    // The one that broke sync on every upgraded install.
    await ensureColumn(db, 'pages', 'locale', 'TEXT');
    await ensureColumn(db, 'subscriptions', 'grace_period_ends_at', 'TEXT');
    await ensureColumn(db, 'subscriptions', 'revenuecat_app_user_id', 'TEXT');
    await ensureColumn(db, 'subscriptions', 'store_product_id', 'TEXT');
    await ensureColumn(db, 'user_events', 'detail', 'TEXT');
  },

  // 2 -> 3: one subscription row per (user, purchase token).
  //
  // saveSubscription used to match on purchase_token alone and insert whenever
  // the probe missed, so a token could end up on several rows - and
  // getActiveSubscription would then read whichever the ordering happened to
  // surface. The index makes that impossible, but only once the duplicates it
  // would reject are gone: keep the HIGHEST id per pair, which is the most
  // recently written state of that purchase.
  async (db) => {
    await db.executeSql(
      `DELETE FROM subscriptions
       WHERE purchase_token IS NOT NULL
         AND id NOT IN (
           SELECT MAX(id) FROM subscriptions
           WHERE purchase_token IS NOT NULL
           GROUP BY user_id, purchase_token
         )`,
    );
    await db.executeSql(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_user_token ON subscriptions (user_id, purchase_token);',
    );
  },
];

const readUserVersion = async (db: any): Promise<number> => {
  try {
    const [res] = await db.executeSql('PRAGMA user_version');
    const row = res.rows.length > 0 ? res.rows.item(0) : null;
    const v = Number(row?.user_version);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
};

/**
 * Apply every migration above the version recorded in the file.
 *
 * Deliberately NOT best-effort as a whole: if a step throws, the version is
 * not advanced and the loop stops, so the next launch retries from the same
 * point instead of skipping past a change the rest of the app assumes landed.
 * initDB's caller already catches, so a broken step degrades to "the app
 * starts on the old schema" rather than "the app does not start".
 */
const runMigrations = async (db: any): Promise<void> => {
  const current = await readUserVersion(db);
  for (let v = current; v < migrations.length; v++) {
    await migrations[v](db);
    // Not a bindable parameter: SQLite does not accept one in a PRAGMA, and
    // the value is a loop counter rather than anything user supplied.
    await db.executeSql(`PRAGMA user_version = ${v + 1}`);
  }
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
        client_id TEXT,
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
        client_id TEXT,
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
        auto_renewing INTEGER DEFAULT 1,
        -- Play is retrying a failed charge and the customer is still entitled
        -- until this date, even though ends_at has already passed.
        grace_period_ends_at TEXT,
        -- Who the purchase belongs to at RevenueCat, and which store product
        -- was actually bought. Both are pushed back to the backend so it can
        -- verify the receipt against the right customer and SKU.
        revenuecat_app_user_id TEXT,
        store_product_id TEXT
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
        is_published INTEGER DEFAULT 1,
        -- Which language the cached copy is in. slug is UNIQUE, so there is
        -- only ever one row per page and it has to say what it holds.
        locale TEXT
      );
    `);

    /**
     * Behaviour events, queued for the next sync.
     *
     * An outbox like the others: written locally the moment something happens,
     * drained when there is a connection. `client_id` is what makes a retried
     * push idempotent on the server, so it is generated here and never
     * regenerated.
     */
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS user_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT UNIQUE,
        user_id INTEGER,
        name TEXT,
        subject TEXT,
        meta TEXT,
        -- One short free-text line about the event, kept out of the meta
        -- blob so it can be read without parsing JSON.
        detail TEXT,
        occurred_at TEXT,
        synced INTEGER DEFAULT 0
      );
    `);
    tx.executeSql(
      'CREATE INDEX IF NOT EXISTS idx_events_pending ON user_events (user_id, synced);'
    );

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
      -- Off. A phone that starts buzzing during a session nobody asked
      -- it to buzz in is a thing people turn off by uninstalling, and
      -- the cue is only useful once you already know what it means.
      ('haptics_enabled', '0', 'bool'),
      ('circle_animation_speed', '0.12', 'float'),
      ('circle_glow_speed', '0.45', 'float'),
      ('circle_time_scale', '0.7', 'float'),
      ('onboarding_enabled', '1', 'bool');
    `);

    /**
     * One-time correction for installs that predate the default flip.
     *
     * INSERT OR IGNORE above only seeds a key that is missing, so every device
     * that already had `haptics_enabled` kept the old '1'. Those users never
     * chose it - it was the default, and for most of the app's life nothing
     * even read it - so leaving it on would mean "off by default" was true
     * only for people installing fresh.
     *
     * Guarded by its own key so it runs exactly once: anybody who turns
     * haptics back on afterwards keeps it on through every later launch.
     */
    tx.executeSql(`
      UPDATE app_settings SET value = '0'
      WHERE key = 'haptics_enabled'
        AND NOT EXISTS (
          SELECT 1 FROM app_settings WHERE key = 'haptics_default_off_applied'
        );
    `);
    tx.executeSql(`
      INSERT OR IGNORE INTO app_settings (key, value, type)
      VALUES ('haptics_default_off_applied', '1', 'bool');
    `);
  });

  await runMigrations(db);
};
