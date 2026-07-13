import { User } from '../context/AuthContext';
import { DBTrainingDay } from '../db/queries';

export const getRequiredSessionsPerDay = (_user: User | null): number => {
  // Fixed at 2 sessions/day (AppConfig::SESSIONS_PER_DAY). The level changes the
  // session LENGTH and exercise count - not how many sessions finish a day.
  return 2;
};

export const getPlanLength = (user: User | null): number => {
  return 30; // Fallback or standard plan length
};

export const getLocalDateString = (timezone?: string | null): string => {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    // format as YYYY-MM-DD
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  } catch (e) {
    // Fallback to local system time format
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
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
