/**
 * @format
 *
 * The SQLite layer, against a fake connection.
 *
 * There is no sqlite binding available under Jest (react-native-sqlite-storage
 * is a native module and better-sqlite3 is not a dependency), so these tests
 * assert on the STATEMENTS the layer produces rather than on the rows a real
 * database would return. That is the right level for most of what changed
 * here: "is this UPDATE scoped to one user", "does this INSERT use ON
 * CONFLICT", "is undefined stripped before it becomes a NULL". The one thing
 * that is genuinely logic rather than SQL - which subscription rows still
 * grant access - is exercised by feeding rows back through the fake.
 */

type Exec = { sql: string; params: any[] };

/**
 * `var`, and names beginning with `mock`, are both required.
 *
 * jest.mock is hoisted above the imports, so anything its factory closes over
 * must already exist when the module under test is required - which rules out
 * `const` (temporal dead zone) - and babel-plugin-jest-hoist only permits an
 * out-of-scope reference whose name starts with "mock".
 */
var mockExecuted: Exec[] = [];
var mockRespond: (sql: string, params: any[]) => any[] = () => [];

jest.mock('../src/db/sqlite', () => ({
  getDBConnection: jest.fn(async () => ({
    executeSql: async (sql: string, params: any[] = []) => {
      mockExecuted.push({ sql, params });
      const rows = mockRespond(sql, params);
      return [{ rows: { length: rows.length, item: (i: number) => rows[i] } }];
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

import {
  clearProgressData,
  clearUserData,
  getActiveSubscription,
  subscriptionEntitlementEndsAt,
  getSubscriptionByToken,
  markRemindersSynced,
  saveDBUser,
  saveSubscription,
} from '../src/db/queries';

const sqlOf = (needle: string) => mockExecuted.filter((e) => e.sql.includes(needle));
const flat = () => mockExecuted.map((e) => e.sql.replace(/\s+/g, ' ').trim());

beforeEach(() => {
  mockExecuted.length = 0;
  mockRespond = () => [];
});

describe('saveSubscription', () => {
  it('writes the row against the user it was given, not the payload', async () => {
    await saveSubscription(7, {
      purchase_token: 'tok-1',
      plan_slug: 'monthly',
      status: 'active',
      // A payload that tries to name a different account must not be able to.
      user_id: 99,
      id: 123,
    } as any);

    const [stmt] = sqlOf('INSERT INTO subscriptions');
    expect(stmt).toBeDefined();
    expect(stmt.params[0]).toBe(7);
    expect(stmt.params).not.toContain(99);
    expect(stmt.sql).not.toContain('id = ');
  });

  it('upserts on (user_id, purchase_token) instead of read-then-write', async () => {
    await saveSubscription(1, { purchase_token: 'tok-1', status: 'active' });
    const [stmt] = sqlOf('INSERT INTO subscriptions');
    expect(stmt.sql).toContain('ON CONFLICT(user_id, purchase_token) DO UPDATE SET');
    expect(stmt.sql).toContain('status = excluded.status');
    // The conflict key itself is not re-assigned.
    expect(stmt.sql).not.toContain('purchase_token = excluded.purchase_token');
  });

  it('normalises every date it stores to one ISO spelling', async () => {
    await saveSubscription(1, {
      purchase_token: 'tok-1',
      // Laravel microseconds, a UTC offset, and a plain Z - the three formats
      // the three writers of this table actually produce.
      ends_at: '2030-01-01T00:00:00+00:00',
      trial_ends_at: '2030-01-02T00:00:00.000000Z',
      grace_period_ends_at: '2030-01-03T00:00:00Z',
    });
    const [stmt] = sqlOf('INSERT INTO subscriptions');
    expect(stmt.params).toContain('2030-01-01T00:00:00.000Z');
    expect(stmt.params).toContain('2030-01-02T00:00:00.000Z');
    expect(stmt.params).toContain('2030-01-03T00:00:00.000Z');
  });

  it('matches a token-less row on (user, plan, start) rather than inserting again', async () => {
    mockRespond = (sql) => (sql.includes('purchase_token IS NULL') ? [{ id: 42 }] : []);
    await saveSubscription(3, {
      purchase_token: null,
      plan_slug: 'granted',
      started_at: '2030-01-01T00:00:00.000Z',
      status: 'active',
    });
    expect(sqlOf('INSERT INTO subscriptions')).toHaveLength(0);
    const [update] = sqlOf('UPDATE subscriptions SET');
    expect(update.sql).toContain('WHERE id = ?');
    expect(update.params[update.params.length - 1]).toBe(42);
  });

  it('still writes the row when the unique index is missing', async () => {
    // A device whose migration could not create idx_sub_user_token rejects the
    // ON CONFLICT statement outright. Losing a purchase row there would be far
    // worse than the race the upsert exists to close.
    mockRespond = (sql) => {
      if (sql.includes('ON CONFLICT')) {
        throw new Error('ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint');
      }
      return sql.includes('SELECT id FROM subscriptions') ? [{ id: 77 }] : [];
    };

    await saveSubscription(1, { purchase_token: 'tok-1', status: 'canceled' });

    const [update] = sqlOf('UPDATE subscriptions SET');
    expect(update.sql).toContain('WHERE id = ?');
    expect(update.params).toEqual(['tok-1', 'canceled', 77]);
  });

  it('ignores undefined fields instead of nulling the column', async () => {
    await saveSubscription(1, {
      purchase_token: 'tok-1',
      status: 'active',
      canceled_at: undefined,
    });
    const [stmt] = sqlOf('INSERT INTO subscriptions');
    expect(stmt.sql).not.toContain('canceled_at');
  });
});

describe('getSubscriptionByToken', () => {
  it('scopes to the user when one is given', async () => {
    await getSubscriptionByToken('tok-1', 5);
    const [stmt] = sqlOf('FROM subscriptions WHERE purchase_token');
    expect(stmt.sql).toContain('AND user_id = ?');
    expect(stmt.params).toEqual(['tok-1', 5]);
  });
});

describe('getActiveSubscription', () => {
  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  const withRows = (rows: any[]) => {
    mockRespond = (sql) => (sql.includes('FROM subscriptions') ? rows : []);
  };

  const row = (over: Partial<Record<string, any>>) => ({
    id: 1,
    user_id: 1,
    plan_id: null,
    plan_slug: 'monthly',
    status: 'active',
    store: 'revenuecat',
    purchase_token: 'tok',
    google_order_id: null,
    trial_ends_at: null,
    started_at: iso(-DAY),
    ends_at: iso(DAY),
    grace_period_ends_at: null,
    canceled_at: null,
    auto_renewing: 1,
    ...over,
  });

  it('reads the user rows and decides in JS, not in a TEXT comparison', async () => {
    withRows([row({})]);
    await getActiveSubscription(1);
    const [stmt] = sqlOf('FROM subscriptions');
    expect(stmt.sql).toBe('SELECT * FROM subscriptions WHERE user_id = ?');
  });

  it('compares dates by instant, not alphabetically', async () => {
    // '+00:00' sorts BEFORE '2030...' as text, so the old SQL `ends_at > ?`
    // said this future subscription had already expired.
    withRows([row({ ends_at: '2030-01-01T00:00:00+00:00' })]);
    expect(await getActiveSubscription(1)).not.toBeNull();
  });

  it('keeps a past_due row while its grace period runs', async () => {
    withRows([
      row({ status: 'past_due', ends_at: iso(-2 * DAY), grace_period_ends_at: iso(3 * DAY) }),
    ]);
    expect(await getActiveSubscription(1)).not.toBeNull();
  });

  it('drops a past_due row once its grace period has passed', async () => {
    withRows([
      row({ status: 'past_due', ends_at: iso(-40 * DAY), grace_period_ends_at: iso(-DAY) }),
    ]);
    expect(await getActiveSubscription(1)).toBeNull();
  });

  it('falls back to Play\'s 30 days when no grace date was sent', async () => {
    withRows([row({ status: 'past_due', ends_at: iso(-10 * DAY), grace_period_ends_at: null })]);
    expect(await getActiveSubscription(1)).not.toBeNull();

    mockExecuted.length = 0;
    withRows([row({ status: 'past_due', ends_at: iso(-40 * DAY), grace_period_ends_at: null })]);
    expect(await getActiveSubscription(1)).toBeNull();
  });

  it('does not entitle paused or on_hold', async () => {
    for (const status of ['paused', 'on_hold']) {
      mockExecuted.length = 0;
      withRows([row({ status, ends_at: iso(30 * DAY) })]);
      expect(await getActiveSubscription(1)).toBeNull();
    }
  });

  it('keeps an auto-renewing row through the renewal-reporting lag', async () => {
    withRows([row({ ends_at: iso(-60 * 60 * 1000), auto_renewing: 1 })]);
    expect(await getActiveSubscription(1)).not.toBeNull();

    mockExecuted.length = 0;
    withRows([row({ ends_at: iso(-60 * 60 * 1000), auto_renewing: 0 })]);
    expect(await getActiveSubscription(1)).toBeNull();
  });

  it('prefers the row that runs longest, not the one written last', async () => {
    withRows([
      row({ id: 9, plan_slug: 'monthly', ends_at: iso(2 * DAY) }),
      row({ id: 2, plan_slug: 'yearly', ends_at: iso(300 * DAY) }),
    ]);
    const active = await getActiveSubscription(1);
    expect(active?.plan_slug).toBe('yearly');
  });
});

/**
 * The boundary of the entitlement rule, as opposed to the rule itself.
 *
 * `subscriptionEntitles` answers "is this row entitling right now", which is
 * enough to decide what to render and not enough to decide anything about the
 * future. Two things need the future: the timer that closes the gate while the
 * app sits open, and the reminder schedule, which hands notifications to
 * Android days in advance and therefore has to know how far ahead it may
 * promise anything at all.
 *
 * Pinned against getActiveSubscription rather than on its own, because the two
 * are the same rule read at two different times and the whole risk is drift
 * between them.
 */
describe('subscriptionEntitlementEndsAt', () => {
  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  const row = (over: Partial<Record<string, any>>) => ({
    id: 1,
    user_id: 1,
    plan_id: null,
    plan_slug: 'monthly',
    status: 'active',
    store: 'revenuecat',
    purchase_token: 'tok',
    google_order_id: null,
    trial_ends_at: null,
    started_at: iso(-DAY),
    ends_at: iso(DAY),
    grace_period_ends_at: null,
    canceled_at: null,
    auto_renewing: 1,
    ...over,
  }) as any;

  it('reports no deadline for an open-ended entitlement', () => {
    expect(subscriptionEntitlementEndsAt(row({ ends_at: null }))).toBeNull();
  });

  it('ends a non-renewing period exactly at its date', () => {
    const endsAt = iso(5 * DAY);
    expect(subscriptionEntitlementEndsAt(row({ ends_at: endsAt, auto_renewing: 0 })))
      .toBe(Date.parse(endsAt));
  });

  it('carries the renewal-reporting lag for an auto-renewing row', () => {
    // getActiveSubscription keeps such a row alive for a day past its expiry,
    // so its boundary is the far end of that window - not `ends_at` itself.
    const endsAt = iso(5 * DAY);
    expect(subscriptionEntitlementEndsAt(row({ ends_at: endsAt, auto_renewing: 1 })))
      .toBeGreaterThan(Date.parse(endsAt));
  });

  it('ends a cancelled row at the date it is paid up to', () => {
    const endsAt = iso(5 * DAY);
    const deadline = subscriptionEntitlementEndsAt(
      row({ status: 'canceled', ends_at: endsAt, auto_renewing: 0 }),
    );
    // No renewal is coming, so no lag allowance either.
    expect(deadline).toBe(Date.parse(endsAt));
  });

  it("ends a past_due row at Play's grace period", () => {
    const graceEnds = iso(3 * DAY);
    expect(
      subscriptionEntitlementEndsAt(
        row({ status: 'past_due', ends_at: iso(-2 * DAY), grace_period_ends_at: graceEnds }),
      ),
    ).toBe(Date.parse(graceEnds));
  });

  it('gives a status that never entitles a deadline in the past', () => {
    // 0, not null: null means "no deadline", and a caller arming a timer off
    // it would wait forever for a row that grants nothing.
    for (const status of ['paused', 'on_hold', 'expired']) {
      expect(subscriptionEntitlementEndsAt(row({ status, ends_at: iso(30 * DAY) }))).toBe(0);
    }
  });

  it('agrees with getActiveSubscription about where the line is', async () => {
    // The property that matters: entitling now implies a deadline in the
    // future, and vice versa. Checked across every shape above.
    const shapes = [
      row({}),
      row({ auto_renewing: 0, ends_at: iso(-DAY) }),
      row({ status: 'canceled', ends_at: iso(2 * DAY) }),
      row({ status: 'canceled', ends_at: iso(-2 * DAY) }),
      row({ status: 'past_due', ends_at: iso(-2 * DAY), grace_period_ends_at: iso(DAY) }),
      row({ status: 'past_due', ends_at: iso(-2 * DAY), grace_period_ends_at: iso(-DAY) }),
      row({ status: 'paused' }),
    ];

    for (const shape of shapes) {
      mockExecuted.length = 0;
      mockRespond = (sql) => (sql.includes('FROM subscriptions') ? [shape] : []);
      const entitledNow = (await getActiveSubscription(1)) !== null;
      const deadline = subscriptionEntitlementEndsAt(shape);
      expect(entitledNow).toBe(deadline === null || deadline > Date.now());
    }
  });
});

describe('markRemindersSynced', () => {
  it('marks the exact rows that were pushed', async () => {
    await markRemindersSynced([3, 4]);
    const [stmt] = sqlOf('UPDATE reminders SET synced');
    expect(stmt.sql).toContain('WHERE id IN (?, ?)');
    expect(stmt.sql).not.toContain('weekday');
    expect(stmt.params).toEqual([3, 4]);
  });

  it('does nothing at all for an empty list', async () => {
    await markRemindersSynced([]);
    expect(mockExecuted).toHaveLength(0);
  });
});

describe('saveDBUser', () => {
  it('leaves out fields the caller did not set', async () => {
    mockRespond = (sql) => (sql.includes('FROM users') ? [{ id: 1 }] : []);
    await saveDBUser({ level_id: 3, timezone: undefined });
    const [stmt] = sqlOf('UPDATE users SET');
    expect(stmt.sql).toContain('level_id = ?');
    expect(stmt.sql).not.toContain('timezone');
    expect(stmt.params).toEqual([3, 1]);
  });

  it('still writes an explicit null, which is a real instruction', async () => {
    mockRespond = (sql) => (sql.includes('FROM users') ? [{ id: 1 }] : []);
    await saveDBUser({ onboarded_at: null });
    const [stmt] = sqlOf('UPDATE users SET');
    expect(stmt.sql).toContain('onboarded_at = ?');
    expect(stmt.params).toEqual([null, 1]);
  });
});

describe('clearUserData', () => {
  it('deletes only the given account, in every user-scoped table', async () => {
    await clearUserData(8);
    const statements = flat();
    for (const table of [
      'workout_sessions',
      'training_days',
      'measurements',
      'reminders',
      'subscriptions',
      'user_events',
    ]) {
      expect(statements).toContain(`DELETE FROM ${table} WHERE user_id = ?`);
    }
    expect(statements).toContain('DELETE FROM users WHERE id = ?');
    // The bug this replaces: an unscoped truncate of somebody else's rows.
    expect(statements).not.toContain('DELETE FROM subscriptions');
    expect(mockExecuted.every((e) => e.params[0] === 8)).toBe(true);
  });

  it('resolves the signed-in user when no id is passed', async () => {
    mockRespond = (sql) => (sql.includes('FROM users') ? [{ id: 4 }] : []);
    await clearUserData();
    expect(sqlOf('DELETE FROM user_events')[0].params).toEqual([4]);
  });

  it('does nothing when there is no user row to clear', async () => {
    mockRespond = () => [];
    await clearUserData();
    expect(sqlOf('DELETE')).toHaveLength(0);
  });
});

describe('clearProgressData', () => {
  it('erases the training record and nothing else', async () => {
    await clearProgressData(2);
    const statements = flat();
    expect(statements).toEqual([
      'DELETE FROM workout_sessions WHERE user_id = ?',
      'DELETE FROM training_days WHERE user_id = ?',
      'DELETE FROM measurements WHERE user_id = ?',
      'DELETE FROM user_events WHERE user_id = ?',
    ]);
    // The account, what they pay for, and their reminder schedule survive.
    expect(statements.join(' ')).not.toContain('subscriptions');
    expect(statements.join(' ')).not.toContain('reminders');
    expect(statements.join(' ')).not.toContain('FROM users');
  });
});
