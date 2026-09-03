package com.kegelee.app.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    /**
     * The SAME web client id the phone app sends.
     *
     * The backend verifies an ID token against its own expected audience, so a
     * token minted for a different client is rejected however valid it looks.
     * Requesting an ID token (not just an email) is the other half: the email
     * alone proves nothing to a server.
     */
    private val webClientId =
        "692228818665-5jbf66ps860i983p1mndba11af9f9het.apps.googleusercontent.com"

    private val engine: SessionEngine by lazy {
        ViewModelProvider(
            this,
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    SessionEngine(applicationContext) as T
            },
        )[SessionEngine::class.java]
    }

    /**
     * Ask for the notification permission, once, when it can be explained.
     *
     * Declared in the manifest is NOT enough on API 33 and up: without a
     * runtime grant every `notify()` is dropped silently, so the alarms fired
     * and nothing ever appeared - reminders looked implemented and did not
     * work at all. Asked after sign-in rather than on first launch, so the
     * dialog follows something the person has chosen to do.
     */
    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* Declined is a valid answer; the alarms simply have nothing to show. */ }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private val googleSignIn = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val token = runCatching {
            GoogleSignIn.getSignedInAccountFromIntent(result.data).getResult(
                com.google.android.gms.common.api.ApiException::class.java,
            ).idToken
        }.getOrNull()
        if (!token.isNullOrBlank()) {
            lifecycleScope.launch { Repo.signInWithGoogle(applicationContext, token) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(android.R.style.Theme_DeviceDefault)
        super.onCreate(savedInstanceState)

        Repo.bootstrap(applicationContext)
        // Debug-only stand-in for a signed-in account, so the session player is
        // reachable on an emulator. Never compiled into a release.
        if (BuildConfig.DEBUG && intent?.getBooleanExtra("demo", false) == true) {
            Repo.seedDemo(applicationContext)
        }

        setContent {
            // Held here rather than inside the theme so a change repaints the
            // whole tree, and written through to disk so it survives a restart.
            var themeMode by remember { mutableStateOf(Store.themeMode(applicationContext)) }

            KegeleeTheme(mode = themeMode) {
                WearApp(
                    engine = engine,
                    themeMode = themeMode,
                    onThemeMode = { picked ->
                        themeMode = picked
                        Store.setThemeMode(applicationContext, picked)
                    },
                    onGoogleSignIn = {
                        val options = GoogleSignInOptions
                            .Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                            .requestIdToken(webClientId)
                            .requestEmail()
                            .build()
                        googleSignIn.launch(GoogleSignIn.getClient(this, options).signInIntent)
                    },
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        /**
         * Sync on every open, not just the first.
         *
         * A watch is glanced at, not sat with, so "when the app comes forward"
         * is the only reliable moment to reconcile - it pushes whatever was
         * finished offline and takes the server's counts back. Failures are
         * silent by design: the cached profile is already on screen, and a
         * connection error is not something to interrupt somebody with.
         */
        if (Repo.auth.value == Repo.Auth.SIGNED_IN && Store.token(applicationContext) != null) {
            ensureNotificationPermission()
            /**
             * Re-arm from the CACHED profile before any network call.
             *
             * The sync arms reminders when it succeeds, which meant a watch
             * with no signal never re-armed at all - so the one feature most
             * worth having offline stopped after its eight-day window. The
             * schedule is already on disk; arming from it needs nobody's
             * permission and no radio.
             */
            Reminders.apply(applicationContext, Store.profile(applicationContext))
            lifecycleScope.launch { Repo.sync(applicationContext) }
        }
    }
}
