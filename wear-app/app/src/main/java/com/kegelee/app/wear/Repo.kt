package com.kegelee.app.wear

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * Everything the screens are allowed to know about, and the only place that
 * touches the network or the disk.
 *
 * Kept as one object so the sign-in state, the cached profile and the outbox
 * can never disagree: a screen asks this what is true and does as it is told.
 */
object Repo {

    enum class Auth { UNKNOWN, SIGNED_OUT, SIGNED_IN }

    private val _auth = MutableStateFlow(Auth.UNKNOWN)
    val auth: StateFlow<Auth> = _auth.asStateFlow()

    private val _profile = MutableStateFlow<Profile?>(null)
    val profile: StateFlow<Profile?> = _profile.asStateFlow()

    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    private val _pending = MutableStateFlow(0)
    val pending: StateFlow<Int> = _pending.asStateFlow()

    /** Set when a sync fails, so the screen can say why rather than just stall. */
    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    fun bootstrap(context: Context) {
        Catalogue.load(context)
        _profile.value = Store.profile(context)
        _pending.value = Store.outbox(context).size
        _auth.value = if (Store.token(context) != null) Auth.SIGNED_IN else Auth.SIGNED_OUT
    }

    /**
     * Stand in for a signed-in account. Debug builds only.
     *
     * The session player is the half of this app worth looking at and it sits
     * behind a login, which makes it unreachable on an emulator with no Google
     * account and no test credentials. Reached with:
     *
     *   adb shell am start -n com.kegelee.app/.wear.MainActivity --ez demo true
     *
     * Deliberately a separate entry point rather than a fallback: nothing may
     * reach for an invented account when a real sync merely failed.
     */
    fun seedDemo(context: Context) {
        Catalogue.load(context)
        val demo = Profile(
            name = "Demo",
            levelId = 2,
            entitled = true,
            completedDays = 12,
            day = 13,
            month = 1,
            todayDone = 1,
            todayRequired = 2,
            streak = 3,
            bestHold = 42,
            reminders = demoReminders(),
            syncedAt = System.currentTimeMillis(),
        )
        _profile.value = demo
        // Persisted and armed, so the demo exercises the REMINDER path too -
        // scheduling, the Monday-first weekday conversion and the notification
        // itself - rather than only the screens.
        Store.setProfile(context, demo)
        Reminders.apply(context, demo)
        _auth.value = Auth.SIGNED_IN
    }

    /**
     * A demo week with one slot a minute from now.
     *
     * The fixed Mon/Wed/Fri 08:00 week proved the list rendered and nothing
     * else: no reminder was ever going to fire while somebody was watching. One
     * slot on today's weekday, a minute out, makes the whole chain observable -
     * alarm armed, alarm delivered, notification posted, next one re-armed.
     */
    private fun demoReminders(): List<ReminderDay> {
        val cal = java.util.Calendar.getInstance().apply { add(java.util.Calendar.MINUTE, 1) }
        // Calendar is Sunday-first; the backend's weekday index is Monday-first.
        val mondayFirst = (cal.get(java.util.Calendar.DAY_OF_WEEK) + 5) % 7
        val soon = String.format(
            java.util.Locale.US, "%02d:%02d",
            cal.get(java.util.Calendar.HOUR_OF_DAY),
            cal.get(java.util.Calendar.MINUTE),
        )
        return listOf(
            ReminderDay(weekday = mondayFirst, times = listOf(soon), enabled = true),
            ReminderDay(weekday = 2, times = listOf("08:00", "20:00"), enabled = true),
        )
    }

    // --- Signing in ---------------------------------------------------------

    suspend fun signInWithPassword(context: Context, email: String, password: String): String? =
        withContext(Dispatchers.IO) {
            complete(context, Api.login(email.trim(), password))
        }

    suspend fun signInWithGoogle(context: Context, idToken: String): String? =
        withContext(Dispatchers.IO) {
            complete(context, Api.googleToken(idToken))
        }

    /**
     * Turn an auth response into a signed-in session.
     *
     * Returns null on success, or a message to show. The token is stored before
     * the first sync so that a sync failing on a flaky connection leaves
     * somebody signed in - being bounced back to a login screen because the
     * train went into a tunnel would be the wrong lesson to draw from it.
     */
    private suspend fun complete(context: Context, result: Api.Result<JsonObject>): String? {
        when (result) {
            is Api.Result.Failed -> return result.message
            is Api.Result.Ok -> {
                val user = result.value["user"] as? JsonObject
                    ?: return "Unexpected response from the server"
                val token = user["api_token"]?.jsonPrimitive?.contentOrNullSafe()
                    ?: return "Signed in, but no token was returned"
                Store.setToken(context, token)
                _auth.value = Auth.SIGNED_IN
                sync(context)
                return null
            }
        }
    }

