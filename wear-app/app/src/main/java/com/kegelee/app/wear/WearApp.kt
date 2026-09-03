package com.kegelee.app.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private enum class Screen { HOME, SESSION, DONE, LEVEL, EXERCISES, APPEARANCE }

@Composable
fun WearApp(
    engine: SessionEngine,
    onGoogleSignIn: () -> Unit,
    themeMode: ThemeMode,
    onThemeMode: (ThemeMode) -> Unit,
) {
    val Ke = LocalPalette.current
    val auth by Repo.auth.collectAsStateWithLifecycle()
    var screen by remember { mutableStateOf(Screen.HOME) }

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

            screen == Screen.APPEARANCE -> AppearanceScreen(
                mode = themeMode,
                onPick = onThemeMode,
                onDone = { screen = Screen.HOME },
            )

            else -> HomeScreen(
                onStart = { steps -> engine.start(steps); screen = Screen.SESSION },
                onChangeLevel = { screen = Screen.LEVEL },
                onExercises = { screen = Screen.EXERCISES },
                onAppearance = { screen = Screen.APPEARANCE },
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
) {
    val Ke = LocalPalette.current
    val profile by Repo.profile.collectAsStateWithLifecycle()
    val syncing by Repo.syncing.collectAsStateWithLifecycle()

    val p = profile
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
                        if (syncing) "Syncing…" else "Not synced yet",
                        color = Ke.textMuted,
                        fontSize = 11.sp,
                    )
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
                            val playlist = SessionBuilder.buildDaily(p.completedDays, p.levelId, p.entitled)
                            if (playlist.steps.isNotEmpty()) onStart(playlist.steps)
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
                CompactChip(
                    onClick = onChangeLevel,
                    colors = ChipDefaults.chipColors(backgroundColor = Ke.surface2, contentColor = Ke.text),
                    label = { Text("Difficulty · ${Catalogue.levelName(p.levelId)}", color = Ke.text, fontSize = 11.sp, maxLines = 1) },
                )
            }
            item {
                CompactChip(
                    onClick = onExercises,
                    colors = ChipDefaults.chipColors(backgroundColor = Ke.surface2, contentColor = Ke.text),
                    label = { Text("Exercises", color = Ke.text, fontSize = 11.sp) },
                )
            }
            item {
                CompactChip(
                    onClick = onAppearance,
                    colors = ChipDefaults.chipColors(backgroundColor = Ke.surface2, contentColor = Ke.text),
                    label = { Text("Appearance", color = Ke.text, fontSize = 11.sp) },
                )
            }

            item {
                if (p.entitled) {
                    RemindersBlock(p)
                } else {
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

@Composable
private fun StatRow(label: String, value: String) {
    val Ke = LocalPalette.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = Ke.textMuted, fontSize = 12.sp, maxLines = 1)
        Text(value, color = Ke.text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

/**
 * The reminder week, in a line or two.
 *
 * Shown because the watch is what actually buzzes, so "when am I being
 * reminded" is a question to answer here. Read-only because building a
 * seven-day schedule on a 40mm screen would be worse than the phone's editor in
 * every respect - and grouped by shared time, because "Mon, Wed, Fri 08:00" is
 * one glance where three rows saying the same thing are not.
 */
@Composable
private fun RemindersBlock(p: Profile) {
    val Ke = LocalPalette.current
    val active = p.activeReminders
    Text("Reminders", color = Ke.textMuted, fontSize = 10.sp)
    Spacer(Modifier.height(2.dp))

    if (active.isEmpty()) {
        Text("Set them in the app", color = Ke.textMuted, fontSize = 9.sp)
        return
    }

    // Monday-first, matching the backend's own weekday index.
    val names = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    active.groupBy { it.times.sorted().joinToString(" ") }.forEach { (times, days) ->
        Text(
            days.mapNotNull { names.getOrNull(it.weekday) }.joinToString(", "),
            color = Ke.text,
            fontSize = 10.sp,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
        Text(times, color = Ke.accent, fontSize = 9.sp, textAlign = TextAlign.Center, maxLines = 1)
        Spacer(Modifier.height(3.dp))
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
@Composable
private fun SessionScreen(engine: SessionEngine, onStop: () -> Unit, onFinished: () -> Unit) {
    val Ke = LocalPalette.current
    val context = LocalContext.current
    val step = engine.currentStep
    val paused = engine.phase == SessionEngine.Phase.PAUSED

    LaunchedEffect(engine.phase) {
        if (engine.phase == SessionEngine.Phase.DONE) {
            Repo.recordSession(context, engine.elapsedSeconds, engine.trainedSlugs())
            onFinished()
        }
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        /**
         * What is being trained, above the ring rather than inside it.
         *
         * It was a third line in the middle of the circle and it did not fit -
         * "Next: Reverse Clamp" was wider than the ring and ran onto the stroke
         * at both ends. Out here it has the full width of the screen, and the
         * chevron does the work "Next:" was doing in a fraction of the room.
         */
        Row(
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (engine.isResting) Glyph.Next(color = Ke.textMuted, size = 8.dp)
            Text(
                text = if (engine.isResting) {
                    engine.nextExerciseSlug?.let { Catalogue.exerciseName(it) } ?: "Rest"
                } else {
                    Catalogue.exerciseName(engine.blockSlug)
                },
                color = Ke.textMuted,
                fontSize = 10.sp,
                maxLines = 1,
            )
        }

        TrainingCircle(
            // A paused circle settles to rest rather than freezing mid-squeeze:
            // a held shape with no clock behind it reads as "keep holding".
            contraction = if (paused) 0f else engine.contraction,
            // Both per-BLOCK, so the ring fills once across an exercise and the
            // numeral counts that exercise down - see the note in SessionEngine
            // on why per-step made this read "1, 0, 1, 0".
            stepProgress = engine.blockProgress,
            sessionProgress = engine.sessionProgress,
            isContract = step?.isContract == true,
            isResting = engine.isResting,
            pursuitMs = engine.pursuitMs,
            label = when {
                paused -> "Paused"
                engine.isResting -> "Rest"
                else -> step?.label.orEmpty()
            },
            seconds = engine.blockRemaining,
        )

        Row(
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            CompactChip(
                onClick = { if (paused) engine.resume() else engine.pause() },
                colors = ChipDefaults.chipColors(backgroundColor = Ke.surface2, contentColor = Ke.text),
                label = { Text(if (paused) "Resume" else "Pause", color = Ke.text, fontSize = 11.sp) },
            )
            CompactChip(
                onClick = onStop,
                colors = ChipDefaults.chipColors(backgroundColor = Ke.surface, contentColor = Ke.textMuted),
                label = { Text("End", color = Ke.textMuted, fontSize = 11.sp) },
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
        Text(
            if (p != null) "${p.todayDone}/${p.todayRequired.coerceAtLeast(1)} today  ·  ${seconds / 60}m ${seconds % 60}s"
            else "${seconds / 60}m ${seconds % 60}s",
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
        colors = ChipDefaults.chipColors(backgroundColor = Ke.surface2, contentColor = Ke.textMuted),
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
    val scope = rememberCoroutineScope()
    val profile by Repo.profile.collectAsStateWithLifecycle()
    val current = profile?.levelId ?: 1

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
                Text("Sets how long a session runs", color = Ke.textMuted, fontSize = 9.sp, maxLines = 1)
            }
        }

        items((1..5).toList()) { level ->
            val selected = level == current
            CompactChip(
                onClick = {
                    scope.launch { Repo.setLevel(context, level) }
                    onDone()
                },
                colors = ChipDefaults.chipColors(
                    backgroundColor = if (selected) Ke.accent else Ke.surface2,
                    contentColor = if (selected) Ke.bg else Ke.text,
                ),
                label = {
                    Text(
                        "${Catalogue.levelName(level)} · ${(Catalogue.level(level).totalSessionSeconds / 60.0).roundToInt().coerceAtLeast(1)} min",
                        color = if (selected) Ke.bg else Ke.text,
                        fontSize = 11.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        maxLines = 1,
                    )
                },
            )
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
                    backgroundColor = if (selected) Ke.accent else Ke.surface2,
                    contentColor = if (selected) Ke.bg else Ke.text,
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
    val days = profile?.completedDays ?: 0
    val entitled = profile?.entitled == true

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
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        if (row.open) "Open" else row.lockedWhy,
                        color = if (row.open) Ke.accent else Ke.textMuted,
                        fontSize = 9.sp,
                        maxLines = 1,
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
