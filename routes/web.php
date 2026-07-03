<?php

use App\Http\Controllers\AdminMaintenanceController;
use App\Http\Controllers\DeviceSyncController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\GooglePlayWebhookController;
use App\Http\Controllers\LandingController;
use App\Http\Controllers\ReminderIcsController;
use App\Http\Controllers\TimezoneController;
use App\Livewire\Admin;
use App\Livewire\App;
use App\Livewire\Auth;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Google Play Real-Time Developer Notifications (RTDN)
| Pub/Sub pushes to this endpoint; no CSRF / auth needed.
|--------------------------------------------------------------------------
*/
Route::post('/webhooks/google-play', [GooglePlayWebhookController::class, 'handle'])
    ->name('webhooks.google-play')
    ->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class]);

/*
|--------------------------------------------------------------------------
| Web deploy tasks for hosts without shell access - migrations and
| production caches. Guarded by SYNC_API_KEY + throttle.
|--------------------------------------------------------------------------
*/
Route::get('/deploy', \App\Http\Controllers\DeployController::class)
    ->middleware('throttle:6,1')
    ->name('deploy');

/*
|--------------------------------------------------------------------------
| On-demand sync — the device app calls this when connectivity returns so
| fresh backend content/progress lands immediately instead of waiting for
| the next navigation. No-op on the backend (CONTENT_SYNC_URL empty).
|--------------------------------------------------------------------------
*/
Route::post('/sync/run', [DeviceSyncController::class, 'run'])->name('sync.run');
Route::get('/sync/status', [DeviceSyncController::class, 'status'])->name('sync.status');

/*
|--------------------------------------------------------------------------
| Public marketing homepage — shown at / when homepage_enabled is true.
| Authenticated users are bounced straight to the app.
|--------------------------------------------------------------------------
*/
Route::get('/', LandingController::class)->name('landing');

/*
|--------------------------------------------------------------------------
| Public (no auth): onboarding intro + content pages
|--------------------------------------------------------------------------
*/
Route::get('/welcome', App\Onboarding::class)->name('onboarding');
// Legal / policy pages — always public so they work even when the web app is
// closed (app_enabled=false) or the marketing homepage is disabled. Required
// for the Google Play privacy-policy URL.
Route::view('/legal', 'legal.index')->name('legal.index');
Route::get('/p/{page:slug}', App\Page\Show::class)->name('page.show');
Route::get('/knowledge', App\Knowledge\Index::class)->name('knowledge.index');
Route::get('/knowledge/{lesson}', App\Knowledge\Show::class)->name('knowledge.show');

/*
|--------------------------------------------------------------------------
| Guest auth
|--------------------------------------------------------------------------
*/
Route::middleware('guest')->group(function () {
    Route::get('/login', Auth\Login::class)->name('login');
    Route::get('/register', Auth\Register::class)->name('register');
    Route::get('/verify', Auth\Verify::class)->name('verify');
    Route::get('/forgot-password', Auth\ForgotPassword::class)->name('password.forgot');
    Route::get('/reset-password', Auth\ResetPassword::class)->name('password.reset');

    Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect'])->name('auth.google');
    Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback'])->name('auth.google.callback');
});

/*
|--------------------------------------------------------------------------
| Authenticated app
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'app.enabled'])->group(function () {
    // Stores the device timezone (captured client-side on first load) so day
    // boundaries follow the user's local day.
    Route::post('/timezone', TimezoneController::class)->name('timezone.set');

    // The ONLY page reachable without an active subscription is the paywall:
    // a signed-up user subscribes (or signs out) before touching anything else.
    Route::get('/upgrade', App\Paywall::class)->name('paywall');

    Route::middleware('subscribed')->group(function () {
        Route::get('/app', App\Home::class)->name('home');

        Route::get('/profile', App\Profile::class)->name('profile');
        Route::get('/settings', App\Settings::class)->name('app.settings');
        Route::get('/change-password', App\ChangePassword::class)->name('app.change-password');

        Route::get('/exercises', App\Exercises\Index::class)->name('exercises.index');
        Route::get('/exercises/{exercise:slug}', App\Exercises\Show::class)->name('exercises.show');

        Route::get('/session', App\Workout::class)->name('session');
        Route::get('/workout/{exercise:slug}', App\Workout::class)->name('workout');

        Route::get('/levels', App\Levels::class)->name('levels');
        Route::get('/progress', App\ProgressTracker::class)->name('progress');
        Route::get('/schedule', App\Schedule::class)->name('schedule');
        Route::get('/reminders', App\Reminders::class)->name('reminders');
        Route::get('/reminders/calendar.ics', [ReminderIcsController::class, 'download'])->name('reminders.ics');
    });
});

/*
|--------------------------------------------------------------------------
| Admin backend
|--------------------------------------------------------------------------
*/
Route::prefix('admin')->name('admin.')->group(function () {
    Route::get('login', Admin\Login::class)->name('login');

    Route::middleware('admin')->group(function () {
        // Exercises, levels, onboarding and plans are hardcoded in the app
        // (App\Support catalogues) - the backend only manages accounts,
        // progress, knowledge videos, legal pages and subscriptions.
        Route::get('/', Admin\Dashboard::class)->name('dashboard');
        Route::get('users', Admin\Users::class)->name('users');
        Route::get('subscriptions', Admin\Subscriptions::class)->name('subscriptions');
        Route::get('pages', Admin\Pages::class)->name('pages');
        Route::get('settings', Admin\Settings::class)->name('settings');

        Route::post('reset-progress', [AdminMaintenanceController::class, 'resetProgress'])->name('reset-progress');
        Route::get('logout', [AdminMaintenanceController::class, 'logout'])->name('logout');
    });
});
