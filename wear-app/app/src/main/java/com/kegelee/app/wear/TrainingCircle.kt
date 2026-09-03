package com.kegelee.app.wear

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text

/**
 * The training circle from the phone app, on a watch.
 *
 * This is the piece worth getting exactly right, because it is not decoration -
 * it is the instruction. The phone draws a ring that SWELLS as the pelvic floor
 * should tighten and settles as it releases, lit by a halo that brightens with
 * it, and people follow the shape rather than reading the word. A generic
 * countdown would have been a different exercise wearing the same name.
 *
 * Three layers, outside in, matching `WorkoutScreen`'s own stack:
 *
 *  1. A faint session arc around the very edge - how much of the whole workout
 *     is behind you, answered without a number.
 *  2. The halo (`ContractGlow` on the phone): a radial wash that is nothing at
 *     rest and strongest at full contraction, so the screen brightens as you
 *     squeeze. It is drawn OUTSIDE the ring, never under it, or it would wash
 *     out the thing it is meant to light.
 *  3. The ring itself: a track, a progress arc drawn from twelve o'clock, and a
 *     radius that grows with the contraction.
 */
@Composable
fun TrainingCircle(
    /** 0f..1f, how tight the squeeze is right now. Drives size and glow. */
    contraction: Float,
    /** 0f..1f through the current step. Fills the arc. */
    stepProgress: Float,
    /** 0f..1f through the whole session. Fills the outer edge. */
    sessionProgress: Float,
    isContract: Boolean,
    label: String,
    seconds: Int,
    modifier: Modifier = Modifier,
    diameter: Dp = 126.dp,
) {
    /**
     * The contraction is smoothed, deliberately.
     *
     * The engine recomputes about twenty times a second, and binding the radius
     * straight to that made the ring move in visible steps. Chasing the value
     * fills in the frames between, which is the same trick the phone plays with
     * its Animated.Value - and here it matters more, because a jerky cue is a
     * cue somebody stops trusting.
     */
    val eased by animateFloatAsState(targetValue = contraction, label = "contraction")

    val cue = if (isContract) Ke.Accent else Ke.Relax

    Box(modifier = modifier.size(diameter), contentAlignment = Alignment.Center) {

        // 1 + 2. The halo, and the session arc at the rim.
        Canvas(Modifier.fillMaxSize()) {
            val c = Offset(size.width / 2f, size.height / 2f)

            /**
             * Nothing at rest, strongest at full squeeze.
             *
             * Alpha carries the contraction rather than radius alone: a halo
             * that only grew would still be visible during a full release,
             * which is precisely when the screen should be calm.
             */
            if (eased > 0.01f) {
                val haloRadius = size.minDimension / 2f * (0.62f + 0.38f * eased)
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            cue.copy(alpha = 0.00f),
                            cue.copy(alpha = 0.16f * eased),
                            cue.copy(alpha = 0.00f),
                        ),
                        center = c,
                        radius = haloRadius,
                    ),
                    radius = haloRadius,
                    center = c,
                )
            }

            val rim = 3.dp.toPx()
            val rimInset = rim / 2f
            drawArc(
                color = Ke.Track.copy(alpha = 0.55f),
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(rimInset, rimInset),
                size = Size(size.width - rim, size.height - rim),
                style = Stroke(width = rim, cap = StrokeCap.Round),
            )
            drawArc(
                color = cue.copy(alpha = 0.45f),
                startAngle = -90f,
                sweepAngle = 360f * sessionProgress.coerceIn(0f, 1f),
                useCenter = false,
                topLeft = Offset(rimInset, rimInset),
                size = Size(size.width - rim, size.height - rim),
                style = Stroke(width = rim, cap = StrokeCap.Round),
            )
        }

        // 3. The ring that breathes.
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 9.dp.toPx()
            // 68% of the box at rest, 92% at full contraction. Enough travel to
            // read across a room; not so much that it collides with the rim arc.
            val scale = 0.68f + 0.24f * eased
            val outer = size.minDimension * scale
            val inset = (size.minDimension - outer) / 2f

            drawArc(
                color = Ke.Track,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset + stroke / 2f, inset + stroke / 2f),
                size = Size(outer - stroke, outer - stroke),
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
            drawArc(
                color = cue,
                startAngle = -90f,
                sweepAngle = 360f * stepProgress.coerceIn(0f, 1f),
                useCenter = false,
                topLeft = Offset(inset + stroke / 2f, inset + stroke / 2f),
                size = Size(outer - stroke, outer - stroke),
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "$seconds",
                color = Ke.Text,
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            // The cue sits inside the ring so the eye never has to leave the
            // shape it is following. Capped at one line and sized to fit the
            // longest label in the catalogue ("Release slowly") within the
            // smaller circle.
            Text(
                text = label,
                color = cue,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 6.dp),
            )
        }
    }
}
