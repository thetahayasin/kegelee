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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 30.dp, bottom = 26.dp, start = 16.dp, end = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
        Text("Kegelee", color = Ke.accent, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text(
            "Sign in to train",
            color = Ke.textMuted,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(14.dp))

        if (!showPassword) {
            CompactChip(
                onClick = onGoogleSignIn,
                colors = ChipDefaults.chipColors(backgroundColor = Ke.accent, contentColor = Ke.bg),
                label = { Text("Continue with Google", color = Ke.bg, fontSize = 12.sp, fontWeight = FontWeight.Bold) },
            )
            Spacer(Modifier.height(8.dp))
            CompactChip(
                onClick = { showPassword = true },
                colors = ChipDefaults.chipColors(backgroundColor = Ke.surface2, contentColor = Ke.text),
                label = { Text("Use email instead", color = Ke.text, fontSize = 11.sp) },
            )
        } else {
            /**
             * Wear's own text field, which hands off to the system input
             * screen - keyboard, handwriting or voice, whichever the watch
             * offers. Rolling a custom one would take that choice away, and
             * voice is how most people will actually get through this.
             */
            WatchField(
                value = email,
                onValueChange = { email = it },
                placeholder = "Email",
                keyboardType = KeyboardType.Email,
            )
            Spacer(Modifier.height(6.dp))
            WatchField(
                value = password,
                onValueChange = { password = it },
                placeholder = "Password",
                keyboardType = KeyboardType.Password,
                isPassword = true,
            )
            Spacer(Modifier.height(10.dp))
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
            Spacer(Modifier.height(6.dp))
            CompactChip(
                onClick = { showPassword = false; error = null },
                colors = ChipDefaults.chipColors(backgroundColor = Ke.surface, contentColor = Ke.textMuted),
                label = { Text("Back", color = Ke.textMuted, fontSize = 11.sp) },
            )
        }

        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = Ke.danger, fontSize = 11.sp, textAlign = TextAlign.Center)
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
