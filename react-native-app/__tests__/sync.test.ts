/**
 * @format
 *
 * The sync engine, with the database and the network both faked.
 *
 * Everything sync.ts does is orchestration - what it sends, what it marks, and
 * crucially what it keeps doing after one part fails - so the queries layer
 * and the api layer are replaced wholesale and the assertions are about the
 * calls that were made.
 */

jest.mock('../src/services/api', () => ({
  api: {
    pushState: jest.fn(),
    pullState: jest.fn(),
    pullContent: jest.fn(),
  },
}));

jest.mock('../src/db/queries', () => ({
  getUnsyncedWorkoutSessions: jest.fn(async () => []),
  getUnsyncedMeasurements: jest.fn(async () => []),
  getUnsyncedReminders: jest.fn(async () => []),
  getReminders: jest.fn(async () => []),
  markWorkoutSessionsSynced: jest.fn(async () => {}),
  markMeasurementsSynced: jest.fn(async () => {}),
  markRemindersSynced: jest.fn(async () => {}),
  saveDBUser: jest.fn(async () => {}),
  getDBUser: jest.fn(async () => ({ id: 1, level_id: 2, level_started_days: 3 })),
  bulkUpsertPulledWorkoutSessions: jest.fn(async () => {}),
  bulkUpsertPulledMeasurements: jest.fn(async () => {}),
  bulkSaveTrainingDays: jest.fn(async () => {}),
  dedupeWorkoutSessions: jest.fn(async () => {}),
  dedupeMeasurements: jest.fn(async () => {}),
  saveReminder: jest.fn(async () => {}),
  saveSubscription: jest.fn(async () => {}),
  getSubscriptions: jest.fn(async () => []),
  savePage: jest.fn(async () => {}),
  saveAppSetting: jest.fn(async () => {}),
}));

jest.mock('../src/services/events', () => ({
  getUnsyncedEvents: jest.fn(async () => []),
  markEventsSynced: jest.fn(async () => {}),
}));

jest.mock('../src/services/reminders', () => ({
  scheduleReminders: jest.fn(async () => ({ scheduled: true, permission: 'granted' })),
  cancelAllReminders: jest.fn(async () => {}),
}));

jest.mock('../src/services/billing', () => ({
  purchaseRecordedAt: jest.fn(async () => null),
}));

// AuthContext only contributes a string constant, and importing it for real
// would drag React, navigation and the whole billing stack into this suite.
jest.mock('../src/context/AuthContext', () => ({
  ONBOARDING_PUSH_KEY: '@onboarding_profile_pending',
}));

jest.mock('../src/i18n', () => ({ __esModule: true, default: { language: 'en' } }));

import { Platform } from 'react-native';
import { api } from '../src/services/api';
import * as queries from '../src/db/queries';
import * as events from '../src/services/events';
import { purchaseRecordedAt } from '../src/services/billing';
import { scheduleReminders, cancelAllReminders } from '../src/services/reminders';
import { syncNow } from '../src/services/sync';
import { APP_VERSION } from '../src/constants/version';

const mockedApi = api as unknown as {
  pushState: jest.Mock;
  pullState: jest.Mock;
  pullContent: jest.Mock;
};
const q = queries as unknown as Record<string, jest.Mock>;
const ev = events as unknown as Record<string, jest.Mock>;

const DAY = 24 * 60 * 60 * 1000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

const pullPayload = (over: Record<string, any> = {}) => ({
  user: { name: 'A', email: 'a@b.c', level_id: 2, level_started_days: 3, timezone: 'UTC' },
  workout_sessions: [],
  training_days: [],
  measurements: [],
  reminders: [],
  subscriptions: [],
  completed_lessons: [],
  ...over,
});

const subRow = (over: Record<string, any> = {}) => ({
  id: 1,
  user_id: 1,
  plan_id: 1,
  plan_slug: 'monthly',
  status: 'active',
  store: 'revenuecat',
  purchase_token: 'tok-old',
  google_order_id: 'ord-1',
  trial_ends_at: null,
  started_at: iso(-90 * DAY),
  ends_at: iso(20 * DAY),
  grace_period_ends_at: null,
  canceled_at: null,
  auto_renewing: 1,
  revenuecat_app_user_id: 'rc-user',
  store_product_id: 'premium_monthly',
  ...over,
});

