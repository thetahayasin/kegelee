import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import i18n from '../i18n';
import { getDBUser, getReminders } from '../db/queries';
import { resolveEntitlement } from './entitlement';
import { track } from './events';
import notifee, {
  TriggerType,
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
  /**
   * The instant the last notification handed to the OS will fire, or null when
   * none were. See `REMINDER_HORIZON_MS` for why there is an end at all.
   */
  scheduledThrough: number | null;
}

/**
 * How far ahead reminders are handed to the OS, and why there is a limit.
 *
 * These used to be created as `RepeatFrequency.WEEKLY` triggers, which is an
 * instruction to Android to re-arm them forever. Nothing about that expires:
 * once the alarm exists it fires every week whether or not the app is ever
 * opened again, whether or not the account still pays, and whether or not the
 * feature that created it is still reachable. The app cancelled them when it
 * noticed a lapse - but noticing requires the app to run, and the whole point
 * of a lapsed account is that it does not open the app. So somebody who
 * cancelled went on being reminded, indefinitely, by a screen they could no
 * longer open.
 *
 * Discrete one-shot triggers over a rolling window fix that at the source: the
 * schedule runs out on its own, so the OS stops on the date we last had
 * permission to promise, with no code needing to run to make it happen. Every
 * sync and every foreground while entitled tops the window back up.
 *
 * Four weeks is chosen to comfortably outlast the gap between app opens for
 * anybody actually training (a single reminder tap tops it up), while bounding
 * a lapsed account's leftover notifications to weeks rather than forever.
 */
export const REMINDER_HORIZON_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * A hard ceiling on how many triggers this app will hold at once.
 *
 * AlarmManager rejects new alarms past a few hundred per app, and a rejection
 * part-way through the loop would leave a half-built schedule. Seven days at
 * the two times a plan asks for is 14 a week, so 64 covers the full horizon
 * with room to spare and only ever bites on a schedule far denser than the UI
 * can produce.
 */
const MAX_SCHEDULED_REMINDERS = 64;

/**
 * How close to the end of the window a top-up starts.
 *
 * A week of slack, so a device that opens the app even once a week never
 * reaches the edge, and one that does not is refilled the moment it comes
 * back.
 */
const REMINDER_TOPUP_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Extra room past an auto-renewing subscription's `ends_at`.
 *
 * A renewal is invisible to a device that has not synced since it happened:
 * the local row still carries the old expiry, so capping strictly at it would
 * silence a paying subscriber's reminders on their renewal date. A notification
 * is not access, and the two failure modes are not symmetric - over-notifying a
 * lapsed account for a few days is a far smaller harm than going quiet on
 * somebody who is still paying, and reminders are the one thing that brings
 * either of them back to the app, where the truth is re-established.
 *
 * Deliberately NOT applied to a cancelled or expired row. Those have no
 * renewal coming, so there is nothing to leave room for.
 */
const RENEWAL_HEADROOM_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What is currently handed to the OS for this account: how far ahead it runs,
 * and what it was built from.
 *
 * Both halves earn their place. `through` is what lets a device that cannot
 * reach the network - and therefore never runs the sync that would normally
 * re-schedule - refill the window from its own local rows before it empties.
 * `fingerprint` is what stops the schedule being torn down and rebuilt on
 * every single pull: applying it is dozens of calls across the native bridge,
 * the sync runs on nearly every foreground, and almost none of those syncs
 * change anything about the week the reader set.
 */
const scheduleStateKey = (userId: number | string) =>
  `@reminders_scheduled_through_${userId}`;

interface ScheduleState {
  through: number | null;
  fingerprint: string;
}

const rememberScheduleState = async (
  userId: number,
  state: ScheduleState,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(scheduleStateKey(userId), JSON.stringify(state));
  } catch {}
};

const readScheduleState = async (userId: number): Promise<ScheduleState | null> => {
  try {
    const raw = await AsyncStorage.getItem(scheduleStateKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.fingerprint !== 'string') return null;
    const through = parsed.through === null ? null : Number(parsed.through);
    if (through !== null && !Number.isFinite(through)) return null;
    return { through, fingerprint: parsed.fingerprint };
  } catch {
    return null;
  }
};

/** When the reminders currently handed to the OS run out. */
export const remindersScheduledThrough = async (
  userId: number,
): Promise<number | null> => (await readScheduleState(userId))?.through ?? null;

