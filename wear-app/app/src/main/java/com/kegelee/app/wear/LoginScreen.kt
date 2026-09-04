package com.kegelee.app.wear

import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.focus.FocusRequester
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.foundation.rotary.RotaryScrollableDefaults
import androidx.wear.compose.foundation.rotary.rotaryScrollable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Text
import kotlinx.coroutines.launch

/**
 * Signing in, on a device with no keyboard worth the name.
 *
 * Google first and typing second, because that is the difference between one
 * tap and spelling an email address out on a 40mm screen. The password route is
 * kept rather than dropped: plenty of accounts were made with one, and a watch
 * app that simply cannot admit those people would be a worse product than an
 * awkward text field.
 *
 * The two routes converge - the backend returns the same payload either way -
 * so nothing downstream knows or cares which was used.
 */
@Composable
fun LoginScreen(onGoogleSignIn: () -> Unit) {
    val Ke = LocalPalette.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var showPassword by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    /**
     * A Wear list, not a padded Column.
     *
     * The email form was unreachable in two ways at once. Its Back chip sat
     * below the bottom of a 384px screen with nothing that would scroll to it -
     * `verticalScroll` handles a finger drag but ignores the crown, which is
     * the gesture people reach for - and a padded Column slices content against
     * the curve rather than scaling it. Both are what ScalingLazyColumn is for,
     * and it is what every other screen here already uses.
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
                Text("Kegelee", color = Ke.accent, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Sign in to train",
                    color = Ke.textMuted,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                )
            }
        }

        if (!showPassword) {
            item {
            /**
             * The real four-colour mark, on a white pill.
             *
             * Google's branding guidance is specific about this - the G is not
             * recut or recoloured, and it sits on white or on its own blue.
             * Painting it in the app's accent, or leaving it off entirely,
             * makes the one button people scan for by its logo harder to find
             * than a plain chip would be.
             */
            CompactChip(
                onClick = onGoogleSignIn,
                colors = ChipDefaults.chipColors(
                    backgroundColor = Color.White,
                    contentColor = Color(0xFF1F1F1F),
                ),
                icon = { GoogleMark(size = 16.dp) },
                label = {
                    Text(
                        "Sign in with Google",
                        color = Color(0xFF1F1F1F),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                    )
                },
            )
            }
            item {
            // Words, not an icon. The Google button earns its mark because the
            // mark IS how that button is recognised; an envelope is just a
            // picture of the word "email", and a bare one leaves somebody
            // guessing what pressing it does.
            CompactChip(
                onClick = { showPassword = true },
                colors = ChipDefaults.chipColors(
                    backgroundColor = Ke.control,
                    contentColor = Ke.textMuted,
                ),
                label = { Text("Use email instead", color = Ke.textMuted, fontSize = 11.sp) },
            )
            }
        } else {
            /**
             * Wear's own text field, which hands off to the system input
             * screen - keyboard, handwriting or voice, whichever the watch
             * offers. Rolling a custom one would take that choice away, and
             * voice is how most people will actually get through this.
             */
            item {
            WatchField(
                value = email,
                onValueChange = { email = it },
                placeholder = "Email",
                keyboardType = KeyboardType.Email,
            )
            }
            item {
            WatchField(
                value = password,
                onValueChange = { password = it },
                placeholder = "Password",
                keyboardType = KeyboardType.Password,
                isPassword = true,
            )
            }
            item {
            CompactChip(
                onClick = {
                    if (busy || email.isBlank() || password.isBlank()) return@CompactChip
                    busy = true
                    error = null
                    scope.launch {
                        error = Repo.signInWithPassword(context, email, password)
                        busy = false
                    }
                },
                colors = ChipDefaults.chipColors(backgroundColor = Ke.accent, contentColor = Ke.bg),
                label = { Text(if (busy) "Signing in…" else "Sign in", color = Ke.bg, fontSize = 12.sp, fontWeight = FontWeight.Bold) },
            )
            }
            item {
            CompactChip(
                onClick = { showPassword = false; error = null },
                colors = ChipDefaults.chipColors(backgroundColor = Ke.surface, contentColor = Ke.textMuted),
                label = { Text("Back", color = Ke.textMuted, fontSize = 11.sp) },
            )
            }
        }

        error?.let { message ->
            item {
                Text(
                    message,
                    color = Ke.danger,
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 14.dp),
                )
            }
        }
    }
}

@Composable
private fun WatchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType,
    isPassword: Boolean = false,
) {
    val Ke = LocalPalette.current
    androidx.compose.foundation.text.BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        textStyle = androidx.compose.ui.text.TextStyle(
            color = Ke.text,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
        ),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(Ke.accent),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = if (isPassword) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        modifier = Modifier
            .fillMaxWidth()
            .background(Ke.surface2, RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        decorationBox = { inner ->
            if (value.isEmpty()) {
                Text(placeholder, color = Ke.textMuted, fontSize = 13.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            }
            inner()
        },
    )
}

/**
 * Google's "G", drawn from the same four path definitions the phone uses.
 *
 * Copied verbatim out of the app's own GoogleLogo component rather than
 * re-traced, so the two screens cannot end up with subtly different marks - and
 * because the shape is Google's, not ours to redraw. The viewBox is 48x48 and
 * the paths are scaled to whatever size is asked for.
 */
@Composable
private fun GoogleMark(size: Dp) {
    val paths = remember {
        listOf(
            Color(0xFFEA4335) to "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z",
            Color(0xFF4285F4) to "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z",
            Color(0xFFFBBC05) to "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z",
            Color(0xFF34A853) to "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z",
        ).map { (colour, data) -> colour to PathParser().parsePathString(data).toPath() }
    }

    Canvas(Modifier.size(size)) {
        val scale = this.size.minDimension / 48f
        scale(scale, scale, pivot = Offset.Zero) {
            paths.forEach { (colour, path) -> drawPath(path, colour) }
        }
    }
}
