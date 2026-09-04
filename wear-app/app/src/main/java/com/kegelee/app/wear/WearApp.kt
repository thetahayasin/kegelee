package com.kegelee.app.wear

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.foundation.rotary.RotaryScrollableDefaults
import androidx.wear.compose.foundation.rotary.rotaryScrollable
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import kotlin.math.roundToInt

private enum class Screen { HOME, SESSION, DONE, LEVEL, EXERCISES, APPEARANCE, ACCOUNT }

@Composable
fun WearApp(
    engine: SessionEngine,
    onGoogleSignIn: () -> Unit,
    themeMode: ThemeMode,
    onThemeMode: (ThemeMode) -> Unit,
) {
    val Ke = LocalPalette.current
    val context = LocalContext.current
    val auth by Repo.auth.collectAsStateWithLifecycle()
    var screen by remember { mutableStateOf(Screen.HOME) }

    /**
     * Back goes back, instead of closing the app.
     *
     * Navigation here is one `screen` variable and nothing was handling the
     * back press, so it fell through to the system and finished the activity -
     * from any screen. Somebody checking which level they were on and pressing
     * back was thrown out of the app entirely.
     *
     * SESSION is excluded because it handles its own: ending a workout asks
     * first, which is a different question from leaving a settings list. DONE
     * dismisses, since acknowledging is the only thing that screen is for.
     */
    BackHandler(enabled = screen != Screen.HOME && screen != Screen.SESSION) {
        if (screen == Screen.DONE) engine.stop()
        screen = Screen.HOME
    }

    Scaffold(
        modifier = Modifier.fillMaxSize().background(Ke.bg),
        /**
         * No clock.
         *
         * Wear puts one at the top of every screen by default, and on a device
         * whose watch face is a clock it is the one piece of information
         * already guaranteed to be a wrist-turn away. Here it only competed
         * with the thing each screen is actually for.
         */
        timeText = {},
    ) {
        when {
            auth == Repo.Auth.SIGNED_OUT -> LoginScreen(onGoogleSignIn = onGoogleSignIn)

            screen == Screen.SESSION -> SessionScreen(
                engine = engine,
                onStop = { engine.stop(); screen = Screen.HOME },
                onFinished = { screen = Screen.DONE },
            )

            screen == Screen.DONE -> DoneScreen(
                seconds = engine.elapsedSeconds,
                onDismiss = { engine.stop(); screen = Screen.HOME },
            )

            screen == Screen.LEVEL -> LevelScreen(onDone = { screen = Screen.HOME })

            screen == Screen.EXERCISES -> ExercisesScreen(onDone = { screen = Screen.HOME })

            screen == Screen.ACCOUNT -> AccountScreen(onDone = { screen = Screen.HOME })

            screen == Screen.APPEARANCE -> AppearanceScreen(
                mode = themeMode,
                onPick = onThemeMode,
                onDone = { screen = Screen.HOME },
            )

            else -> HomeScreen(
                onStart = { steps ->
                    /**
                     * Both gates, read at the moment a session starts.
                     *
                     * The stored preference AND the entitlement, exactly as the
                     * phone requires: a lapsed account stops being buzzed even
                     * though its saved preference still says yes.
                     */
                    engine.hapticsEnabled = Store.hapticsEnabled(context) &&
                        Repo.profile.value?.entitledAsOf(System.currentTimeMillis()) == true
                    engine.start(steps)
                    screen = Screen.SESSION
                },
                onChangeLevel = { screen = Screen.LEVEL },
                onExercises = { screen = Screen.EXERCISES },
                onAppearance = { screen = Screen.APPEARANCE },
                onAccount = { screen = Screen.ACCOUNT },
            )
        }
    }
}

// --- Home ------------------------------------------------------------------

/**
 * One glance, one decision - then everything else below it.
 *
 * A ScalingLazyColumn now, like the list screens, because the scaling is worth
 * having everywhere: rows shrink and fade into the curve as they pass the edge
 * instead of being sliced by it, which is both better looking and the reason
 * text stopped getting cut in half.
 *
 * The ring and the Start button share ONE item deliberately. An earlier attempt
 * gave them separate items and the list centred the ring against the clock,
 * pushing the button off screen; kept together they are centred together, which
 * is the pairing the screen exists for.
 */
