package com.kegelee.app.wear

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
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

    /**
     * The scope for work that must outlive the screen that started it.
     *
     * Three things were launched on `rememberCoroutineScope()` and then had
     * that scope destroyed by their own success. Signing in sets auth to
     * SIGNED_IN, which is what swaps the login screen out of composition - so
     * the first sync, started on the line before, was cancelled by the line
     * after, and the app could land on a home screen with no profile, no Start
     * button and nothing that would ever retry. Changing level called
     * `onDone()` on the next line, cancelling the push before it had run at
     * all. Recording a session raced the navigation away from it.
     *
     * A sync, a push and a level change belong to the ACCOUNT, not to whatever
     * screen happened to ask for them. SupervisorJob so one failure does not
     * take the others with it.
     */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

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

    /**
     * Why the last sign-in attempt did not work.
     *
     * Separate from `lastError`, which is about an account that is already
     * signed in. The Google route had nowhere to put a failure at all: a
     * cancelled picker, missing Play services and a rejected token all ended
     * with the handler doing nothing, so the login screen simply reappeared
     * unchanged and people tapped it again.
     */
    private val _authError = MutableStateFlow<String?>(null)
    val authError: StateFlow<String?> = _authError.asStateFlow()

    /** True while a Google sign-in is in flight, so the button can say so. */
    private val _authBusy = MutableStateFlow(false)
    val authBusy: StateFlow<Boolean> = _authBusy.asStateFlow()

    fun beginGoogleSignIn() {
        _authError.value = null
        _authBusy.value = true
    }

    fun failGoogleSignIn(message: String) {
        _authError.value = message
        _authBusy.value = false
    }

    /** Cancelled rather than failed: drop the spinner without an error. */
    fun clearGoogleSignIn() {
        _authError.value = null
        _authBusy.value = false
    }

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
    /**
     * @param entitled false seeds a FREE account, which is the state most of
     *   the gating is about and the one hardest to reach by hand - a real free
     *   account cannot be conjured without a second login. `--ez free true`.
     */
    fun seedDemo(context: Context, entitled: Boolean = true) {
        Catalogue.load(context)
        val demo = Profile(
            name = "Demo",
            levelId = 2,
            entitled = entitled,
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
            is Api.Result.Failed -> {
                _authBusy.value = false
                return result.message
            }
            is Api.Result.Ok -> {
                val user = result.value["user"] as? JsonObject
                    ?: return "Unexpected response from the server"
                val token = user["api_token"]?.jsonPrimitive?.contentOrNullSafe()
                    ?: return "Signed in, but no token was returned"
                Store.setToken(context, token)
                /**
                 * Sync on the account's scope, NOT on this coroutine.
                 *
                 * Setting auth is what removes the login screen, and the login
                 * screen owns the scope this is running on - so awaiting the
                 * sync here meant the act of signing in cancelled the sync that
                 * signing in had just started. It raced, so it worked often
                 * enough to look fine, and when it lost the app sat on "Not
                 * synced yet" with no Start button until it was force-closed.
                 *
                 * Launched before the auth flip, so the sync is already owned
                 * by a scope nothing on screen can cancel.
                 */
                scope.launch { sync(context) }
                _authBusy.value = false
                _authError.value = null
                _auth.value = Auth.SIGNED_IN
                return null
            }
        }
    }

    /**
     * @param keepOutbox true when the server rejected the token rather than the
     *   person choosing to leave - see the push path in `sync`.
     */
    fun signOut(context: Context, keepOutbox: Boolean = false) {
        Store.signOut(context, keepOutbox = keepOutbox)
        _profile.value = null
        _pending.value = if (keepOutbox) Store.outbox(context).size else 0
        _lastError.value = null
        _authError.value = null
        _authBusy.value = false
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
                        /**
                         * Sign out, but KEEP the outbox.
                         *
                         * `Store.signOut` clears it, which is right when
                         * somebody chooses to sign out - the queue belongs to
                         * the account that is leaving. It is wrong here: a
                         * server-side 401 is not a decision anybody made, and
                         * discarding finished workouts over a transient one
                         * loses real training that would have pushed fine on
                         * the next attempt.
                         */
                        if (res.unauthorized) { signOut(context, keepOutbox = true); return@withContext false }
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
                    if (res.unauthorized) { signOut(context, keepOutbox = true); return@withContext false }
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
    fun setLevel(context: Context, level: Int) {
        val clamped = level.coerceIn(1, 5)
        val current = _profile.value ?: return
        if (current.levelId == clamped) return

        /**
         * A free account cannot change level, and the server is the one that
         * says so.
         *
         * `pushState` ignores a pushed `level_id` unless the account is
         * subscribed or an admin - "no subscription, no level change". Applying
         * it locally anyway produced the worst possible version of that: the
         * picker moved, the push was quietly dropped, and the next pull put the
         * old level back. It looked like the app forgetting rather than a
         * feature being locked.
         */
        if (!current.entitledAsOf(System.currentTimeMillis())) return
        val next = current.copy(levelId = clamped)
        _profile.value = next
        /**
         * On the account's scope, because the picker closes itself.
         *
         * `LevelScreen` called this and then `onDone()` on the very next line,
         * which leaves composition and cancels the scope the call was launched
         * on - possibly before the first statement ran. The local write usually
         * survived and the push usually did not, so the level moved on the
         * watch and the server never heard, which reads as the app forgetting.
         */
        scope.launch {
            Store.setProfile(context, next)
            sync(context)
        }
    }

    /**
     * Streak, counted from the training days the pull already sends.
     *
     * The API has no streak field - the phone works it out from the same rows -
     * so this counts back from today over consecutive completed days. Today not
     * being finished yet does not break a streak; it has simply not been added
     * to it, which is why the walk starts at yesterday when today is open.
     */
    // internal, not private, so the test source set can reach it.
    internal fun streakFrom(payload: JsonObject): Int {
        val days = (payload["training_days"] as? JsonArray) ?: return 0
        val completed = days.mapNotNull { el ->
            val row = el as? JsonObject ?: return@mapNotNull null
            val done = row["completed_at"]?.jsonPrimitive?.contentOrNullSafe()
            if (done.isNullOrBlank()) null else row["date"]?.jsonPrimitive?.contentOrNullSafe()
        }.toSet()
        if (completed.isEmpty()) return 0

        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getDefault() }
        /**
         * Walk by CALENDAR days, not by 86,400,000 milliseconds.
         *
         * Subtracting a fixed day is wrong twice a year. On the clocks-back day
         * a local date is 25 hours long, so the cursor lands inside the same
         * date twice and one day of training is counted as two; on the
         * clocks-forward day it can step over a date entirely and end a live
         * streak early. `Reminders.nextOccurrence` already avoids this with
         * `Calendar.add`, and the phone's reminder code names the same trap.
         */
        val cursor = java.util.Calendar.getInstance()
        // If today is not closed yet, start counting from yesterday.
        if (fmt.format(cursor.time) !in completed) cursor.add(java.util.Calendar.DAY_OF_YEAR, -1)

        var streak = 0
        while (fmt.format(cursor.time) in completed) {
            streak++
            cursor.add(java.util.Calendar.DAY_OF_YEAR, -1)
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
    fun recordSession(context: Context, seconds: Int, slugs: List<String>) {
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

        // Show it immediately rather than waiting for the round trip. The pull
        // at the end of `sync` replaces this with the server's own count, so an
        // optimistic bump can never drift.
        _profile.value = _profile.value?.let { it.copy(todayDone = it.todayDone + 1) }

        /**
         * The write and the upload both move off the caller.
         *
         * `setOutbox` uses `commit()` - a synchronous disk write, deliberately,
         * because this is somebody's finished workout and a process death a
         * moment later must not lose it. What was wrong was doing it on the
         * MAIN thread, at the exact moment the completion screen should be
         * appearing, with a full network round trip awaited behind it.
         *
         * The durability is unchanged: the enqueue still happens before any
         * network call, and the scope outlives the screen, so navigating away
         * cannot cancel the write.
         */
        scope.launch {
            Store.enqueue(context, session)
            _pending.value = Store.outbox(context).size
            sync(context)
        }
    }
}

// Small guards so a field arriving as the wrong JSON type is null rather than a
// crash on a screen somebody is looking at.
/**
 * The text of a field, or null - including when the field is JSON `null`.
 *
 * `JsonPrimitive.content` renders JsonNull as the four-character string
 * "null", which is not blank and not empty, so every null-check downstream
 * passed. A `completed_at: null` training day counted toward the streak, and a
 * null name or email would have been drawn on the Account screen as the word
 * "null". `contentOrNull` is the accessor that knows the difference.
 */
private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? =
    runCatching { contentOrNull }.getOrNull()

private fun kotlinx.serialization.json.JsonPrimitive.intOrNullSafe(): Int? =
    runCatching { content.toDouble().toInt() }.getOrNull()

private fun kotlinx.serialization.json.JsonPrimitive.booleanOrNullSafe(): Boolean? =
    runCatching { content.toBooleanStrict() }.getOrNull()
    ?: runCatching { content == "1" }.getOrNull()
