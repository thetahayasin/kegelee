package com.taha.androidalarms

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.AlarmClock
import androidx.fragment.app.FragmentActivity
import com.nativephp.mobile.bridge.BridgeFunction
import com.nativephp.mobile.bridge.BridgeResponse
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * PHP/JS-callable bridge that creates REAL alarms in the device's system Clock
 * app via AlarmClock.ACTION_SET_ALARM. The OS Clock app owns and fires them, so
 * this plugin runs NO AlarmManager, NO BroadcastReceiver, NO boot re-arming and
 * NO in-app notifications. The only permission is SET_ALARM (install-time).
 *
 *   nativephp_call('Alarm.SetWeeklySchedule', '{"appName":"Kegel","slots":[...]}')
 *   nativephp_call('Alarm.IsClockAppAvailable', '{}')
 *   nativephp_call('Alarm.OpenAlarmsList', '{}')
 *
 * NOTE: the bridge delivers JSON array params as org.json.JSONArray (not a Kotlin
 * List) and object params as JSONObject, so we read them with the org.json API.
 *
 * DECISION (a): EXTRA_SKIP_UI is a *request* - some OEM Clock apps still flash a
 * toast/UI or ignore it. We handle that gracefully (we never depend on silent
 * creation). DECISION (b): identical alarms may be re-used by the Clock app
 * rather than duplicated, which is fine. DECISION (c): we pass a real Activity
 * but still add FLAG_ACTIVITY_NEW_TASK so a non-Activity caller would also work.
 */
object AlarmFunctions {

    // App weekday index 0..6 (0=Monday .. 6=Sunday) -> Calendar day constants.
    private val ORDER = intArrayOf(
        Calendar.MONDAY, Calendar.TUESDAY, Calendar.WEDNESDAY, Calendar.THURSDAY,
        Calendar.FRIDAY, Calendar.SATURDAY, Calendar.SUNDAY,
    )
    private val NAMES = mapOf(
        "MON" to Calendar.MONDAY, "TUE" to Calendar.TUESDAY, "WED" to Calendar.WEDNESDAY,
        "THU" to Calendar.THURSDAY, "FRI" to Calendar.FRIDAY, "SAT" to Calendar.SATURDAY,
        "SUN" to Calendar.SUNDAY,
    )

    /** Map 0..6 (0=Mon..6=Sun) or MON..SUN / full day names to a Calendar day. */
    private fun toCalendarDay(value: Any?): Int? {
        when (value) {
            is Number -> value.toInt().let { if (it in 0..6) return ORDER[it] }
            is String -> {
                val key = value.trim().uppercase()
                NAMES[key]?.let { return it }
                if (key.length >= 3) NAMES[key.substring(0, 3)]?.let { return it }
                key.toIntOrNull()?.let { if (it in 0..6) return ORDER[it] }
            }
        }
        return null
    }

    private fun clockAvailable(context: Context, action: String = AlarmClock.ACTION_SET_ALARM): Boolean =
        Intent(action).resolveActivity(context.packageManager) != null

    /**
     * Whether we should let the user proceed to create alarms.
     *
     * BUGFIX / DECISION: on Android 11+ (API 30+) `resolveActivity` is filtered by
     * package visibility and returns null for the Clock app EVEN WHEN it is
     * installed (we don't declare a <queries> element). That made the check
     * false-negative with "no compatible Clock app". `startActivity` is NOT
     * visibility-filtered, so above API 30 we optimistically assume the system
     * Clock handler is present and rely on the try/catch in fireAlarm to detect a
     * genuine absence. Below API 30 the resolveActivity check is accurate.
     */
    private fun clockLikelyAvailable(context: Context): Boolean =
        clockAvailable(context) || Build.VERSION.SDK_INT >= Build.VERSION_CODES.R

    /** Build and fire one ACTION_SET_ALARM intent. Returns true if it was sent. */
    private fun fireAlarm(
        activity: FragmentActivity,
        hour: Int,
        minute: Int,
        message: String,
        days: List<Int>,
        vibrate: Boolean,
    ): Boolean {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(AlarmClock.EXTRA_HOUR, hour)
            putExtra(AlarmClock.EXTRA_MINUTES, minute)
            putExtra(AlarmClock.EXTRA_MESSAGE, message)
            putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            putExtra(AlarmClock.EXTRA_VIBRATE, vibrate)
            if (days.isNotEmpty()) {
                // EXTRA_DAYS makes one alarm recur on several weekdays.
                putIntegerArrayListExtra(AlarmClock.EXTRA_DAYS, ArrayList(days))
            }
        }

        // Fire it. startActivity (unlike resolveActivity) isn't blocked by package
        // visibility, so this reaches the system Clock app on Android 11+; a
        // genuine "no Clock app" surfaces as ActivityNotFoundException.
        return try {
            activity.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }

