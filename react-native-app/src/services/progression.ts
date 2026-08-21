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
