package com.kegelee.app.wear

import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text

/**
 * `Easing.out(Easing.quad)` from the phone, which Compose has no name for.
 *
 * Decelerating: fastest at the start of the chase, settling gently. Matching it
 * matters more than it sounds - a linear or spring chase gives the same numbers
 * a different feel, and the whole point of this component is that the movement
 * is recognisably the same as the app's.
 */
private val QuadOut = Easing { t -> 1f - (1f - t) * (1f - t) }

/**
 * The training circle from the phone app, on a watch.
 *
 * Not decoration - it is the instruction. People follow the light rather than
 * reading the word, which is why the rhythm is copied from
 * `WorkoutScreen.updateGlowAnimation` rather than approximated.
 *
 * The important structural point, and the one the first attempt got wrong: **the
 * ring does not change size.** On the phone it is fixed, its arc filling with
 * the step's progress, and it is the HALO behind it that swells and brightens
 * as the contraction builds. Scaling the ring instead produced something that
 * moved but did not look like the same exercise.
 *
 * So, back to front:
 *
 *  1. The halo. A radial gradient that is empty where the ring sits and rises
 *     to its brightest just outside it, so it reads as light coming off the
 *     ring. Its box is 1.7x the ring - the phone's `GLOW_SCALE` - and it is
 *     scaled 0.58..1.0 and faded 0.08..1.0 by the contraction. A rest beat has
 *     none at all.
 *  2. A faint rim arc at the very edge: how much of the whole session is done,
 *     answered without a number.
 *  3. The ring: a track, and a progress arc drawn from twelve o'clock.
 *  4. Seconds, and the cue, small and inside.
 */
