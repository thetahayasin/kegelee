/**
 * @format
 *
 * How far ahead reminders may be promised, and who is allowed to have them.
 *
 * A reminder is not app state. It is an alarm handed to Android, and it
 * outlives the process that created it. These were created as WEEKLY repeating
 * triggers - an instruction to fire forever - so stopping them required the app
 * to run, and the defining feature of a lapsed account is that it does not open
 * the app. Somebody who cancelled went on being reminded indefinitely by a
 * screen they could no longer open.
 *
 * The fix is at the source: a bounded series of one-shot triggers that runs out
 * on its own, capped at the entitlement. Nothing has to notice a lapse for the
 * notifications to stop, which is the only property that actually holds for a
 * device that never comes back.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';

jest.mock('../src/db/queries', () => ({
  getReminders: jest.fn(async () => []),
  getDBUser: jest.fn(async () => ({ id: 3, is_admin: 0 })),
}));

jest.mock('../src/services/entitlement', () => ({
  resolveEntitlement: jest.fn(async () => ({
    active: true,
    source: 'subscription',
    expiresAt: null,
    subscription: null,
  })),
}));

jest.mock('../src/services/events', () => ({ track: jest.fn() }));

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k, language: 'en' },
}));

import { getDBUser, getReminders } from '../src/db/queries';
import { resolveEntitlement } from '../src/services/entitlement';
import {
  REMINDER_HORIZON_MS,
  applyReminderSchedule,
  remindersScheduledThrough,
  scheduleReminders,
  topUpFromDelivery,
} from '../src/services/reminders';

const notif = notifee as unknown as Record<string, jest.Mock>;
const mockedReminders = getReminders as jest.Mock;
const mockedEntitlement = resolveEntitlement as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;
const USER = 3;

/** Monday and Wednesday, twice a day - a normal week off the Schedule tab. */
const WEEK = [
  { weekday: 0, times: ['08:00', '20:00'], isEnabled: true },
  { weekday: 2, times: ['08:00', '20:00'], isEnabled: true },
];

const scheduledTimestamps = (): number[] =>
  notif.createTriggerNotification.mock.calls.map((call) => call[1].timestamp);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  notif.getTriggerNotificationIds.mockResolvedValue([]);
  notif.createTriggerNotification.mockResolvedValue('id');
  notif.getNotificationSettings.mockResolvedValue({
    authorizationStatus: 1,
    android: { alarm: 1 },
  });
  (getDBUser as jest.Mock).mockResolvedValue({ id: USER, is_admin: 0 });
  mockedReminders.mockResolvedValue([]);
  mockedEntitlement.mockResolvedValue({
    active: true,
    source: 'subscription',
    expiresAt: null,
    subscription: null,
  });
});

describe('the schedule ends', () => {
  it('never hands the OS a trigger that repeats forever', async () => {
    await scheduleReminders(WEEK);

    expect(notif.createTriggerNotification).toHaveBeenCalled();
    for (const call of notif.createTriggerNotification.mock.calls) {
      // The whole bug in one assertion: a repeatFrequency is a standing
      // instruction to Android, and nothing in this app can be sure of being
      // alive to withdraw it.
      expect(call[1].repeatFrequency).toBeUndefined();
    }
  });

  it('stops at the horizon when nothing is known to expire', async () => {
    await scheduleReminders(WEEK, { until: null });

    const stamps = scheduledTimestamps();
    expect(stamps.length).toBeGreaterThan(0);
    expect(Math.max(...stamps)).toBeLessThanOrEqual(Date.now() + REMINDER_HORIZON_MS);
  });

  it('reports how far ahead it got, so the window can be topped up', async () => {
    const result = await scheduleReminders(WEEK);

    expect(result.scheduled).toBe(true);
    expect(result.scheduledThrough).toBe(Math.max(...scheduledTimestamps()));
  });
});

describe('the entitlement is the ceiling', () => {
  it('promises nothing past the date access runs out', async () => {
    const until = Date.now() + 10 * DAY;

    await scheduleReminders(WEEK, { until });

    const stamps = scheduledTimestamps();
    expect(stamps.length).toBeGreaterThan(0);
    expect(Math.max(...stamps)).toBeLessThanOrEqual(until);
  });

  it('schedules nothing at all once the entitlement is already over', async () => {
    const result = await scheduleReminders(WEEK, { until: Date.now() - DAY });

    expect(notif.createTriggerNotification).not.toHaveBeenCalled();
    expect(result.scheduledThrough).toBeNull();
  });

  it('keeps the wall-clock time across a week, not a fixed 168 hours', async () => {
    // Adding 7 * 24h in milliseconds moves an 08:00 reminder to 07:00 or 09:00
    // across a daylight-saving change. Adding seven days to the date keeps the
    // hour the reader chose.
    await scheduleReminders([{ weekday: 0, times: ['08:00'], isEnabled: true }]);

    const stamps = scheduledTimestamps().sort((a, b) => a - b);
    expect(stamps.length).toBeGreaterThan(1);
    for (const stamp of stamps) {
      const at = new Date(stamp);
      expect(at.getHours()).toBe(8);
      expect(at.getMinutes()).toBe(0);
    }
  });
});

