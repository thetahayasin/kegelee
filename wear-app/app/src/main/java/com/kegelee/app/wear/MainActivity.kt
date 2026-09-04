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
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

    /**
     * Ask on the way IN to a signed-in state, not only on the next launch.
     *
     * `onStart` asks when somebody is already signed in, which skips the one
     * moment it matters most: a first sign-in happens after `onStart` has
     * already run, so the prompt did not appear until the app was next opened
     * by hand - and any reminder armed in between fired an alarm that posted
     * nothing. That is the original silent-reminder bug arriving through a
     * different door.
     */
    private fun watchForSignIn() {
        lifecycleScope.launch {
            var wasSignedIn = Repo.auth.value == Repo.Auth.SIGNED_IN
            Repo.auth.collect { state ->
                val signedIn = state == Repo.Auth.SIGNED_IN
                if (signedIn && !wasSignedIn) ensureNotificationPermission()
                wasSignedIn = signedIn
            }
        }
    }

    /**
     * Google sign-in, with every way it can fail actually reported.
     *
     * This used to read the token and, if it was null, do nothing at all - so a
     * cancelled picker, a watch without Play services, a network drop and a
     * token the backend would have rejected were indistinguishable: the login
     * screen reappeared unchanged and people pressed the button again. The
     * email route already had an error line; this one now writes to the same
     * place.
     */
    private val googleSignIn = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val account = runCatching {
            GoogleSignIn.getSignedInAccountFromIntent(result.data).getResult(
                com.google.android.gms.common.api.ApiException::class.java,
            )
        }
        val token = account.getOrNull()?.idToken
        val failure = account.exceptionOrNull()
        val cancelled = (failure as? ApiException)?.statusCode == CommonStatusCodes.CANCELED

        when {
            !token.isNullOrBlank() -> lifecycleScope.launch {
                val error = Repo.signInWithGoogle(applicationContext, token)
                if (error != null) Repo.failGoogleSignIn(error)
            }
            // Cancelling is a choice, not a fault: drop the spinner, say nothing.
            cancelled -> Repo.clearGoogleSignIn()
            else -> Repo.failGoogleSignIn(googleFailureMessage(failure))
        }
    }

    /** Google's status codes, in words somebody can act on. */
    private fun googleFailureMessage(error: Throwable?): String =
        when ((error as? ApiException)?.statusCode) {
            CommonStatusCodes.NETWORK_ERROR ->
                "No connection. Try again when the watch is online."
            CommonStatusCodes.SIGN_IN_REQUIRED ->
                "No Google account on this watch. Add one in Settings, or use email."
            CommonStatusCodes.DEVELOPER_ERROR ->
                "This build cannot sign in with Google. Use email instead."
            else -> "Google sign-in did not work. Try again, or use email."
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(android.R.style.Theme_DeviceDefault)
        super.onCreate(savedInstanceState)

        Repo.bootstrap(applicationContext)
        watchForSignIn()
        // Debug-only stand-in for a signed-in account, so the session player is
        // reachable on an emulator. Never compiled into a release.
        /**
         * `--ez dump true` writes the whole catalogue as this app computes it
         * and exits, so it can be diffed against the phone's. Debug only.
         */
        if (BuildConfig.DEBUG && intent?.getBooleanExtra("dump", false) == true) {
            Catalogue.load(applicationContext)
            java.io.File(applicationContext.filesDir, "exercises.json")
                .writeText(SessionBuilder.dumpAllForComparison())
            java.io.File(applicationContext.filesDir, "gate.json")
                .writeText(SessionBuilder.dumpGateForComparison())
            finish()
            return
        }

        if (BuildConfig.DEBUG && intent?.getBooleanExtra("demo", false) == true) {
            Repo.seedDemo(applicationContext, entitled = intent?.getBooleanExtra("free", false) != true)
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
                        Repo.beginGoogleSignIn()
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
            /**
             * Off the main thread: `apply` clears 32 PendingIntents before it
             * arms anything, and that is 32 binder round trips standing between
             * launch and the first frame.
             */
            lifecycleScope.launch {
                withContext(Dispatchers.IO) {
                    Reminders.apply(applicationContext, Store.profile(applicationContext))
                }
                Repo.sync(applicationContext)
            }
        }
    }
}