/**
 * Forget what was scheduled for an account, without touching the OS.
 *
 * For sign-out, which cancels the notifications separately. Left behind, the
 * record would claim a full window still stood over alarms that no longer
 * exist, and the next sign-in would skip the rebuild it needs - so the account
 * that came back would simply never be reminded again.
 */
export const forgetReminderSchedule = async (userId: number): Promise<void> => {
  try {
    await AsyncStorage.removeItem(scheduleStateKey(userId));
  } catch {}
};

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
   *
   * `until` is the instant the account's entitlement runs out. Nothing is
   * scheduled past it, which is what stops a lapsed account being reminded by
   * a feature it can no longer open. `null` or absent means no known deadline,
   * and the horizon alone applies.
   */
  opts?: { requestPermission?: boolean; userId?: number; until?: number | null },
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
    return { scheduled: false, permission, scheduledThrough: null };
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

    /**
     * The last instant anything may be scheduled for.
     *
     * The rolling horizon and the entitlement deadline, whichever comes first.
     * A `null` deadline means nothing is known to end, so the horizon decides
     * on its own - an admin, or a subscription with no expiry at all.
     */
    const now = Date.now();
    const horizonEnd = now + REMINDER_HORIZON_MS;
    const until = typeof opts?.until === 'number' ? opts.until : null;
    const cutoff = until === null ? horizonEnd : Math.min(horizonEnd, until);

    // Nothing left to promise. Not an error: it is the correct outcome for an
    // entitlement that has already run out, and the caller cancelled above.
    if (cutoff <= now) {
      return { scheduled: true, permission, scheduledThrough: null };
    }

    /**
     * Every occurrence, gathered before anything is handed to the OS.
     *
     * Built first so the count can be capped and the list sorted by time: with
     * a ceiling to respect, the ones that should survive it are the SOONEST,
     * not whichever weekday the loop happened to reach first.
     */
    const occurrences: { at: number; id: string }[] = [];
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

        // The first occurrence, then the same slot a week later, and again,
        // until the cutoff. One trigger per firing rather than one repeating
        // trigger, so the series ENDS - see REMINDER_HORIZON_MS.
        const occurrence = getNextTriggerDate(dbWeekdayToJs(config.weekday), h, m);
        for (let week = 0; occurrence.getTime() <= cutoff; week++) {
          occurrences.push({
            // Week-indexed rather than date-stamped: the id is reported with
            // every reminder_tapped event, and a date in it would make each
            // one unique and the figure useless to group by.
            at: occurrence.getTime(),
            id: `reminder_${config.weekday}_${hStr}_${mStr}_w${week}`,
          });
          // Date arithmetic, not `+ 7 * 24h`. Adding a fixed number of
          // milliseconds moves an 08:00 reminder to 07:00 or 09:00 across a
          // daylight-saving change; adding seven days to the date keeps the
          // wall-clock time the reader chose.
          occurrence.setDate(occurrence.getDate() + 7);
        }
      }
    }

    occurrences.sort((a, b) => a.at - b.at);
    const scheduled = occurrences.slice(0, MAX_SCHEDULED_REMINDERS);

    for (const occurrence of scheduled) {
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: occurrence.at,
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
          id: occurrence.id,
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

    return {
      scheduled: true,
      permission,
      scheduledThrough: scheduled.length > 0 ? scheduled[scheduled.length - 1].at : null,
    };
  } catch (e) {
    console.error('Failed to schedule Notifee reminders', e);
    return { scheduled: false, permission, scheduledThrough: null };
  }
};

/**
 * Bring this device's scheduled reminders into line with the account's
 * entitlement, from the local rows alone.
 *
 * The one place the rule lives, so the two callers cannot disagree. It used to
 * be spread across a sync section that RE-SCHEDULED on every pull and a
 * context effect that CANCELLED on every state change, and they fought: the
 * sync ran far more often, so it won, and a lapsed account had its reminders
 * put straight back after every cancel.
 *
 * The rule is a state, not a transition:
 *
 *   entitled     -> the local rows are scheduled, out to the entitlement
 *   not entitled -> nothing is scheduled
 *
 * The rows themselves are never touched. Nothing is deleted, so subscribing
 * again restores the same schedule rather than asking somebody to set their
 * week up a second time.
 *
 * Network-free by construction: `resolveEntitlement` reads SQLite and
 * AsyncStorage, which is what lets an offline device still refill its own
 * window before it empties, and still go quiet when its subscription ends.
 */
