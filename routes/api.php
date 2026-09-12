<?php

use App\Http\Controllers\SyncController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Sync API — per-user token auth (X-User-Token)
|--------------------------------------------------------------------------
|
| These endpoints power the offline-first sync engine. Public endpoints
| (content, auth) are open but throttled + credential-checked, exactly like
| the website's own forms. User endpoints require the per-user API token the
| backend issues at sign-in; there is no shared app key to leak or rotate.
|
*/
Route::prefix('v1')->middleware('api.user')->group(function () {

    // Backend-managed content: legal pages. Exercises, levels, onboarding and
    // plans are hardcoded in the app. Public: there is nothing user-specific
    // in it, and no shared API key exists to ask for.
    Route::get('/content', [SyncController::class, 'content']);

    // Legal pages are served live (online-only) so the app always shows the
    // current version.
    Route::get('/pages/{slug}', [SyncController::class, 'page']);

    // Remote authentication endpoints (accessed by NativePHP clients/app).
    // Throttled: the API key ships inside the APK (extractable), so these
    // endpoints must not be brute-forceable even with a valid key.
    Route::middleware('throttle:20,1')->group(function () {
        Route::post('/auth/login', [SyncController::class, 'remoteLogin']);
        Route::post('/auth/register', [SyncController::class, 'remoteRegister']);
        Route::post('/auth/verify', [SyncController::class, 'remoteVerify']);
        Route::post('/auth/resend', [SyncController::class, 'remoteResend']);

        // Password reset (emailed code) — no session needed, the code proves identity.
        Route::post('/auth/reset-code', [SyncController::class, 'remoteResetCode']);
        Route::post('/auth/reset', [SyncController::class, 'remoteReset']);

        // Native Google sign-in: the device redeems the one-time token minted by
        // the Custom Tab callback for the account payload to mirror + sign in.
        Route::post('/auth/google/redeem', [SyncController::class, 'googleRedeem']);

        // Fully native Google sign-in (no browser): the device posts the ID
        // token from the Google account picker; verified server-side.
        Route::post('/auth/google/token', [SyncController::class, 'googleToken']);
        Route::post('/auth/apple/challenge', [SyncController::class, 'appleChallenge']);
        Route::post('/auth/apple/token', [SyncController::class, 'appleToken']);
    });

    // User-specific data — requires the per-user API token (or a session).
    //
    // Throttled explicitly here rather than through withMiddleware's
    // throttleApi(): this api group is custom (ResolveApiUser, no Sanctum),
    // so the framework's default limiter never applied to it. 60/min is well
    // above a device's sync rate - it pushes on navigation, not per second.
    Route::middleware(['auth', 'throttle:60,1'])->group(function () {
        Route::post('/user/push', [SyncController::class, 'push']);
        Route::get('/user/pull', [SyncController::class, 'pull']);
        Route::post('/user/reset', [SyncController::class, 'reset']);

        // Changing a password is an authenticated act: it used to name the
        // account in the request body, which made it a guessing oracle for
        // any address an attacker knew.
        Route::post('/auth/change-password', [SyncController::class, 'remoteChangePassword']);

        // Account deletion (emailed code confirmation). The code send has its
        // own named limiter - six a minute, because every call costs an email
        // - which a second plain throttle here could not do: it would share
        // the group's counter and charge each request twice.
        Route::post('/user/delete-code', [SyncController::class, 'deleteCode'])
            ->middleware('throttle:delete-code');
        Route::post('/user/delete', [SyncController::class, 'deleteAccount']);
        Route::post('/user/apple-delete-challenge', [SyncController::class, 'appleDeleteChallenge']);
        Route::post('/user/apple-delete', [SyncController::class, 'appleDeleteAccount']);
    });
});
