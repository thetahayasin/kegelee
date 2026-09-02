import { NativeModules, Platform } from 'react-native';
import i18n from '../i18n';
import { track } from './events';
import notifee, {
  TriggerType,
  RepeatFrequency,
  TimestampTrigger,
  AlarmType,
  AndroidImportance,
  AndroidNotificationSetting,
  AuthorizationStatus,
} from '@notifee/react-native';

const { AlarmModule } = NativeModules;

export interface ReminderConfig {
  /** DB weekday index: 0 = Monday .. 6 = Sunday. NOT the JS `Date.getDay()` order. */
  weekday: number;
  times: string[]; // ['08:00', '18:00']
  isEnabled: boolean;
}

/**
 * The two weekday orders this app has to live with, and the conversion between.
 *
 * The backend and the `reminders` table store Monday-first (0 = Mon .. 6 = Sun)
 * because that is how the schedule is written and read. `Date.getDay()` is
 * Sunday-first (0 = Sun .. 6 = Sat) and is not negotiable.
 *
 * The conversion was written inline in two places (the Schedule tab and the
 * scheduler below) and the doc comment above claimed the DB order was the JS
 * one, which is how a "Monday" reminder could be scheduled for Tuesday.
 * Exporting one pair of functions means the two ends cannot disagree.
 */
export const dbWeekdayToJs = (dbWeekday: number): number => (dbWeekday + 1) % 7;

export const jsWeekdayToDb = (jsWeekday: number): number => (jsWeekday + 6) % 7;

/** What `scheduleReminders` managed to do, so the caller can say so. */
export interface ScheduleResult {
  /** Whether the trigger notifications were actually created. */
  scheduled: boolean;
  permission: 'granted' | 'denied' | 'unknown';
}

/**
 * Calculates the next trigger date/time for a given weekday, hour, and minute.
 * `weekday` here is the JS/Sunday-first index, matching `Date.getDay()`.
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
 * Whether the app may schedule *exact* alarms.
 *
 * Kept, but no longer something the app asks for. SCHEDULE_EXACT_ALARM and
 * USE_EXACT_ALARM were removed from the manifest because Play treats exact
 * alarms as a restricted permission that this app cannot justify: a training
 * reminder is not an alarm clock. So on Android 12+ this is always DISABLED
 * and the inexact, Doze-friendly alarm is simply the path.
 *
 * It survives only to pick the AlarmManager type below, where "exact if the OS
 * happens to allow it" is still the right question on the pre-12 devices where
 * exact alarms need no permission at all. Nothing shows a prompt off the back
 * of it any more.
 */
export const isExactAlarmAllowed = async (): Promise<boolean> => {
  try {
    const settings = await notifee.getNotificationSettings();
    return settings.android.alarm !== AndroidNotificationSetting.DISABLED;
  } catch {
    return false;
  }
};

/**
 * Open this app's system notification settings.
 *
 * The only route back from a refused permission. Android will not show the
 * runtime prompt a second time once it has been dismissed twice, so a screen
 * that says "notifications are off" without this is a dead end.
 */
export const openNotificationSettings = async () => {
  try {
    await notifee.openNotificationSettings();
  } catch (e) {
    console.warn('Failed to open notification settings', e);
  }
};

/**
 * The "Alarms & reminders" special access screen, for this app.
 *
 * A different destination from openNotificationSettings above, and the two are
 * not interchangeable: notifications control whether anything is delivered at
 * all, this controls whether it is delivered ON TIME. An app can hold the
 * first and still have its reminders shifted by minutes without the second.
 *
 * Only reachable because SCHEDULE_EXACT_ALARM is declared again. While it was
 * stripped from the manifest this screen did not list the app at all, which is
 * why the offer was removed from the Schedule tab.
 */
export const openExactAlarmSettings = async () => {
  try {
    await notifee.openAlarmPermissionSettings();
  } catch (e) {
    console.warn('Failed to open alarm permission settings', e);
  }
};

