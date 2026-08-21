import { NativeModules, Platform } from 'react-native';
import notifee, {
  TriggerType,
  RepeatFrequency,
  TimestampTrigger,
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
} from '@notifee/react-native';

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
 * Cancels every scheduled reminder notification on this device (all `reminder_*`
 * triggers). Called when switching users so one account's reminders can never
 * fire for the next person who signs in.
 */
export const cancelAllReminders = async () => {
  try {
    const ids = await notifee.getTriggerNotificationIds();
    const reminderIds = ids.filter(id => id.startsWith('reminder_'));
    if (reminderIds.length > 0) {
      await notifee.cancelTriggerNotifications(reminderIds);
    }
  } catch (e) {
    console.warn('Failed to cancel reminder notifications', e);
  }
};

/**
 * Whether the app may schedule *exact* alarms. On Android 12+ (API 31+) this is
 * the "Alarms & reminders" special access, off by default on Android 14+. Returns
 * true when it's granted, or on Android < 12 where exact alarms are always
 * allowed (NOT_SUPPORTED means the setting itself doesn't exist).
 */
export const isExactAlarmAllowed = async (): Promise<boolean> => {
  try {
    const settings = await notifee.getNotificationSettings();
    return settings.android.alarm !== AndroidNotificationSetting.DISABLED;
  } catch {
    return false;
  }
};

/** Open the system "Alarms & reminders" special-access screen for this app. */
export const openExactAlarmSettings = async () => {
  try {
    await notifee.openAlarmPermissionSettings();
  } catch (e) {
    console.warn('Failed to open alarm permission settings', e);
  }
};

/**
 * Schedules recurring weekly local notifications using Notifee for enabled reminders.
 */
export const scheduleReminders = async (configs: ReminderConfig[]) => {
  try {
    // 1. Cancel any previously scheduled reminder notifications
    await cancelAllReminders();

    // 2. Request permission (highly recommended before scheduling triggers)
    await notifee.requestPermission();

    // 3. Create/retrieve Android notification channel (ignored on iOS).
    // Channels are IMMUTABLE once created: the original 'reminders' channel
    // shipped without an explicit sound and stayed silent on devices that
    // already had it, so this is a new id with the default sound baked in.
    const channelId = await notifee.createChannel({
      id: 'reminders-v2',
      name: 'Training Reminders',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });
    // Drop the old silent channel so it doesn't linger in system settings.
    try {
      await notifee.deleteChannel('reminders');
    } catch {}

    // Fire exactly on time when "Alarms & reminders" access is granted; otherwise
    // fall back to an inexact (Doze-batched, up to ~10 min late) alarm so the
    // reminder still arrives. Only the exact variant needs SCHEDULE_EXACT_ALARM.
    const alarmType = (await isExactAlarmAllowed())
      ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE
      : AlarmType.SET_AND_ALLOW_WHILE_IDLE;

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

        // Convert DB day index (0 = Monday ... 6 = Sunday) to JS/UI day index (0 = Sunday ... 6 = Saturday)
        const jsWeekday = config.weekday === 6 ? 0 : config.weekday + 1;
        const nextTrigger = getNextTriggerDate(jsWeekday, h, m);
        const notificationId = `reminder_${config.weekday}_${hStr}_${mStr}`;

        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: nextTrigger.getTime(),
          repeatFrequency: RepeatFrequency.WEEKLY,
          // Deliver through AlarmManager, not Notifee's default WorkManager, which
          // Android defers indefinitely in Doze and OEM battery optimisers kill
          // when the app is swiped away (reminders silently never fire). alarmType
          // is exact when the user has granted "Alarms & reminders", else an
          // inexact Doze-friendly fallback.
          alarmManager: {
            type: alarmType,
          },
        };

        await notifee.createTriggerNotification(
          {
            id: notificationId,
            title: 'Kegel Training',
            body: "It's time for your daily Kegel session!",
            android: {
              channelId,
              // Channel settings own the sound on Android 8+; this covers the
              // pre-channel devices (minSdk 24 = Android 7).
              sound: 'default',
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
  } catch {
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


