/**
 * @format
 *
 * What a free account's session actually contains, and what happens to it
 * when they pay.
 *
 * The catalogue boundary is pinned in freemium.test.ts. This is the other
 * half: the promise the app makes to a free account in words - "the first
 * three exercises are yours, and subscribing continues your plan rather than
 * restarting it" - expressed as assertions, so it cannot quietly stop being
 * true.
 */
import { buildDailySession } from '../src/services/sessionBuilder';
import {
  EXERCISES,
  FREE_EXERCISE_SLUGS,
  FREE_DAY_CAP,
  isFreeExercise,
} from '../src/constants/catalogues';

/** A day count well past anything the catalogue gates on. */
const EVERYTHING = Math.max(
  ...Object.values(EXERCISES).map((ex) => ex.unlock_after_days),
);

describe('a free session', () => {
  it('is drawn only from the free exercises, at any day count', () => {
    // Even handed a day count it could never have earned - a clock change, a
    // restored backup, a bug upstream - the free tier must not widen. The cap
    // is the primary defence; this is the second one.
    for (const days of [0, FREE_DAY_CAP, EVERYTHING]) {
      const { exercises } = buildDailySession(days, 1, { freeOnly: true });
      expect(exercises.length).toBeGreaterThan(0);
      for (const slug of exercises) {
        expect(isFreeExercise(slug)).toBe(true);
      }
    }
  });

  it('reaches all three free exercises by the cap', () => {
    // Across the days a free account can actually reach, every exercise it was
    // promised has to turn up in some session. Sessions are sampled from the
    // unlocked pool, so this looks at the whole range rather than one draw.
    const seen = new Set<string>();
    for (let day = 0; day <= FREE_DAY_CAP; day++) {
      for (let draw = 0; draw < 40; draw++) {
        buildDailySession(day, 1, { freeOnly: true }).exercises.forEach((s) =>
          seen.add(s),
        );
      }
    }
    for (const slug of FREE_EXERCISE_SLUGS) {
      expect(seen.has(slug)).toBe(true);
    }
  });
});

describe('subscribing', () => {
  it('changes nothing about the session on the day it happens', () => {
    // The user-facing promise: "if subscribed, start from there". At the cap
    // itself, paying must not move the plan in either direction - the pool a
    // subscriber draws from on that day is exactly the pool they had a moment
    // earlier. What paying buys is the days AFTER it, not a different today.
    const pool = (freeOnly: boolean) => {
      const seen = new Set<string>();
      for (let draw = 0; draw < 60; draw++) {
        buildDailySession(FREE_DAY_CAP, 1, { freeOnly }).exercises.forEach((s) =>
          seen.add(s),
        );
      }
      return [...seen].sort();
    };
    expect(pool(false)).toEqual(pool(true));
    expect(pool(true)).toEqual([...FREE_EXERCISE_SLUGS].sort());
  });

  it('opens the next exercise one day past the cap', () => {
    // And the day after is where paying shows: the fourth exercise becomes
    // reachable at a day count the free tier can never hold.
    const fourth = Object.values(EXERCISES)
      .filter((ex) => !isFreeExercise(ex.slug))
      .sort((a, b) => a.unlock_after_days - b.unlock_after_days)[0];
    expect(fourth.unlock_after_days).toBeGreaterThan(FREE_DAY_CAP);

    const seen = new Set<string>();
    for (let draw = 0; draw < 80; draw++) {
      buildDailySession(fourth.unlock_after_days, 1).exercises.forEach((s) =>
        seen.add(s),
      );
    }
    expect(seen.has(fourth.slug)).toBe(true);
  });

  it('widens the pool that the free tier held shut', () => {
    // At a day count past the free ones, a paid session must be able to draw
    // exercises a free session never could. Sampled, because any single draw
    // is a random subset of the unlocked pool.
    const paid = new Set<string>();
    for (let draw = 0; draw < 60; draw++) {
      buildDailySession(EVERYTHING, 1).exercises.forEach((s) => paid.add(s));
    }
    const beyondFree = [...paid].filter((s) => !isFreeExercise(s));
    expect(beyondFree.length).toBeGreaterThan(0);
  });
});
