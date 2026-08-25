/**
 * The exercise and level catalogue.
 *
 * This file owns STRUCTURE only: slugs, unlock thresholds, timings and the
 * contract/relax pattern that drives the training circle. Every word the user
 * reads lives in the locale files under `catalogue.*` and is resolved with
 * `t()` at render time.
 *
 * That split is deliberate. `EXERCISES` is built once at module load, so any
 * text baked in here would be frozen in whatever language was active at
 * startup and would not follow a change from Settings. Keys resolved in the
 * component re-render with the rest of the UI.
 *
 * Keys are derived from the slug rather than stored, so adding an exercise
 * means adding one entry here and one block to each locale file - there is no
 * third place to forget.
 */
export const exerciseNameKey = (slug: string) => `catalogue.exercises.${slug}.name`;
export const exerciseSummaryKey = (slug: string) => `catalogue.exercises.${slug}.summary`;
export const exerciseDescriptionKey = (slug: string) => `catalogue.exercises.${slug}.description`;
export const exerciseHowToKey = (slug: string) => `catalogue.exercises.${slug}.howTo`;
export const levelNameKey = (levelNumber: number) => `catalogue.levels.${levelNumber}.name`;
export const levelDescriptionKey = (levelNumber: number) =>
  `catalogue.levels.${levelNumber}.description`;

/** The rest beat between exercises. Not an exercise, so it has no slug of its own. */
export const REST_LABEL_KEY = 'catalogue.steps.rest';

export interface ExerciseSegment {
  phase: 'contract' | 'relax';
  /** i18n key for the cue shown inside the training circle, e.g. "Contract slowly". */
  labelKey: string;
  seconds: number;
  from: number;
  to: number;
}

export interface ExerciseDef {
  slug: string;
  unlock_after_days: number;
  pattern: ExerciseSegment[];
  min_seconds?: number;
  max_seconds?: number;
  sort_order: number;
}

export interface LevelDef {
  number: number;
  total_session_seconds: number;
  rest_seconds: number;
  min_exercises: number;
}

export const LEVELS: Record<number, LevelDef> = {
  1: {
    number: 1,
    total_session_seconds: 60,
    rest_seconds: 5,
    min_exercises: 3,
  },
  2: {
    number: 2,
    total_session_seconds: 120,
    rest_seconds: 6,
    min_exercises: 3,
  },
  3: {
    number: 3,
    total_session_seconds: 180,
    rest_seconds: 6,
    min_exercises: 4,
  },
  4: {
    number: 4,
    total_session_seconds: 240,
    rest_seconds: 8,
    min_exercises: 5,
  },
  5: {
    number: 5,
    total_session_seconds: 300,
    rest_seconds: 8,
    min_exercises: 6,
  },
};

/** i18n keys for the phase cues, kept short so the pattern arrays stay readable. */
const S = {
  contract: 'catalogue.steps.contract',
  contractAndHold: 'catalogue.steps.contractAndHold',
  contractSlowly: 'catalogue.steps.contractSlowly',
  easeDown: 'catalogue.steps.easeDown',
  hold: 'catalogue.steps.hold',
  pulse1: 'catalogue.steps.pulse1',
  pulse2: 'catalogue.steps.pulse2',
  relax: 'catalogue.steps.relax',
  relaxSlowly: 'catalogue.steps.relaxSlowly',
  release: 'catalogue.steps.release',
  releaseSlowly: 'catalogue.steps.releaseSlowly',
  reset: 'catalogue.steps.reset',
  step1: 'catalogue.steps.step1',
  step2: 'catalogue.steps.step2',
  step3: 'catalogue.steps.step3',
  top: 'catalogue.steps.top',
} as const;

