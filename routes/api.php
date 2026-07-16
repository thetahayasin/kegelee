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

    // Backend-managed content: knowledge lessons + legal page titles.
    // Exercises, levels, onboarding and plans are hardcoded in the app.
    // No user auth needed; the API key is enough.
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
        Route::post('/auth/change-password', [SyncController::class, 'remoteChangePassword']);
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
    });

    // User-specific data — requires auth session cookie.
    Route::middleware('auth')->group(function () {
        Route::post('/user/push', [SyncController::class, 'push']);
        Route::get('/user/pull', [SyncController::class, 'pull']);
        Route::post('/user/reset', [SyncController::class, 'reset']);

        // Account deletion (emailed code confirmation).
        Route::post('/user/delete-code', [SyncController::class, 'deleteCode']);
        Route::post('/user/delete', [SyncController::class, 'deleteAccount']);
    });
});