/**
 * Schedules recurring weekly local notifications using Notifee for enabled reminders.
 *
 * Returns what actually happened rather than nothing. The whole body used to
 * sit in one try/catch that logged and swallowed, so a refused notification
 * permission was indistinguishable from success: the Schedule tab said
 * "Reminders saved" and no reminder would ever arrive. The permission step is
 * now checked on its own, and a denial short-circuits before anything is
 * scheduled so the caller can explain it.
 */
export const scheduleReminders = async (
  configs: ReminderConfig[],
  /**
   * `userId` is only needed when `requestPermission` is set: it attributes the
   * answer to the person who was asked. Every other caller of this function is
   * a background reschedule that asks nobody anything and records nothing.
   */
  opts?: { requestPermission?: boolean; userId?: number },
): Promise<ScheduleResult> => {
  // Cancelling is bookkeeping and its failure is not the caller's problem, so
  // it keeps its own guard rather than aborting the schedule.
  await cancelAllReminders();

  // Ask for permission ONLY when a person is setting reminders.
  //
  // Requesting used to be unconditional, which quietly undid the whole point
  // of taking the prompt out of sign-in: every sync reschedules this account's
  // reminders from the backend, and the first sync runs at login, so any
  // returning account with reminders got the system permission dialog thrown
  // at it on sign-in exactly as before, just from one call deeper.
  //
  // Rescheduling is bookkeeping. It happens in the background, the person did
  // not ask for it, and if they have already refused there is nothing to be
  // gained by asking again on every launch. The two places that pass `true`
  // are the two where someone has just tapped a button that plainly means
  // "yes, remind me": saving on the Schedule tab, and accepting the offer on
  // the completion screen. Everywhere else only READS the current answer,
  // which is what lets a background reschedule still report a denial.
  let permission: ScheduleResult['permission'] = 'unknown';
  try {
    /**
     * What the system said BEFORE we asked.
     *
     * Only read on the ask path, and only to tell two different failures
     * apart. A refusal at a dialog the reader just saw is a copy problem - the
     * ask arrived at a bad moment, or the reason was not convincing. A system
     * that was already refusing before we asked cannot be fixed by asking
     * better; the only route back is the system settings screen, which is why
     * this app has a button for it. They need opposite responses, and one
     * "denied" bucket hides which one you are looking at.
     */
    const before = opts?.requestPermission
      ? await notifee.getNotificationSettings().catch(() => null)
      : null;
    const wasRefused = before?.authorizationStatus === AuthorizationStatus.DENIED;

    const settings = opts?.requestPermission
      ? await notifee.requestPermission()
      : await notifee.getNotificationSettings();
    permission =
      settings.authorizationStatus === AuthorizationStatus.DENIED
        ? 'denied'
        : settings.authorizationStatus === AuthorizationStatus.AUTHORIZED
          || settings.authorizationStatus === AuthorizationStatus.PROVISIONAL
          ? 'granted'
          : 'unknown';

    /**
     * Recorded only where somebody was actually asked.
     *
     * scheduleReminders also runs on every sync to re-apply the account's
     * schedule, and recording there would write a row per sync about a
     * question nobody was posed. 'unknown' is skipped for the same reason: on
     * Android below 13 there is no runtime permission to grant, so there is no
     * answer to report.
     */
    if (opts?.requestPermission && permission !== 'unknown') {
      track(
        opts.userId,
        'notification_permission',
        permission === 'granted' ? 'granted' : wasRefused ? 'blocked' : 'denied',
      );
    }
  } catch (e) {
    // A platform that will not answer is not a refusal. 'unknown' lets the
    // scheduling go ahead, because on Android below 13 there is no runtime
    // permission to grant and notifications simply work.
    console.warn('Could not read notification permission', e);
  }

  if (permission === 'denied') {
    return { scheduled: false, permission };
  }

  try {
    // Create/retrieve Android notification channel (ignored on iOS).
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

        const nextTrigger = getNextTriggerDate(dbWeekdayToJs(config.weekday), h, m);
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
    return { scheduled: true, permission };
  } catch (e) {
    console.error('Failed to schedule Notifee reminders', e);
    return { scheduled: false, permission };
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
