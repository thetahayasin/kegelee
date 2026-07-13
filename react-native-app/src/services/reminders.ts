import { NativeModules, Platform } from 'react-native';

const { AlarmModule } = NativeModules;

export interface ReminderConfig {
  weekday: number; // 0 (Sun) .. 6 (Sat)
  times: string[]; // ['08:00', '18:00']
  isEnabled: boolean;
}

// JS weekday (0=Sun..6=Sat) -> Android Calendar day constant (SUNDAY=1..SATURDAY=7).
const toCalendarDay = (weekday: number) => weekday + 1;

/**
 * Create native system Clock alarms for the enabled reminder days/times - the
 * same "native reminders" behaviour as the original app (real alarms in the
 * device Clock app, not notifications). One recurring alarm per time, repeating
 * weekly on every enabled weekday.
 */
export const scheduleReminders = async (configs: ReminderConfig[]) => {
  if (Platform.OS !== 'android' || !AlarmModule) {
    return;
  }

  const enabled = configs.filter(c => c.isEnabled);
  const days = enabled.map(c => toCalendarDay(c.weekday));
  const uniqueTimes = Array.from(
    new Set(enabled.flatMap(c => c.times)),
  ).filter(Boolean);

  for (const time of uniqueTimes) {
    const [h, m] = time.split(':').map(n => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) {
      continue;
    }
    try {
      await AlarmModule.setAlarm(h, m, 'Time for your Kegel session', days);
    } catch (e) {
      console.warn('Failed to set alarm', time, e);
    }
  }
};

/**
 * Show the OS-native time picker seeded with `current` ("HH:MM"). Returns the
 * chosen time as "HH:MM", or null if cancelled / unavailable.
 */
export const showTimePicker = async (
  current: string,
): Promise<string | null> => {
  if (Platform.OS !== 'android' || !AlarmModule?.showTimePicker) {
    return null;
  }
  const [ch, cm] = (current || '08:00').split(':').map(n => parseInt(n, 10));
  const hour = Number.isNaN(ch) ? 8 : ch;
  const minute = Number.isNaN(cm) ? 0 : cm;
  try {
    const res = await AlarmModule.showTimePicker(hour, minute);
    if (!res) {
      return null;
    }
    const hh = String(res.hour).padStart(2, '0');
    const mm = String(res.minute).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch (e) {
    return null;
  }
};

/** Open the system Clock app so the user can review/remove their alarms. */
export const openAlarms = async () => {
  try {
    await AlarmModule?.openAlarms();
  } catch (e) {
    console.warn('Failed to open alarms', e);
  }
};
