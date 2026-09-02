/**
 * @format
 *
 * getPosition reports two different counts that used to be one, and the whole
 * point of separating them is a boundary nobody reaches by hand: the thirtieth
 * completed day, when the plan rolls into month 2 and the displayed day number
 * has to go back to 1 while the lifetime count keeps climbing.
 *
 * Before the split, `day` was clamped at the plan length and `days_left`
 * counted down from a lifetime total, so a second-month account was pinned at
 * "day 30" with a negative number of days remaining and every calendar cell
 * marked done. None of that is visible without running the app for a month,
 * which is exactly what a test is for.
 */
import { currentDayNumber, getPosition } from '../src/services/progression';
import type { User } from '../src/context/AuthContext';
import type { DBTrainingDay } from '../src/db/queries';

const user = { id: 1, timezone: 'UTC' } as User;

/** A completed training day. Only date + completed_at are read. */
const done = (date: string): DBTrainingDay =>
  ({ date, completed_at: `${date}T10:00:00Z` } as DBTrainingDay);

/**
 * `count` consecutive completed days ending the day before `today`.
 *
 * Built backwards from a fixed anchor so the rows are always strictly before
 * "today" - which is what currentDayNumber counts - regardless of how many
 * there are.
 */
const daysBefore = (count: number, today: string): DBTrainingDay[] => {
  const rows: DBTrainingDay[] = [];
  const cursor = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < count; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    rows.push(done(cursor.toISOString().slice(0, 10)));
  }
  return rows;
};

const TODAY = '2026-06-15';

describe('getPosition', () => {
  // Fake timers rather than a Date.now stub: getLocalDateString builds today
  // from `new Date()`, which a Date.now override does not touch.
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts a brand new account on month 1, day 1, with the full plan left', () => {
    const pos = getPosition(user, []);
    expect(pos.month).toBe(1);
    expect(pos.day).toBe(1);
    expect(pos.completed).toBe(0);
    expect(pos.completed_in_month).toBe(0);
    expect(pos.days_left).toBe(30);
  });

  it('counts through the first month', () => {
    const pos = getPosition(user, daysBefore(5, TODAY));
    expect(pos.month).toBe(1);
    expect(pos.day).toBe(6);
    expect(pos.completed).toBe(5);
    expect(pos.completed_in_month).toBe(5);
    expect(pos.days_left).toBe(25);
  });

  it('is still month 1 on the last day of the plan', () => {
    const pos = getPosition(user, daysBefore(29, TODAY));
    expect(pos.month).toBe(1);
    expect(pos.day).toBe(30);
    expect(pos.completed_in_month).toBe(29);
    expect(pos.days_left).toBe(1);
  });

  it('rolls day 30 over into month 2, day 1', () => {
    const pos = getPosition(user, daysBefore(30, TODAY));
    expect(pos.month).toBe(2);
    expect(pos.day).toBe(1);
    // The lifetime count keeps growing - it is what unlock thresholds compare
    // against, so an exercise opened in month 1 must stay open.
    expect(pos.completed).toBe(30);
    // ...while the month-relative one restarts.
    expect(pos.completed_in_month).toBe(0);
    expect(pos.days_left).toBe(30);
  });

  it('carries on into month 2 rather than pinning at the plan length', () => {
    const pos = getPosition(user, daysBefore(34, TODAY));
    expect(pos.month).toBe(2);
    expect(pos.day).toBe(5);
    expect(pos.completed).toBe(34);
    expect(pos.completed_in_month).toBe(4);
    expect(pos.days_left).toBe(26);
  });

  it('reaches month 3 at sixty completed days', () => {
    const pos = getPosition(user, daysBefore(60, TODAY));
    expect(pos.month).toBe(3);
    expect(pos.day).toBe(1);
    expect(pos.days_left).toBe(30);
  });

  it('never reports a negative number of days left', () => {
    for (const n of [0, 1, 29, 30, 31, 59, 60, 61, 200]) {
      expect(getPosition(user, daysBefore(n, TODAY)).days_left).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not count today towards the day number until tomorrow', () => {
    // Five days before today, plus today itself finished. The reader is still
    // ON day 6 - the day only advances once it is behind them.
    const rows = [...daysBefore(5, TODAY), done(TODAY)];
    const pos = getPosition(user, rows);
    expect(pos.day).toBe(6);
    expect(pos.completed).toBe(6);
  });
});

describe('currentDayNumber', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is unbounded, so getPosition can work out the month from it', () => {
    expect(currentDayNumber(user, daysBefore(45, TODAY))).toBe(46);
  });

  it('is day 1 without a user', () => {
    expect(currentDayNumber(null, daysBefore(45, TODAY))).toBe(1);
  });
});