@Composable
fun TrainingCircle(
    /** 0f..1f, already eased by the engine. Drives the halo. */
    contraction: Float,
    /** 0f..1f through the current step. Fills the ring's arc. */
    stepProgress: Float,
    /** 0f..1f through the whole session. Fills the rim. */
    sessionProgress: Float,
    isContract: Boolean,
    isResting: Boolean,
    /** How long the halo may take to reach a new target - see SessionEngine. */
    pursuitMs: Int,
    label: String,
    seconds: Int,
    /** What follows this block, shown under the cue. Null hides the line. */
    upcoming: String? = null,
    modifier: Modifier = Modifier,
    /** The ring. Everything else is sized from it. */
    ring: Dp = 96.dp,
) {
    /**
     * One colour for both phases, as the phone has it.
     *
     * `LiveProgressRing` draws its arc in `accentText` whatever the step is,
     * and `ContractGlow` is always the lime `glow` token - so a two-colour
     * scheme here read as a different app, and a blue ring inside a lime halo
     * looked like a mistake besides. The phase is carried by the light: a
     * contraction is bright and wide, a release is dim and close. That is the
     * distinction the design already makes, and it survives being glanced at
     * far better than a hue change does.
     */
    val cue = Ke.Accent

    /**
     * Two chased values, exactly as the phone animates them.
     *
     * The engine recomputes about twenty times a second and these tween toward
     * whatever it last said, which makes the timing a low-pass filter: gradual
     * ramps track with no visible lag, while a step boundary's jump eases out
     * instead of snapping in a single frame.
     */
    val glowScale by animateFloatAsState(
        targetValue = 0.58f + contraction * 0.42f,
        animationSpec = tween(durationMillis = pursuitMs, easing = QuadOut),
        label = "glowScale",
    )
    val glowAlpha by animateFloatAsState(
        targetValue = if (isResting) 0f else 0.08f + contraction * 0.92f,
        animationSpec = tween(durationMillis = pursuitMs, easing = QuadOut),
        label = "glowAlpha",
    )

    /**
     * The arc is chased too, not bound straight to the engine.
     *
     * The block progress is recomputed twenty times a second, and drawing it
     * raw moved the sweep in twenty visible steps per second - which on a ring
     * this size reads as a stutter. A short linear tween fills in the frames
     * between, the same reason the phone runs its `strokeDashoffset` through an
     * Animated.Value. Linear, not eased: progress through an exercise is
     * genuinely linear and easing it would make the arc lie about the clock.
     */
    val sweep by animateFloatAsState(
        targetValue = stepProgress.coerceIn(0f, 1f),
        animationSpec = tween(durationMillis = 90, easing = LinearEasing),
        label = "sweep",
    )
    val rimSweep by animateFloatAsState(
        targetValue = sessionProgress.coerceIn(0f, 1f),
        animationSpec = tween(durationMillis = 220, easing = LinearEasing),
        label = "rimSweep",
    )

    // 1.7x the ring, so the halo has somewhere to reach.
    val box = ring * 1.7f

    Box(modifier = modifier.size(box), contentAlignment = Alignment.Center) {

        // 1. The halo.
        Canvas(Modifier.size(box)) {
            if (glowAlpha <= 0.01f) return@Canvas
            val centre = Offset(size.width / 2f, size.height / 2f)
            val radius = (size.minDimension / 2f) * glowScale
            if (radius <= 0f) return@Canvas
            drawCircle(
                brush = Brush.radialGradient(
                    /**
                     * The phone's own stops. Empty until 56% - where the ring
                     * itself sits - because a halo drawn under the ring washes
                     * out the thing it is meant to be lighting. Brightest at
                     * 90% and easing off at the rim, so the edge is light
                     * rather than a drawn circle.
                     */
                    0.00f to Ke.Glow.copy(alpha = 0f),
                    0.56f to Ke.Glow.copy(alpha = 0f),
                    0.66f to Ke.Glow.copy(alpha = 0.08f * glowAlpha),
                    0.90f to Ke.Glow.copy(alpha = 0.42f * glowAlpha),
                    1.00f to Ke.Glow.copy(alpha = 0.24f * glowAlpha),
                    center = centre,
                    radius = radius,
                ),
                radius = radius,
                center = centre,
            )
        }

        // 2. The session rim.
        Canvas(Modifier.size(box)) {
            val w = 3.dp.toPx()
            val inset = w / 2f
            drawArc(
                color = Ke.Track.copy(alpha = 0.4f),
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(size.width - w, size.height - w),
                style = Stroke(width = w, cap = StrokeCap.Round),
            )
            drawArc(
                color = cue.copy(alpha = 0.4f),
                startAngle = -90f,
                sweepAngle = 360f * rimSweep,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(size.width - w, size.height - w),
                style = Stroke(width = w, cap = StrokeCap.Round),
            )
        }

        // 3. The ring. Fixed size - see the note at the top.
        Canvas(Modifier.size(ring)) {
            val w = 8.dp.toPx()
            val inset = w / 2f
            drawArc(
                color = Ke.Track,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(size.width - w, size.height - w),
                style = Stroke(width = w, cap = StrokeCap.Round),
            )
            drawArc(
                color = cue,
                startAngle = -90f,
                sweepAngle = 360f * sweep,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(size.width - w, size.height - w),
                style = Stroke(width = w, cap = StrokeCap.Round),
            )
        }

        /**
         * 4. The readout, sitting a little high in the ring.
         *
         * Nudged up rather than centred because there are now three lines and a
         * centred block put the third one on the ring's lower stroke. Raising
         * the group leaves the count optically centred - which is the thing the
         * eye goes to - and gives what is coming next somewhere to live.
         */
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.offset(y = (-6).dp),
        ) {
            Text(
                text = "$seconds",
                color = Ke.Text,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            Text(
                text = label,
                color = cue,
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
            // What is coming, in place of the phone's carousel along the bottom
            // - there is no room for that here, and this is the same answer to
            // the same question.
            if (!upcoming.isNullOrBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = upcoming,
                    color = Ke.TextMuted,
                    fontSize = 8.sp,
                    maxLines = 1,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 10.dp),
                )
            }
        }
    }
}
