package com.kegelee.app.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-arm the reminder week after the watch restarts.
 *
 * Android drops every alarm on reboot, and nothing here noticed. The bounded
 * self-re-arming chain is the right design - each firing arms the next, so the
 * series lives exactly as long as the entitlement does - but a reboot cuts the
 * chain rather than advancing it, and there is no next firing left to restart
 * it. Reminders simply stopped, silently, until somebody happened to open the
 * app again. A watch reboots on updates and on flat batteries, so that is not a
 * rare event.
 *
 * Everything needed is already on disk: the schedule arrived with the last pull
 * and `apply` re-derives the whole week from the cached profile. No network, no
 * account check beyond the one `apply` already makes, nothing to wait for.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            // Some OEM images send this instead of the standard one.
            "android.intent.action.QUICKBOOT_POWERON",
            -> Reminders.apply(context, Store.profile(context))
        }
    }
}
