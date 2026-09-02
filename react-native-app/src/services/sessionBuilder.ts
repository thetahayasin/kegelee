import {
  EXERCISES,
  LEVELS,
  REST_LABEL_KEY,
  getCycleSeconds,
  getDurationBounds,
  getSteps,
  isFreeExercise,
} from '../constants/catalogues';

export interface PlaylistStep {
  phase: 'contract' | 'relax';
  /** i18n key for the cue inside the circle. Resolved by the screen, not here. */
  labelKey: string;
  seconds: number;
  from: number;
  to: number;
  /** Exercise this step belongs to, or 'rest'. Doubles as the identity used to
   *  group consecutive steps into one carousel block. */
  slug: string;
}

export interface Playlist {
  steps: PlaylistStep[];
  /** Slugs, in the order they are trained. Names are looked up for display. */
  exercises: string[];
  totalSeconds: number;
}

// Shuffles an array helper
const shuffle = <T>(array: T[]): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Calculate duration of an exercise for a specific level number
export const getDurationForLevel = (slug: string, levelNumber: number): number => {
  const cycle = getCycleSeconds(slug);
  if (cycle <= 0) return 30.0;

  const [min, max] = getDurationBounds(slug);
  const topNumber = 5; // Levels range from 1 to 5
  
  const pct = topNumber > 1 ? Math.max(0.0, Math.min(1.0, (levelNumber - 1) / (topNumber - 1))) : 0.0;
  const target = min + (max - min) * pct;

  let cycles = Math.max(1, Math.round(target / cycle));
  // Whole cycles, but never blow past the range maximum on rounding
  while (cycles > 1 && cycles * cycle > max + 0.01) {
    cycles--;
  }
  // ...and symmetrically, never fall short of the minimum.
  //
  // Only the maximum was guarded, so the duration range was enforced at one
  // end and not the other. Rounding to a whole number of cycles can land under
  // `min` whenever the cycle length does not divide it: front-clamp has a 3.3s
  // cycle and a 20s floor, so level 1 rounded to 6 cycles - 19.8s, a set
  // shorter than the catalogue says the exercise is. The extra cycle is only
  // taken when it still fits under `max`, so this can never fight the loop
  // above.
  while (cycles * cycle < min - 0.01 && (cycles + 1) * cycle <= max + 0.01) {
    cycles++;
  }

  return Math.round(cycles * cycle * 10) / 10;
};

// Generate daily workout session playlist
export const buildDailySession = (
  completedDays: number,
  levelNumber: number,
  opts?: { freeOnly?: boolean },
): Playlist => {
  const level = LEVELS[levelNumber] || LEVELS[1];
  const total = level.total_session_seconds;
  const rest = level.rest_seconds;

  // Filter to only unlocked exercises.
  //
  // A free account is bounded twice over, and both bounds matter. Its day
  // count stops at FREE_DAY_CAP so the day-based unlock can never reach the
  // fourth exercise, and this filter is the belt to that braces: even if a
  // day count arrived from somewhere else - a sync from an account that was
  // subscribed yesterday, a clock change - the session still only ever
  // contains what the tier actually includes.
  const unlocked = Object.values(EXERCISES).filter(
    (ex) =>
      completedDays >= ex.unlock_after_days
      && (!opts?.freeOnly || isFreeExercise(ex.slug)),
  );

  if (unlocked.length === 0) {
    return { steps: [], exercises: [], totalSeconds: 0 };
  }

  // Shuffle unlocked exercises
  let pool = shuffle(unlocked);
  const sequence: any[] = [];
  const durations: number[] = [];
  let acc = 0;
  let idx = 0;

  while (sequence.length < 30) {
    let candidate = pool[idx % pool.length];
    
    // Avoid two consecutive exercises of the same type if pool has more than 1
    if (sequence.length > 0 && sequence[sequence.length - 1].slug === candidate.slug && pool.length > 1) {
      idx++;
      candidate = pool[idx % pool.length];
    }

    const duration = getDurationForLevel(candidate.slug, levelNumber);
    const addition = (sequence.length === 0 ? 0.0 : rest) + duration;

    // Check if adding exceeds target total
    if (sequence.length > 0 && acc + addition > total) {
      const over = (acc + addition) - total;
      const under = total - acc;
      if (over >= under) {
        break; // Stopping here gets us closer to target
      }
    }

    durations.push(duration);
    sequence.push(candidate);
    acc += addition;
    idx++;

    if (acc >= total) {
      break;
    }
  }

  // Construct the final playlist steps
  const steps: PlaylistStep[] = [];
  const exercises: string[] = [];
  let finalAcc = 0;

  sequence.forEach((exercise, i) => {
    // Insert rest between exercises
    if (i > 0 && rest > 0) {
      steps.push({
        phase: 'relax',
        labelKey: REST_LABEL_KEY,
        seconds: rest,
        from: 0,
        to: 0,
        slug: 'rest',
      });
      finalAcc += rest;
    }

    // Insert movement steps
    const exerciseDuration = durations[i];
    const exerciseSteps = getSteps(exercise.slug, exerciseDuration);
    
    exerciseSteps.forEach((s) => {
      steps.push({
        phase: s.phase,
        labelKey: s.labelKey,
        seconds: s.seconds,
        from: s.from,
        to: s.to,
        slug: exercise.slug,
      });
      finalAcc += s.seconds;
    });

    if (!exercises.includes(exercise.slug)) {
      exercises.push(exercise.slug);
    }
  });

  return {
    steps,
    exercises,
    totalSeconds: Math.round(finalAcc * 10) / 10,
  };
};

// Generate single trial exercise workout playlist (for practicing a specific exercise)
export const buildSingleSession = (slug: string, levelNumber: number): Playlist => {
  const exercise = EXERCISES[slug];
  if (!exercise) {
    return { steps: [], exercises: [], totalSeconds: 0 };
  }

  const duration = getDurationForLevel(slug, levelNumber);
  const exerciseSteps = getSteps(slug, duration);

  const steps: PlaylistStep[] = exerciseSteps.map((s) => ({
    phase: s.phase,
    labelKey: s.labelKey,
    seconds: s.seconds,
    from: s.from,
    to: s.to,
    slug: exercise.slug,
  }));

  const total = steps.reduce((sum, s) => sum + s.seconds, 0);

  return {
    steps,
    exercises: [exercise.slug],
    totalSeconds: Math.round(total * 10) / 10,
  };
};
