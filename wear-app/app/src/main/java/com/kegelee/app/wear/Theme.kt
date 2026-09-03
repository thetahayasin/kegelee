package com.kegelee.app.wear

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Typography

/**
 * The phone app's palette, on a watch.
 *
 * Taken verbatim from `src/theme/colors.ts` rather than re-picked, so the two
 * apps read as one product. It stays dark whatever the phone is set to: a watch
 * screen is OLED and mostly off, and a light ground would both cost battery and
 * be the wrong thing to look at mid-session in a dim room.
 */
object Ke {
    val Bg = Color(0xFF060810)
    val Surface = Color(0xFF12151D)
    val Surface2 = Color(0xFF1A1F29)
    val Accent = Color(0xFFC1FF72)
    val AccentSoft = Color(0xFFD6FFA1)
    val Text = Color(0xFFF2F5EE)
    val TextMuted = Color(0xFF9AA3B2)
    val Track = Color(0xFF232937)
    /** The release cue. Cool against the accent's warmth, so the two phases
     *  are distinguishable at a glance and not only by the word. */
    val Relax = Color(0xFF7FD4FF)
    /** The halo behind the training ring - `glow` in the phone's dark palette.
     *  Its own token there, and kept as one here, because it is a light source
     *  rather than an accent and the two are free to diverge. */
    val Glow = Color(0xFFC1FF72)
    val Danger = Color(0xFFFF8A80)
}

private val KeColors = Colors(
    primary = Ke.Accent,
    primaryVariant = Ke.AccentSoft,
    secondary = Ke.Relax,
    background = Ke.Bg,
    surface = Ke.Surface,
    error = Ke.Danger,
    onPrimary = Ke.Bg,
    onSecondary = Ke.Bg,
    onBackground = Ke.Text,
    onSurface = Ke.Text,
    onSurfaceVariant = Ke.TextMuted,
    onError = Ke.Bg,
)

/**
 * Sizes chosen for a wrist at arm's length, not a phone at reading distance.
 *
 * Wear's defaults are already tighter than the phone's; these push the display
 * sizes further still because the one number that matters mid-session - the
 * seconds left - has to be readable in peripheral vision.
 */
private val KeTypography = Typography(
    display1 = Typography().display1.copy(fontSize = 44.sp, fontWeight = FontWeight.Bold),
    display3 = Typography().display3.copy(fontSize = 26.sp, fontWeight = FontWeight.SemiBold),
    title2 = Typography().title2.copy(fontWeight = FontWeight.SemiBold),
    body1 = Typography().body1.copy(fontSize = 15.sp),
    caption1 = Typography().caption1.copy(color = Ke.TextMuted),
)

@Composable
fun KegeleeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colors = KeColors, typography = KeTypography, content = content)
}
