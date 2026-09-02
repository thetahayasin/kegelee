/**
 * @format
 *
 * The two weekday orders, and the week boundary.
 *
 * The reminders table stores Monday-first and `Date.getDay()` is Sunday-first,
 * the conversion between them was written inline in two places, and the doc
 * comment on the config interface asserted the wrong one. A reminder scheduled
 * for the wrong day does not fail loudly - it simply arrives on Tuesday - so
 * the round trip and the fixed points get pinned here.
 *
 * getNextTriggerDate is the other half: it is only ever interesting when it
 * has to cross into next week, which is the case a hand test on a Wednesday
 * afternoon never reaches.
 */
import {
  dbWeekdayToJs,
  jsWeekdayToDb,
  getNextTriggerDate,
} from '../src/services/reminders';

const MON = 0; // DB indexes
const SUN = 6;

describe('weekday conversion', () => {
  it('maps the DB Monday-first order onto the JS Sunday-first one', () => {
    expect(dbWeekdayToJs(MON)).toBe(1); // Monday
    expect(dbWeekdayToJs(1)).toBe(2); // Tuesday
    expect(dbWeekdayToJs(5)).toBe(6); // Saturday
    expect(dbWeekdayToJs(SUN)).toBe(0); // Sunday wraps to the front
  });

  it('maps back the other way', () => {
    expect(jsWeekdayToDb(0)).toBe(SUN); // Sunday goes to the end
    expect(jsWeekdayToDb(1)).toBe(MON);
    expect(jsWeekdayToDb(6)).toBe(5);
  });

  it('round-trips every day, in both directions', () => {
    for (let db = 0; db < 7; db++) {
      expect(jsWeekdayToDb(dbWeekdayToJs(db))).toBe(db);
    }
    for (let js = 0; js < 7; js++) {
      expect(dbWeekdayToJs(jsWeekdayToDb(js))).toBe(js);
    }
  });

  it('stays inside 0..6 for every input', () => {
    for (let i = 0; i < 7; i++) {
      expect(dbWeekdayToJs(i)).toBeGreaterThanOrEqual(0);
      expect(dbWeekdayToJs(i)).toBeLessThan(7);
      expect(jsWeekdayToDb(i)).toBeGreaterThanOrEqual(0);
      expect(jsWeekdayToDb(i)).toBeLessThan(7);
    }
  });
});

describe('getNextTriggerDate', () => {
  // A Wednesday, 10:00 local. Fake timers rather than a Date.now stub: the
  // function builds both `now` and the candidate from `new Date()`.
  const wednesday = new Date(2026, 5, 17, 10, 0, 0);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(wednesday);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is today when the time is still ahead', () => {
    const d = getNextTriggerDate(3, 18, 30); // Wednesday 18:30
    expect(d.getDay()).toBe(3);
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(30);
  });

  it('is a week away when today\'s time has already passed', () => {
    const d = getNextTriggerDate(3, 8, 0); // Wednesday 08:00, two hours ago
    expect(d.getDay()).toBe(3);
    expect(d.getDate()).toBe(24);
  });

  it('finds a later day in the same week', () => {
    const d = getNextTriggerDate(5, 8, 0); // Friday
    expect(d.getDay()).toBe(5);
    expect(d.getDate()).toBe(19);
  });

  it('crosses the week boundary for a day already behind us', () => {
    // Monday is two days back, so the next one is five days forward - into
    // next week. Wrapping was the whole reason this function exists.
    const d = getNextTriggerDate(1, 8, 0);
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(22);
  });

  it('crosses the week boundary for Sunday, which is index 0', () => {
    // Sunday reads as "before Wednesday" numerically and has to wrap forward,
    // not backward. This is the case the Monday-first/Sunday-first mix-up
    // broke first.
    const d = getNextTriggerDate(0, 8, 0);
    expect(d.getDay()).toBe(0);
    expect(d.getDate()).toBe(21);
  });

  it('is always in the future, for every day and both sides of the clock', () => {
    for (let weekday = 0; weekday < 7; weekday++) {
      for (const [h, m] of [[0, 0], [9, 59], [10, 0], [23, 59]]) {
        const d = getNextTriggerDate(weekday, h, m);
        expect(d.getTime()).toBeGreaterThan(wednesday.getTime());
        expect(d.getDay()).toBe(weekday);
        // ...and never more than a week out, or a reminder would skip a week.
        expect(d.getTime() - wednesday.getTime()).toBeLessThanOrEqual(
          7 * 24 * 60 * 60 * 1000,
        );
      }
    }
  });

  it('lands on the DB weekday the scheduler asks it for', () => {
    // The scheduler passes dbWeekdayToJs(config.weekday), so a row stored as
    // "Monday" has to produce a Date whose getDay() is 1.
    expect(getNextTriggerDate(dbWeekdayToJs(MON), 8, 0).getDay()).toBe(1);
    expect(getNextTriggerDate(dbWeekdayToJs(SUN), 8, 0).getDay()).toBe(0);
  });
});