    fun signOut(context: Context) {
        Store.signOut(context)
        _profile.value = null
        _pending.value = 0
        _lastError.value = null
        _auth.value = Auth.SIGNED_OUT
    }

    // --- Syncing ------------------------------------------------------------

    /**
     * Push anything waiting, then take the server's answer as the truth.
     *
     * Push first, always. The pull returns today's counts, and pulling before
     * pushing would show a session that has just been finished on this watch as
     * missing - the one moment somebody is most likely to be looking.
     */
    suspend fun sync(context: Context): Boolean = withContext(Dispatchers.IO) {
        val token = Store.token(context) ?: return@withContext false
        if (_syncing.value) return@withContext false
        _syncing.value = true
        try {
            val outbox = Store.outbox(context)
            if (outbox.isNotEmpty()) {
                val levelId = _profile.value?.levelId ?: 1
                when (val res = Api.push(token, outbox, levelId)) {
                    is Api.Result.Failed -> {
                        if (res.unauthorized) { signOut(context); return@withContext false }
                        // Left in the outbox on purpose - the next sync retries,
                        // and client_id makes that safe.
                        _lastError.value = res.message
                    }
                    is Api.Result.Ok -> {
                        Store.clearAccepted(context, outbox.map { it.clientId })
                        _pending.value = Store.outbox(context).size
                    }
                }
            }

            when (val res = Api.pull(token)) {
                is Api.Result.Failed -> {
                    if (res.unauthorized) { signOut(context); return@withContext false }
                    _lastError.value = res.message
                    return@withContext false
                }
                is Api.Result.Ok -> {
                    val fresh = parseProfile(res.value)
                    _profile.value = fresh
                    Store.setProfile(context, fresh)
                    // The schedule is the phone's, so re-arm from it on every
                    // pull: a week changed there takes effect here with nobody
                    // doing anything, and a switched-off day stops ringing.
                    Reminders.apply(context, fresh)
                    _lastError.value = null
                    return@withContext true
                }
            }
        } finally {
            _syncing.value = false
        }
    }

    private fun parseProfile(payload: JsonObject): Profile {
        val user = payload["user"] as? JsonObject
        val position = payload["position"] as? JsonObject
        val today = payload["today"] as? JsonObject

        return Profile(
            name = user?.get("name")?.jsonPrimitive?.contentOrNullSafe().orEmpty(),
            email = user?.get("email")?.jsonPrimitive?.contentOrNullSafe().orEmpty(),
            levelId = user?.get("level_id")?.jsonPrimitive?.intOrNullSafe() ?: 1,
            entitled = user?.get("is_subscribed")?.jsonPrimitive?.booleanOrNullSafe() ?: false,
            completedDays = position?.get("completed")?.jsonPrimitive?.intOrNullSafe() ?: 0,
            day = position?.get("day")?.jsonPrimitive?.intOrNullSafe() ?: 1,
            month = position?.get("month")?.jsonPrimitive?.intOrNullSafe() ?: 1,
            todayDone = today?.get("done")?.jsonPrimitive?.intOrNullSafe() ?: 0,
            todayRequired = today?.get("required")?.jsonPrimitive?.intOrNullSafe() ?: 2,
            streak = streakFrom(payload),
            bestHold = bestHoldFrom(payload),
            reminders = remindersFrom(payload),
            syncedAt = System.currentTimeMillis(),
        )
    }

    /**
     * The longest hold on record, which is the one measurement worth a glance.
     *
     * The pull sends the whole measurement history and the phone shows the best
     * of it as a personal record. Reducing rather than taking the newest is the
     * point: a bad day should not replace a best.
     */
    private fun bestHoldFrom(payload: JsonObject): Int {
        val rows = (payload["measurements"] as? JsonArray) ?: return 0
        return rows.mapNotNull { el ->
            (el as? JsonObject)?.get("seconds")?.jsonPrimitive?.intOrNullSafe()
        }.maxOrNull() ?: 0
    }

