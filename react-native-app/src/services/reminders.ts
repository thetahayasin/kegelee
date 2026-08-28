import { NativeModules, Platform } from 'react-native';
import i18n from '../i18n';
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
export const scheduleReminders = async (
  configs: ReminderConfig[],
  opts?: { requestPermission?: boolean },
) => {
  try {
    // 1. Cancel any previously scheduled reminder notifications
    await cancelAllReminders();

    // 2. Ask for permission ONLY when a person is setting reminders.
    //
    // This used to be unconditional, which quietly undid the whole point of
    // taking the prompt out of sign-in: every sync reschedules this account's
    // reminders from the backend, and the first sync runs at login - so any
    // returning account with reminders got the system permission dialog
    // thrown at it on sign-in exactly as before, just from one call deeper.
    //
    // Rescheduling is bookkeeping. It happens in the background, the person
    // did not ask for it, and if they have already refused there is nothing to
    // be gained by asking again on every launch. The two places that pass
    // `true` are the two where someone has just tapped a button that plainly
    // means "yes, remind me": saving on the Schedule tab, and accepting the
    // offer on the completion screen.
    if (opts?.requestPermission) {
      await notifee.requestPermission();
    }

    // 3. Create/retrieve Android notification channel (ignored on iOS).
    // Channels are IMMUTABLE once created: the original 'reminders' channel
    // shipped without an explicit sound and stayed silent on devices that
    // already had it, so this is a new id with the default sound baked in.
    const channelId = await notifee.createChannel({
      id: 'reminders-v2',
      name: i18n.t('reminders.channelName'),
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
            title: i18n.t('reminders.notificationTitle'),
            body: i18n.t('reminders.notificationBody'),
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



/**
 * One-shot nudges: the lapse check-in and the trial-ending warning.
 *
 * Both exist because the app had exactly one way of ever contacting anyone -
 * the weekly reminders above - and that one way is off until a person goes
 * looking for it. Someone who trains for a week, stops, and never opened the
 * Schedule tab heard nothing at all, while continuing to be billed until they
 * noticed. Someone on a trial was never told it was about to convert, which is
 * both a conversion moment missed and the kind of surprise charge people
 * dispute.
 *
 * Separate channel from the training reminders, at DEFAULT rather than HIGH:
 * these are occasional and not time-critical, and burying them in the same
 * channel would mean turning off one to silence the other.
 */
const NUDGE_CHANNEL_ID = 'nudges-v1';
const LAPSE_NOTIFICATION_ID = 'nudge_lapse';
const TRIAL_NOTIFICATION_ID = 'nudge_trial_ending';

/** Silence after a completed session before the check-in fires. */
const LAPSE_DELAY_MS = 72 * 60 * 60 * 1000;
/** How far ahead of the trial's end the warning lands. */
const TRIAL_WARNING_LEAD_MS = 24 * 60 * 60 * 1000;

const nudgeChannel = async (): Promise<string> =>
  notifee.createChannel({
    id: NUDGE_CHANNEL_ID,
    name: i18n.t('reminders.nudgeChannelName'),
    importance: AndroidImportance.DEFAULT,
    sound: 'default',
  });

const scheduleOneShot = async (
  id: string,
  at: number,
  title: string,
  body: string,
): Promise<void> => {
  // Never schedule into the past - Notifee rejects it, and for the trial
  // warning a lead time that has already elapsed is a normal case (someone
  // subscribing with less than a day of trial left).
  if (at <= Date.now()) return;

  const channelId = await nudgeChannel();
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: at,
    // Same reasoning as the weekly reminders: WorkManager gets deferred
    // indefinitely in Doze and killed by OEM battery optimisers. Inexact is
    // fine here - nothing about these is to-the-minute - so this never needs
    // the exact-alarm permission.
    alarmManager: { type: AlarmType.SET_AND_ALLOW_WHILE_IDLE },
  };

  await notifee.createTriggerNotification(
    {
      id,
      title,
      body,
      android: { channelId, sound: 'default', pressAction: { id: 'default' } },
    },
    trigger,
  );
};

/**
 * Push the check-in back to 72 hours from now.
 *
 * Called on every completed session, so an active user perpetually postpones
 * it and never sees it - which is the point. It only ever arrives for someone
 * who has actually gone quiet.
 */
export const scheduleLapseNudge = async (): Promise<void> => {
  try {
    await notifee.cancelTriggerNotification(LAPSE_NOTIFICATION_ID);
  } catch {}
  try {
    await scheduleOneShot(
      LAPSE_NOTIFICATION_ID,
      Date.now() + LAPSE_DELAY_MS,
      i18n.t('reminders.lapseTitle'),
      i18n.t('reminders.lapseBody'),
    );
  } catch (e) {
    console.warn('Failed to schedule lapse nudge', e);
  }
};

export const cancelLapseNudge = async (): Promise<void> => {
  try {
    await notifee.cancelTriggerNotification(LAPSE_NOTIFICATION_ID);
  } catch {}
};

/**
 * Warn a day before the trial converts. Passing null (no trial, or it has
 * already converted) just clears any warning already scheduled, so this can be
 * called unconditionally whenever the subscription state is read.
 */
export const scheduleTrialEndingWarning = async (
  trialEndsAt: string | null | undefined,
): Promise<void> => {
  try {
    await notifee.cancelTriggerNotification(TRIAL_NOTIFICATION_ID);
  } catch {}
  if (!trialEndsAt) return;

  const endsAt = Date.parse(trialEndsAt);
  if (!Number.isFinite(endsAt)) return;

  try {
    await scheduleOneShot(
      TRIAL_NOTIFICATION_ID,
      endsAt - TRIAL_WARNING_LEAD_MS,
      i18n.t('reminders.trialEndingTitle'),
      i18n.t('reminders.trialEndingBody'),
    );
  } catch (e) {
    console.warn('Failed to schedule trial-ending warning', e);
  }
};

/**
 * Drop every one-shot nudge. Called alongside cancelAllReminders when the
 * signed-in account changes, so one person's check-in cannot fire at the next.
 */
export const cancelAllNudges = async (): Promise<void> => {
  try {
    await notifee.cancelTriggerNotification(LAPSE_NOTIFICATION_ID);
    await notifee.cancelTriggerNotification(TRIAL_NOTIFICATION_ID);
  } catch {}
};
