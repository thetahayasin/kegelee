<?php

use App\Http\Controllers\AdminMaintenanceController;
use App\Http\Controllers\AssetLinksController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\GooglePlayWebhookController;
use App\Http\Controllers\LandingController;
use App\Http\Controllers\RevenueCatWebhookController;
use App\Livewire\Admin;
use App\Livewire\App\Page\Show as PageShow;
use App\Livewire\Auth;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| What lives on the web
|--------------------------------------------------------------------------
|
| The training app is the React Native client in react-native-app/. The web
| serves four things and nothing else: the marketing homepage, the legal
| pages Google Play links to, the admin panel at /mystic, and the API the
| app talks to (routes/api.php).
|
*/

/*
|--------------------------------------------------------------------------
| RevenueCat Webhooks
| RevenueCat server events push here; no CSRF / auth needed.
|--------------------------------------------------------------------------
*/
// Throttled generously: real event volume is a trickle, but the endpoint mints
// subscriptions from its request body, so an attacker who learns the bearer
// secret must not be able to hammer it. 120/min is far above anything
// RevenueCat sends, including retry bursts.
Route::post('/webhooks/revenuecat', [RevenueCatWebhookController::class, 'handle'])
    ->middleware('throttle:120,1')
    ->name('webhooks.revenuecat');

/*
|--------------------------------------------------------------------------
| Google Play Real-Time Developer Notifications (RTDN - legacy)
| Pub/Sub pushes to this endpoint; no CSRF / auth needed.
|--------------------------------------------------------------------------
*/
Route::post('/webhooks/google-play', [GooglePlayWebhookController::class, 'handle'])
    ->middleware('throttle:120,1')
    ->name('webhooks.google-play');

/*
|--------------------------------------------------------------------------
| Web deploy tasks for hosts without shell access - migrations and
| production caches. Guarded by DEPLOY_KEY (server-only) + throttle.
|--------------------------------------------------------------------------
*/
// POST, not GET: a deploy CHANGES the server, and a GET is what browsers
// prefetch, what proxies cache and what ends up in a link. The key travels in
// the Authorization header rather than the query string, which is logged by
// every web server on the way.
Route::post('/deploy', \App\Http\Controllers\DeployController::class)
    ->middleware('throttle:6,1')
    ->name('deploy');

/*
|--------------------------------------------------------------------------
| Public marketing homepage — shown at / when homepage_enabled is true,
| otherwise visitors are sent to the legal index.
|--------------------------------------------------------------------------
*/
Route::get('/', LandingController::class)->name('landing');

/*
|--------------------------------------------------------------------------
| Public (no auth): legal / policy pages
|--------------------------------------------------------------------------
*/
// Always public, and reachable even with the marketing homepage disabled:
// the Google Play listing links straight at these URLs.
Route::view('/legal', 'legal.index')->name('legal.index');
Route::get('/p/{page:slug}', PageShow::class)->name('page.show');

/*
|--------------------------------------------------------------------------
| Google sign-in for the mobile app
|--------------------------------------------------------------------------
|
| Google blocks OAuth inside embedded WebViews, so the app opens these in the
| system browser. Nothing here signs anybody into a web session: the callback
| mints a one-time token and hands it back to the app, which redeems it at
| POST /api/v1/auth/google/redeem.
|
*/
Route::get('/auth/google/native', [GoogleAuthController::class, 'nativeRedirect'])->name('auth.google.native');
Route::get('/auth/google/native/callback', [GoogleAuthController::class, 'nativeCallback'])->name('auth.google.native.callback');

// The App Link target. Android hands this URL straight to the app once
// assetlinks.json is verified; when it is not (or the app is not installed)
// this page renders and bounces to the kegelee:// deeplink instead.
Route::get('/auth/google/finish', [GoogleAuthController::class, 'finish'])->name('auth.google.finish');

/*
|--------------------------------------------------------------------------
| Android App Links verification
|
| Google fetches this file over HTTPS to confirm that this domain and the
| app signing key belong together. Without it, links into the app open in a
| browser instead - including the Google sign-in return.
|--------------------------------------------------------------------------
*/
Route::get('/.well-known/assetlinks.json', AssetLinksController::class)
    ->name('assetlinks');

/*
|--------------------------------------------------------------------------
| Admin backend
|--------------------------------------------------------------------------
*/
Route::prefix('mystic')->name('admin.')->group(function () {
    Route::get('login', Admin\Login::class)->name('login');

    // Admin password recovery. These used to sit at /forgot-password and
    // /reset-password as if they were app screens, but both refuse any
    // account that is not an admin - members reset through the API. They live
    // under the admin prefix now, and outside the 'admin' middleware because
    // the person using them cannot sign in.
    Route::get('forgot-password', Auth\ForgotPassword::class)->name('password.forgot');
    Route::get('reset-password', Auth\ResetPassword::class)->name('password.reset');

    Route::middleware('admin')->group(function () {
        // Exercises, levels, onboarding and plans are hardcoded in the app
        // (App\Support catalogues) - the backend only manages accounts,
        // progress, knowledge videos, legal pages and subscriptions.
        Route::get('/', Admin\Dashboard::class)->name('dashboard');
        Route::get('users', Admin\Users::class)->name('users');

        /**
         * Reports.
         *
         * Six pages rather than one, because they answer six different
         * questions and a single page long enough to hold all of them is a
         * page nobody scrolls to the bottom of. Each keeps its own window in
         * the query string, so a view can be shared or bookmarked.
         */
        Route::prefix('reports')->name('reports.')->group(function () {
            Route::get('/', Admin\Reports\Overview::class)->name('overview');
            Route::get('funnel', Admin\Reports\Funnel::class)->name('funnel');
            Route::get('retention', Admin\Reports\Retention::class)->name('retention');
            Route::get('training', Admin\Reports\Training::class)->name('training');
            Route::get('money', Admin\Reports\Money::class)->name('money');
            Route::get('engagement', Admin\Reports\Engagement::class)->name('engagement');

            // The rows behind any of the above, as a spreadsheet.
            Route::get('export/{report}', [\App\Http\Controllers\Admin\ReportExportController::class, 'download'])
                ->name('export');
        });

        // Insights became the Engagement report. Kept as a redirect because
        // the old address is in people's bookmarks and in this repository's
        // history, and a 404 teaches nobody where it went.
        // Route::redirect, not a closure: deploys run `route:cache`, and a
        // closure route cannot be serialised - it would fail the whole cache
        // build rather than this one line.
        Route::redirect('insights', '/mystic/reports/engagement')->name('insights');
        Route::get('subscriptions', Admin\Subscriptions::class)->name('subscriptions');
        Route::get('pages', Admin\Pages::class)->name('pages');
        Route::get('settings', Admin\Settings::class)->name('settings');

        // POST: signing an admin out is a state change, so it must not be
        // reachable from an <img src> or a prefetched link.
        Route::post('logout', [AdminMaintenanceController::class, 'logout'])->name('logout');
    });
});
