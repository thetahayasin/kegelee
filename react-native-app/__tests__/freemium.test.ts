/**
 * @format
 *
 * The freemium boundary, pinned.
 *
 * Both values are derived from the exercise catalogue, which is the point -
 * but derivation is only safe if something checks that the derivation still
 * means what it is supposed to mean. Adding an exercise or moving an unlock
 * threshold could otherwise change what the app gives away for nothing, and
 * nobody would find out until revenue moved.
 */
import {
  EXERCISES,
  FREE_EXERCISE_SLUGS,
  FREE_DAY_CAP,
  isFreeExercise,
  unlockedAtDay,
} from '../src/constants/catalogues';

describe('freemium boundary', () => {
  it('gives away exactly three exercises', () => {
    expect(FREE_EXERCISE_SLUGS).toHaveLength(3);
    expect(new Set(FREE_EXERCISE_SLUGS).size).toBe(3);
  });

  it('gives away the three that unlock earliest', () => {
    const byUnlock = Object.values(EXERCISES)
      .slice()
      .sort((a, b) => a.unlock_after_days - b.unlock_after_days || a.sort_order - b.sort_order);
    expect(FREE_EXERCISE_SLUGS).toEqual(byUnlock.slice(0, 3).map((e) => e.slug));
  });

  it('caps the day count exactly where the third one unlocks', () => {
    const thresholds = FREE_EXERCISE_SLUGS.map((s) => EXERCISES[s].unlock_after_days);
    expect(FREE_DAY_CAP).toBe(Math.max(...thresholds));
  });

  it('never lets a free account reach the fourth exercise', () => {
    // The whole boundary rests on this: days stop accumulating below the next
    // threshold, so no amount of free training can open exercise four.
    const byUnlock = Object.values(EXERCISES)
      .slice()
      .sort((a, b) => a.unlock_after_days - b.unlock_after_days || a.sort_order - b.sort_order);
    const fourth = byUnlock[3];
    expect(fourth).toBeDefined();
    expect(FREE_DAY_CAP).toBeLessThan(fourth.unlock_after_days);
  });

  it('agrees with isFreeExercise', () => {
    for (const slug of Object.keys(EXERCISES)) {
      expect(isFreeExercise(slug)).toBe(FREE_EXERCISE_SLUGS.includes(slug));
    }
  });

  it('unlocks all three free exercises at the cap', () => {
    // At FREE_DAY_CAP every free exercise must be available, or the boundary
    // would be advertising something a free account cannot actually reach.
    for (const slug of FREE_EXERCISE_SLUGS) {
      expect(EXERCISES[slug].unlock_after_days).toBeLessThanOrEqual(FREE_DAY_CAP);
    }
  });
});

/** One past the last gate in the catalogue, so no loop below can under-run it. */
const LAST_DAY =
  Math.max(...Object.values(EXERCISES).map((ex) => ex.unlock_after_days)) + 1;

describe('unlockedAtDay', () => {
  it('never announces the starting set', () => {
    // The bug this pins: at a completed-day count of 0 a plain
    // `unlock_after_days === completedDays` matches every day-0 exercise, so
    // the completion screen told everybody that trembling and holding had just
    // been unlocked - after the first session, for the two exercises they
    // started with and had just trained with.
    expect(unlockedAtDay(0)).toEqual([]);

    const dayZero = Object.values(EXERCISES).filter((ex) => ex.unlock_after_days === 0);
    expect(dayZero.length).toBeGreaterThan(0);
    for (let day = 0; day <= LAST_DAY; day++) {
      for (const ex of unlockedAtDay(day)) {
        expect(ex.unlock_after_days).toBeGreaterThan(0);
      }
    }
  });

  it('announces an exercise exactly once, on the day it gates on', () => {
    for (const ex of Object.values(EXERCISES)) {
      if (ex.unlock_after_days === 0) continue;
      const days = [];
      for (let day = 0; day <= LAST_DAY; day++) {
        if (unlockedAtDay(day).some((u) => u.slug === ex.slug)) days.push(day);
      }
      expect(days).toEqual([ex.unlock_after_days]);
    }
  });

  it('opens the fourth exercise one day past the free cap', () => {
    // What the reader should actually see announced after their first full
    // day: the front clamp, not the two they already had.
    const atCap = unlockedAtDay(FREE_DAY_CAP).map((ex) => ex.slug);
    expect(atCap.length).toBeGreaterThan(0);
    for (const slug of atCap) {
      expect(isFreeExercise(slug)).toBe(true);
    }
  });
});
