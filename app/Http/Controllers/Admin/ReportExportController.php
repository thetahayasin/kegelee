<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccountDeletion;
use App\Models\Device;
use App\Models\Subscription;
use App\Models\User;
use App\Models\UserEvent;
use App\Models\WorkoutSession;
use App\Support\Reports\Window;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The raw rows behind a report, as a spreadsheet.
 *
 * Every page here is a count, and a count is exactly the thing that can be
 * quietly wrong for a month. Being able to open the same rows in a spreadsheet
 * is what makes a number checkable rather than merely believable - and it is
 * also the answer to every "can you also show me..." that would otherwise
 * become another page nobody reads.
 *
 * Streamed and chunked: an export must not be limited by how much memory the
 * request has, and the file starts arriving immediately.
 */
class ReportExportController extends Controller
{
    /** What can be exported. Anything else is a 404, not an empty file. */
    private const REPORTS = ['events', 'users', 'sessions', 'subscriptions', 'devices', 'deletions'];

    public function download(Request $request, string $report): StreamedResponse
    {
        abort_unless(in_array($report, self::REPORTS, true), 404);

        $window = Window::of($request->query('days'));
        $filename = 'kegel-'.$report.'-'.now()->format('Y-m-d').'-'.$window->days.'d.csv';

        return response()->streamDownload(function () use ($report, $window) {
            $handle = fopen('php://output', 'w');

            [$headings, $query, $row] = $this->source($report, $window);

            fputcsv($handle, $headings);

            $query->chunk(1000, function ($rows) use ($handle, $row) {
                foreach ($rows as $record) {
                    fputcsv($handle, $row($record));
                }
            });

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv',
            // Told not to cache: this is somebody's live data, and a proxy
            // holding on to yesterday's copy is worse than no export at all.
            'Cache-Control' => 'no-store, no-cache',
        ]);
    }

    /**
     * Headings, the query to walk, and how one record becomes one line.
     *
     * @return array{0: array<int, string>, 1: mixed, 2: callable}
     */
    private function source(string $report, Window $window): array
    {
        return match ($report) {
            'events' => [
                ['when', 'person', 'email', 'what happened', 'about', 'kind', 'extra'],
                UserEvent::with('user:id,name,email')
                    ->whereBetween('occurred_at', [$window->since(), $window->until()])
                    ->orderBy('id'),
                fn (UserEvent $e) => [
                    $e->occurred_at?->toDateTimeString(),
                    $e->user?->name,
                    $e->user?->email,
                    $e->label,
                    $e->subject,
                    $e->detail,
                    $e->meta ? json_encode($e->meta) : null,
                ],
            ],

            'users' => [
                ['joined', 'name', 'email', 'verified', 'last seen', 'days completed', 'workouts', 'subscribed now'],
                User::where('is_admin', false)
                    ->withCount([
                        'trainingDays as completed_days_count' => fn ($q) => $q->whereNotNull('completed_at'),
                        'workoutSessions as sessions_count',
                        // entitled(), not a bare status check. A row left
                        // 'active' with a date in the past is not a subscriber,
                        // and this column is headed "subscribed now".
                        'subscriptions as live_subs_count' => fn ($q) => $q->entitled(),
                    ])
                    ->orderBy('id'),
                fn (User $u) => [
                    $u->created_at?->toDateString(),
                    $u->name,
                    $u->email,
                    $u->email_verified_at ? 'yes' : 'no',
                    $u->last_seen_at?->toDateTimeString(),
                    $u->completed_days_count,
                    $u->sessions_count,
                    $u->live_subs_count > 0 ? 'yes' : 'no',
                ],
            ],

            'sessions' => [
                ['finished', 'email', 'seconds', 'extra session', 'last exercise'],
                WorkoutSession::with(['user:id,email', 'exercise:id,name'])
                    ->whereBetween('completed_at', [$window->since(), $window->until()])
                    ->orderBy('id'),
                fn (WorkoutSession $s) => [
                    $s->completed_at?->toDateTimeString(),
                    $s->user?->email,
                    (int) $s->duration_seconds,
                    $s->is_extra ? 'yes' : 'no',
                    $s->exercise?->name,
                ],
            ],

            'subscriptions' => [
                ['started', 'email', 'plan', 'state', 'trial ends', 'ends', 'store'],
                Subscription::with(['user:id,email', 'plan:id,slug'])->orderBy('id'),
                fn (Subscription $s) => [
                    $s->started_at?->toDateTimeString(),
                    $s->user?->email,
                    $s->plan?->slug,
                    $s->status,
                    $s->trial_ends_at?->toDateTimeString(),
                    $s->ends_at?->toDateTimeString(),
                    $s->store,
                ],
            ],

            'devices' => [
                ['first seen', 'last seen', 'email', 'platform', 'os', 'app version', 'language'],
                Device::with('user:id,email')->orderBy('id'),
                fn (Device $d) => [
                    $d->first_seen_at?->toDateTimeString(),
                    $d->last_seen_at?->toDateTimeString(),
                    $d->user?->email,
                    $d->platform,
                    $d->os_version,
                    $d->app_version,
                    $d->locale,
                ],
            ],

            // No email and no user id, because the row does not have one: an
            // account deletion has to leave nothing that identifies anybody.
            'deletions' => [
                ['deleted', 'days they stayed', 'was paying', 'workouts done'],
                AccountDeletion::orderBy('id'),
                fn (AccountDeletion $d) => [
                    $d->deleted_at?->toDateTimeString(),
                    $d->days_since_signup,
                    $d->had_subscription ? 'yes' : 'no',
                    $d->sessions_done,
                ],
            ],
        };
    }
}