describe('applyReminderSchedule', () => {
  it('clears everything for an account that is not entitled', async () => {
    mockedEntitlement.mockResolvedValue({
      active: false,
      source: 'none',
      expiresAt: null,
      subscription: null,
    });
    notif.getTriggerNotificationIds.mockResolvedValue(['reminder_0_08_00_w0']);
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
    ]);

    await applyReminderSchedule(USER, false);

    expect(notif.cancelTriggerNotifications).toHaveBeenCalledWith(['reminder_0_08_00_w0']);
    expect(notif.createTriggerNotification).not.toHaveBeenCalled();
    // The rows are untouched, so re-subscribing restores the same week rather
    // than asking somebody to set it up a second time.
    expect(await remindersScheduledThrough(USER)).toBeNull();
  });

  it('schedules the local rows out to the entitlement for a subscriber', async () => {
    const expiresAt = Date.now() + 5 * DAY;
    mockedEntitlement.mockResolvedValue({
      active: true,
      source: 'subscription',
      expiresAt,
      subscription: { auto_renewing: 0 },
    });
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
      { user_id: USER, weekday: 1, times: ['08:00'], is_enabled: 0 },
    ]);

    await applyReminderSchedule(USER, false);

    const stamps = scheduledTimestamps();
    expect(stamps.length).toBeGreaterThan(0);
    expect(Math.max(...stamps)).toBeLessThanOrEqual(expiresAt);
    expect(await remindersScheduledThrough(USER)).toBe(Math.max(...stamps));
  });

  it('leaves an auto-renewing subscriber room for a renewal it has not seen', async () => {
    // The local row still carries the old expiry until a sync brings the new
    // one down, so capping strictly at it would go quiet on somebody who is
    // still paying - and reminders are what bring them back to the app, where
    // the truth is re-established.
    const expiresAt = Date.now() + DAY;
    mockedEntitlement.mockResolvedValue({
      active: true,
      source: 'subscription',
      expiresAt,
      subscription: { auto_renewing: 1 },
    });
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
      { user_id: USER, weekday: 3, times: ['08:00'], is_enabled: 1 },
    ]);

    await applyReminderSchedule(USER, false);

    const stamps = scheduledTimestamps();
    expect(Math.max(...stamps)).toBeGreaterThan(expiresAt);
    // Bounded all the same. A few days of over-notifying is a far smaller
    // harm than forever, which is what this replaced.
    expect(Math.max(...stamps)).toBeLessThanOrEqual(Date.now() + REMINDER_HORIZON_MS);
  });

  it('does not schedule a cancelled subscriber past their paid-through date', async () => {
    // No renewal is coming, so there is nothing to leave room for.
    const expiresAt = Date.now() + 3 * DAY;
    mockedEntitlement.mockResolvedValue({
      active: true,
      source: 'subscription',
      expiresAt,
      subscription: { auto_renewing: 0, status: 'canceled' },
    });
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
      { user_id: USER, weekday: 3, times: ['08:00'], is_enabled: 1 },
    ]);

    await applyReminderSchedule(USER, false);

    expect(Math.max(...scheduledTimestamps())).toBeLessThanOrEqual(expiresAt);
  });

  it('does not rebuild an identical schedule on every sync', async () => {
    // Applying it is dozens of calls across the native bridge and a sync runs
    // on nearly every foreground, so a second pull that changes nothing must
    // not tear the week down and put it straight back.
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
    ]);

    await applyReminderSchedule(USER, false);
    const first = notif.createTriggerNotification.mock.calls.length;
    expect(first).toBeGreaterThan(0);

    notif.createTriggerNotification.mockClear();
    await applyReminderSchedule(USER, false);

    expect(notif.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('rebuilds when the week changes', async () => {
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
    ]);
    await applyReminderSchedule(USER, false);

    notif.createTriggerNotification.mockClear();
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['09:30'], is_enabled: 1 },
    ]);
    await applyReminderSchedule(USER, false);

    expect(notif.createTriggerNotification).toHaveBeenCalled();
  });

  it('rebuilds when the entitlement ceiling moves', async () => {
    // A cancellation does not change the week; it changes how far ahead the
    // week may be promised. Skipping that rebuild would leave notifications
    // scheduled past the date access ends, which is the whole bug.
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
    ]);
    await applyReminderSchedule(USER, false);

    notif.createTriggerNotification.mockClear();
    mockedEntitlement.mockResolvedValue({
      active: true,
      source: 'subscription',
      expiresAt: Date.now() + 9 * DAY,
      subscription: { auto_renewing: 0, status: 'canceled' },
    });
    await applyReminderSchedule(USER, false);

    expect(notif.createTriggerNotification).toHaveBeenCalled();
    expect(Math.max(...scheduledTimestamps())).toBeLessThanOrEqual(Date.now() + 9 * DAY);
  });

  it('rebuilds once the window is running down', async () => {
    // Nothing has changed, but the schedule is nearly spent. This is the case
    // an offline device lives in: no sync will ever come to refill it, so the
    // foreground check has to.
    mockedEntitlement.mockResolvedValue({
      active: true,
      source: 'subscription',
      expiresAt: Date.now() + 5 * DAY,
      subscription: { auto_renewing: 0 },
    });
    // Every day, so the five-day window certainly holds occurrences and the
    // schedule genuinely ends inside the top-up threshold.
    mockedReminders.mockResolvedValue(
      Array.from({ length: 7 }, (_, weekday) => ({
        user_id: USER,
        weekday,
        times: ['08:00'],
        is_enabled: 1,
      })),
    );
    await applyReminderSchedule(USER, false);
    expect(await remindersScheduledThrough(USER)).not.toBeNull();

    notif.createTriggerNotification.mockClear();
    await applyReminderSchedule(USER, false);

    expect(notif.createTriggerNotification).toHaveBeenCalled();
  });

  it('does not remember a refused attempt as the current schedule', async () => {
    // Otherwise the next call would skip the retry: the reader turns
    // notifications back on in system settings and nothing ever re-schedules.
    notif.requestPermission.mockResolvedValue({ authorizationStatus: 0 });
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
    ]);
    await applyReminderSchedule(USER, false, { requestPermission: true });

    notif.getNotificationSettings.mockResolvedValue({
      authorizationStatus: 1,
      android: { alarm: 1 },
    });
    await applyReminderSchedule(USER, false);

    expect(notif.createTriggerNotification).toHaveBeenCalled();
  });

  it('cancels a lapsed account even when nothing else has changed', async () => {
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
    ]);
    await applyReminderSchedule(USER, false);

    notif.cancelTriggerNotifications.mockClear();
    notif.getTriggerNotificationIds.mockResolvedValue(['reminder_0_08_00_w0']);
    mockedEntitlement.mockResolvedValue({
      active: false,
      source: 'server',
      expiresAt: null,
      subscription: null,
    });
    await applyReminderSchedule(USER, false);

    expect(notif.cancelTriggerNotifications).toHaveBeenCalled();
  });

  it('asks nobody for permission on a background reschedule', async () => {
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
    ]);

    await applyReminderSchedule(USER, false);

    expect(notif.requestPermission).not.toHaveBeenCalled();
  });

  it('asks when somebody has just tapped "remind me"', async () => {
    notif.requestPermission.mockResolvedValue({ authorizationStatus: 1 });
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
    ]);

    await applyReminderSchedule(USER, false, { requestPermission: true });

    expect(notif.requestPermission).toHaveBeenCalled();
  });

  it('schedules nothing when the system permission is refused', async () => {
    notif.requestPermission.mockResolvedValue({ authorizationStatus: 0 });
    mockedReminders.mockResolvedValue([
      { user_id: USER, weekday: 0, times: ['08:00'], is_enabled: 1 },
    ]);

    const result = await applyReminderSchedule(USER, false, { requestPermission: true });

    expect(result.permission).toBe('denied');
    expect(notif.createTriggerNotification).not.toHaveBeenCalled();
  });
});