const buildExercises = (): Record<string, ExerciseDef> => {
  const seg = (dur: number, from: number, to: number, labelKey: string): ExerciseSegment => {
    const phase = to > from || (to === from && to > 0) ? 'contract' : 'relax';
    return { phase, labelKey, seconds: dur, from, to };
  };

  const hold = (dur: number, val: number, labelKey: string): ExerciseSegment => {
    return seg(dur, val, val, labelKey);
  };

  const list: Omit<ExerciseDef, 'sort_order'>[] = [
    {
      slug: 'trembling',
      unlock_after_days: 0,
      pattern: [seg(0.6, 0, 1, S.contract), seg(0.4, 1, 0, S.relax)],
    },
    {
      slug: 'holding',
      unlock_after_days: 0,
      pattern: [hold(3, 1, S.contractAndHold)],
      min_seconds: 12,
      max_seconds: 30,
    },
    {
      slug: 'front-clamp',
      unlock_after_days: 1,
      // Release is a 0.3s beat, not a full second: just enough for the drop
      // cue + haptic to register, then the next slow squeeze starts instantly
      // (deliberate divergence from the web's 1s hold - it read as dead time).
      pattern: [seg(3, 0, 1, S.contractSlowly), hold(0.3, 0, S.release)],
    },
    {
      slug: 'reverse-clamp',
      unlock_after_days: 3,
      pattern: [seg(0.3, 0, 1, S.contract), seg(3, 1, 0, S.releaseSlowly)],
    },
    {
      slug: 'flash',
      unlock_after_days: 5,
      pattern: [hold(0.3, 1, S.contract), hold(0.3, 0, S.relax)],
    },
    {
      slug: 'steady-trembling',
      unlock_after_days: 7,
      pattern: [hold(2.4, 1, S.contractAndHold), seg(0.5, 1, 0, S.relax)],
    },
    {
      slug: 'clamp',
      unlock_after_days: 14,
      pattern: [seg(3, 0, 1, S.contractSlowly), seg(3, 1, 0, S.relaxSlowly)],
    },
    {
      slug: 'starter',
      unlock_after_days: 20,
      pattern: [seg(0.3, 0, 1, S.contract), seg(0.7, 1, 0, S.relax), hold(5, 1, S.contractAndHold), hold(1, 0, S.relax)],
    },
    {
      slug: 'short-holding',
      unlock_after_days: 36,
      // Distinct from Steady Clamp (same ramp and hold, but a sharp release):
      // this one trains the controlled descent instead.
      pattern: [seg(1, 0, 1, S.contract), hold(4, 1, S.hold), seg(2, 1, 0, S.easeDown)],
    },
    {
      slug: 'waves',
      unlock_after_days: 43,
      pattern: [seg(2, 0, 1, S.contractSlowly), seg(2, 1, 0, S.relaxSlowly)],
    },
    {
      // Slug unchanged: session history and progression rows reference it.
      slug: 'pulsation',
      unlock_after_days: 50,
      pattern: [
        seg(0.3, 0, 1, S.pulse1),
        seg(0.3, 1, 0, S.release),
        seg(0.3, 0, 1, S.pulse2),
        seg(0.3, 1, 0, S.release),
        hold(0.8, 0, S.reset),
      ],
    },
    {
      slug: 'push',
      unlock_after_days: 57,
      pattern: [seg(3, 0, 1, S.contractSlowly), hold(2, 1, S.hold), seg(3, 1, 0, S.relaxSlowly)],
    },
    {
      slug: 'upstairs',
      unlock_after_days: 69,
      pattern: [hold(1, 0.25, S.step1), hold(1, 0.5, S.step2), hold(1, 0.75, S.step3), hold(1, 1, S.top), hold(1, 0, S.relax)],
    },
    {
      slug: 'steady-clamp',
      unlock_after_days: 79,
      pattern: [seg(1, 0, 1, S.contract), hold(5, 1, S.hold), hold(1, 0, S.relax)],
    },
    {
      slug: 'downstairs',
      unlock_after_days: 89,
      pattern: [hold(1, 1, S.contract), hold(1, 0.75, S.step3), hold(1, 0.5, S.step2), hold(1, 0.25, S.step1), seg(1, 0.25, 0, S.relax)],
    },
    {
      slug: 'long-steady-clamp',
      unlock_after_days: 99,
      pattern: [seg(1, 0, 1, S.contract), hold(10, 1, S.hold), hold(1, 0, S.relax)],
    },
    {
      slug: 'elevator',
      unlock_after_days: 109,
      pattern: [hold(1, 0.25, S.step1), hold(1, 0.5, S.step2), hold(1, 0.75, S.step3), hold(1, 1, S.top), hold(1, 0.75, S.step3), hold(1, 0.5, S.step2), hold(1, 0.25, S.step1), seg(1, 0.25, 0, S.relax)],
    },
  ];

  const bySlug: Record<string, ExerciseDef> = {};
  list.forEach((item, index) => {
    bySlug[item.slug] = { ...item, sort_order: index };
  });

  return bySlug;
};

export const EXERCISES = buildExercises();

export const getCycleSeconds = (slug: string): number => {
  const def = EXERCISES[slug];
  if (!def) return 0;
  return def.pattern.reduce((sum, item) => sum + item.seconds, 0);
};

export const getDurationBounds = (slug: string): [number, number] => {
  const def = EXERCISES[slug];
  if (!def) return [20, 60];
  return [def.min_seconds ?? 20, def.max_seconds ?? 60];
};

export const getRepsForDuration = (slug: string, duration: number): number => {
  const cycle = getCycleSeconds(slug);
  return cycle > 0 ? Math.max(1, Math.floor(duration / cycle + 1e-6)) : 0;
};

export const getSteps = (slug: string, duration: number): ExerciseSegment[] => {
  const def = EXERCISES[slug];
  if (!def) return [];
  const reps = getRepsForDuration(slug, duration);
  const steps: ExerciseSegment[] = [];
  for (let i = 0; i < reps; i++) {
    steps.push(...def.pattern);
  }
  return steps;
};
