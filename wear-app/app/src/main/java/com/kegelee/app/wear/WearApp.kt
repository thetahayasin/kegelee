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

private enum class Screen { HOME, SESSION, DONE, LEVEL, EXERCISES }

@Composable
fun WearApp(engine: SessionEngine, onGoogleSignIn: () -> Unit) {
    val auth by Repo.auth.collectAsStateWithLifecycle()
    var screen by remember { mutableStateOf(Screen.HOME) }

    Scaffold(
        modifier = Modifier.fillMaxSize().background(Ke.Bg),
        // Hidden mid-session: the clock sits where the cue belongs, and nobody
        // holding a contraction is checking the time.
        timeText = { if (screen != Screen.SESSION) TimeText() },
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

            else -> HomeScreen(
                onStart = { steps -> engine.start(steps); screen = Screen.SESSION },
                onChangeLevel = { screen = Screen.LEVEL },
                onExercises = { screen = Screen.EXERCISES },
            )
        }
    }
}

// --- Home ------------------------------------------------------------------

/**
 * One glance, one decision - then everything else below the fold.
 *
 * The ring says whether today is done and the button starts a session. Those
 * are the only two things anybody wants from a wrist, so they lead; the record,
 * the difficulty, the catalogue and the reminder week are all one scroll away,
 * present when looked for and out of the way when not.
 *
 * A plain scrolling Column rather than a Wear list, unlike the two list screens
 * below. The difference is the ring: it is a fixed-size graphic, and
 * ScalingLazyColumn insisted on centring its own chosen item against the clock
 * whatever padding it was given.
 */