export const applyReminderSchedule = async (
  userId: number,
  isAdmin: boolean,
  /**
   * `requestPermission` is for the two places a person has just tapped
   * something that plainly means "yes, remind me": saving on the Schedule tab,
   * and accepting the offer on the completion screen. Every other caller is a
   * background reschedule that asks nobody anything - and implies `force`,
   * because somebody is waiting on the answer.
   *
   * `force` rebuilds the schedule even when nothing appears to have changed.
   */
  opts?: { requestPermission?: boolean; force?: boolean },
): Promise<ScheduleResult> => {
  const entitlement = await resolveEntitlement(userId, isAdmin);

  if (!entitlement.active) {
    // Always, and never skipped by the fingerprint below. This is the safety
    // path - one bridge call to list the pending triggers, and a second only
    // if there are any - and the cost of getting it wrong is somebody being
    // notified by a feature they cannot open.
    await cancelAllReminders();
    await rememberScheduleState(userId, { through: null, fingerprint: 'none' });
    return { scheduled: false, permission: 'unknown', scheduledThrough: null };
  }

  /**
   * How far ahead this account may be promised anything.
   *
   * An auto-renewing row gets a renewal's worth of headroom, because a
   * renewal that has happened but not yet reached this device leaves the
   * local expiry looking older than it is - see RENEWAL_HEADROOM_MS.
   */
  const autoRenewing = Number(entitlement.subscription?.auto_renewing) === 1;
  const until =
    entitlement.expiresAt === null
      ? null
      : entitlement.expiresAt + (autoRenewing ? RENEWAL_HEADROOM_MS : 0);

  const rows = await getReminders(userId);
  const configs = rows.map((r) => ({
    weekday: r.weekday,
    times: r.times,
    isEnabled: r.is_enabled === 1,
  }));

  /**
   * Everything the resulting schedule depends on, except the clock.
   *
   * The clock is deliberately left out and handled by the window check
   * instead: a fingerprint that moved with `now` would never match, which is
   * the behaviour this exists to avoid. `until` is stable between renewals, so
   * a cancellation or a plan change does change it and does force a rebuild.
   */
  const fingerprint = JSON.stringify([until, configs.filter((c) => c.isEnabled)]);
  const forced = opts?.force || opts?.requestPermission;

  if (!forced) {
    const state = await readScheduleState(userId);
    // Same week, same ceiling, and the window still has room in it. Rebuilding
    // would hand the OS the identical set of alarms it already holds.
    if (
      state
      && state.fingerprint === fingerprint
      && state.through !== null
      && state.through - Date.now() > REMINDER_TOPUP_THRESHOLD_MS
    ) {
      return { scheduled: true, permission: 'unknown', scheduledThrough: state.through };
    }
  }

  const result = await scheduleReminders(configs, {
    until,
    requestPermission: opts?.requestPermission,
    userId,
  });
  await rememberScheduleState(userId, {
    through: result.scheduled ? result.scheduledThrough : null,
    // A failed or refused attempt must not be remembered as the current
    // state, or the next call would skip the retry it needs.
    fingerprint: result.scheduled ? fingerprint : 'unset',
  });
  return result;
};

/**
 * Re-arm the series from the notification that just fired.
 *
 * The one thing that makes a bounded schedule survive an unbounded absence.
 *
 * Reminders are scheduled four weeks ahead and topped up whenever the app runs,
 * which covers everybody who opens it. It does not cover the person the
 * reminders exist FOR: somebody who has stopped training, is still paying, and
 * is being nudged precisely because they are not opening the app. Their window
 * would quietly run out about a month in, and the one mechanism this app has
 * for bringing them back would go silent on a paying customer.
 *
 * Notifee delivers an event to the background handler every time a reminder is
 * shown, and that handler is ordinary JS with the database and the stored
 * verdict in reach. So each delivery refills the window, and the series keeps
 * itself alive for exactly as long as the entitlement does - no app open
 * required, and no standing instruction to Android that outlives the
 * subscription. When the entitlement HAS ended, this is what cancels the rest
 * of the series instead of extending it.
 *
 * Cheap: applyReminderSchedule does nothing at all until the window is running
 * down or something about the schedule has changed.
 */
export const topUpFromDelivery = async (notificationId?: string | null): Promise<void> => {
  if (!notificationId || !notificationId.startsWith('reminder_')) return;
  try {
    const user = await getDBUser();
    if (!user) return;
    await applyReminderSchedule(user.id, user.is_admin === 1);
  } catch {
    // A failed top-up costs the tail of the window, not this notification.
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
