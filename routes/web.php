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
        Route::get('/', Admin\Dashboard::class)->name('dashboard');
        Route::get('exercises', Admin\Exercises::class)->name('exercises');
        Route::get('exercises/{exercise}', Admin\ExerciseEdit::class)->name('exercises.edit');
        Route::get('exercises-create', Admin\ExerciseEdit::class)->name('exercises.create');
        Route::get('levels', Admin\Levels::class)->name('levels');
        Route::get('users', Admin\Users::class)->name('users');
        Route::get('plans', Admin\Plans::class)->name('plans');
        Route::get('discounts', Admin\Discounts::class)->name('discounts');
        Route::get('subscriptions', Admin\Subscriptions::class)->name('subscriptions');
        Route::get('onboarding', Admin\OnboardingSlides::class)->name('onboarding');
        Route::get('knowledge', Admin\Knowledge::class)->name('knowledge');
        Route::get('pages', Admin\Pages::class)->name('pages');
        Route::get('settings', Admin\Settings::class)->name('settings');

        Route::post('reset-progress', function () {
            $userIds = User::where('is_admin', false)->pluck('id');
            DB::table('training_days')->whereIn('user_id', $userIds)->delete();
            DB::table('workout_sessions')->whereIn('user_id', $userIds)->delete();
            DB::table('measurements')->whereIn('user_id', $userIds)->delete();
            DB::table('knowledge_lesson_user')->whereIn('user_id', $userIds)->delete();
            User::whereIn('id', $userIds)->update(['onboarded_at' => null, 'level_started_days' => 0]);

            return back()->with('status', 'All app progress has been reset.');
        })->name('reset-progress');

        Route::get('logout', function () {
            auth()->logout();
            return redirect()->route('admin.login');
        })->name('logout');
    });
});
