package com.kegelee.app.wear

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text

/**
 * The training circle from the phone app, on a watch.
 *
 * Not decoration - it is the instruction. The ring holds still and the HALO
 * behind it swells and brightens as the contraction builds, which is what the
 * phone draws; scaling the ring instead moved but did not look like the same
 * exercise.
 *
 * ## Why everything here is a lambda
 *
 * The animated values arrive as `() -> Float` rather than as `Float`, and are
 * called inside the `Canvas` draw block. That is a DEFERRED READ: the state is
 * subscribed to by the draw phase instead of by composition, so a value that
 * changes every frame re-runs a few drawArc calls and nothing else.
 *
 * Passed as plain floats, the same change invalidated this whole composable
 * sixty times a second - re-measuring text, re-laying out a column, rebuilding
 * every lambda - to move an arc a fraction of a degree. That is where the app's
 * sluggishness came from, and it is the single biggest reason it feels
 * different now.
 *
 * The text is the opposite case: it changes about once a second, so it stays an
 * ordinary parameter and recomposes when it genuinely changes.
 */
@Composable
fun TrainingCircle(
    /**
     * The halo's size and brightness, ALREADY CHASED by the engine.
     *
     * Not the raw contraction: the phone restarts an eased timing toward its
     * target every 50ms and draws the chased value, and that lag is the motion
     * people follow. See SessionEngine's `Chase`.
     */
    glowScale: () -> Float,
    glowAlpha: () -> Float,
    /** The ring's arc, chased linearly as the phone chases its dashoffset. */
    ringPct: () -> Float,
    /** 0f..1f through the whole session. Fills the rim. Read per frame. */
    sessionProgress: () -> Float,
    seconds: Int,
    label: String,
    /** The exercise being trained, small, under the cue. */
    exercise: String,
    modifier: Modifier = Modifier,
    /** The ring. The halo reaches 1.7x this, matching the phone's GLOW_SCALE. */
    ring: Dp = 104.dp,
) {
    val Ke = LocalPalette.current
    val box = ring * 1.7f

    /**
     * What a screen reader is told, since none of this is text it can reach.
     *
     * The circle is raw Canvas and the numerals inside it are three separate
     * unrelated Texts, so TalkBack read a bare number with no idea what it was
     * counting. Merged into one node with a spoken state, which is also what
     * gets announced when the cue changes.
     */
    val spoken = listOf(exercise, label, "${seconds}s").filter { it.isNotBlank() }.joinToString(", ")

    Box(
        modifier = modifier
            .size(box)
            .semantics(mergeDescendants = true) { stateDescription = spoken },
        contentAlignment = Alignment.Center,
    ) {

        /**
         * Halo, rim and ring in ONE draw pass, with the gradient cached.
         *
         * Two things were costing real time here every frame. Each Canvas is
         * its own layout node, so three of them meant three lots of measure and
         * place on a screen redrawing sixty times a second; and the halo's
         * radial gradient was being rebuilt inside the draw block, which
         * allocates a shader per frame - the single most expensive thing that
         * was happening.
         *
         * `drawWithCache` builds the brush once per SIZE change, and the
         * animation is applied as a scale and an alpha at draw time instead.
         * That is exactly equivalent - the stops below carry the phone's
         * relative opacities and the global alpha scales all of them - and it
         * costs nothing per frame.
         */
        Spacer(
            Modifier
                .fillMaxSize()
                .drawWithCache {
                    val haloRadius = size.minDimension / 2f
                    val halo = Brush.radialGradient(
                        // Empty until 56%, where the ring sits: a halo drawn
                        // under the ring washes out what it is meant to light.
                        0.00f to Ke.glow.copy(alpha = 0f),
                        0.56f to Ke.glow.copy(alpha = 0f),
                        0.66f to Ke.glow.copy(alpha = 0.08f),
                        0.90f to Ke.glow.copy(alpha = 0.42f),
                        1.00f to Ke.glow.copy(alpha = 0.24f),
                        center = Offset(size.width / 2f, size.height / 2f),
                        radius = haloRadius,
                    )
                    val centre = Offset(size.width / 2f, size.height / 2f)

                    val rimW = 3.dp.toPx()
                    val rimBox = Size(size.width - rimW, size.height - rimW)
                    val rimTopLeft = Offset(rimW / 2f, rimW / 2f)

                    val ringPx = ring.toPx()
                    val ringW = 8.dp.toPx()
                    val ringInset = (size.minDimension - ringPx) / 2f + ringW / 2f
                    val ringBox = Size(ringPx - ringW, ringPx - ringW)
                    val ringTopLeft = Offset(ringInset, ringInset)

                    onDrawBehind {
                        val alpha = glowAlpha().coerceIn(0f, 1f)

                        if (alpha > 0.01f) {
                            // The chased scale, applied to a brush that never
                            // has to be rebuilt.
                            scale(glowScale().coerceIn(0.1f, 2f), pivot = centre) {
                                drawCircle(
                                    brush = halo,
                                    radius = haloRadius,
                                    center = centre,
                                    alpha = alpha,
                                )
                            }
                        }

                        drawArc(
                            color = Ke.track.copy(alpha = 0.4f),
                            startAngle = -90f,
                            sweepAngle = 360f,
                            useCenter = false,
                            topLeft = rimTopLeft,
                            size = rimBox,
                            style = Stroke(width = rimW, cap = StrokeCap.Round),
                        )
                        drawArc(
                            color = Ke.accent.copy(alpha = 0.4f),
                            startAngle = -90f,
                            sweepAngle = 360f * sessionProgress().coerceIn(0f, 1f),
                            useCenter = false,
                            topLeft = rimTopLeft,
                            size = rimBox,
                            style = Stroke(width = rimW, cap = StrokeCap.Round),
                        )

                        // The ring, at a fixed size - see the note at the top.
                        drawArc(
                            color = Ke.track,
                            startAngle = -90f,
                            sweepAngle = 360f,
                            useCenter = false,
                            topLeft = ringTopLeft,
                            size = ringBox,
                            style = Stroke(width = ringW, cap = StrokeCap.Round),
                        )
                        drawArc(
                            color = Ke.accent,
                            startAngle = -90f,
                            sweepAngle = 360f * ringPct().coerceIn(0f, 1f),
                            useCenter = false,
                            topLeft = ringTopLeft,
                            size = ringBox,
                            style = Stroke(width = ringW, cap = StrokeCap.Round),
                        )
                    }
                },
        )

        /**
         * Three lines, inside the ring, in descending importance.
         *
         * The exercise name lives here rather than above the circle: put at the
         * top of the screen it was a separate thing to look at, and the whole
         * point of the circle is that one place holds everything. It is small
         * enough not to crowd the cue, capped to one line, and inset well
         * inside the ring's inner edge so it cannot touch the stroke.
         */
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(horizontal = ring * 0.14f),
        ) {
            Text(
                text = "$seconds",
                color = Ke.text,
                fontSize = 26.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = label,
                color = Ke.accent,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
            )
            if (exercise.isNotBlank()) {
                Spacer(Modifier.height(1.dp))
                Text(
                    text = exercise,
                    color = Ke.textMuted,
                    // 8sp was below anything readable on a wrist at arm's length.
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
