export interface ExerciseSegment {
  phase: 'contract' | 'relax';
  label: string;
  seconds: number;
  from: number;
  to: number;
}

export interface ExerciseDef {
  name: string;
  slug: string;
  unlock_after_days: number;
  summary: string;
  description: string;
  how_to: string;
  pattern: ExerciseSegment[];
  min_seconds?: number;
  max_seconds?: number;
  sort_order: number;
}

export interface LevelDef {
  number: number;
  name: string;
  description: string;
  total_session_seconds: number;
  rest_seconds: number;
  min_exercises: number;
}

export const LEVELS: Record<number, LevelDef> = {
  1: {
    number: 1,
    name: 'Level 1',
    description: 'Gentle start. Short 1 minute sessions.',
    total_session_seconds: 60,
    rest_seconds: 5,
    min_exercises: 3,
  },
  2: {
    number: 2,
    name: 'Level 2',
    description: 'A little longer. 2 minute sessions.',
    total_session_seconds: 120,
    rest_seconds: 6,
    min_exercises: 3,
  },
  3: {
    number: 3,
    name: 'Level 3',
    description: 'Balanced training. 3 minute sessions.',
    total_session_seconds: 180,
    rest_seconds: 6,
    min_exercises: 4,
  },
  4: {
    number: 4,
    name: 'Level 4',
    description: 'Longer sessions for stronger muscles. 4 minutes.',
    total_session_seconds: 240,
    rest_seconds: 8,
    min_exercises: 5,
  },
  5: {
    number: 5,
    name: 'Level 5',
    description: 'Advanced endurance and control. 5 minutes.',
    total_session_seconds: 300,
    rest_seconds: 8,
    min_exercises: 6,
  },
};

