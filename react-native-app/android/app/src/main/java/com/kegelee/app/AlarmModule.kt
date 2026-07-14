package com.kegelee.app

import android.app.TimePickerDialog
import android.content.Intent
import android.provider.AlarmClock
import android.text.format.DateFormat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

/**
 * Creates real system Clock alarms via AlarmClock.ACTION_SET_ALARM - the same
 * "native reminders" behaviour as the original NativePHP app (not notifications).
 * EXTRA_SKIP_UI keeps it silent (no Clock app popping open); EXTRA_DAYS makes the
 * alarm repeat weekly on the given days.
 */
class AlarmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AlarmModule"

    /**
     * @param hour    0-23
     * @param minutes 0-59
     * @param message alarm label
     * @param days    Calendar day constants (SUNDAY=1 .. SATURDAY=7); empty = one-shot
     */
    @ReactMethod
    fun setAlarm(hour: Int, minutes: Int, message: String, days: ReadableArray, promise: Promise) {
        try {
            val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                putExtra(AlarmClock.EXTRA_HOUR, hour)
                putExtra(AlarmClock.EXTRA_MINUTES, minutes)
                putExtra(AlarmClock.EXTRA_MESSAGE, message)
                putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                putExtra(AlarmClock.EXTRA_VIBRATE, true)
                val dayList = ArrayList<Int>()
                for (i in 0 until days.size()) {
                    dayList.add(days.getInt(i))
                }
                if (dayList.isNotEmpty()) {
                    putIntegerArrayListExtra(AlarmClock.EXTRA_DAYS, dayList)
                }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                activity.startActivity(intent)
            } else {
                reactApplicationContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ALARM_ERROR", e.message, e)
        }
    }

    /**
     * Show the OS-native TimePickerDialog. Resolves { hour, minute } on OK, or
     * null if the user cancels. Used by the reminder editor so there is no text
     * field (and therefore no keyboard covering the modal).
     */
    @ReactMethod
    fun showTimePicker(hour: Int, minute: Int, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity to show the time picker")
            return
        }
        activity.runOnUiThread {
            var settled = false
            try {
                val dialog = TimePickerDialog(
                    activity,
                    { _, h, m ->
                        if (!settled) {
                            settled = true
                            val result = Arguments.createMap()
                            result.putInt("hour", h)
                            result.putInt("minute", m)
                            promise.resolve(result)
                        }
                    },
                    hour,
                    minute,
                    DateFormat.is24HourFormat(activity),
                )
                dialog.setOnCancelListener {
                    if (!settled) {
                        settled = true
                        promise.resolve(null)
                    }
                }
                dialog.show()
            } catch (e: Exception) {
                if (!settled) {
                    settled = true
                    promise.reject("PICKER_ERROR", e.message, e)
                }
            }
        }
    }

    /** Opens the Clock app so the user can review / remove alarms (there is no
     *  public API to delete alarms an app created via ACTION_SET_ALARM). */
    @ReactMethod
    fun openAlarms(promise: Promise) {
        try {
            val intent = Intent(AlarmClock.ACTION_SHOW_ALARMS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            (reactApplicationContext.currentActivity ?: reactApplicationContext).startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ALARM_ERROR", e.message, e)
        }
    }
}
