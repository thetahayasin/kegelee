package com.kegelee.app.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The handful of marks this app needs, drawn rather than imported.
 *
 * `material-icons-extended` is megabytes of vectors to get a tick and two
 * chevrons, which is weight a watch APK should not carry. These are a few lines
 * of Canvas each and scale to any size without a density bucket.
 *
 * They exist because words were taking up room the screen does not have: a
 * "Next: Reverse Clamp" line was wider than the ring it sat in, and a chevron
 * says "next" in eight pixels.
 */
object Glyph {

    /** Points the way to what follows. Used where "Next:" was written out. */
    @Composable
    fun Next(color: Color, size: Dp = 8.dp) {
        Canvas(Modifier.size(size)) {
            val w = this.size.width
            val h = this.size.height
            val stroke = (w * 0.22f).coerceAtLeast(1.2f)
            drawPath(
                path = Path().apply {
                    moveTo(w * 0.3f, h * 0.15f)
                    lineTo(w * 0.72f, h * 0.5f)
                    lineTo(w * 0.3f, h * 0.85f)
                },
                color = color,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
    }

    /** Back, at the top of a screen where a watch expects it. */
    @Composable
    fun Back(color: Color, size: Dp = 14.dp) {
        Canvas(Modifier.size(size)) {
            val w = this.size.width
            val h = this.size.height
            val stroke = (w * 0.14f).coerceAtLeast(1.5f)
            drawPath(
                path = Path().apply {
                    moveTo(w * 0.62f, h * 0.18f)
                    lineTo(w * 0.3f, h * 0.5f)
                    lineTo(w * 0.62f, h * 0.82f)
                },
                color = color,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
    }

    /**
     * Session finished.
     *
     * A tick inside a ring, which is the shape the phone's completion screen
     * uses - so the moment reads the same on either device.
     */
    @Composable
    fun Complete(color: Color, size: Dp = 46.dp) {
        Canvas(Modifier.size(size)) {
            val d = this.size.minDimension
            val ring = d * 0.075f
            drawCircle(
                color = color,
                radius = (d - ring) / 2f,
                center = Offset(d / 2f, d / 2f),
                style = Stroke(width = ring, cap = StrokeCap.Round),
            )
            drawPath(
                path = Path().apply {
                    moveTo(d * 0.30f, d * 0.52f)
                    lineTo(d * 0.44f, d * 0.66f)
                    lineTo(d * 0.71f, d * 0.36f)
                },
                color = color,
                style = Stroke(width = d * 0.085f, cap = StrokeCap.Round),
            )
        }
    }
}
