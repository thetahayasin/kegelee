<?php

use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\GooglePlayWebhookController;
use App\Http\Controllers\ReminderIcsController;
use App\Livewire\Admin;
use App\Livewire\App;
use App\Livewire\Auth;
use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Support\Facades\DB;
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
| On-demand sync — the device app calls this when connectivity returns so
| fresh backend content/progress lands immediately instead of waiting for
| the next navigation. No-op on the backend (CONTENT_SYNC_URL empty).
|--------------------------------------------------------------------------
*/
Route::post('/sync/run', function (
    \App\Services\Sync\ContentSyncService $content,
    \App\Services\Sync\UserSyncService $userSync,
) {
    $diag = \App\Services\Sync\BackendClient::diagnostics();

    if (! \App\Services\Sync\BackendClient::isClient()) {
        return response()->json(['ok' => false, 'reason' => 'not_a_client', 'diagnostics' => $diag]);
    }

    $changed = $content->pull();

    if ($user = auth()->user()) {
        $userSync->push($user);
        $userSync->pull($user);
    }

    return response()->json([
        'ok'        => $content->report['ok'] ?? false,
        'changed'   => $changed,
        'content'   => $content->report,
        'diagnostics' => $diag,
    ]);
})->name('sync.run');

// Plain-GET diagnostic: open this in the device to see exactly why sync is or
// isn't working (host detection, HTTP status, counts). Safe to leave in.
Route::get('/sync/status', function (\App\Services\Sync\ContentSyncService $content) {
    $diag = \App\Services\Sync\BackendClient::diagnostics();
    $content->pull();

    return response()->json([
        'diagnostics'           => $diag,
        'content_pull'          => $content->report,
        'local_knowledge_count' => \App\Models\KnowledgeLesson::count(),
        'local_exercise_count'  => \App\Models\Exercise::count(),
    ], 200, [], JSON_PRETTY_PRINT);
})->name('sync.status');

/*
|--------------------------------------------------------------------------
| Public marketing homepage — shown at / when homepage_enabled is true.
| Authenticated users are bounced straight to the app.
|--------------------------------------------------------------------------
*/
Route::get('/', function (SettingsService $settings) {
    // When a public marketing homepage is enabled, always show it —
    // authenticated users navigate to the app via the "Open App" link.
    if ($settings->get('homepage_enabled', true)) {
        return view('landing');
    }

    // Homepage disabled (native-app / no-marketing mode).
    if (auth()->check() && auth()->user()->onboarded_at) {
        return redirect()->route('home');
    }

    return redirect()->route('onboarding');
})->name('landing');

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
    Route::post('/timezone', function (\Illuminate\Http\Request $request, \App\Services\Sync\UserSyncService $userSync) {
        $tz = (string) $request->input('timezone');
        if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true)) {
            $user = $request->user();
            if ($user->timezone !== $tz) {
                $user->update(['timezone' => $tz]);
                // On a device, propagate the new timezone up to the backend now.
                if (\App\Services\Sync\BackendClient::isClient()) {
                    $userSync->push($user);
                }
            }
        }
        return response()->noContent();
    })->name('timezone.set');

    // Account / subscription management stays reachable without an active sub,
    // so users can subscribe, manage their account, or sign out.
    Route::get('/profile', App\Profile::class)->name('profile');
    Route::get('/settings', App\Settings::class)->name('app.settings');
    Route::get('/change-password', App\ChangePassword::class)->name('app.change-password');
    Route::get('/upgrade', App\Paywall::class)->name('paywall');

    // The core training experience requires an active subscription.
    Route::middleware('subscribed')->group(function () {
        Route::get('/app', App\Home::class)->name('home');

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

        Route::post('reset-progress', function () {
            $userIds = User::where('is_admin', false)->pluck('id');
            DB::table('training_days')->whereIn('user_id', $userIds)->delete();
            DB::table('workout_sessions')->whereIn('user_id', $userIds)->delete();
            DB::table('measurements')->whereIn('user_id', $userIds)->delete();
            DB::table('knowledge_lesson_user')->whereIn('user_id', $userIds)->delete();
            DB::table('reminders')->whereIn('user_id', $userIds)->delete();
            User::whereIn('id', $userIds)->update(['onboarded_at' => null, 'level_started_days' => 0]);

            return back()->with('status', 'All app progress has been reset.');
        })->name('reset-progress');

        Route::get('logout', function () {
            auth()->logout();
            return redirect()->route('admin.login');
        })->name('logout');
    });
});
