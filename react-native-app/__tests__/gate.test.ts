/**
 * @format
 *
 * exerciseGateState replaced three hand-written copies of the same decision -
 * the home screen, the full catalogue and the completion screen - and the
 * three had already drifted: only one guarded the divide-by-zero on a day-0
 * threshold and only one clamped the day count before computing the fraction.
 *
 * The distinction that matters most is between the two LOCKS. A day lock is a
 * countdown that ends by itself; a subscription lock never does, because a
 * free account's day count is frozen at FREE_DAY_CAP. Reporting days left on
 * one of those is a countdown to a day that never arrives.
 */
import {
  EXERCISES,
  FREE_DAY_CAP,
  FREE_EXERCISE_SLUGS,
  exerciseGateState,
  isFreeExercise,
} from '../src/constants/catalogues';

const ex = (slug: string) => EXERCISES[slug];
const SUBBED = { subscribed: true };
const FREE = { subscribed: false };
const ADMIN = { subscribed: false, isAdmin: true };

describe('exerciseGateState', () => {
  it('opens the day-0 starting set immediately, at a full bar', () => {
    // A threshold of 0 is the set everybody begins with. Nothing gates it, so
    // the bar reads 100 rather than dividing by zero.
    const gate = exerciseGateState(ex('trembling'), 0, SUBBED);
    expect(gate.unlocked).toBe(true);
    expect(gate.subLocked).toBe(false);
    expect(gate.progressPercent).toBe(100);
    expect(gate.daysLeft).toBe(0);
  });

  it('counts down a day lock and fills the bar as the days add up', () => {
    // clamp: unlock_after_days 14.
    const half = exerciseGateState(ex('clamp'), 7, SUBBED);
    expect(half.unlocked).toBe(false);
    expect(half.subLocked).toBe(false);
    expect(half.daysLeft).toBe(7);
    expect(half.progressPercent).toBe(50);
  });

  it('opens exactly on the threshold day, not the day after', () => {
    expect(exerciseGateState(ex('clamp'), 13, SUBBED).unlocked).toBe(false);
    expect(exerciseGateState(ex('clamp'), 14, SUBBED).unlocked).toBe(true);
  });

  it('reports no days left and a full bar once unlocked', () => {
    const gate = exerciseGateState(ex('clamp'), 40, SUBBED);
    expect(gate.unlocked).toBe(true);
    expect(gate.daysLeft).toBe(0);
    expect(gate.progressPercent).toBe(100);
  });

  it('never runs the bar past 100 or below 0', () => {
    for (const slug of Object.keys(EXERCISES)) {
      for (const days of [0, 1, 14, 999]) {
        const pct = exerciseGateState(ex(slug), days, SUBBED).progressPercent;
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });

  describe('a free account', () => {
    it('has the three free exercises open on their own day counts', () => {
      for (const slug of FREE_EXERCISE_SLUGS) {
        const threshold = ex(slug).unlock_after_days;
        expect(exerciseGateState(ex(slug), threshold, FREE).unlocked).toBe(true);
        expect(exerciseGateState(ex(slug), threshold, FREE).subLocked).toBe(false);
      }
    });

    it('is held by the SUBSCRIPTION past those three, never by a countdown', () => {
      const paid = Object.values(EXERCISES).filter((e) => !isFreeExercise(e.slug));
      expect(paid.length).toBeGreaterThan(0);
      for (const e of paid) {
        // Even at a day count far past the threshold - which a free account
        // cannot actually reach, but a stale sync could hand it.
        const gate = exerciseGateState(e, 999, FREE);
        expect(gate.unlocked).toBe(false);
        expect(gate.subLocked).toBe(true);
        // The countdown would tick towards a day that never comes.
        expect(gate.daysLeft).toBe(0);
      }
    });

    it('cannot reach the fourth exercise even at the free day cap', () => {
      const beyond = Object.values(EXERCISES)
        .filter((e) => !isFreeExercise(e.slug))
        .sort((a, b) => a.unlock_after_days - b.unlock_after_days)[0];
      expect(beyond.unlock_after_days).toBeGreaterThan(FREE_DAY_CAP);
      expect(exerciseGateState(beyond, FREE_DAY_CAP, FREE).unlocked).toBe(false);
    });
  });

  describe('a subscriber', () => {
    it('is held only by days, never by the subscription', () => {
      for (const e of Object.values(EXERCISES)) {
        expect(exerciseGateState(e, 0, SUBBED).subLocked).toBe(false);
      }
    });

    it('opens everything at a high enough day count', () => {
      const highest = Math.max(
        ...Object.values(EXERCISES).map((e) => e.unlock_after_days),
      );
      for (const e of Object.values(EXERCISES)) {
        expect(exerciseGateState(e, highest, SUBBED).unlocked).toBe(true);
      }
    });
  });

  it('gives an admin the whole catalogue on day zero, with neither lock', () => {
    for (const e of Object.values(EXERCISES)) {
      const gate = exerciseGateState(e, 0, ADMIN);
      expect(gate.unlocked).toBe(true);
      expect(gate.subLocked).toBe(false);
      expect(gate.daysLeft).toBe(0);
      expect(gate.progressPercent).toBe(100);
    }
  });
});
