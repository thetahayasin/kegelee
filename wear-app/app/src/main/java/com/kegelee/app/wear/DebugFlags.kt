package com.kegelee.app.wear

import android.content.Context

/**
 * TESTING ONLY. DELETE THIS FILE BEFORE PRODUCTION.
 *
 * Overrides that make states reachable by hand which otherwise need weeks of
 * real training or a second account. Every one of them is guarded by
 * `BuildConfig.DEBUG` at its call site as well as here, so a release build
 * cannot honour them even if a flag were somehow set - but the point is that
 * this whole file goes, not that it is safely inert.
 *
 * ## To remove
 *
 * Delete this file, then delete the three call sites the compiler will point
 * at: the unlock check in `HomeScreen`, the one in `ExercisesScreen`, and the
 * flag read in `MainActivity`. Nothing else refers to it.
 *
 * ## Usage
 *
 *   adb shell am start -S -n com.kegelee.app/.wear.MainActivity --ez unlock true
 *   adb shell am start -S -n com.kegelee.app/.wear.MainActivity --ez unlock false
 *
 * The setting persists across launches so a session can be started, finished
 * and inspected without re-passing it. `false` turns it off again.
 */
object DebugFlags {
    private const val PREFS = "kegelee_wear_debug"
    private const val K_UNLOCK_ALL = "unlock_all"

    /**
     * Treat the account as having trained long enough to have everything.
     *
     * Deliberately NOT a bypass of the gate. It raises the DAY COUNT the gate
     * is asked about, so the real filter still runs and the real ordering still
     * applies - testing the shipped rule with a different input rather than
     * testing a different rule. A bypass would have proved nothing about
     * whether the gate works.
     */
    fun unlockAll(context: Context): Boolean =
        BuildConfig.DEBUG && context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(K_UNLOCK_ALL, false)

    fun setUnlockAll(context: Context, on: Boolean) {
        if (!BuildConfig.DEBUG) return
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(K_UNLOCK_ALL, on).apply()
    }

    /**
     * The day count to use when the override is on.
     *
     * Past the last exercise's threshold (109) with room to spare, so the
     * catalogue can grow without this needing to be revisited.
     */
    const val UNLOCKED_DAYS = 9999
}
