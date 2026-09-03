package com.kegelee.app.wear

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Typography

/**
 * The phone app's two palettes, on a watch.
 *
 * Both taken from `src/theme/colors.ts` rather than re-picked, so the watch and
 * the phone read as one product in either appearance. The light one is not a
 * naive inversion: its accent is several steps darker (`#5f9e0a` against
 * `#c1ff72`) because the bright lime is invisible on a white ground - the phone
 * learned that the hard way and the note in its own palette says so.
 */
data class Palette(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val accent: Color,
    val accentSoft: Color,
    val text: Color,
    val textMuted: Color,
    val track: Color,
    /** The halo behind the training ring. Its own token, as on the phone. */
    val glow: Color,
    val danger: Color,
)

val DarkPalette = Palette(
    bg = Color(0xFF060810),
    surface = Color(0xFF12151D),
    surface2 = Color(0xFF1A1F29),
    accent = Color(0xFFC1FF72),
    accentSoft = Color(0xFFD6FFA1),
    text = Color(0xFFF2F5EE),
    textMuted = Color(0xFF9AA3B2),
    track = Color(0xFF232937),
    glow = Color(0xFFC1FF72),
    danger = Color(0xFFFF8A80),
)

val LightPalette = Palette(
    bg = Color(0xFFF4F6F0),
    surface = Color(0xFFFFFFFF),
    surface2 = Color(0xFFF7F8F4),
    accent = Color(0xFF5F9E0A),
    accentSoft = Color(0xFF3F6212),
    text = Color(0xFF14181A),
    textMuted = Color(0xFF585F59),
    track = Color(0xFFE2E6DC),
    glow = Color(0xFF5F9E0A),
    danger = Color(0xFFC0392B),
)

/**
 * How the appearance is chosen.
 *
 * SYSTEM follows the watch's own dark-theme setting, which is what most people
 * expect and what a watch face change should carry with it.
 */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

/**
 * The palette in force.
 *
 * Every composable that needs colour opens with `val Ke = LocalPalette.current`,
 * which deliberately shadows nothing and reads exactly as the old hardcoded
 * object did - so switching from one fixed palette to two cost the call sites a
 * single line each rather than a rename of every colour reference in the app.
 */
val LocalPalette = staticCompositionLocalOf { DarkPalette }

private fun colorsOf(p: Palette) = Colors(
    primary = p.accent,
    primaryVariant = p.accentSoft,
    secondary = p.accent,
    background = p.bg,
    surface = p.surface,
    error = p.danger,
    onPrimary = p.bg,
    onSecondary = p.bg,
    onBackground = p.text,
    onSurface = p.text,
    onSurfaceVariant = p.textMuted,
    onError = p.bg,
)

/**
 * Sizes for a wrist at arm's length, not a phone at reading distance.
 *
 * Wear's defaults are already tighter than the phone's; these push the display
 * sizes further because the one number that matters mid-session - the seconds
 * left - has to be readable in peripheral vision.
 */
private fun typographyOf(p: Palette) = Typography(
    display1 = Typography().display1.copy(fontSize = 40.sp, fontWeight = FontWeight.Bold),
    display3 = Typography().display3.copy(fontSize = 24.sp, fontWeight = FontWeight.SemiBold),
    title2 = Typography().title2.copy(fontWeight = FontWeight.SemiBold),
    body1 = Typography().body1.copy(fontSize = 14.sp),
    caption1 = Typography().caption1.copy(color = p.textMuted),
)

@Composable
fun KegeleeTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
    val palette = if (dark) DarkPalette else LightPalette

    CompositionLocalProvider(LocalPalette provides palette) {
        MaterialTheme(
            colors = colorsOf(palette),
            typography = typographyOf(palette),
            content = content,
        )
    }
}