    /** Is a Clock app that can handle ACTION_SET_ALARM installed? */
    class IsClockAppAvailable(private val activity: FragmentActivity) : BridgeFunction {
        override fun execute(parameters: Map<String, Any>): Map<String, Any> =
            BridgeResponse.success(mapOf("available" to clockLikelyAvailable(activity)))
    }

    /**
     * The primary call. Groups the slots by identical hour:minute and fires ONE
     * intent per distinct time, whose EXTRA_DAYS lists every weekday at that time
     * (7:00 Mon/Wed/Fri + 21:00 daily = 2 intents, not 8). Distinct times on the
     * same day each get their own alarm.
     */
    class SetWeeklySchedule(private val activity: FragmentActivity) : BridgeFunction {
        override fun execute(parameters: Map<String, Any>): Map<String, Any> {
            if (!clockLikelyAvailable(activity)) {
                return BridgeResponse.success(mapOf("available" to false, "intentsFired" to 0))
            }

            val appName = (parameters["appName"] as? String)?.takeUnless { it.isBlank() } ?: "Reminder"
            val slots = parameters["slots"] as? JSONArray ?: JSONArray()
            val vibrate = (parameters["vibrate"] as? Boolean) ?: true

            // Group weekdays by their time. LinkedHashMap keeps a stable order;
            // LinkedHashSet de-dupes weekdays that repeat at the same time.
            data class Group(val hour: Int, val minute: Int, val label: String, val days: LinkedHashSet<Int>)
            val groups = LinkedHashMap<String, Group>()

            for (i in 0 until slots.length()) {
                val slot = slots.optJSONObject(i) ?: continue
                val hour = slot.optInt("hour", -1)
                val minute = slot.optInt("minute", 0)
                val day = toCalendarDay(slot.opt("dayOfWeek")) ?: continue
                if (hour !in 0..23 || minute !in 0..59) continue

                val key = "%02d:%02d".format(hour, minute)
                val label = slot.optString("label").takeUnless { it.isNullOrBlank() } ?: "Session"
                groups.getOrPut(key) { Group(hour, minute, label, LinkedHashSet()) }.days.add(day)
            }

            // Fire one intent per distinct time, STAGGERED on the main thread.
            // Firing several ACTION_SET_ALARM intents back-to-back makes some OEM
            // Clock apps register only the first (rapid identical-component
            // launches get coalesced), so we space them out and let each finish.
            val handler = Handler(Looper.getMainLooper())
            var fired = 0
            var step = 0
            for ((_, group) in groups) {
                // App-name prefix so the user can recognise + find these alarms.
                val message = "$appName · ${group.label}"
                val days = group.days.toList()
                handler.postDelayed({
                    fireAlarm(activity, group.hour, group.minute, message, days, vibrate)
                }, step * 700L)
                step++
                fired++
            }

            return BridgeResponse.success(
                mapOf(
                    "available" to true,
                    "slots" to slots.length(),
                    "groups" to groups.size,
                    "intentsFired" to fired,
                ),
            )
        }
    }

    /** Thin wrapper: fire one alarm for a single time on the given weekdays. */
    class SetSingleAlarm(private val activity: FragmentActivity) : BridgeFunction {
        override fun execute(parameters: Map<String, Any>): Map<String, Any> {
            if (!clockLikelyAvailable(activity)) {
                return BridgeResponse.success(mapOf("available" to false, "intentsFired" to 0))
            }

            val hour = (parameters["hour"] as? Number)?.toInt() ?: -1
            val minute = (parameters["minute"] as? Number)?.toInt() ?: 0
            if (hour !in 0..23 || minute !in 0..59) {
                return BridgeResponse.success(mapOf("available" to true, "intentsFired" to 0))
            }

            val label = (parameters["label"] as? String)?.takeUnless { it.isBlank() } ?: "Reminder"
            val vibrate = (parameters["vibrate"] as? Boolean) ?: true
            val daysJson = parameters["days"] as? JSONArray ?: JSONArray()
            val days = (0 until daysJson.length()).mapNotNull { toCalendarDay(daysJson.opt(it)) }

            val fired = if (fireAlarm(activity, hour, minute, label, days, vibrate)) 1 else 0

            return BridgeResponse.success(mapOf("available" to true, "intentsFired" to fired))
        }
    }

    /** Open the Clock app's alarms list so the user can review / remove alarms. */
    class OpenAlarmsList(private val activity: FragmentActivity) : BridgeFunction {
        override fun execute(parameters: Map<String, Any>): Map<String, Any> {
            val intent = Intent(AlarmClock.ACTION_SHOW_ALARMS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            // startActivity isn't package-visibility filtered (resolveActivity is),
            // so try it and report success/failure.
            val opened = try {
                activity.startActivity(intent)
                true
            } catch (e: ActivityNotFoundException) {
                false
            }

            return BridgeResponse.success(mapOf("opened" to opened))
        }
    }
}