@Composable
private fun HomeScreen(
    onStart: (List<PlayStep>) -> Unit,
    onChangeLevel: () -> Unit,
    onExercises: () -> Unit,
    onAppearance: () -> Unit,
    onAccount: () -> Unit,
) {
    val Ke = LocalPalette.current
    val context = LocalContext.current
    val profile by Repo.profile.collectAsStateWithLifecycle()
    val syncing by Repo.syncing.collectAsStateWithLifecycle()

    val p = profile

    /**
     * Entitlement, resolved ONCE for this pass.
     *
     * `entitledAsOf(System.currentTimeMillis())` was called at four separate
     * points on this screen alone. It is a wall-clock read rather than snapshot
     * state, so nothing recomposes when the TTL lapses and two calls in the
     * same frame can in principle disagree - four answers to one question.
     */
    val entitled = p?.entitledAsOf(System.currentTimeMillis()) == true

    /**
     * Why the last sync did not work, if it did not.
     *
     * This state existed and no screen read it, so a dead token or an
     * unreachable server presented as stale figures that quietly stopped
     * moving. There is no manual sync button by design, which makes saying
     * nothing worse rather than better: without a reason there is nothing to
     * act on.
     */
    val lastError by Repo.lastError.collectAsStateWithLifecycle()

    /**
     * Set when Start produced nothing to do.
     *
     * `buildDaily` returns an empty playlist if the catalogue failed to load -
     * and `Catalogue.load` swallows its own errors - so the button silently did
     * nothing at all, forever, with no way to tell a broken asset from a broken
     * app.
     */
    var startFailed by remember { mutableStateOf(false) }

    /** Set when a locked row is pressed, so the lock explains itself. */
    var lockedNote by remember { mutableStateOf(false) }

    /**
     * Open on the ring, not on the row below it.
     *
     * ScalingLazyColumn centres item 1 by default - a sensible guess for a list
     * with a header, and wrong here, where item 0 IS the screen: the ring and
     * the Start button. Without this the app opened halfway down its own home
     * screen with the ring above the fold.
     */
    val listState = rememberScalingLazyListState(initialCenterItemIndex = 0)
    val rotaryFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { rotaryFocus.requestFocus() } }

    ScalingLazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .rotaryScrollable(
                RotaryScrollableDefaults.snapBehavior(listState),
                focusRequester = rotaryFocus,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                TodayRing(
                    done = p?.todayDone ?: 0,
                    required = p?.todayRequired ?: 2,
                    syncing = syncing && p == null,
                )
                Spacer(Modifier.height(10.dp))

                if (p == null) {
                    Text(
                        when {
                            syncing -> "Syncing…"
                            lastError != null -> "Can't sync"
                            else -> "Not synced yet"
                        },
                        color = Ke.textMuted,
                        fontSize = 11.sp,
                    )
                    lastError?.let {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            it,
                            color = Ke.textMuted,
                            fontSize = 9.sp,
                            textAlign = TextAlign.Center,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(horizontal = 20.dp),
                        )
                    }
                } else {
                    /**
                     * A free account still trains, on the free exercises.
                     *
                     * Locking the watch outright was the wrong answer to "what
                     * if they have not subscribed": the phone is freemium, so a
                     * watch that refused to open would be stricter than the
                     * product it belongs to. `entitled` goes straight to the
                     * builder, which narrows the pool exactly as the phone's
                     * `freeOnly` does.
                     */
                    Button(
                        onClick = {
                            /**
                             * A free account's day count is CAPPED, not just
                             * its exercise pool.
                             *
                             * The phone bounds it twice over: the pool is
                             * narrowed to the free set, and the plan stops
                             * advancing at FREE_DAY_CAP so the day-based
                             * unlock can never reach a paid exercise. Passing
                             * the raw count here would have let a day total
                             * earned while subscribed keep unlocking things
                             * after the subscription ended.
                             */
                            val days = if (entitled) p.completedDays
                            else minOf(p.completedDays, Catalogue.freeDayCap)
                            val playlist = SessionBuilder.buildDaily(days, p.levelId, entitled)
                            if (playlist.steps.isNotEmpty()) {
                                startFailed = false
                                onStart(playlist.steps)
                            } else {
                                startFailed = true
                            }
                        },
                        colors = ButtonDefaults.buttonColors(backgroundColor = Ke.accent, contentColor = Ke.bg),
                        modifier = Modifier.size(width = 128.dp, height = 44.dp),
                    ) {
                        Text(
                            if (p.todayComplete) "Train again" else "Start",
                            color = Ke.bg,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "${(Catalogue.level(p.levelId).totalSessionSeconds / 60.0).roundToInt().coerceAtLeast(1)} min  ·  ${Catalogue.levelName(p.levelId)}",
                        color = Ke.textMuted,
                        fontSize = 10.sp,
                    )
                    if (startFailed) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "No exercises available. Open the phone app to sync your plan.",
                            color = Ke.danger,
                            fontSize = 9.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 14.dp),
                        )
                    }
                }
            }
        }

        if (p != null) {
            item { StatRow("Streak", if (p.streak == 1) "1 day" else "${p.streak} days") }
            item { StatRow("Day", "${p.day}") }
            // The personal record: a streak says how consistent, this says how
            // strong, and it is the one progress figure worth a glance.
            if (p.bestHold > 0) item { StatRow("Best hold", "${p.bestHold}s") }

            item {
                // Marked here rather than only inside, so the lock is visible
                // before the tap - the same treatment the Vibration row gets.
                LockableChip(
                    label = "Difficulty · ${Catalogue.levelName(p.levelId)}",
                    locked = !entitled,
                    onClick = onChangeLevel,
                )
            }
            item { ActionChip("Exercises", onExercises) }
            item { ActionChip("Appearance", onAppearance) }
            item { ActionChip("Account", onAccount) }
            item { HapticsChip(entitled = entitled, onLockedTap = { lockedNote = true }) }
            if (lockedNote && !entitled) {
                item {
                    Text(
                        "Vibration cues are part of Premium",
                        color = Ke.accent,
                        fontSize = 9.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }

            if (entitled) {
                item { Text("Reminders", color = Ke.textMuted, fontSize = 10.sp) }
                // Comma-separated: "08:00 20:00" read as one strange time rather
                // than two reminders.
                val groups = p.activeReminders.groupBy { it.times.sorted().joinToString(", ") }
                if (groups.isEmpty()) {
                    item { Text("Set them in the app", color = Ke.textMuted, fontSize = 9.sp) }
                } else {
                    items(groups.entries.toList()) { (times, days) ->
                        ReminderRow(
                            days = days.mapNotNull { WEEKDAY_NAMES.getOrNull(it.weekday) }.joinToString(", "),
                            times = times,
                        )
                    }
                }
            }

            if (!entitled) {
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Premium", color = Ke.accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Subscribe in the app for every exercise",
                            color = Ke.textMuted,
                            fontSize = 9.sp,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }

        /**
         * Nothing here about syncing.
         *
         * There was a Sync button, then a line counting sessions waiting to
         * upload. Both told somebody about this app's plumbing and invited them
         * to worry about it. It syncs on every open, after every session and
         * whenever the level changes; that is the app's job, done quietly.
         */
    }
}

/**
 * The session cue, and the one setting on this screen that can be locked.
 *
 * Premium, like the phone's - the buzz is part of the subscription, so a free
 * account sees the row and what it would give them rather than having it hidden
 * and never knowing it exists. Tapping it while locked says so, rather than
 * doing nothing - the watch cannot sell anything, but it can explain itself.
 */
@Composable
private fun HapticsChip(entitled: Boolean, onLockedTap: () -> Unit) {
    val Ke = LocalPalette.current
    val context = LocalContext.current
    var on by remember { mutableStateOf(Store.hapticsEnabled(context)) }

    Row(
        modifier = Modifier
            .padding(vertical = 2.dp)
            .defaultMinSize(minHeight = TAP_TARGET)
            .clip(RoundedCornerShape(50))
            .background(Ke.control)
            .border(1.dp, Ke.controlEdge, RoundedCornerShape(50))
            /**
             * Locked still answers.
             *
             * This was `clickable(enabled = entitled)`, so a free account
             * pressed a row marked Premium and got nothing at all - while the
             * Difficulty row beside it, locked in exactly the same way, opened
             * a screen explaining itself. Two locked controls behaving
             * differently teaches nothing except that the app is unreliable.
             */
            .clickable {
                if (!entitled) return@clickable onLockedTap()
                on = !on
                Store.setHapticsEnabled(context, on)
            }
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "Vibration",
            color = if (entitled) Ke.text else Ke.textMuted,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            if (!entitled) "Premium" else if (on) "On" else "Off",
            color = if (!entitled) Ke.textMuted else if (on) Ke.accent else Ke.textMuted,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Today's training, as one continuous ring.
 *
 * It used to be drawn as one segment per required session, which looked like a
 * broken circle - two arcs with gaps, read as damage rather than progress.
 * One sweep is unambiguous, and the label inside now says what is being counted
 * instead of leaving "today" to be guessed at.
 */
@Composable
private fun TodayRing(done: Int, required: Int, syncing: Boolean) {
    val Ke = LocalPalette.current
    val target = required.coerceAtLeast(1)
    val complete = done >= target
    val fraction = (done.toFloat() / target).coerceIn(0f, 1f)

    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(84.dp)) {
        if (syncing) {
            CircularProgressIndicator(
                modifier = Modifier.fillMaxSize(),
                indicatorColor = Ke.accent,
                trackColor = Ke.track,
                strokeWidth = 7.dp,
            )
        } else {
            Canvas(Modifier.fillMaxSize()) {
                val stroke = 8.dp.toPx()
                val inset = stroke / 2f
                val box = Size(size.width - stroke, size.height - stroke)
                drawArc(
                    color = Ke.track,
                    startAngle = -90f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = box,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
                if (fraction > 0f) {
                    drawArc(
                        color = Ke.accent,
                        startAngle = -90f,
                        sweepAngle = 360f * fraction,
                        useCenter = false,
                        topLeft = Offset(inset, inset),
                        size = box,
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                    )
                }
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "$done/$target",
                color = if (complete) Ke.accent else Ke.text,
                fontSize = 21.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                if (target == 1) "session" else "sessions",
                color = Ke.textMuted,
                fontSize = 9.sp,
            )
        }
    }
}

/**
 * A tappable row that looks tappable.
 *
 * Wear's CompactChip is a pill with a fill and no edge, which is fine on a dark
 * ground and invisible on a light one - the light palette's chip colour differs
 * from its background by three values, so every one of these read as plain text
 * somebody was supposed to guess at. The border is what fixes it, and it is
 * transparent in dark mode where the fill already does the job.
 */
@Composable
private fun ActionChip(label: String, onClick: () -> Unit) {
    val Ke = LocalPalette.current
    Box(
        modifier = Modifier
            .padding(vertical = 2.dp)
            .defaultMinSize(minHeight = TAP_TARGET)
            .clip(RoundedCornerShape(50))
            .background(Ke.control)
            .border(1.dp, Ke.controlEdge, RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Ke.text, fontSize = 11.sp, maxLines = 1, fontWeight = FontWeight.Medium, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * An action row that can be locked, with the reason on its face.
 *
 * Still tappable when locked - the screen it opens explains what Premium buys
 * and shows the current setting, which is more use than a control that does
 * nothing when pressed.
 */
@Composable
private fun LockableChip(label: String, locked: Boolean, onClick: () -> Unit) {
    val Ke = LocalPalette.current
    Row(
        modifier = Modifier
            .padding(vertical = 2.dp)
            .defaultMinSize(minHeight = TAP_TARGET)
            .clip(RoundedCornerShape(50))
            .background(Ke.control)
            .border(1.dp, Ke.controlEdge, RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            label,
            color = if (locked) Ke.textMuted else Ke.text,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (locked) {
            Text("Premium", color = Ke.accent, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * A label and its figure, inset clear of the glass.
 *
 * With no horizontal padding this is a full-width row on a CIRCULAR display,
 * so both ends sat outside the screen: "Streak" rendered as "reak" and
 * "3 days" as "3 da". The chips beside it were already inset; this was not.
 */
@Composable
private fun StatRow(label: String, value: String) {
    val Ke = LocalPalette.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 26.dp, vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = Ke.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(value, color = Ke.text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * The reminder week, one row per group of days that share a time.
 *
 * It used to be a stacked block inside a single list item, and near the bottom
 * of a round screen the list scaled the whole stack down together - three lines
 * squeezed into the height of one and overlapping, which is why it could not be
 * read. One row per group lets each be scaled on its own, and the day names and
 * the times share a line instead of fighting for two.
 */
@Composable
private fun ReminderRow(days: String, times: String) {
    val Ke = LocalPalette.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(days, color = Ke.textMuted, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(times, color = Ke.accent, fontSize = 10.sp, maxLines = 1, fontWeight = FontWeight.SemiBold, overflow = TextOverflow.Ellipsis)
    }
}

/** Monday-first, matching the backend's own weekday index. */
private val WEEKDAY_NAMES = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

/**
 * The smallest a tappable row may be.
 *
 * The custom chips came out around 36dp, which is under the 48dp minimum on
 * the smallest screen the product runs on - and these rows are reached while
 * walking, which is the case the guideline exists for. Wear's own CompactChip
 * already pads its tap target to this; the hand-rolled ones did not.
 */
private val TAP_TARGET = 48.dp

/**
 * Who is signed in, and the way out.
 *
 * There was no way out at all: `Repo.signOut` existed and nothing on any screen
 * called it, so an account signed in on a watch was signed in permanently and
 * the login screen was unreachable once passed. That also made the sign-in flow
 * impossible to look at again without wiping the app's data over adb, which is
 * not a thing to ask of anybody.
 *
 * Confirmation before it happens, because a mis-tap on a small screen should
 * not end a session - and because signing out drops the outbox with it, so
 * anything not yet uploaded goes. The count is shown when there is one, rather
 * than discovered afterwards.
 */
@Composable
private fun AccountScreen(onDone: () -> Unit) {
    val Ke = LocalPalette.current
    val context = LocalContext.current
    val profile by Repo.profile.collectAsStateWithLifecycle()
    val pending by Repo.pending.collectAsStateWithLifecycle()
    var confirming by remember { mutableStateOf(false) }

    val listState = rememberScalingLazyListState()
    val rotaryFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { rotaryFocus.requestFocus() } }

    ScalingLazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .rotaryScrollable(
                RotaryScrollableDefaults.snapBehavior(listState),
                focusRequester = rotaryFocus,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item { TopBack(onDone) }
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Account", color = Ke.text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                profile?.name?.takeIf { it.isNotBlank() }?.let {
                    Text(it, color = Ke.text, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                profile?.email?.takeIf { it.isNotBlank() }?.let {
                    Text(it, color = Ke.textMuted, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }

        if (!confirming) {
            item { ActionChip("Sign out", onClick = { confirming = true }) }
        } else {
            item {
                Text(
                    if (pending > 0) {
                        "Sign out? $pending session${if (pending == 1) "" else "s"} not uploaded yet"
                    } else {
                        "Sign out of this watch?"
                    },
                    color = Ke.textMuted,
                    fontSize = 9.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
            item {
                CompactChip(
                    onClick = { Repo.signOut(context) },
                    colors = ChipDefaults.chipColors(
                        backgroundColor = Ke.danger,
                        contentColor = Ke.bg,
                    ),
                    label = { Text("Sign out", color = Ke.bg, fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                )
            }
            item { ActionChip("Keep me signed in", onClick = { confirming = false }) }
        }
    }
}

// --- Session ---------------------------------------------------------------

/**
 * The session: the training circle, and nothing that competes with it.
 *
 * There is no announcement overlay any more. A full-screen name on every block
 * change hid the first squeeze of each exercise - the moment the cue matters
 * most - to say something a small line inside the ring can say continuously
 * without covering anything.
 */
/**
 * Hold the display awake for as long as this is composed.
 *
 * A Wear screen times out in seconds and blanks the moment a wrist drops, and
 * a guided session is exactly the case where nobody is touching it - so the
 * circle somebody is following went dark part way through every session. The
 * manifest had asked for WAKE_LOCK since the first commit and nothing had ever
 * used it.
 *
 * `View.keepScreenOn` rather than a wake lock: it is scoped to the view, so it
 * cannot outlive the screen and leak, and `onDispose` releases it on every
 * exit - finishing, ending early, backing out or being destroyed. The phone app
 * does the same thing through `KeepAwake.activate` in WorkoutScreen.
 */
@Composable
private fun KeepScreenOn() {
    val view = LocalView.current
    DisposableEffect(view) {
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = false }
    }
}

/**
 * Stop the session while the app is not on screen, and pick it up on return.
 *
 * See `SessionEngine.onEnterBackground` for why this matters: the tick is
 * driven by the frame clock and stops with the app, but the wall clock it reads
 * does not - so without this a session came back and replayed every missed step
 * at frame rate, buzzing for each one.
 */
@Composable
private fun PauseWhileAway(engine: SessionEngine) {
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner, engine) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> engine.onEnterBackground()
                Lifecycle.Event.ON_START -> engine.onEnterForeground()
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
}

@Composable
private fun SessionScreen(engine: SessionEngine, onStop: () -> Unit, onFinished: () -> Unit) {
    val Ke = LocalPalette.current
    val context = LocalContext.current
    val paused = engine.phase == SessionEngine.Phase.PAUSED

    KeepScreenOn()
    PauseWhileAway(engine)

    /**
     * Back does not throw the session away without asking.
     *
     * Ending is one tap from Pause on a 40mm screen, and a stray back gesture
     * mid-session used to discard the whole workout silently. The first press
     * pauses and arms the confirmation; the second ends it.
     */
    var confirmEnd by remember { mutableStateOf(false) }
    BackHandler {
        if (confirmEnd) onStop() else { engine.pause(); confirmEnd = true }
    }

    /**
     * One tick per frame, from the frame clock.
     *
     * The engine used to run its own `delay(50)` loop, which is twenty updates
     * a second on a timer with no relationship to when the display redraws:
     * some landed between frames and were discarded, the rest arrived unevenly,
     * and the ring moved in visible steps. `withFrameNanos` hands it exactly
     * one update per frame, aligned to that frame.
     */
    LaunchedEffect(engine.phase) {
        while (engine.phase == SessionEngine.Phase.RUNNING) {
            withFrameNanos { engine.tick() }
        }
    }

    /**
     * Show the completion screen NOW, and let the upload follow.
     *
     * `recordSession` used to be awaited here, and it ends in a full push and
     * pull - 15s connect plus 30s read, twice. On a weak connection somebody
     * who had just finished sat looking at the frozen last frame of their
     * session, Pause and End still showing, for the better part of a minute.
     *
     * Waiting bought nothing: the session is written to the outbox before any
     * network call, so it is already safe by the time this runs.
     */
    LaunchedEffect(engine.phase) {
        if (engine.phase == SessionEngine.Phase.DONE) {
            Repo.recordSession(context, engine.elapsedSeconds, engine.trainedSlugs())
            onFinished()
        }
    }

    /**
     * Remembered lambdas, and derived text. Both matter, for the same reason.
     *
     * Reading `engine.blockRemaining` in the body of this composable subscribes
     * it to `stepProgress` underneath - which changes every frame - so this
     * whole screen was invalidated sixty times a second even though the number
     * it wanted changes once. And because the lambdas below were rebuilt on
     * each of those passes, they were never equal to the previous ones, so
     * TrainingCircle could not skip either: the deferred reads bought nothing.
     *
     * `derivedStateOf` notifies only when the computed VALUE changes, and
     * `remember` gives the lambdas a stable identity. Together they take this
     * screen from recomposing per frame to recomposing per second, while the
     * ring still moves per frame in the draw phase.
     */
    val glowScale = remember(engine) { { engine.glowScale } }
    val glowAlpha = remember(engine) { { engine.glowAlpha } }
    val ringPct = remember(engine) { { engine.ringPct } }
    val sessionProgress = remember(engine) { { engine.sessionProgress } }

    val seconds by remember(engine) { derivedStateOf { engine.blockRemaining } }
    val label by remember(engine) {
        derivedStateOf {
            when {
                engine.phase == SessionEngine.Phase.PAUSED -> "Paused"
                engine.isResting -> "Rest"
                else -> engine.currentStep?.label.orEmpty()
            }
        }
    }
    /**
     * The exercise being trained now, and nothing about what follows.
     *
     * A "Next · Reverse Clamp" line during rests was dropped: it is one more
     * thing to read on a screen whose whole point is that you do not have to
     * read it, and knowing what is coming changes nothing about the rest you
     * are currently taking. A rest simply says "Rest".
     */
    val exercise by remember(engine) {
        derivedStateOf {
            if (engine.isResting) "" else Catalogue.exerciseName(engine.blockSlug)
        }
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        TrainingCircle(
            glowScale = glowScale,
            glowAlpha = glowAlpha,
            ringPct = ringPct,
            sessionProgress = sessionProgress,
            seconds = seconds,
            label = label,
            exercise = exercise,
        )

        /**
         * Clear of the curve.
         *
         * 4dp from the bottom put the End chip's shoulder into the bezel on a
         * round screen, where it was both clipped and hard to hit.
         */
        Row(
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CompactChip(
                onClick = {
                    confirmEnd = false
                    if (paused) engine.resume() else engine.pause()
                },
                colors = ChipDefaults.chipColors(backgroundColor = Ke.control, contentColor = Ke.text),
                label = { Text(if (paused) "Resume" else "Pause", color = Ke.text, fontSize = 12.sp) },
            )
            /**
             * Ending asks once.
             *
             * This sat one tap from Pause on a 40mm screen and threw the whole
             * workout away on the first press, with nothing recorded and no way
             * back. It now pauses and asks; the second press ends it.
             */
            CompactChip(
                onClick = { if (confirmEnd) onStop() else { engine.pause(); confirmEnd = true } },
                colors = ChipDefaults.chipColors(
                    backgroundColor = if (confirmEnd) Ke.danger else Ke.control,
                    contentColor = if (confirmEnd) Ke.bg else Ke.textMuted,
                ),
                label = {
                    Text(
                        if (confirmEnd) "End it?" else "End",
                        color = if (confirmEnd) Ke.bg else Ke.textMuted,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
            )
        }
    }
}

// --- Done ------------------------------------------------------------------

@Composable
private fun DoneScreen(seconds: Int, onDismiss: () -> Unit) {
    val Ke = LocalPalette.current
    val profile by Repo.profile.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 22.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // The same shape the phone's completion screen uses, so finishing reads
        // the same on either device.
        Glyph.Complete(color = Ke.accent, size = 40.dp)
        Spacer(Modifier.height(8.dp))
        Text("Session done", color = Ke.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(3.dp))

        /**
         * Where they now stand, instead of a note about uploading.
         *
         * The old line said "will upload when you are online", which told
         * somebody about this app's plumbing at the one moment they wanted to
         * hear about their training. Syncing is the app's problem; the day's
         * count is theirs.
         */
        val p = profile
        /**
         * The session's LENGTH, not the stopwatch.
         *
         * A wall-clock reading came out as "1m 58s" or "2m 3s" depending on
         * when the last step happened to land, which invites somebody to
         * wonder whether they did it wrong. The plan says two minutes; the
         * screen says two minutes.
         */
        val planned = (Catalogue.level(p?.levelId ?: 1).totalSessionSeconds / 60.0)
            .roundToInt().coerceAtLeast(1)
        Text(
            if (p != null) "${p.todayDone}/${p.todayRequired.coerceAtLeast(1)} today  ·  $planned min"
            else "$planned min",
            color = Ke.textMuted,
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
        )

        if (p?.todayComplete == true) {
            Spacer(Modifier.height(3.dp))
            Text("Day complete", color = Ke.accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        }

        Spacer(Modifier.height(14.dp))
        // A Button, not a CompactChip: this is the only action on the screen
        // and it was reading as a cramped label rather than something to press.
        Button(
            onClick = onDismiss,
            colors = ButtonDefaults.buttonColors(backgroundColor = Ke.accent, contentColor = Ke.bg),
            modifier = Modifier.size(width = 104.dp, height = 40.dp),
        ) {
            Text("Done", color = Ke.bg, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/**
 * Back, at the top, where a watch screen expects it.
 *
 * Wear's own gesture is a swipe from the left edge, which is fine and
 * undiscoverable. A chip at the BOTTOM of a scrolling list is worse than
 * either: it is only reachable after scrolling past everything, which is
 * exactly when somebody has decided they are done looking.
 */
@Composable
private fun TopBack(onBack: () -> Unit) {
    val Ke = LocalPalette.current
    CompactChip(
        onClick = onBack,
        colors = ChipDefaults.chipColors(backgroundColor = Ke.control, contentColor = Ke.textMuted),
        // Named for TalkBack: an icon-only control otherwise announces as an
        // unlabelled button, which on the one way out of a screen is the worst
        // place for it.
        modifier = Modifier.semantics { contentDescription = "Back" },
        label = { Glyph.Back(color = Ke.textMuted, size = 12.dp) },
    )
}

// --- Difficulty ------------------------------------------------------------

/**
 * Difficulty, changed from the wrist.
 *
 * Five levels, one tap each, current one marked - a picker rather than a
 * stepper, because there is no reason to walk through three levels to reach the
 * fifth. Applied locally then pushed; the server stays authoritative, so a
 * level set on the phone still wins on the next pull.
 */
@Composable
private fun LevelScreen(onDone: () -> Unit) {
    val Ke = LocalPalette.current
    val context = LocalContext.current
    val profile by Repo.profile.collectAsStateWithLifecycle()
    val current = profile?.levelId ?: 1

    /**
     * Locked for a free account, and it says so instead of pretending.
     *
     * The server ignores a pushed level change without a subscription, so the
     * picker used to move, the change was quietly dropped, and the next pull
     * put the old level back - which reads as the app forgetting rather than
     * as a locked feature. The list is still shown, because seeing which level
     * you are on is useful whether or not you can change it.
     */
    val entitled = profile?.entitledAsOf(System.currentTimeMillis()) == true

    val listState = rememberScalingLazyListState()
    val rotaryFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { rotaryFocus.requestFocus() } }

    ScalingLazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .rotaryScrollable(
                RotaryScrollableDefaults.snapBehavior(listState),
                focusRequester = rotaryFocus,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item { TopBack(onDone) }
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Difficulty", color = Ke.text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text(
                    if (entitled) "Sets how long a session runs"
                    else "Changing this is part of Premium",
                    color = if (entitled) Ke.textMuted else Ke.accent,
                    fontSize = 9.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        items((1..5).toList()) { level ->
            val selected = level == current
            CompactChip(
                enabled = entitled,
                onClick = {
                    // Not launched here: `setLevel` owns its own scope now, so
                    // closing the picker on the next line cannot cancel it.
                    Repo.setLevel(context, level)
                    onDone()
                },
                colors = ChipDefaults.chipColors(
                    backgroundColor = if (selected) Ke.accent else Ke.control,
                    contentColor = if (selected) Ke.bg else Ke.text,
                ),
                label = {
                    Text(
                        "${Catalogue.levelName(level)} · ${(Catalogue.level(level).totalSessionSeconds / 60.0).roundToInt().coerceAtLeast(1)} min",
                        color = if (selected) Ke.bg else Ke.text,
                        fontSize = 11.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
            )
        }


        if (!entitled) {
            item {
                Text(
                    "Subscribe in the app to change difficulty",
                    color = Ke.textMuted,
                    fontSize = 9.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 14.dp),
                )
            }
        }
    }
}

// --- Appearance ------------------------------------------------------------

/**
 * Light, dark, or whatever the watch is set to.
 *
 * SYSTEM leads and is the default: a watch's appearance usually changes with a
 * watch face or a schedule, and an app that ignored that would be the one thing
 * on the wrist still glowing at night. The other two are for people who want it
 * settled either way regardless.
 */
@Composable
private fun AppearanceScreen(mode: ThemeMode, onPick: (ThemeMode) -> Unit, onDone: () -> Unit) {
    val Ke = LocalPalette.current
    val listState = rememberScalingLazyListState()
    val rotaryFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { rotaryFocus.requestFocus() } }

    ScalingLazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .rotaryScrollable(
                RotaryScrollableDefaults.snapBehavior(listState),
                focusRequester = rotaryFocus,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item { TopBack(onDone) }
        item { Text("Appearance", color = Ke.text, fontSize = 15.sp, fontWeight = FontWeight.Bold) }

        items(
            listOf(
                ThemeMode.SYSTEM to "Follow system",
                ThemeMode.LIGHT to "Light",
                ThemeMode.DARK to "Dark",
            ),
        ) { (value, label) ->
            val selected = value == mode
            CompactChip(
                onClick = { onPick(value); onDone() },
                colors = ChipDefaults.chipColors(
                    backgroundColor = if (selected) Ke.accent else Ke.control,
                    contentColor = if (selected) Ke.bg else Ke.text,
                    disabledBackgroundColor = if (selected) Ke.accent else Ke.control,
                    disabledContentColor = if (selected) Ke.bg else Ke.textMuted,
                ),
                label = {
                    // Inked explicitly. Wear's Chip does not push contentColor
                    // into a custom label slot, so a selected chip came out as
                    // dark text on a dark green fill.
                    Text(
                        label,
                        color = if (selected) Ke.bg else Ke.text,
                        fontSize = 11.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
            )
        }
    }
}

// --- Exercises -------------------------------------------------------------

private data class ExerciseRow(
    val name: String,
    val open: Boolean,
    val lockedWhy: String,
    val progress: Float = 0f,
    val showProgress: Boolean = false,
)

/**
 * The whole catalogue, and what it takes to reach each of it.
 *
 * Gated by exactly the rule the phone applies in `exerciseGateState`: a day
 * threshold, and - for an account without a subscription - the free set. Both
 * inputs come from the server, so this list says the same thing here as the
 * phone does for the same account on the same day.
 *
 * A ScalingLazyColumn here, and a plain Column on the home screen. Not
 * inconsistency: this is a list of seventeen rows, which is what the Wear list
 * is for - it scales items into the curve, so a name at the edge of the
 * viewport is small rather than sliced in half, which is what a padded Column
 * was doing to "Flash".
 */
@Composable
private fun ExercisesScreen(onDone: () -> Unit) {
    val Ke = LocalPalette.current
    val profile by Repo.profile.collectAsStateWithLifecycle()
    val entitled = profile?.entitledAsOf(System.currentTimeMillis()) == true
    // Same cap as the session builder: a free account's plan stops advancing,
    // so a countdown past the cap would tick toward a day that never arrives.
    val days = (profile?.completedDays ?: 0).let {
        if (entitled) it else minOf(it, Catalogue.freeDayCap)
    }

    val listState = rememberScalingLazyListState()
    val rotaryFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { rotaryFocus.requestFocus() } }

    val rows = remember(days, entitled) {
        Catalogue.exercises.values.sortedBy { it.sortOrder }.map { def ->
            val freeOk = entitled || def.slug in Catalogue.freeSlugs
            val dayOk = days >= def.unlockAfterDays
            ExerciseRow(
                name = Catalogue.exerciseName(def.slug),
                open = freeOk && dayOk,
                lockedWhy = if (!freeOk) "Premium" else if (!dayOk) "Day ${def.unlockAfterDays}" else "",
                /**
                 * How close this one is, 0f..1f.
                 *
                 * Only meaningful for a DAY lock, which is a countdown that
                 * ends by itself. A subscription lock has no distance to
                 * travel, so it gets no bar - a progress track that can never
                 * fill is a worse answer than none, and the phone's own
                 * `exerciseGateState` draws the same distinction.
                 */
                progress = when {
                    freeOk && dayOk -> 1f
                    !freeOk -> 0f
                    def.unlockAfterDays <= 0 -> 1f
                    else -> (days.toFloat() / def.unlockAfterDays).coerceIn(0f, 1f)
                },
                showProgress = freeOk && !dayOk,
            )
            // Reachable ones first: that is the order somebody scanning for
            // "what can I do now" actually wants.
        }.sortedBy { !it.open }
    }

    ScalingLazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .rotaryScrollable(
                RotaryScrollableDefaults.snapBehavior(listState),
                focusRequester = rotaryFocus,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item { TopBack(onDone) }
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Exercises", color = Ke.text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text(
                    "${rows.count { it.open }} of ${rows.size} open",
                    color = Ke.textMuted,
                    fontSize = 9.sp,
                )
            }
        }

        items(rows) { row ->
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 2.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        row.name,
                        color = if (row.open) Ke.text else Ke.textMuted,
                        fontSize = 11.sp,
                        fontWeight = if (row.open) FontWeight.SemiBold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        if (row.open) "Open" else row.lockedWhy,
                        color = if (row.open) Ke.accent else Ke.textMuted,
                        fontSize = 9.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (row.showProgress) {
                    Spacer(Modifier.height(2.dp))
                    Canvas(Modifier.fillMaxWidth().height(3.dp)) {
                        val r = size.height / 2f
                        drawRoundRect(
                            color = Ke.track,
                            cornerRadius = CornerRadius(r, r),
                        )
                        if (row.progress > 0f) {
                            drawRoundRect(
                                color = Ke.accent,
                                size = Size(size.width * row.progress, size.height),
                                cornerRadius = CornerRadius(r, r),
                            )
                        }
                    }
                }
            }
        }

    }
}
