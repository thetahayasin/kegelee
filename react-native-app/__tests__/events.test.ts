/**
 * @format
 *
 * The behaviour outbox, against a fake database.
 *
 * The questions here are the ones a wrong answer to would corrupt every report
 * built on top: does a guest's first run get written at all, does signing up
 * move exactly those rows and nothing else, can a push ever pick a guest row
 * up, and does one sitting count as one app open. Plus the rule the whole
 * module is written around - instrumentation must never throw at its caller.
 */

type Exec = { sql: string; params: any[] };

// See queries.test.ts for why these are `var` and prefixed with "mock":
// jest.mock is hoisted above the imports, so its factory can only close over a
// name that already exists and that babel-plugin-jest-hoist allows out of
// scope.
var mockExecuted: Exec[] = [];
var mockRespond: (sql: string, params: any[]) => any[] = () => [];
var mockFail = false;

/**
 * AsyncStorage backed by a Map that OUTLIVES jest.resetModules().
 *
 * The shared mock in jest.setup.js builds its store inside the factory, so
 * re-requiring it hands back an empty one - which is the opposite of what the
 * cold-start test needs: a relaunched app keeps its storage and loses only its
 * module state, and that difference is the whole point of persisting the last
 * open.
 */
var mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (mockStore.has(k) ? mockStore.get(k) : null),
    setItem: async (k: string, v: string) => {
      mockStore.set(k, String(v));
    },
    removeItem: async (k: string) => {
      mockStore.delete(k);
    },
  },
}));

jest.mock('../src/db/sqlite', () => ({
  getDBConnection: jest.fn(async () => {
    if (mockFail) throw new Error('database is locked');
    return {
      executeSql: async (sql: string, params: any[] = []) => {
        mockExecuted.push({ sql, params });
        const rows = mockRespond(sql, params);
        return [{ rows: { length: rows.length, item: (i: number) => rows[i] } }];
      },
    };
  }),
}));

import { GUEST_USER_ID } from '../src/services/events';

/**
 * A fresh copy of the module for every test.
 *
 * The 30-minute throttle keeps its most recent value in module state on
 * purpose, so tests that share one module instance would leak an app_opened
 * from one case into the next - and the first one to run would be the only one
 * that could ever record an open.
 */
let events: typeof import('../src/services/events');

const inserts = () => mockExecuted.filter((e) => e.sql.includes('INSERT INTO user_events'));
const sqlOf = (needle: string) =>
  mockExecuted.filter((e) => e.sql.replace(/\s+/g, ' ').includes(needle));

/** The columns the INSERT lists, in order, so params can be read by name. */
const insertedRow = (e: Exec) => {
  const cols = e.sql
    .slice(e.sql.indexOf('(') + 1, e.sql.indexOf(')'))
    .split(',')
    .map((c) => c.trim());
  const row: Record<string, any> = {};
  cols.forEach((c, i) => {
    row[c] = e.params[i];
  });
  return row;
};

beforeEach(() => {
  mockExecuted.length = 0;
  mockRespond = () => [];
  mockFail = false;
  mockStore.clear();
  jest.resetModules();
  events = require('../src/services/events');
});

describe('guest attribution', () => {
  it('writes a row for a signed-out reader instead of dropping it', async () => {
    await events.track(null, 'quiz_completed', null, null, { level: 3 });

    expect(inserts()).toHaveLength(1);
    expect(insertedRow(inserts()[0]).user_id).toBe(GUEST_USER_ID);
  });

  it('files a signed-in reader under their own id', async () => {
    await events.track(42, 'quiz_completed');

    expect(insertedRow(inserts()[0]).user_id).toBe(42);
  });

  it('claims only the guest rows, never another account\'s', async () => {
    await events.claimGuestEvents(7);

    const [update] = sqlOf('UPDATE user_events SET user_id = ? WHERE user_id = ?');
    expect(update).toBeDefined();
    expect(update.params).toEqual([7, GUEST_USER_ID]);
  });

  it('deletes guest rows by the guest id alone', async () => {
    await events.deleteGuestEvents();

    const [del] = sqlOf('DELETE FROM user_events WHERE user_id = ?');
    expect(del.params).toEqual([GUEST_USER_ID]);
  });

  it('never asks for guest rows when draining the queue', async () => {
    await events.getUnsyncedEvents(9);

    const [select] = sqlOf('SELECT id, client_id, name, subject, detail');
    expect(select.sql).toContain('WHERE user_id = ? AND synced = 0');
    expect(select.params).toEqual([9]);
  });
});