beforeEach(() => {
  // clearAllMocks forgets the CALLS but keeps any implementation a test set,
  // so every mock a test overrides is restored explicitly here. Without it a
  // rejection injected by one test kept firing in the next, which is both
  // noise and a way for a later assertion to pass for the wrong reason.
  jest.clearAllMocks();
  q.savePage.mockResolvedValue(undefined);
  q.bulkSaveTrainingDays.mockResolvedValue(undefined);
  q.bulkUpsertPulledWorkoutSessions.mockResolvedValue(undefined);
  q.bulkUpsertPulledMeasurements.mockResolvedValue(undefined);
  q.saveSubscription.mockResolvedValue(undefined);
  q.getDBUser.mockResolvedValue({ id: 1, level_id: 2, level_started_days: 3 });
  q.getUnsyncedWorkoutSessions.mockResolvedValue([]);
  q.getUnsyncedMeasurements.mockResolvedValue([]);
  q.getUnsyncedReminders.mockResolvedValue([]);
  q.getReminders.mockResolvedValue([]);
  q.getSubscriptions.mockResolvedValue([]);
  ev.getUnsyncedEvents.mockResolvedValue([]);
  (purchaseRecordedAt as jest.Mock).mockResolvedValue(null);
  mockedApi.pushState.mockResolvedValue({ ok: true, status: 200, data: {} });
  mockedApi.pullState.mockResolvedValue({ ok: true, status: 200, data: pullPayload() });
  mockedApi.pullContent.mockResolvedValue({ ok: true, status: 200, data: { pages: [], settings: {} } });
});

describe('reminders follow the subscription', () => {
  /**
   * The pull rescheduled reminders on every sync, and AuthContext cancels them
   * when the gate closes. So the two fought and this side won, because it runs
   * on every sync while the cancel runs once per state change: a lapsed account
   * kept being notified indefinitely by a screen it could no longer open, with
   * the app correctly showing no subscription the whole time.
   */
  it('does not put a lapsed account\'s reminders back', async () => {
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload({
        user: { name: 'A', email: 'a@b.c', level_id: 2, level_started_days: 3, timezone: 'UTC', is_subscribed: false },
      }),
    });

    await syncNow(1);

    expect(scheduleReminders).not.toHaveBeenCalled();
    expect(cancelAllReminders).toHaveBeenCalled();
  });

  it('still schedules them for a subscriber', async () => {
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload({
        user: { name: 'A', email: 'a@b.c', level_id: 2, level_started_days: 3, timezone: 'UTC', is_subscribed: true },
      }),
    });

    await syncNow(1);

    expect(scheduleReminders).toHaveBeenCalled();
    expect(cancelAllReminders).not.toHaveBeenCalled();
  });

  it('leaves a subscriber alone when the backend does not send the field', async () => {
    // An older server saying nothing must not be read as "not entitled", or it
    // would strip the reminders of every paying customer on it.
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload(),
    });

    await syncNow(1);

    expect(scheduleReminders).toHaveBeenCalled();
    expect(cancelAllReminders).not.toHaveBeenCalled();
  });
});