/**
 * The half that makes a bounded schedule survive an unbounded absence.
 *
 * A four-week window is refilled whenever the app runs, which covers everybody
 * who opens it - and not the person the reminders exist for, who is being
 * nudged precisely because they have stopped opening it. Their window would run
 * out about a month in, and the app would go silent on a paying customer.
 * Notifee hands every delivery to a background handler, and that is the one
 * moment this app is guaranteed to be running for them.
 */
/**
 * What a real subscriber actually gets, as opposed to a Play TEST subscription.
 *
 * Worth pinning because the two look alarmingly different on a device and the
 * difference is correct. A licence tester's monthly plan renews every FIVE
 * MINUTES, so its `ends_at` is minutes away and the entitlement ceiling - not
 * the horizon - is what binds: about a week of reminders, which reads like the
 * schedule has been truncated. A real monthly subscriber's `ends_at` is a month
 * out, the ceiling lands beyond the horizon, and the full four weeks are
 * scheduled. Both are the same rule.
 */
describe('a real subscriber, not a five-minute test one', () => {
  const everyDay = Array.from({ length: 7 }, (_, weekday) => ({
    user_id: USER,
    weekday,
    times: ['08:00'],
    is_enabled: 1,
  }));

  it('gets four weeks at a time, so each day repeats weekly', async () => {
    // A monthly plan: ends_at ~30 days out, still auto-renewing.
    mockedEntitlement.mockResolvedValue({
      active: true,
      source: 'subscription',
      expiresAt: Date.now() + 31 * DAY,
      subscription: { auto_renewing: 1 },
    });
    mockedReminders.mockResolvedValue(everyDay);

    await applyReminderSchedule(USER, false);

    const stamps = scheduledTimestamps().sort((a, b) => a - b);
    // Seven days a week for four weeks.
    expect(stamps.length).toBe(28);
    // And the same weekday recurs seven days apart, four times over.
    const mondays = stamps.filter((at) => new Date(at).getDay() === 1);
    expect(mondays.length).toBe(4);
    expect(Math.max(...stamps)).toBeGreaterThan(Date.now() + 26 * DAY);
    expect(Math.max(...stamps)).toBeLessThanOrEqual(Date.now() + REMINDER_HORIZON_MS);
  });

  it('is capped by the period when the period is shorter than the horizon', async () => {
    // The test-subscription shape: minutes of entitlement, so the ceiling is
    // the renewal headroom and roughly a week is scheduled.
    mockedEntitlement.mockResolvedValue({
      active: true,
      source: 'subscription',
      expiresAt: Date.now() + DAY,
      subscription: { auto_renewing: 1 },
    });
    mockedReminders.mockResolvedValue(everyDay);

    await applyReminderSchedule(USER, false);

    const stamps = scheduledTimestamps();
    expect(stamps.length).toBeLessThan(28);
    expect(Math.max(...stamps)).toBeLessThanOrEqual(Date.now() + 8 * DAY);
  });
});

