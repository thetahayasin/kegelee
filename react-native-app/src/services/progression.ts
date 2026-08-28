import { getLocalDateString } from '../utils/localDate';

// Re-exported so existing callers keep importing it from here.
export { getLocalDateString };

import { User } from '../context/AuthContext';
import { DBTrainingDay } from '../db/queries';

export const getRequiredSessionsPerDay = (_user: User | null): number => {
  // Fixed at 2 sessions/day (AppConfig::SESSIONS_PER_DAY). The level changes the
  // session LENGTH and exercise count - not how many sessions finish a day.
  return 2;
};

export const getPlanLength = (_user: User | null): number => {
  return 30; // Fallback or standard plan length
};


export const currentDayNumber = (user: User | null, trainingDays: DBTrainingDay[]): number => {
  if (!user) return 1;
  const todayStr = getLocalDateString(user.timezone);
  const planLen = getPlanLength(user);

  // Count training days completed strictly before today
  const completedBeforeToday = trainingDays.filter(
    (td) => td.completed_at !== null && td.date < todayStr
  ).length;

  return Math.min(completedBeforeToday + 1, planLen);
};

export const getPosition = (user: User | null, trainingDays: DBTrainingDay[]) => {
  const planLen = getPlanLength(user);
  const completed = trainingDays.filter((td) => td.completed_at !== null).length;
  const current = currentDayNumber(user, trainingDays);

  return {
    month: Math.floor(completed / planLen) + 1,
    day: current,
    plan_length: planLen,
    completed,
    days_left: Math.max(0, planLen - completed),
  };
};

export const getTodayProgress = (user: User | null, trainingDays: DBTrainingDay[]) => {
  if (!user) {
    return { done: 0, required: 2, complete: false };
  }
  const todayStr = getLocalDateString(user.timezone);
  const todayRecord = trainingDays.find((td) => td.date === todayStr);

  const required = getRequiredSessionsPerDay(user);
  if (!todayRecord) {
    return { done: 0, required, complete: false };
  }

  return {
    done: todayRecord.sessions_count,
    required: todayRecord.required_sessions || required,
    complete: todayRecord.completed_at !== null,
  };
};

/**
 * Consecutive completed training days, counting back from today.
 *
 * The chain, as distinct from the progress. `getPosition` already reports how
 * far through the plan someone is, which answers "how much have I done" - a
 * fact that only ever grows and that nobody loses by skipping a day. A streak
 * answers the other question, the one that actually gets a habit app opened:
 * what does today cost me if I skip it.
 *
 * Today NOT being finished does not break the streak - the day is still in
 * progress, and a counter that resets at midnight and only comes back after
 * the second session would spend most of its life reading zero. It counts back
 * from yesterday in that case, so the number stands until the day is genuinely
 * missed.
 *
 * Reads the same completed_at + local-date pair every other progress figure in
 * the app is derived from, so it can never disagree with the ring above it.
 */
export const getStreak = (user: User | null, trainingDays: DBTrainingDay[]): number => {
  if (!user) return 0;

  const completed = new Set(
    trainingDays.filter((td) => td.completed_at !== null).map((td) => td.date),
  );
  if (completed.size === 0) return 0;

  const todayStr = getLocalDateString(user.timezone);
  // Walk the calendar rather than the rows: a gap has to be detected by a date
  // that is ABSENT, and absent rows are exactly what a row list cannot show.
  // Parsed as UTC noon so a setDate() step can never land on a DST boundary
  // and repeat or skip a day.
  const cursor = new Date(`${todayStr}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return 0;

  // An unfinished today is not a broken streak, just a day still in progress.
  if (!completed.has(todayStr)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  // Bounded so a corrupt or far-future row cannot spin here forever.
  for (let i = 0; i < 3650; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (!completed.has(key)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
};