describe('push payload', () => {
  /**
   * The server takes ten subscriptions and used to reject the entire request
   * for an eleventh. Local rows only accumulate - a new purchase token per plan
   * change, resubscribe and restore, and nothing ever deletes one - so a device
   * eventually sent more than that on every sync. The push then 422'd, and
   * because the client returns early when the push fails, the pull never ran
   * either. Workouts stopped syncing because of an old subscription, and
   * reinstalling was the only cure.
   */
  it('never sends more subscriptions than the server will accept', async () => {
    q.getSubscriptions.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) =>
        subRow({ id: i + 1, purchase_token: `tok-${i}`, started_at: iso(-i * DAY) }),
      ),
    );

    await syncNow(1);

    const sent = mockedApi.pushState.mock.calls[0][0].subscriptions;
    expect(sent.length).toBeLessThanOrEqual(9);
  });

  it('spends that budget on the rows the server may not have', async () => {
    // plan_id is written by a pull, so a null one has never been acknowledged
    // and is the whole reason the push exists. It must not be the row that
    // gets trimmed away in favour of ten old expired ones.
    q.getSubscriptions.mockResolvedValue([
      ...Array.from({ length: 12 }, (_, i) =>
        subRow({ id: i + 1, plan_id: 1, purchase_token: `old-${i}`, started_at: iso(-100 * DAY) }),
      ),
      subRow({ id: 99, plan_id: null, purchase_token: 'brand-new', started_at: iso(-1) }),
    ]);

    await syncNow(1);

    const sent = mockedApi.pushState.mock.calls[0][0].subscriptions;
    expect(sent.map((s: any) => s.purchase_token)).toContain('brand-new');
  });

  it('sends the row\'s own RevenueCat id, product and grace date', async () => {
    q.getSubscriptions.mockResolvedValue([subRow({ grace_period_ends_at: iso(3 * DAY) })]);
    await syncNow(1);

    const sent = mockedApi.pushState.mock.calls[0][0].subscriptions[0];
    // Not String(userId): the purchase may belong to a different RevenueCat
    // customer than the local account id, and verifying it against ours fails.
    expect(sent.revenuecat_app_user_id).toBe('rc-user');
    expect(sent.store_product_id).toBe('premium_monthly');
    expect(sent.grace_period_ends_at).toBeTruthy();
  });

  it('falls back to the local id only when the row has no RevenueCat id', async () => {
    q.getSubscriptions.mockResolvedValue([subRow({ revenuecat_app_user_id: null })]);
    await syncNow(1);
    expect(mockedApi.pushState.mock.calls[0][0].subscriptions[0].revenuecat_app_user_id).toBe('1');
  });

  it('describes the install once, on the envelope', async () => {
    // Facts about the device, not about any one row - so they ride here rather
    // than being copied into the meta of every event.
    await syncNow(1);
    const device = mockedApi.pushState.mock.calls[0][0].device;
    expect(device.install_id).toEqual(expect.any(String));
    expect(device.install_id.length).toBeGreaterThan(0);
    // Whatever this bundle is running on: the RN jest preset reports iOS, and
    // pinning a literal here would fail on the platform the app actually ships
    // to without saying anything true about the payload.
    expect(device.platform).toBe(Platform.OS);
    expect(device.os_version).toEqual(expect.any(String));
    expect(device.app_version).toBe(APP_VERSION);
    expect(device.locale).toBe('en');
  });

  it('sends an event\'s detail beside its subject', async () => {
    ev.getUnsyncedEvents.mockResolvedValueOnce([
      {
        id: 1,
        client_id: 'e1',
        name: 'workout_abandoned',
        subject: 'daily',
        detail: 'p25',
        meta: '{"step_index":2}',
        occurred_at: iso(-1000),
      },
    ]).mockResolvedValue([]);

    await syncNow(1);

    const sent = mockedApi.pushState.mock.calls[0][0].events[0];
    expect(sent.subject).toBe('daily');
    expect(sent.detail).toBe('p25');
    expect(sent.meta).toEqual({ step_index: 2 });
  });
});