describe('every delivery re-arms the series', () => {
  const REMINDER_ID = 'reminder_0_08_00_w0';

  const weekOf = (id: number) => [
    { user_id: id, weekday: 0, times: ['08:00'], is_enabled: 1 },
    { user_id: id, weekday: 3, times: ['08:00'], is_enabled: 1 },
  ];

  it('extends a window that is running down, with no app open', async () => {
    mockedEntitlement.mockResolvedValue({
      active: true,
      source: 'subscription',
      expiresAt: Date.now() + 5 * DAY,
      subscription: { auto_renewing: 0 },
    });
    mockedReminders.mockResolvedValue(weekOf(USER));
    await applyReminderSchedule(USER, false);

    notif.createTriggerNotification.mockClear();
    await topUpFromDelivery(REMINDER_ID);

    expect(notif.createTriggerNotification).toHaveBeenCalled();
  });

  it('cancels the rest of the series when the entitlement has ended', async () => {
    // The same hook, doing the opposite job. A lapsed account that never opens
    // the app has its remaining notifications withdrawn by the next one that
    // fires, rather than serving out the tail of a window it no longer pays
    // for.
    mockedReminders.mockResolvedValue(weekOf(USER));
    await applyReminderSchedule(USER, false);

    notif.cancelTriggerNotifications.mockClear();
    notif.createTriggerNotification.mockClear();
    notif.getTriggerNotificationIds.mockResolvedValue([REMINDER_ID]);
    mockedEntitlement.mockResolvedValue({
      active: false,
      source: 'server',
      expiresAt: null,
      subscription: null,
    });

    await topUpFromDelivery(REMINDER_ID);

    expect(notif.cancelTriggerNotifications).toHaveBeenCalledWith([REMINDER_ID]);
    expect(notif.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('ignores a notification that is not one of ours', async () => {
    await topUpFromDelivery('nudge_lapse');
    await topUpFromDelivery(null);

    expect(getDBUser).not.toHaveBeenCalled();
  });

  it('does nothing when nobody is signed in', async () => {
    (getDBUser as jest.Mock).mockResolvedValue(null);

    await topUpFromDelivery(REMINDER_ID);

    expect(notif.createTriggerNotification).not.toHaveBeenCalled();
  });
});
