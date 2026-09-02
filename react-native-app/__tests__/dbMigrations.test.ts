/**
 * @format
 *
 * The local schema migration runner.
 *
 * This exists because of a real, silent production failure: `locale` was added
 * to the `pages` CREATE TABLE and to nothing else, so a fresh install had the
 * column and every upgraded phone did not. CREATE TABLE IF NOT EXISTS does
 * nothing to a table that is already there, savePage's INSERT failed on an
 * unknown column, and the exception took the whole sync down with it - which
 * meant subscriptions never landed either. Nobody found out from a crash
 * report, because it was caught.
 *
 * The fake database below reports which columns each table has, so the tests
 * can ask the question that matters: given a phone whose schema predates a
 * change, does opening the database actually add the column.
 */

type Exec = { sql: string; params: any[] };

// See queries.test.ts for why these are `var` and prefixed with "mock".
var mockExecuted: Exec[] = [];
var mockColumns: Record<string, string[]> = {};
var mockUserVersion = 0;

jest.mock('react-native-sqlite-storage', () => ({
  enablePromise: jest.fn(),
  openDatabase: jest.fn(async () => ({
    executeSql: async (sql: string, params: any[] = []) => {
      mockExecuted.push({ sql, params });

      const info = sql.match(/PRAGMA table_info\((\w+)\)/);
      if (info) {
        const cols = (mockColumns[info[1]] || []).map((name) => ({ name }));
        return [{ rows: { length: cols.length, item: (i: number) => cols[i] } }];
      }

      const setVersion = sql.match(/PRAGMA user_version\s*=\s*(\d+)/);
      if (setVersion) {
        mockUserVersion = Number(setVersion[1]);
        return [{ rows: { length: 0, item: () => undefined } }];
      }

      if (sql.trim() === 'PRAGMA user_version') {
        const row = { user_version: mockUserVersion };
        return [{ rows: { length: 1, item: () => row } }];
      }

      const alter = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
      if (alter) {
        mockColumns[alter[1]] = [...(mockColumns[alter[1]] || []), alter[2]];
      }

      return [{ rows: { length: 0, item: () => undefined } }];
    },
    transaction: async (cb: (tx: any) => void) => {
      cb({
        executeSql: (sql: string, params: any[] = []) => {
          mockExecuted.push({ sql, params });
        },
      });
    },
  })),
}));

import { initDB } from '../src/db/sqlite';

/** A database as it stood before any of the migrated columns were added. */
const legacySchema = () => ({
  users: ['id', 'name', 'email'],
  workout_sessions: ['id', 'user_id', 'completed_at'],
  measurements: ['id', 'user_id', 'measured_at'],
  reminders: ['id', 'user_id', 'weekday'],
  subscriptions: ['id', 'user_id', 'status', 'ends_at', 'purchase_token'],
  pages: ['id', 'slug', 'title', 'content'],
  user_events: ['id', 'user_id', 'name'],
  app_settings: ['key', 'value', 'type'],
});

beforeEach(() => {
  mockExecuted = [];
  mockColumns = legacySchema();
  mockUserVersion = 0;
});

const alteredColumns = () =>
  mockExecuted
    .map((e) => e.sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => `${m[1]}.${m[2]}`);

describe('initDB migrations', () => {
  it('adds pages.locale to a database that predates it', async () => {
    await initDB();
    expect(alteredColumns()).toContain('pages.locale');
    expect(mockColumns.pages).toContain('locale');
  });

  it('adds every column a later release started writing', async () => {
    await initDB();
    const added = alteredColumns();
    expect(added).toEqual(
      expect.arrayContaining([
        'workout_sessions.client_id',
        'measurements.client_id',
        'pages.locale',
        'subscriptions.grace_period_ends_at',
        'subscriptions.revenuecat_app_user_id',
        'subscriptions.store_product_id',
        'user_events.detail',
      ]),
    );
  });

  it('records the schema version so a second launch does no work', async () => {
    await initDB();
    const reached = mockUserVersion;
    expect(reached).toBeGreaterThan(0);

    mockExecuted = [];
    await initDB();
    expect(alteredColumns()).toEqual([]);
    expect(mockUserVersion).toBe(reached);
  });

  it('collapses duplicate subscription rows before claiming the unique index', async () => {
    await initDB();
    const statements = mockExecuted.map((e) => e.sql.replace(/\s+/g, ' ').trim());
    const dedupeAt = statements.findIndex((s) => s.startsWith('DELETE FROM subscriptions'));
    const indexAt = statements.findIndex((s) => s.includes('idx_sub_user_token'));
    expect(dedupeAt).toBeGreaterThanOrEqual(0);
    expect(indexAt).toBeGreaterThan(dedupeAt);
    // Keeping the HIGHEST id is deliberate: it is the most recently written
    // state of that purchase.
    expect(statements[dedupeAt]).toContain('MAX(id)');
  });

  it('leaves the version alone when a step fails, so the next launch retries', async () => {
    // A column that cannot be added must not be recorded as if it had been.
    // ensureColumn swallows its own failure by design, so the failure is
    // injected at the dedupe step instead, which does not.
    const sqlite = require('react-native-sqlite-storage');
    const original = sqlite.openDatabase;
    sqlite.openDatabase = async () => {
      const db = await original();
      const inner = db.executeSql;
      db.executeSql = async (sql: string, params: any[] = []) => {
        if (sql.includes('DELETE FROM subscriptions')) {
          throw new Error('disk I/O error');
        }
        return inner(sql, params);
      };
      return db;
    };

    await expect(initDB()).rejects.toThrow('disk I/O error');
    // The two steps before it stuck; the failing one did not.
    expect(mockUserVersion).toBe(2);
    expect(mockColumns.pages).toContain('locale');

    sqlite.openDatabase = original;
  });
});
