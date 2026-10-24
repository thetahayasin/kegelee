package com.kegelee.app.wear

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Typography

/**
 * The phone app's two palettes, on a watch.
 *
 * Both taken from `src/theme/colors.ts` rather than re-picked, so the watch and
 * the phone read as one product in either appearance. Black and white, like the
 * KE logo: white on true black in dark mode, black on white in light mode. Red
 * is the only hue, and it only ever means something is wrong.
 */
data class Palette(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val accent: Color,
    val accentSoft: Color,
    val text: Color,
    val textMuted: Color,
    /**
     * The fill behind a tappable row, and its edge.
     *
     * Its own token because `surface2` cannot do this job in both palettes: in
     * the light one it is #F7F8F4 against a #F4F6F0 ground - a difference of
     * three values - so every chip disappeared into the background and read as
     * plain text somebody was expected to guess was tappable. Dark mode never
     * showed the problem, which is why it took a second look to find.
     */
    val control: Color,
    val controlEdge: Color,
    val track: Color,
    /** The halo behind the training ring. Its own token, as on the phone. */
    val glow: Color,
    val danger: Color,
)

val DarkPalette = Palette(
    bg = Color(0xFF000000),
    surface = Color(0xFF0E0E0E),
    surface2 = Color(0xFF171717),
    accent = Color(0xFFFFFFFF),
    accentSoft = Color(0xFFE5E5E5),
    text = Color(0xFFFFFFFF),
    textMuted = Color(0xFFA3A3A3),
    // A step up from the ground is plenty on a dark screen.
    control = Color(0xFF1F1F1F),
    controlEdge = Color(0x00000000),
    track = Color(0xFF262626),
    glow = Color(0xFFFFFFFF),
    danger = Color(0xFFFF8A80),
)

val LightPalette = Palette(
    bg = Color(0xFFF4F4F4),
    surface = Color(0xFFFFFFFF),
    surface2 = Color(0xFFF6F6F6),
    accent = Color(0xFF000000),
    accentSoft = Color(0xFF262626),
    text = Color(0xFF0A0A0A),
    textMuted = Color(0xFF525252),
    // White against the off-white ground, plus a hairline - which is what the
    // phone's own light cards do, and the only way a control reads as one here.
    control = Color(0xFFFFFFFF),
    controlEdge = Color(0x22000000),
    track = Color(0xFFE0E0E0),
    glow = Color(0xFF000000),
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
 * Archivo, the phone's typeface (SIL OFL 1.1). Body text in the normal width;
 * the big numbers and titles in the wide expanded cut that echoes the KE logo.
 */
val Archivo = FontFamily(
    Font(R.font.archivo_regular, FontWeight.Normal),
    Font(R.font.archivo_medium, FontWeight.Medium),
    Font(R.font.archivo_semibold, FontWeight.SemiBold),
    Font(R.font.archivo_bold, FontWeight.Bold),
    Font(R.font.archivo_extrabold, FontWeight.ExtraBold),
)
val ArchivoExpanded = FontFamily(
    Font(R.font.archivo_expanded_bold, FontWeight.Bold),
    Font(R.font.archivo_expanded_extrabold, FontWeight.ExtraBold),
    Font(R.font.archivo_expanded_black, FontWeight.Black),
)

/**
 * Sizes for a wrist at arm's length, not a phone at reading distance.
 *
 * Wear's defaults are already tighter than the phone's; these push the display
 * sizes further because the one number that matters mid-session - the seconds
 * left - has to be readable in peripheral vision.
 */
private fun typographyOf(p: Palette) = Typography(
    defaultFontFamily = Archivo,
    display1 = Typography().display1.copy(fontFamily = ArchivoExpanded, fontSize = 40.sp, fontWeight = FontWeight.ExtraBold),
    display3 = Typography().display3.copy(fontFamily = ArchivoExpanded, fontSize = 24.sp, fontWeight = FontWeight.Bold),
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
