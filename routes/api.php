<?php

use App\Http\Controllers\SyncController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Sync API — secured by SYNC_API_KEY (Bearer token)
|--------------------------------------------------------------------------
|
| These endpoints power the offline-first sync engine. The client stores
| content in IndexedDB and pushes queued user data when connectivity
| returns. All routes require a valid API key; user-specific routes
| additionally require an authenticated session.
|
*/
Route::prefix('v1')->middleware('sync.key')->group(function () {

    // Public content catalog — exercises, levels, onboarding, settings.
    // No user auth needed; the API key is enough.
    Route::get('/content', [SyncController::class, 'content']);

    // Remote authentication endpoints (accessed by NativePHP clients/app)
    Route::post('/auth/login', [SyncController::class, 'remoteLogin']);
    Route::post('/auth/register', [SyncController::class, 'remoteRegister']);
    Route::post('/auth/change-password', [SyncController::class, 'remoteChangePassword']);
    Route::post('/auth/verify', [SyncController::class, 'remoteVerify']);
    Route::post('/auth/resend', [SyncController::class, 'remoteResend']);

    // User-specific data — requires auth session cookie.
    Route::middleware('auth')->group(function () {
        Route::post('/user/push', [SyncController::class, 'push']);
        Route::get('/user/pull', [SyncController::class, 'pull']);
        Route::post('/user/reset', [SyncController::class, 'reset']);
    });
});
