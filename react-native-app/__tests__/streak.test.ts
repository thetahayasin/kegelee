/**
 * @format
 *
 * getStreak is the one piece of new business logic behind the home screen's
 * streak, and every interesting case in it is a date-boundary case: an
 * unfinished today, a gap detected by an ABSENT row rather than a present one,
 * and a month rollover. None of those are visible by reading the number on a
 * device for an afternoon, so they get a test instead.
 */
import { getStreak } from '../src/services/progression';
import type { User } from '../src/context/AuthContext';
import type { DBTrainingDay } from '../src/db/queries';

const user = { id: 1, timezone: 'UTC' } as User;

/** A completed training day. Only date + completed_at are read. */
const done = (date: string): DBTrainingDay =>
  ({ date, completed_at: `${date}T10:00:00Z` } as DBTrainingDay);

/** A day that was started but never finished. */
const partial = (date: string): DBTrainingDay =>
  ({ date, completed_at: null } as DBTrainingDay);

describe('getStreak', () => {
  // Fake timers, not a Date.now stub: getLocalDateString builds today from
  // `new Date()`, which a Date.now override does not touch - so stubbing it
  // left the code reading the real clock and every case returned 0.
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-10T15:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is zero with no history at all', () => {
    expect(getStreak(user, [])).toBe(0);
  });

  it('is zero without a user, whatever the history says', () => {
    expect(getStreak(null, [done('2026-03-10'), done('2026-03-09')])).toBe(0);
  });

  it('counts consecutive completed days up to and including today', () => {
    const days = [done('2026-03-10'), done('2026-03-09'), done('2026-03-08')];
    expect(getStreak(user, days)).toBe(3);
  });

  it('does NOT break when today is merely unfinished', () => {
    // The day is still in progress. A counter that reset at midnight and only
    // returned after the second session would read zero most of the time.
    const days = [done('2026-03-09'), done('2026-03-08')];
    expect(getStreak(user, days)).toBe(2);
  });

  it('ignores a started-but-unfinished today the same way as a missing one', () => {
    const days = [partial('2026-03-10'), done('2026-03-09')];
    expect(getStreak(user, days)).toBe(1);
  });

  it('stops at the first missing day', () => {
    // 2026-03-08 is absent, so the run of three before it does not count.
    const days = [
      done('2026-03-10'),
      done('2026-03-09'),
      done('2026-03-07'),
      done('2026-03-06'),
      done('2026-03-05'),
    ];
    expect(getStreak(user, days)).toBe(2);
  });

  it('stops at a day that was started and abandoned', () => {
    const days = [done('2026-03-10'), done('2026-03-09'), partial('2026-03-08'), done('2026-03-07')];
    expect(getStreak(user, days)).toBe(2);
  });

  it('is zero when the last completed day is too long ago', () => {
    // Yesterday is missing too, so the chain is genuinely broken.
    expect(getStreak(user, [done('2026-03-01')])).toBe(0);
  });

  it('walks across a month boundary', () => {
    jest.setSystemTime(new Date('2026-03-02T09:00:00Z'));
    const days = [done('2026-03-02'), done('2026-03-01'), done('2026-02-28'), done('2026-02-27')];
    expect(getStreak(user, days)).toBe(4);
  });

  it('walks across a leap day', () => {
    jest.setSystemTime(new Date('2024-03-01T09:00:00Z'));
    const days = [done('2024-03-01'), done('2024-02-29'), done('2024-02-28')];
    expect(getStreak(user, days)).toBe(3);
  });

  it('is unaffected by row order or duplicates', () => {
    const days = [
      done('2026-03-08'),
      done('2026-03-10'),
      done('2026-03-09'),
      done('2026-03-09'),
    ];
    expect(getStreak(user, days)).toBe(3);
  });
});
