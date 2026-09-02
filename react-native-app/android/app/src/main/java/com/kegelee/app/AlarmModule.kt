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

/**
 * The two small pieces of system UI the reminder editor needs: the OS time
 * picker, and a way into the Clock app.
 *
 * setAlarm() used to live here too, creating real system Clock alarms via
 * AlarmClock.ACTION_SET_ALARM - the original NativePHP app's behaviour. It was
 * removed along with the SET_ALARM permission, because reminders have been
 * delivered by Notifee for some time now and nothing on the JS side had called
 * it since. A permission on the store listing that no code path can reach is
 * pure cost: it appears in the app's permission list, it needs justifying, and
 * it grants a capability nobody is using.
 */
class AlarmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AlarmModule"

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
            // A Promise may be settled exactly once; settling it twice crashes
            // the bridge with "Illegal callback invocation from native module".
            // Every path below goes through this guard rather than trusting
            // that the listeners are mutually exclusive - they are not.
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
                /**
                 * Dismiss, not cancel.
                 *
                 * setOnCancelListener only fires for an explicit cancel - the
                 * back button or a tap outside. It does NOT fire when the
                 * dialog goes away for any other reason: the activity being
                 * recreated on a configuration change, the window being
                 * dismissed programmatically, the process being backgrounded
                 * and the activity destroyed. In all of those the promise was
                 * simply never settled, so the JS `await` hung forever and the
                 * reminder editor sat with a dead time field that could not be
                 * opened again.
                 *
                 * onDismiss fires for every one of those AND after a cancel
                 * AND after a successful pick, so it is the one hook that is
                 * guaranteed to run. The guard above makes the success case a
                 * no-op here.
                 */
                dialog.setOnDismissListener {
                    if (!settled) {
                        settled = true
                        promise.reject("PICKER_CANCELLED", "Time picker dismissed without a selection")
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