const buildExercises = (): Record<string, ExerciseDef> => {
  const seg = (dur: number, from: number, to: number, label: string): ExerciseSegment => {
    const phase = to > from || (to === from && to > 0) ? 'contract' : 'relax';
    return { phase, label, seconds: dur, from, to };
  };

  const hold = (dur: number, val: number, label: string): ExerciseSegment => {
    return seg(dur, val, val, label);
  };

  const list: Omit<ExerciseDef, 'sort_order'>[] = [
    {
      name: 'Trembling',
      slug: 'trembling',
      unlock_after_days: 0,
      summary: 'Quick flicks, on and off',
      description: 'Rapid on and off squeezes that make the muscle tremble and wake up its fast response.',
      how_to: 'Squeeze all at once, hold for a moment, then let go smoothly. Follow the circle as it snaps up and eases down.',
      pattern: [seg(0.6, 0, 1, 'Contract'), seg(0.4, 1, 0, 'Relax')],
    },
    {
      name: 'Holding',
      slug: 'holding',
      unlock_after_days: 0,
      summary: 'One steady hold',
      description: 'Squeeze and keep holding to build baseline endurance in the pelvic floor.',
      how_to: 'Squeeze your pelvic floor and keep holding for the whole round. If the tension fades, gently squeeze back up. Keep breathing normally.',
      pattern: [hold(3, 1, 'Contract & hold')],
      min_seconds: 12,
      max_seconds: 30,
    },
    {
      name: 'Front Clamp',
      slug: 'front-clamp',
      unlock_after_days: 1,
      summary: 'Squeeze up slowly, let go at once',
      description: 'A slow, focused squeeze of the front pelvic floor with a quick clean release.',
      how_to: 'Tighten slowly over 3 seconds as the circle fills. When it empties, let go all at once. Then start the next slow squeeze.',
      // Release is a 0.3s beat, not a full second: just enough for the drop
      // cue + haptic to register, then the next slow squeeze starts instantly
      // (deliberate divergence from the web's 1s hold - it read as dead time).
      pattern: [seg(3, 0, 1, 'Contract slowly'), hold(0.3, 0, 'Release')],
    },
    {
      name: 'Reverse Clamp',
      slug: 'reverse-clamp',
      unlock_after_days: 3,
      summary: 'Squeeze at once, release slowly',
      description: 'A quick squeeze followed by a slow, controlled letting go. Great for control.',
      how_to: 'Squeeze at once, then immediately start releasing as slowly as you can, following the circle down. The slow letting go is the exercise.',
      pattern: [seg(0.3, 0, 1, 'Contract'), seg(3, 1, 0, 'Release slowly')],
    },
    {
      name: 'Flash',
      slug: 'flash',
      unlock_after_days: 5,
      summary: 'Fastest on and off flicks',
      description: 'The fastest flicks. Short snappy squeezes that train quick reactions.',
      how_to: 'Squeeze and let go as fast as you can, in time with the circle. Stay light, do not strain.',
      pattern: [hold(0.3, 1, 'Contract'), hold(0.3, 0, 'Relax')],
    },
    {
      name: 'Steady Trembling',
      slug: 'steady-trembling',
      unlock_after_days: 7,
      summary: 'Squeeze at once, hold, then relax',
      description: 'Squeeze at once, keep the tension steady for a couple of seconds, then relax.',
      how_to: 'Squeeze at once and hold the tension. When the circle drops, let go smoothly. Then repeat the quick squeeze and hold.',
      pattern: [hold(2.4, 1, 'Contract & hold'), seg(0.5, 1, 0, 'Relax')],
    },
    {
      name: 'Clamp',
      slug: 'clamp',
      unlock_after_days: 14,
      summary: 'Slow squeeze up, slow release',
      description: 'A firm squeeze built up slowly and released just as slowly.',
      how_to: 'Tighten slowly over 3 seconds as the circle fills, then release just as slowly as it empties. Keep the movement smooth in both directions.',
      pattern: [seg(3, 0, 1, 'Contract slowly'), seg(3, 1, 0, 'Relax slowly')],
    },
    {
      name: 'Starter',
      slug: 'starter',
      unlock_after_days: 20,
      summary: 'Quick flick, then a 5 second hold',
      description: 'One quick squeeze to wake the muscle, then a strong 5 second hold.',
      how_to: 'Give one quick squeeze, relax smoothly, then squeeze again and hold strong for five seconds. Let go, breathe, and repeat.',
      pattern: [seg(0.3, 0, 1, 'Contract'), seg(0.7, 1, 0, 'Relax'), hold(5, 1, 'Contract & hold'), hold(1, 0, 'Relax')],
    },
    {
      name: 'Short Holding',
      slug: 'short-holding',
      unlock_after_days: 36,
      summary: 'Hold 4 seconds, then ease down',
      description: 'A strong 4 second hold released slowly rather than dropped. Letting go under control is a skill in its own right, and most people find it harder than the hold.',
      how_to: 'Tighten over one second, hold at full strength for four, then release gradually as the circle sinks. Do not let it collapse - stay with it all the way down.',
      // Distinct from Steady Clamp (same ramp and hold, but a sharp release):
      // this one trains the controlled descent instead.
      pattern: [seg(1, 0, 1, 'Contract'), hold(4, 1, 'Hold'), seg(2, 1, 0, 'Ease down')],
    },
    {
      name: 'Waves',
      slug: 'waves',
      unlock_after_days: 43,
      summary: '2 seconds up, 2 seconds down',
      description: 'Wave-like squeezes that build and release tension continuously.',
      how_to: 'Tighten slowly for two seconds, then release just as slowly, like a wave rising and falling. Keep it smooth and continuous.',
      pattern: [seg(2, 0, 1, 'Contract slowly'), seg(2, 1, 0, 'Relax slowly')],
    },
    {
      name: 'Double Pulse',
      // Slug unchanged: session history and progression rows reference it.
      slug: 'pulsation',
      unlock_after_days: 50,
      summary: 'Two fast pulses, then a full reset',
      description: 'Two quick squeezes back to back, then a complete release. Trains squeezing again before you have fully recovered, and letting go properly between efforts.',
      how_to: 'Squeeze and release twice in quick succession with the circle, then let everything go completely while it rests. The full release matters as much as the pulses.',
      pattern: [
        seg(0.3, 0, 1, 'Pulse 1'),
        seg(0.3, 1, 0, 'Release'),
        seg(0.3, 0, 1, 'Pulse 2'),
        seg(0.3, 1, 0, 'Release'),
        hold(0.8, 0, 'Reset'),
      ],
    },
    {
      name: 'Push',
      slug: 'push',
      unlock_after_days: 57,
      summary: '3s build, 2s peak hold, 3s relax',
      description: 'Build the squeeze to a strong peak, hold it, then let go slowly.',
      how_to: 'Tighten gradually over three seconds, getting stronger as the circle fills. Hold your strongest squeeze for two seconds, then release slowly. Squeeze harder, never push down or strain.',
      pattern: [seg(3, 0, 1, 'Contract slowly'), hold(2, 1, 'Hold'), seg(3, 1, 0, 'Relax slowly')],
    },
    {
      name: 'Upstairs',
      slug: 'upstairs',
      unlock_after_days: 69,
      summary: '4-step climb to the top',
      description: 'Climb the squeeze in four steps, a little stronger at each level.',
      how_to: 'Imagine riding an elevator upward. Tighten a little, then more, then more, until you reach your strongest squeeze, spending about one second at each level. Relax afterward.',
      pattern: [hold(1, 0.25, 'Step 1'), hold(1, 0.5, 'Step 2'), hold(1, 0.75, 'Step 3'), hold(1, 1, 'Top'), hold(1, 0, 'Relax')],
    },
    {
      name: 'Steady Clamp',
      slug: 'steady-clamp',
      unlock_after_days: 79,
      summary: '1 second squeeze, 5 second hold',
      description: 'A steady clamp: squeeze for a second, then hold at full strength for five.',
      how_to: 'Tighten for one second, then hold at full strength for five seconds without letting the tension drop. Let go and repeat.',
      pattern: [seg(1, 0, 1, 'Contract'), hold(5, 1, 'Hold'), hold(1, 0, 'Relax')],
    },
    {
      name: 'Downstairs',
      slug: 'downstairs',
      unlock_after_days: 89,
      summary: '4-step descent from the top',
      description: 'Squeeze to the top, then come down one step at a time under full control.',
      how_to: 'Squeeze to your strongest, then relax a little at a time, pausing about one second at each level on the way down. The controlled descent is the exercise.',
      pattern: [hold(1, 1, 'Contract'), hold(1, 0.75, 'Step 3'), hold(1, 0.5, 'Step 2'), hold(1, 0.25, 'Step 1'), seg(1, 0.25, 0, 'Relax')],
    },
    {
      name: 'Long Steady Clamp',
      slug: 'long-steady-clamp',
      unlock_after_days: 99,
      summary: '1 second squeeze, 10 second hold',
      description: 'The endurance builder: a one second squeeze into a ten second full-strength hold.',
      how_to: 'Tighten for one second, then hold at full strength for ten seconds. If the tension fades, gently squeeze back up to full. Let go and repeat.',
      pattern: [seg(1, 0, 1, 'Contract'), hold(10, 1, 'Hold'), hold(1, 0, 'Relax')],
    },
    {
      name: 'Elevator',
      slug: 'elevator',
      unlock_after_days: 109,
      summary: 'Climb to the top, then step back down',
      description: 'The signature exercise. Climb up step by step, then come back down under control.',
      how_to: 'Imagine riding an elevator. Tighten a little more at each step until you reach your strongest squeeze, then come back down one step at a time until fully relaxed.',
      pattern: [hold(1, 0.25, 'Step 1'), hold(1, 0.5, 'Step 2'), hold(1, 0.75, 'Step 3'), hold(1, 1, 'Top'), hold(1, 0.75, 'Step 3'), hold(1, 0.5, 'Step 2'), hold(1, 0.25, 'Step 1'), seg(1, 0.25, 0, 'Relax')],
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