describe('marking pushed rows', () => {
  const reminders = [
    { id: 11, user_id: 1, weekday: 2, times: ['08:00'], is_enabled: 1 },
    { id: 12, user_id: 1, weekday: 3, times: ['09:00'], is_enabled: 1 },
  ];
  const queued = (n: number) => ({
    id: n,
    client_id: `e${n}`,
    name: 'app_opened',
    subject: 'cold',
    detail: null,
    meta: null,
    occurred_at: iso(-1000),
  });

  it('marks reminders by row id, not by weekday', async () => {
    q.getUnsyncedReminders.mockResolvedValue(reminders);
    await syncNow(1);
    expect(q.markRemindersSynced).toHaveBeenCalledWith([11, 12]);
  });

  it('marks everything when the response says nothing about what it took', async () => {
    // An older backend. Silence is not a rejection, and treating it as one
    // would make every device re-push its whole outbox on every sync forever.
    ev.getUnsyncedEvents.mockResolvedValue([queued(1), queued(2)]);
    await syncNow(1);
    expect(ev.markEventsSynced).toHaveBeenCalledWith([1, 2]);
  });

  it('marks only the rows the server acknowledged', async () => {
    ev.getUnsyncedEvents.mockResolvedValueOnce([queued(1), queued(2)]).mockResolvedValue([]);
    q.getUnsyncedReminders.mockResolvedValue(reminders);
    mockedApi.pushState.mockResolvedValue({
      ok: true,
      status: 200,
      data: { accepted: { events: ['e2'], reminders: [3] } },
    });

    await syncNow(1);

    // e1 was not acknowledged, so it stays queued for the next sync - the
    // client id is what makes re-sending it harmless.
    expect(ev.markEventsSynced).toHaveBeenCalledWith([2]);
    // Reminders are named back by WEEKDAY, not by any id: they have no client
    // id and upsert on (user, weekday), so the weekday is their natural key.
    // Weekday 3 is the row with local id 12; weekday 2 was not acknowledged.
    expect(q.markRemindersSynced).toHaveBeenCalledWith([12]);
  });

  it('leaves a reminder the server did not name for the next sync', async () => {
    // The whole set unacknowledged, which is what an empty list means. Nothing
    // is marked, and the upsert on (user, weekday) makes the repeat push free.
    q.getUnsyncedReminders.mockResolvedValue(reminders);
    mockedApi.pushState.mockResolvedValue({
      ok: true,
      status: 200,
      data: { accepted: { reminders: [] } },
    });

    await syncNow(1);

    expect(q.markRemindersSynced).toHaveBeenCalledWith([]);
  });

  it('falls back per collection, not per response', async () => {
    // `events` is acknowledged, `reminders` is not mentioned at all. The
    // unmentioned one keeps the old all-or-nothing behaviour.
    ev.getUnsyncedEvents.mockResolvedValueOnce([queued(1)]).mockResolvedValue([]);
    q.getUnsyncedReminders.mockResolvedValue(reminders);
    mockedApi.pushState.mockResolvedValue({
      ok: true,
      status: 200,
      data: { accepted: { events: ['e1'] } },
    });

    await syncNow(1);

    expect(ev.markEventsSynced).toHaveBeenCalledWith([1]);
    expect(q.markRemindersSynced).toHaveBeenCalledWith([11, 12]);
  });
});

describe('draining a backlog', () => {
  const session = (id: number) => ({
    id,
    user_id: 1,
    client_id: `c${id}`,
    exercise_slug: 'slow',
    level_id: 1,
    duration_seconds: 60,
    is_extra: 0,
    started_at: iso(-DAY),
    completed_at: iso(-DAY),
  });

  it('keeps pushing until the queue is empty', async () => {
    const first = Array.from({ length: 500 }, (_, i) => session(i + 1));
    const second = [session(501)];
    q.getUnsyncedWorkoutSessions
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValue([]);

    await syncNow(1);

    // The initial push plus one drain round, and nothing after the queue empties.
    expect(mockedApi.pushState).toHaveBeenCalledTimes(2);
    expect(mockedApi.pushState.mock.calls[1][0].workout_sessions).toHaveLength(1);
    expect(q.markWorkoutSessionsSynced).toHaveBeenLastCalledWith([501]);
  });

  it('stops after a bounded number of rounds even if nothing ever drains', async () => {
    q.getUnsyncedWorkoutSessions.mockResolvedValue([session(1)]);
    await syncNow(1);
    // One initial push plus at most four drain rounds.
    expect(mockedApi.pushState).toHaveBeenCalledTimes(5);
  });
});

