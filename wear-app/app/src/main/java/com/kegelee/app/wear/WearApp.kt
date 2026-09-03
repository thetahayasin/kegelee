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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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

private enum class Screen { HOME, SESSION, DONE }

@Composable
fun WearApp(engine: SessionEngine, onGoogleSignIn: () -> Unit) {
    val auth by Repo.auth.collectAsStateWithLifecycle()
    var screen by remember { mutableStateOf(Screen.HOME) }

    Scaffold(
        modifier = Modifier.fillMaxSize().background(Ke.Bg),
        // Hidden mid-session: the clock sits exactly where the cue belongs, and
        // nobody holding a contraction is checking the time.
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

            else -> HomeScreen(
                onStart = { steps ->
                    engine.start(steps)
                    screen = Screen.SESSION
                },
            )
        }
    }
}

// --- Home ------------------------------------------------------------------

/**
 * One glance, one decision.
 *
 * The ring says whether today is done and the button starts a session; those
 * are the only two things anybody wants from a wrist. Everything else - level,
 * streak, plan position - sits below the fold, present when looked for and out
 * of the way when not. Putting the stats above the action, as the first version
 * did, buried the one thing the screen exists for.
 */
@Composable
private fun HomeScreen(onStart: (List<PlayStep>) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val profile by Repo.profile.collectAsStateWithLifecycle()
    val syncing by Repo.syncing.collectAsStateWithLifecycle()
    val pending by Repo.pending.collectAsStateWithLifecycle()

    val p = profile

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 30.dp, bottom = 26.dp, start = 14.dp, end = 14.dp),
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
        } else if (!p.entitled) {
            // The watch cannot sell anything, so it says the true thing and
            // stops. A "Subscribe" button that could not take money would be
            // worse than the plain sentence.
            Text("Premium", color = Ke.Accent, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(
                "Subscribe in the app to train",
                color = Ke.TextMuted,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )
        } else {
            Button(
                onClick = {
                    val playlist = SessionBuilder.buildDaily(p.completedDays, p.levelId, true)
                    if (playlist.steps.isNotEmpty()) onStart(playlist.steps)
                },
                colors = ButtonDefaults.buttonColors(backgroundColor = Ke.Accent, contentColor = Ke.Bg),
                modifier = Modifier.size(width = 132.dp, height = 48.dp),
            ) {
                Text(
                    if (p.todayComplete) "Train again" else "Start",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "${(Catalogue.level(p.levelId).totalSessionSeconds / 60.0).roundToInt().coerceAtLeast(1)} min  ·  ${Catalogue.levelName(p.levelId)}",
                color = Ke.TextMuted,
                fontSize = 12.sp,
            )
        }

        if (p != null) {
            Spacer(Modifier.height(14.dp))
            StatRow("Streak", if (p.streak == 1) "1 day" else "${p.streak} days")
            StatRow("Day", "${p.day}")
            StatRow("Days done", "${p.completedDays}")
        }

        Spacer(Modifier.height(10.dp))
        CompactChip(
            onClick = { scope.launch { Repo.sync(context) } },
            colors = ChipDefaults.chipColors(backgroundColor = Ke.Surface2, contentColor = Ke.Text),
            label = { Text(if (syncing) "Syncing…" else "Sync", fontSize = 12.sp) },
        )

        // Only when there is something to say - a permanent "0 waiting" row is
        // noise on a screen this size.
        if (pending > 0) {
            Spacer(Modifier.height(6.dp))
            Text(
                if (pending == 1) "1 session to upload" else "$pending sessions to upload",
                color = Ke.TextMuted,
                fontSize = 11.sp,
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

    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(86.dp)) {
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
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )
            Text("today", color = Ke.TextMuted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = Ke.TextMuted, fontSize = 13.sp)
        Text(value, color = Ke.Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

// --- Session ---------------------------------------------------------------

/**
 * The session: the training circle, and nothing that competes with it.
 *
 * Pause and End are deliberately small and low. They are wanted perhaps once a
 * session, and anything given equal weight to the circle would pull the eye off
 * the one thing being followed.
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

    /**
     * Three bands, and nothing overlapping.
     *
     * The first attempt centred a large circle and hung the exercise name and
     * the controls off the bottom of the same box, so on a 192dp screen all
     * three collided. A column that gives each its own row is both correct and
     * easier to read: what you are doing at the top, the cue in the middle,
     * the controls where a thumb expects them.
     */
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 16.dp, bottom = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = step?.takeIf { !it.isRest }?.let { Catalogue.exerciseName(it.slug) } ?: "Rest",
            color = Ke.TextMuted,
            fontSize = 11.sp,
            maxLines = 1,
        )

        TrainingCircle(
            // A paused circle settles to rest rather than freezing mid-squeeze:
            // a held shape with no clock behind it reads as "keep holding".
            contraction = if (paused) 0f else engine.contraction,
            stepProgress = engine.stepProgress,
            sessionProgress = engine.sessionProgress,
            isContract = step?.isContract == true,
            label = if (paused) "Paused" else step?.label.orEmpty(),
            seconds = engine.stepRemaining,
        )

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Nice work", color = Ke.Accent, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text("${seconds / 60}m ${seconds % 60}s", color = Ke.Text, fontSize = 16.sp)
        Spacer(Modifier.height(6.dp))
        // The honest state either way. Claiming "saved" while it sits in the
        // outbox would be a promise the radio has not kept yet.
        Text(
            if (pending > 0) "Will upload when you are online" else "Saved",
            color = Ke.TextMuted,
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(14.dp))
        CompactChip(
            onClick = onDismiss,
            colors = ChipDefaults.chipColors(backgroundColor = Ke.Accent, contentColor = Ke.Bg),
            label = { Text("Done", fontSize = 13.sp, fontWeight = FontWeight.Bold) },
        )
    }
}
