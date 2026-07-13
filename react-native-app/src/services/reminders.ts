import { NativeModules, Platform } from 'react-native';
import notifee, { TriggerType, RepeatFrequency, TimestampTrigger } from '@notifee/react-native';

const { AlarmModule } = NativeModules;

export interface ReminderConfig {
  weekday: number; // 0 (Sun) .. 6 (Sat)
  times: string[]; // ['08:00', '18:00']
  isEnabled: boolean;
}

/**
 * Calculates the next trigger date/time for a given weekday, hour, and minute.
 */
export const getNextTriggerDate = (weekday: number, hour: number, minute: number): Date => {
  const now = new Date();
  const candidate = new Date();
  candidate.setHours(hour, minute, 0, 0);

  let daysDiff = weekday - now.getDay();
  if (daysDiff < 0) {
    daysDiff += 7;
  } else if (daysDiff === 0 && candidate.getTime() <= now.getTime()) {
    daysDiff = 7;
  }

  candidate.setDate(candidate.getDate() + daysDiff);
  return candidate;
};

/**
 * Schedules recurring weekly local notifications using Notifee for enabled reminders.
 */
export const scheduleReminders = async (configs: ReminderConfig[]) => {
  try {
    // 1. Cancel any previously scheduled reminder notifications
    const ids = await notifee.getTriggerNotificationIds();
    const reminderIds = ids.filter(id => id.startsWith('reminder_'));
    if (reminderIds.length > 0) {
      await notifee.cancelTriggerNotifications(reminderIds);
    }

    // 2. Request permission (highly recommended before scheduling triggers)
    await notifee.requestPermission();

    // 3. Create/retrieve Android notification channel (ignored on iOS)
    const channelId = await notifee.createChannel({
      id: 'reminders',
      name: 'Training Reminders',
      importance: 4, // high
    });

    // 4. Schedule trigger notifications for enabled days and times
    for (const config of configs) {
      if (!config.isEnabled) {
        continue;
      }

      for (const time of config.times) {
        const [hStr, mStr] = time.split(':');
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        if (isNaN(h) || isNaN(m)) {
          continue;
        }

        const nextTrigger = getNextTriggerDate(config.weekday, h, m);
        const notificationId = `reminder_${config.weekday}_${hStr}_${mStr}`;

        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: nextTrigger.getTime(),
          repeatFrequency: RepeatFrequency.WEEKLY,
        };

        await notifee.createTriggerNotification(
          {
            id: notificationId,
            title: 'Kegel Training',
            body: "It's time for your daily Kegel session!",
            android: {
              channelId,
              pressAction: {
                id: 'default',
              },
            },
          },
          trigger
        );
      }
    }
  } catch (e) {
    console.error('Failed to schedule Notifee reminders', e);
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

/** Open the system Clock app (no longer used for scheduling, kept for backwards compatibility). */
export const openAlarms = async () => {
  try {
    await AlarmModule?.openAlarms();
  } catch (e) {
    console.warn('Failed to open alarms', e);
  }
};