describe('applying the pull', () => {
  it('stores the server\'s onboarded_at verbatim', async () => {
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload({
        user: {
          name: 'A',
          email: 'a@b.c',
          level_id: 2,
          level_started_days: 3,
          timezone: 'UTC',
          onboarded: true,
          onboarded_at: '2024-03-01T10:00:00.000Z',
        },
      }),
    });
    await syncNow(1);
    expect(q.saveDBUser).toHaveBeenCalledWith(
      expect.objectContaining({ onboarded_at: '2024-03-01T10:00:00.000Z' }),
    );
  });

  it('falls back to the boolean only when no date is sent', async () => {
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload({
        user: { name: 'A', email: 'a@b.c', level_id: 2, level_started_days: 3, timezone: 'UTC', onboarded: false },
      }),
    });
    await syncNow(1);
    expect(q.saveDBUser).toHaveBeenCalledWith(expect.objectContaining({ onboarded_at: null }));
  });

  it('carries on when one section throws', async () => {
    // reportError logs in __DEV__, and these failures are the point of the
    // test rather than a surprise, so the output is not worth printing.
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Exactly the production failure: savePage hit a missing `pages.locale`
    // column, and subscriptions - which are applied afterwards - never landed.
    q.savePage.mockRejectedValue(new Error('no such column: locale'));
    q.bulkSaveTrainingDays.mockRejectedValue(new Error('boom'));
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload({
        training_days: [{ date: '2024-01-01', sessions_count: 2, required_sessions: 2, completed_at: null }],
        subscriptions: [{ purchase_token: 'tok-new', status: 'active', plan_slug: 'monthly' }],
      }),
    });
    mockedApi.pullContent.mockResolvedValue({
      ok: true,
      status: 200,
      data: { pages: [{ slug: 'terms', title: 'T', content: 'c', sort_order: 1 }], settings: {} },
    });

    const res = await syncNow(1);

    expect(res.success).toBe(true);
    expect(q.saveSubscription).toHaveBeenCalledWith(1, expect.objectContaining({ purchase_token: 'tok-new' }));
    quiet.mockRestore();
  });
});

describe('subscription reconcile', () => {
  it('expires a local row the server no longer returns', async () => {
    q.getSubscriptions.mockResolvedValue([subRow({ purchase_token: 'tok-gone' })]);
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload({ subscriptions: [] }),
    });

    await syncNow(1);

    expect(q.saveSubscription).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ purchase_token: 'tok-gone', status: 'expired', auto_renewing: 0 }),
    );
  });

  it('leaves an unacknowledged purchase recorded minutes ago alone', async () => {
    // The push and the RevenueCat webhook have not had time to land, so the
    // server not knowing about it yet proves nothing. plan_id null is what
    // makes it ours-and-unconfirmed: recordCompletedPurchase writes that, and
    // a row that has been through a pull comes back with one set.
    (purchaseRecordedAt as jest.Mock).mockResolvedValue(Date.now() - 60_000);
    q.getSubscriptions.mockResolvedValue([
      subRow({ purchase_token: 'tok-fresh', plan_id: null }),
    ]);
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload({ subscriptions: [] }),
    });

    await syncNow(1);

    expect(q.saveSubscription).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'expired' }),
    );
  });

  it('retires a row the server acknowledged and has now dropped, however recent', async () => {
    /**
     * Cancelling shortly after subscribing. The settle window is for a purchase
     * the backend has not seen; this row carries a plan_id, so it HAS been
     * seen, and a complete pull that omits it is an answer rather than a delay.
     *
     * It used to be held by the window regardless, and because purchaseRecordedAt
     * is one stamp for the whole device, any recent purchase froze every row on
     * the phone. That is why a cancellation minutes after buying did nothing
     * until the app's storage was cleared.
     */
    (purchaseRecordedAt as jest.Mock).mockResolvedValue(Date.now() - 60_000);
    q.getSubscriptions.mockResolvedValue([
      subRow({ purchase_token: 'tok-cancelled', plan_id: 1 }),
    ]);
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload({ subscriptions: [] }),
    });

    await syncNow(1);

    expect(q.saveSubscription).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        purchase_token: 'tok-cancelled',
        status: 'expired',
        auto_renewing: 0,
      }),
    );
  });

  it('leaves everything alone when the payload carries no subscriptions key', async () => {
    // Silence from an older backend is not "you have none".
    q.getSubscriptions.mockResolvedValue([subRow({ purchase_token: 'tok-old' })]);
    const payload = pullPayload();
    delete (payload as any).subscriptions;
    mockedApi.pullState.mockResolvedValue({ ok: true, status: 200, data: payload });

    await syncNow(1);

    expect(q.saveSubscription).not.toHaveBeenCalled();
  });

  it('keeps a row the server did return', async () => {
    q.getSubscriptions.mockResolvedValue([subRow({ purchase_token: 'tok-live' })]);
    mockedApi.pullState.mockResolvedValue({
      ok: true,
      status: 200,
      data: pullPayload({
        subscriptions: [{ purchase_token: 'tok-live', status: 'active', plan_slug: 'monthly' }],
      }),
    });

    await syncNow(1);

    expect(q.saveSubscription).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'expired' }),
    );
  });
});