    /** The reminder week, so the watch can show it and ring for it. */
    private fun remindersFrom(payload: JsonObject): List<ReminderDay> {
        val rows = (payload["reminders"] as? JsonArray) ?: return emptyList()
        return rows.mapNotNull { el ->
            val row = el as? JsonObject ?: return@mapNotNull null
            val weekday = row["weekday"]?.jsonPrimitive?.intOrNullSafe() ?: return@mapNotNull null
            val times = (row["times"] as? JsonArray)
                ?.mapNotNull { it.jsonPrimitive.contentOrNullSafe() }
                ?.filter { it.isNotBlank() }
                .orEmpty()
            val enabled = row["is_enabled"]?.jsonPrimitive?.booleanOrNullSafe() ?: false
            ReminderDay(weekday = weekday, times = times, enabled = enabled)
        }
    }

    // --- Changing the level -------------------------------------------------

    /**
     * Change difficulty from the wrist.
     *
     * Applied locally first so the screen answers immediately, then pushed. The
     * push carries `level_id` on every sync anyway, so a failure here is not
     * lost - the next sync sends it. The server is still authoritative: its
     * next pull overwrites this, which is what makes a change made on the phone
     * win if the two ever disagree.
     */
    suspend fun setLevel(context: Context, level: Int) {
        val clamped = level.coerceIn(1, 5)
        val current = _profile.value ?: return
        if (current.levelId == clamped) return
        val next = current.copy(levelId = clamped)
        _profile.value = next
        Store.setProfile(context, next)
        sync(context)
    }

    /**
     * Streak, counted from the training days the pull already sends.
     *
     * The API has no streak field - the phone works it out from the same rows -
     * so this counts back from today over consecutive completed days. Today not
     * being finished yet does not break a streak; it has simply not been added
     * to it, which is why the walk starts at yesterday when today is open.
     */
    private fun streakFrom(payload: JsonObject): Int {
        val days = (payload["training_days"] as? JsonArray) ?: return 0
        val completed = days.mapNotNull { el ->
            val row = el as? JsonObject ?: return@mapNotNull null
            val done = row["completed_at"]?.jsonPrimitive?.contentOrNullSafe()
            if (done.isNullOrBlank()) null else row["date"]?.jsonPrimitive?.contentOrNullSafe()
        }.toSet()
        if (completed.isEmpty()) return 0

        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getDefault() }
        val dayMs = 24 * 60 * 60 * 1000L
        var cursor = System.currentTimeMillis()
        // If today is not closed yet, start counting from yesterday.
        if (fmt.format(Date(cursor)) !in completed) cursor -= dayMs

        var streak = 0
        while (fmt.format(Date(cursor)) in completed) {
            streak++
            cursor -= dayMs
        }
        return streak
    }

    // --- Finishing a session ------------------------------------------------

    /**
     * Record a finished session: to disk first, then to the server.
     *
     * The local write is the one that must not fail. Everything after it is a
     * retry waiting to happen.
     */
    suspend fun recordSession(context: Context, seconds: Int, slugs: List<String>) {
        val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date())

        val session = PendingSession(
            clientId = UUID.randomUUID().toString(),
            // The server records one session against one exercise; the first
            // trained is the representative one, matching what the phone sends
            // for a multi-exercise session.
            exerciseSlug = slugs.firstOrNull().orEmpty(),
            durationSeconds = seconds,
            completedAtIso = iso,
            isExtra = _profile.value?.todayComplete == true,
        )

        Store.enqueue(context, session)
        _pending.value = Store.outbox(context).size

        // Show it immediately rather than waiting for the round trip. The pull
        // at the end of `sync` replaces this with the server's own count, so an
        // optimistic bump can never drift.
        _profile.value = _profile.value?.let { it.copy(todayDone = it.todayDone + 1) }

        sync(context)
    }
}

// Small guards so a field arriving as the wrong JSON type is null rather than a
// crash on a screen somebody is looking at.
private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? =
    runCatching { content }.getOrNull()

private fun kotlinx.serialization.json.JsonPrimitive.intOrNullSafe(): Int? =
    runCatching { content.toDouble().toInt() }.getOrNull()

private fun kotlinx.serialization.json.JsonPrimitive.booleanOrNullSafe(): Boolean? =
    runCatching { content.toBooleanStrict() }.getOrNull()
    ?: runCatching { content == "1" }.getOrNull()