describe('the detail column', () => {
  it('is written between subject and meta', async () => {
    await events.track(1, 'workout_abandoned', 'daily', 'p25', { step_index: 2 });

    const row = insertedRow(inserts()[0]);
    expect(row.subject).toBe('daily');
    expect(row.detail).toBe('p25');
    expect(JSON.parse(row.meta)).toEqual({ step_index: 2 });
  });

  it('is null rather than undefined when the caller omits it', async () => {
    await events.track(1, 'logged_out');

    const row = insertedRow(inserts()[0]);
    expect(row.detail).toBeNull();
    expect(row.meta).toBeNull();
  });

  it('is read back by the queue, so the push can send it', async () => {
    mockRespond = (sql) =>
      sql.includes('FROM user_events')
        ? [
            {
              id: 1,
              client_id: 'c1',
              name: 'purchase_failed',
              subject: 'premium_yearly',
              detail: 'cancelled',
              meta: null,
              occurred_at: '2026-01-01T00:00:00.000Z',
            },
          ]
        : [];

    const [row] = await events.getUnsyncedEvents(1);
    expect(row.detail).toBe('cancelled');
  });
});

describe('attributing without the auth context', () => {
  it('uses the id AuthContext published', async () => {
    events.setCurrentUserId(5);
    await events.trackCurrent('error_boundary_hit', 'Training');

    const row = insertedRow(inserts()[0]);
    expect(row.user_id).toBe(5);
    expect(row.subject).toBe('Training');
  });

  it('falls back to the local user row when nothing was published', async () => {
    mockRespond = (sql) => (sql.includes('SELECT id FROM users') ? [{ id: 11 }] : []);

    await events.trackAppOpened('cold');

    expect(insertedRow(inserts()[0]).user_id).toBe(11);
  });

  it('records a tapped reminder, and only a reminder', async () => {
    await events.trackReminderTapped('reminder_3_08_00');
    await events.trackReminderTapped('nudge_lapse');
    await events.trackReminderTapped(undefined);

    expect(inserts()).toHaveLength(1);
    const row = insertedRow(inserts()[0]);
    expect(row.name).toBe('reminder_tapped');
    expect(JSON.parse(row.meta)).toEqual({ id: 'reminder_3_08_00' });
  });
});

describe('the app_opened throttle', () => {
  it('counts one open per sitting, not one per foreground', async () => {
    await events.trackAppOpened('cold');
    await events.trackAppOpened('foreground');
    await events.trackAppOpened('foreground');

    expect(inserts()).toHaveLength(1);
    expect(insertedRow(inserts()[0]).subject).toBe('cold');
  });

  it('counts again once the window has passed', async () => {
    const realNow = Date.now;
    try {
      let clock = 1_800_000_000_000;
      Date.now = () => clock;
      await events.trackAppOpened('cold');
      clock += 31 * 60 * 1000;
      await events.trackAppOpened('foreground');
    } finally {
      Date.now = realNow;
    }

    expect(inserts()).toHaveLength(2);
  });

  it('survives a cold start: the last open is remembered in storage', async () => {
    await events.trackAppOpened('cold');
    expect(inserts()).toHaveLength(1);

    // A fresh module is what a relaunched app has - the throttle's in-memory
    // half is empty and only the persisted stamp can suppress the second open.
    jest.resetModules();
    mockExecuted.length = 0;
    const relaunched: typeof events = require('../src/services/events');
    await relaunched.trackAppOpened('cold');

    expect(inserts()).toHaveLength(0);
  });

  it('does not throttle anything else', async () => {
    await events.track(1, 'lesson_started', 'why');
    await events.track(1, 'lesson_started', 'find');

    expect(inserts()).toHaveLength(2);
  });
});

describe('failure', () => {
  it('swallows a database that will not open', async () => {
    mockFail = true;

    await expect(events.track(1, 'quiz_completed')).resolves.toBeUndefined();
    await expect(events.claimGuestEvents(1)).resolves.toBeUndefined();
    await expect(events.deleteGuestEvents()).resolves.toBeUndefined();
    await expect(events.getUnsyncedEvents(1)).resolves.toEqual([]);
  });
});
