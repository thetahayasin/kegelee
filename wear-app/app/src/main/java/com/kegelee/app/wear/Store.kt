package com.kegelee.app.wear

import android.content.Context
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * What this account looks like right now, as last heard from the server.
 *
 * Cached so the watch opens on real figures with no network - which on a wrist
 * is the normal case, not the exception - and so a session can be started in a
 * lift or a gym basement.
 */
@Serializable
data class Profile(
    @SerialName("name") val name: String = "",
    @SerialName("email") val email: String = "",
    @SerialName("levelId") val levelId: Int = 1,
    @SerialName("entitled") val entitled: Boolean = false,
    @SerialName("completedDays") val completedDays: Int = 0,
    @SerialName("day") val day: Int = 1,
    @SerialName("month") val month: Int = 1,
    @SerialName("todayDone") val todayDone: Int = 0,
    @SerialName("todayRequired") val todayRequired: Int = 2,
    @SerialName("streak") val streak: Int = 0,
    /** Longest hold recorded, in seconds. 0 when nothing has been measured. */
    @SerialName("bestHold") val bestHold: Int = 0,
    /** The reminder week, as the phone has it. Monday-first weekdays. */
    @SerialName("reminders") val reminders: List<ReminderDay> = emptyList(),
    @SerialName("syncedAt") val syncedAt: Long = 0L,
) {
    val todayComplete: Boolean get() = todayRequired > 0 && todayDone >= todayRequired

    /**
     * Entitlement, with a staleness bound.
     *
     * `entitled` on its own is what the server last said, and a cached yes has
     * no expiry - so a subscription that lapsed while the watch was offline
     * would keep the full exercise set indefinitely. That is the same bug the
     * phone had, where the gate could be raised and never lowered.
     *
     * A week is far longer than the gap between syncs on any watch in use (one
     * runs on every app open), so in practice this never bites a paying
     * customer; it bounds the failure for a device that has genuinely stopped
     * checking. Erring long is deliberate - the cost of being late is a few
     * free days, the cost of being early is locking out somebody who paid.
     */
    fun entitledAsOf(now: Long): Boolean =
        entitled && syncedAt > 0L && (now - syncedAt) < ENTITLEMENT_TTL_MS

    /** Only the days actually switched on, in week order. */
    val activeReminders: List<ReminderDay>
        get() = reminders.filter { it.enabled && it.times.isNotEmpty() }.sortedBy { it.weekday }
}

/** How long a cached "subscribed" is honoured without a successful sync. */
const val ENTITLEMENT_TTL_MS: Long = 7L * 24 * 60 * 60 * 1000

/**
 * One day of the reminder week.
 *
 * `weekday` is the backend's Monday-first index (0 = Mon .. 6 = Sun), NOT
 * `Calendar`'s Sunday-first one. The phone carries the same trap and names it
 * in services/reminders.ts; getting it wrong shows Monday's reminder on a
 * Tuesday, which fails quietly.
 */
@Serializable
data class ReminderDay(
    @SerialName("weekday") val weekday: Int = 0,
    @SerialName("times") val times: List<String> = emptyList(),
    @SerialName("enabled") val enabled: Boolean = false,
)

/**
 * Token, profile and outbox on disk.
 *
 * The outbox is the important half. A session finished on a watch is real work
 * somebody did, and the radio is the least reliable thing on the device - so it
 * is written down before any attempt to send it, and only removed once the
 * server has actually taken it.
 */
object Store {
    private const val PREFS = "kegelee_wear"
    private const val K_TOKEN = "token"
    private const val K_PROFILE = "profile"
    private const val K_OUTBOX = "outbox"
    private const val K_THEME = "theme"
    private const val K_HAPTICS = "haptics"

    /** Beyond this the watch has not seen a network for weeks; keep the newest. */
    private const val MAX_OUTBOX = 100

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // --- Session token ------------------------------------------------------

    fun token(context: Context): String? =
        prefs(context).getString(K_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun setToken(context: Context, token: String?) {
        prefs(context).edit().apply {
            if (token.isNullOrBlank()) remove(K_TOKEN) else putString(K_TOKEN, token)
        }.apply()
    }

    /**
     * Sign out completely.
     *
     * The outbox goes too. Anything still queued belongs to the account that is
     * leaving, and handing it to whoever signs in next would file one person's
     * training under another's.
     */
    fun signOut(context: Context) {
        prefs(context).edit().remove(K_TOKEN).remove(K_PROFILE).remove(K_OUTBOX).apply()
    }

    // --- Appearance ---------------------------------------------------------

    /**
     * Kept out of `signOut`, unlike everything else here.
     *
     * The palette is a property of the device and the person holding it, not of
     * the account: signing out and being handed a light app at night would be a
     * surprise nobody asked for.
     */
    fun themeMode(context: Context): ThemeMode =
        runCatching { ThemeMode.valueOf(prefs(context).getString(K_THEME, null) ?: "SYSTEM") }
            .getOrDefault(ThemeMode.SYSTEM)

    fun setThemeMode(context: Context, mode: ThemeMode) {
        prefs(context).edit().putString(K_THEME, mode.name).apply()
    }

    // --- Haptics ------------------------------------------------------------

    /**
     * The session cue, off by default.
     *
     * Matches the phone's `haptics_enabled`, which also ships off: a buzz on
     * the wrist during a private exercise is something to opt into, not
     * something to discover. Device-local like the appearance, because it is a
     * property of this watch rather than of the account - and kept out of
     * `signOut` for the same reason.
     */
    fun hapticsEnabled(context: Context): Boolean =
        prefs(context).getBoolean(K_HAPTICS, false)

    fun setHapticsEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(K_HAPTICS, enabled).apply()
    }

    // --- Profile ------------------------------------------------------------

    fun profile(context: Context): Profile? {
        val raw = prefs(context).getString(K_PROFILE, null) ?: return null
        return runCatching { json.decodeFromString(Profile.serializer(), raw) }.getOrNull()
    }

    fun setProfile(context: Context, profile: Profile) {
        prefs(context).edit()
            .putString(K_PROFILE, json.encodeToString(Profile.serializer(), profile))
            .apply()
    }

    // --- Outbox -------------------------------------------------------------

    fun outbox(context: Context): List<PendingSession> {
        val raw = prefs(context).getString(K_OUTBOX, null) ?: return emptyList()
        return runCatching {
            json.decodeFromString(ListSerializer(PendingSession.serializer()), raw)
        }.getOrDefault(emptyList())
    }

    private fun setOutbox(context: Context, items: List<PendingSession>) {
        // commit, not apply: this is called on the path that has just taken
        // somebody's finished workout, and a process death a moment later must
        // not lose it.
        prefs(context).edit()
            .putString(K_OUTBOX, json.encodeToString(ListSerializer(PendingSession.serializer()), items))
            .commit()
    }

    fun enqueue(context: Context, session: PendingSession): List<PendingSession> {
        val next = (outbox(context) + session).takeLast(MAX_OUTBOX)
        setOutbox(context, next)
        return next
    }

    fun clearAccepted(context: Context, accepted: Collection<String>) {
        if (accepted.isEmpty()) return
        setOutbox(context, outbox(context).filterNot { it.clientId in accepted })
    }
}