@Composable
private fun HomeScreen(
    onStart: (List<PlayStep>) -> Unit,
    onChangeLevel: () -> Unit,
    onExercises: () -> Unit,
) {
    val profile by Repo.profile.collectAsStateWithLifecycle()
    val syncing by Repo.syncing.collectAsStateWithLifecycle()
    val pending by Repo.pending.collectAsStateWithLifecycle()

    val p = profile

    /**
     * The crown, not just the touchscreen.
     *
     * `verticalScroll` alone handles a finger drag and ignores rotary input, so
     * on a real watch the screen would not move when the crown was turned -
     * which is the gesture people reach for first.
     */
    val scrollState = rememberScrollState()
    val rotaryFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { rotaryFocus.requestFocus() } }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .rotaryScrollable(
                RotaryScrollableDefaults.behavior(scrollableState = scrollState),
                focusRequester = rotaryFocus,
            )
            // Wide insets, because the screen is a circle: a row near the top or
            // bottom has far less width than one across the middle.
            .padding(top = 30.dp, bottom = 32.dp, start = 22.dp, end = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        TodayRing(
            done = p?.todayDone ?: 0,
            required = p?.todayRequired ?: 2,
            syncing = syncing && p == null,
        )

        Spacer(Modifier.height(12.dp))

        if (p == null) {
            Text(
                if (syncing) "Syncing…" else "Not synced yet",
                color = Ke.TextMuted,
                fontSize = 12.sp,
            )
        } else {
            /**
             * A free account still trains, on the free exercises.
             *
             * Locking the watch outright was the wrong answer to "what if they
             * have not subscribed": the phone is freemium - three free
             * exercises and a day count that stops at the free cap - so a watch
             * that refused to open would be stricter than the product it
             * belongs to. `entitled` goes straight to the builder, which
             * narrows the pool exactly as the phone's `freeOnly` does.
             */
            Button(
                onClick = {
                    val playlist = SessionBuilder.buildDaily(p.completedDays, p.levelId, p.entitled)
                    if (playlist.steps.isNotEmpty()) onStart(playlist.steps)
                },
                colors = ButtonDefaults.buttonColors(backgroundColor = Ke.Accent, contentColor = Ke.Bg),
                modifier = Modifier.size(width = 130.dp, height = 46.dp),
            ) {
                Text(
                    if (p.todayComplete) "Train again" else "Start",
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "${(Catalogue.level(p.levelId).totalSessionSeconds / 60.0).roundToInt().coerceAtLeast(1)} min  ·  ${Catalogue.levelName(p.levelId)}",
                color = Ke.TextMuted,
                fontSize = 11.sp,
            )

            Spacer(Modifier.height(14.dp))
            StatRow("Streak", if (p.streak == 1) "1 day" else "${p.streak} days")
            StatRow("Day", "${p.day}")
            // The personal record: a streak says how consistent, this says how
            // strong, and it is the one progress figure worth a glance.
            if (p.bestHold > 0) StatRow("Best hold", "${p.bestHold}s")

            Spacer(Modifier.height(10.dp))
            CompactChip(
                onClick = onChangeLevel,
                colors = ChipDefaults.chipColors(backgroundColor = Ke.Surface2, contentColor = Ke.Text),
                label = { Text("Difficulty · ${Catalogue.levelName(p.levelId)}", fontSize = 11.sp, maxLines = 1) },
            )
            Spacer(Modifier.height(5.dp))
            CompactChip(
                onClick = onExercises,
                colors = ChipDefaults.chipColors(backgroundColor = Ke.Surface2, contentColor = Ke.Text),
                label = { Text("Exercises", fontSize = 11.sp) },
            )

            Spacer(Modifier.height(12.dp))
            if (p.entitled) {
                RemindersBlock(p)
            } else {
                Text("Premium", color = Ke.Accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "Subscribe in the app for every exercise and reminders",
                    color = Ke.TextMuted,
                    fontSize = 9.sp,
                    textAlign = TextAlign.Center,
                )
            }
        }

        /**
         * No Sync button.
         *
         * It did what the app already does on every open and after every
         * session, so its only real function was to make somebody wonder
         * whether they needed to press it. Syncing is the app's job.
         */
        if (pending > 0) {
            Spacer(Modifier.height(8.dp))
            Text(
                if (pending == 1) "1 session to upload" else "$pending sessions to upload",
                color = Ke.TextMuted,
                fontSize = 9.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/**
 * Today's sessions as segments, not a smooth arc.
 *
 * The target is a small whole number - usually two - and a continuous 50% sweep
 * says less at a glance than one filled segment out of two.
 */
@Composable
private fun TodayRing(done: Int, required: Int, syncing: Boolean) {
    val target = required.coerceAtLeast(1)
    val complete = done >= target

    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(84.dp)) {
        if (syncing) {
            CircularProgressIndicator(
                modifier = Modifier.fillMaxSize(),
                indicatorColor = Ke.Accent,
                trackColor = Ke.Track,
                strokeWidth = 7.dp,
            )
        } else {
            Canvas(Modifier.fillMaxSize()) {
                val stroke = 8.dp.toPx()
                val gap = if (target > 1) 10f else 0f
                val sweep = (360f / target) - gap
                for (i in 0 until target) {
                    drawArc(
                        color = if (i < done) Ke.Accent else Ke.Track,
                        startAngle = -90f + (i * 360f / target) + (gap / 2f),
                        sweepAngle = sweep,
                        useCenter = false,
                        style = Stroke(width = stroke, cap = StrokeCap.Round),
                    )
                }
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "$done/$target",
                color = if (complete) Ke.Accent else Ke.Text,
                fontSize = 21.sp,
                fontWeight = FontWeight.Bold,
            )
            Text("today", color = Ke.TextMuted, fontSize = 10.sp)
        }
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = Ke.TextMuted, fontSize = 12.sp, maxLines = 1)
        Text(value, color = Ke.Text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
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
    val active = p.activeReminders
    Text("Reminders", color = Ke.TextMuted, fontSize = 10.sp)
    Spacer(Modifier.height(2.dp))

    if (active.isEmpty()) {
        Text("Set them in the app", color = Ke.TextMuted, fontSize = 9.sp)
        return
    }

    // Monday-first, matching the backend's own weekday index.
    val names = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    active.groupBy { it.times.sorted().joinToString(" ") }.forEach { (times, days) ->
        Text(
            days.mapNotNull { names.getOrNull(it.weekday) }.joinToString(", "),
            color = Ke.Text,
            fontSize = 10.sp,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
        Text(times, color = Ke.Accent, fontSize = 9.sp, textAlign = TextAlign.Center, maxLines = 1)
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
            upcoming = when {
                paused -> null
                engine.isResting -> engine.nextExerciseSlug?.let { "Next: ${Catalogue.exerciseName(it)}" }
                else -> Catalogue.exerciseName(engine.blockSlug)
            },
        )

        Row(
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            CompactChip(
                onClick = { if (paused) engine.resume() else engine.pause() },
                colors = ChipDefaults.chipColors(backgroundColor = Ke.Surface2, contentColor = Ke.Text),
                label = { Text(if (paused) "Resume" else "Pause", fontSize = 11.sp) },
            )
            CompactChip(
                onClick = onStop,
                colors = ChipDefaults.chipColors(backgroundColor = Ke.Surface, contentColor = Ke.TextMuted),
                label = { Text("End", fontSize = 11.sp) },
            )
        }
    }
}

// --- Done ------------------------------------------------------------------

@Composable
private fun DoneScreen(seconds: Int, onDismiss: () -> Unit) {
    val pending by Repo.pending.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 22.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Nice work", color = Ke.Accent, fontSize = 19.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text("${seconds / 60}m ${seconds % 60}s", color = Ke.Text, fontSize = 15.sp)
        Spacer(Modifier.height(6.dp))
        // The honest state either way. Claiming "saved" while it sits in the
        // outbox would be a promise the radio has not kept yet.
        Text(
            if (pending > 0) "Will upload when you are online" else "Saved",
            color = Ke.TextMuted,
            fontSize = 10.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(14.dp))
        CompactChip(
            onClick = onDismiss,
            colors = ChipDefaults.chipColors(backgroundColor = Ke.Accent, contentColor = Ke.Bg),
            label = { Text("Done", fontSize = 12.sp, fontWeight = FontWeight.Bold) },
        )
    }
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
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Difficulty", color = Ke.Text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text("Sets how long a session runs", color = Ke.TextMuted, fontSize = 9.sp, maxLines = 1)
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
                    backgroundColor = if (selected) Ke.Accent else Ke.Surface2,
                    contentColor = if (selected) Ke.Bg else Ke.Text,
                ),
                label = {
                    Text(
                        "${Catalogue.levelName(level)} · ${(Catalogue.level(level).totalSessionSeconds / 60.0).roundToInt().coerceAtLeast(1)} min",
                        fontSize = 11.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        maxLines = 1,
                    )
                },
            )
        }

        item {
            CompactChip(
                onClick = onDone,
                colors = ChipDefaults.chipColors(backgroundColor = Ke.Surface, contentColor = Ke.TextMuted),
                label = { Text("Back", fontSize = 11.sp) },
            )
        }
    }
}

// --- Exercises -------------------------------------------------------------

private data class ExerciseRow(val name: String, val open: Boolean, val lockedWhy: String)

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
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Exercises", color = Ke.Text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text(
                    "${rows.count { it.open }} of ${rows.size} open",
                    color = Ke.TextMuted,
                    fontSize = 9.sp,
                )
            }
        }

        items(rows) { row ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    row.name,
                    color = if (row.open) Ke.Text else Ke.TextMuted,
                    fontSize = 11.sp,
                    fontWeight = if (row.open) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    if (row.open) "Open" else row.lockedWhy,
                    color = if (row.open) Ke.Accent else Ke.TextMuted,
                    fontSize = 9.sp,
                    maxLines = 1,
                )
            }
        }

        item {
            CompactChip(
                onClick = onDone,
                colors = ChipDefaults.chipColors(backgroundColor = Ke.Surface, contentColor = Ke.TextMuted),
                label = { Text("Back", fontSize = 11.sp) },
            )
        }
    }
}
