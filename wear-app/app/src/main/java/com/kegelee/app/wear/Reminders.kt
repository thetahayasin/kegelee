package com.kegelee.app.wear

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import java.util.Calendar

/**
 * Reminders, on the wrist.
 *
 * The schedule itself is set on the phone and arrives with every pull - this
 * app never edits it, because a week is a fiddly thing to build on a 40mm
 * screen and there is already a good editor for it. What the watch adds is the
 * buzz: a tap on the wrist is far harder to miss than a phone notification in
 * another room, which is the whole reason somebody wears one.
 *
 * Bounded on purpose, exactly as the phone's own reminders are. Nothing is
 * scheduled as a repeating alarm: the next occurrence of each enabled slot is
 * armed, and firing one arms the following week. An endlessly repeating alarm
 * would outlive the subscription, the schedule and the account, and stopping it
 * would require this app to run - which is precisely what cannot be relied on.
 */
object Reminders {
    private const val CHANNEL = "kegelee-reminders"
    private const val ACTION = "com.kegelee.app.wear.REMIND"
    /** One request code per weekday slot, so re-arming replaces rather than piles up. */
    private const val BASE_REQUEST = 7100

    /** Never promise further ahead than this without the app having run again. */
    private const val HORIZON_DAYS = 8

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Training reminders", NotificationManager.IMPORTANCE_HIGH)
                .apply { description = "Time to train" },
        )
    }

    /**
     * Arm the next occurrence of every enabled slot.
     *
     * Called after each sync, so a schedule changed on the phone takes effect
     * here without anybody doing anything. Cancels first: a slot switched off
     * on the phone has to stop ringing on the watch, and the only way to know
     * which those are is to clear the lot and re-arm what survives.
     */
    fun apply(context: Context, profile: Profile?) {
        ensureChannel(context)
        cancelAll(context)

        // Not entitled means no reminders, the same rule the phone applies. An
        // account that cannot open the training screen should not be nudged
        // toward it.
        if (profile == null || !profile.entitled) return

        val alarms = context.getSystemService(android.app.AlarmManager::class.java) ?: return
        val now = System.currentTimeMillis()
        val horizon = now + HORIZON_DAYS * 24L * 60 * 60 * 1000

        var slot = 0
        for (day in profile.activeReminders) {
            for (time in day.times) {
                val at = nextOccurrence(day.weekday, time, now) ?: continue
                if (at > horizon) continue
                val intent = Intent(context, ReminderReceiver::class.java).setAction(ACTION)
                val pending = PendingIntent.getBroadcast(
                    context,
                    BASE_REQUEST + slot,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                slot++
                runCatching {
                    // Inexact and Doze-friendly, like the phone's. A training
                    // reminder is not an alarm clock, and Play treats exact
                    // alarms as a restricted permission this app cannot justify.
                    alarms.setAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, at, pending)
                }
            }
        }
    }

    private fun cancelAll(context: Context) {
        val alarms = context.getSystemService(android.app.AlarmManager::class.java) ?: return
        // 7 days x a few slots each, comfortably covering anything the phone's
        // editor can produce.
        for (i in 0 until 32) {
            val intent = Intent(context, ReminderReceiver::class.java).setAction(ACTION)
            val pending = PendingIntent.getBroadcast(
                context,
                BASE_REQUEST + i,
                intent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
            if (pending != null) {
                runCatching { alarms.cancel(pending) }
                pending.cancel()
            }
        }
    }

    /**
     * When this slot next comes round.
     *
     * `weekday` arrives Monday-first from the backend and `Calendar` is
     * Sunday-first, which is the trap the phone names in its own reminder code.
     * Converting here, once, is what stops Monday's reminder arriving on a
     * Tuesday.
     */
    private fun nextOccurrence(mondayFirstWeekday: Int, time: String, now: Long): Long? {
        val parts = time.split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: return null
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: return null

        // 0 = Mon .. 6 = Sun  ->  Calendar.MONDAY = 2 .. Calendar.SUNDAY = 1
        val calendarDay = ((mondayFirstWeekday + 1) % 7) + 1

        val cal = Calendar.getInstance().apply {
            timeInMillis = now
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        var delta = calendarDay - cal.get(Calendar.DAY_OF_WEEK)
        if (delta < 0) delta += 7
        if (delta == 0 && cal.timeInMillis <= now) delta = 7
        cal.add(Calendar.DAY_OF_YEAR, delta)
        return cal.timeInMillis
    }

    fun show(context: Context) {
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Time to train")
            .setContentText("A quick session keeps the streak going")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        runCatching {
            context.getSystemService(NotificationManager::class.java)
                ?.notify(ACTION.hashCode(), notification)
        }
    }
}

/**
 * Delivers a reminder, then arms the next one.
 *
 * The re-arm is what makes a bounded schedule self-sustaining: each firing
 * pushes the window forward, so the series keeps going for exactly as long as
 * the account stays entitled and stops on its own when it does not - with no
 * standing instruction to Android that could outlive either.
 */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        Reminders.show(context)
        Reminders.apply(context, Store.profile(context))
    }
}
