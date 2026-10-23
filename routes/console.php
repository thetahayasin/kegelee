<?php

use App\Models\EmailCode;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Maintenance
|--------------------------------------------------------------------------
|
| Nothing here was scheduled before, so two tables grew forever and nothing
| ever noticed a subscription the store had moved on from.
|
*/

// Failed jobs are kept for a week - long enough to read one, short enough
// that the table stays small on a shared host.
Schedule::command('queue:prune-failed --hours=168')->daily();

// Spent verification codes. They are dead 15 minutes after they are issued;
// the extra day is only so a support question can still be answered.
Schedule::call(function () {
    EmailCode::where('expires_at', '<', now()->subDay())->delete();
})->hourly()->name('prune-expired-email-codes')->withoutOverlapping();

// Re-checks subscriptions against the store: cancellations and expiries that
// arrive as a webhook we never received are otherwise invisible, and the row
// keeps granting access.
Schedule::command('subscriptions:reconcile')->dailyAt('04:00');
