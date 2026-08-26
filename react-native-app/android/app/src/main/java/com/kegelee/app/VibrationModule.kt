package com.kegelee.app

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Whether the workout cue can actually be felt, and a way to the setting that
 * decides it.
 *
 * The contract cue is fired with React Native's Vibration.vibrate, which sends
 * an untagged one-shot deliberately: the tagged effects that
 * react-native-haptic-feedback sends are stamped VibrationAttributes.USAGE_TOUCH
 * and Android 13+ drops those whenever "Touch feedback" is off - a setting about
 * keypress ticks that has no business silencing a training cue.
 *
 * An untagged buzz still obeys the two things that legitimately outrank us:
 * hardware that cannot vibrate at all, and the system-wide vibration switch.
 * When either is the case the buzz simply never arrives, and the app's own
 * Vibration switch keeps happily reporting "on" - which reads as a broken app
 * rather than as a phone doing what it was told. This module exists so that
 * screen can tell the difference and say which one it is.
 */
class VibrationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "VibrationModule"

    private fun vibrator(): Vibrator? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = reactApplicationContext
                .getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            manager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            reactApplicationContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    } catch (e: Exception) {
        null
    }

    /**
     * @return hasVibrator          the hardware exists and is usable
     * @return systemVibrationOn    best-effort read of the system-wide switch
     * @return systemVibrationKnown false when we could not read that switch at
     *         all, so the caller can stay quiet instead of guessing
     *
     * Settings.System.VIBRATE_ON is the master "Vibration & haptics" toggle, but
     * the constant is @hide, so it is read by its literal key. Several OEM skins
     * (Samsung and Xiaomi among them) keep their own switch elsewhere and leave
     * this one stale, which is why an unreadable or absent value is reported as
     * unknown rather than as "off": warning someone their vibration is disabled
     * when it is not is worse than staying silent.
     */
    @ReactMethod
    fun getStatus(promise: Promise) {
        val result = Arguments.createMap()
        try {
            result.putBoolean("hasVibrator", vibrator()?.hasVibrator() == true)
        } catch (e: Exception) {
            result.putBoolean("hasVibrator", true)
        }

        try {
            val value = Settings.System.getInt(
                reactApplicationContext.contentResolver,
                "vibrate_on",
                -1,
            )
            result.putBoolean("systemVibrationKnown", value >= 0)
            result.putBoolean("systemVibrationOn", value != 0)
        } catch (e: Exception) {
            result.putBoolean("systemVibrationKnown", false)
            result.putBoolean("systemVibrationOn", true)
        }

        promise.resolve(result)
    }

    /**
     * Sound & vibration settings, where both the master switch and the
     * per-category ones live. Falls back to the app's own settings page on the
     * skins that do not answer the generic action.
     */
    @ReactMethod
    fun openSystemSoundSettings(promise: Promise) {
        val targets = listOf(
            Intent(Settings.ACTION_SOUND_SETTINGS),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(
                android.net.Uri.parse("package:" + reactApplicationContext.packageName),
            ),
        )
        for (intent in targets) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                val activity = reactApplicationContext.currentActivity
                if (activity != null) activity.startActivity(intent)
                else reactApplicationContext.startActivity(intent)
                promise.resolve(true)
                return
            } catch (e: Exception) {
                // Try the next one.
            }
        }
        promise.resolve(false)
    }
}
