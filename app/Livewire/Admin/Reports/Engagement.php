<?php

namespace App\Livewire\Admin\Reports;

use App\Models\AccountDeletion;
use App\Models\Device;
use App\Models\User;
use App\Models\UserEvent;
use App\Support\Reports\Delta;
use App\Support\Reports\PlainWords;
use App\Support\Reports\Window;
use Illuminate\Support\Facades\DB;

/**
 * What people do with the app once they are in it, and what they run on.
 *
 * This is the old Insights page plus the things that were never recorded
 * anywhere: whether reminders were allowed as well as set, which build people
 * are on, and how many accounts get deleted.
 *
 * Reminders are the important half. They are the single strongest predictor of
 * somebody still being here in a month, and there are two ways to lose them -
 * never setting one, and setting one that Android is not allowed to show. Both
 * are on this page, because only one of them is a bug.
 */
class Engagement extends ReportPage
{
    public function slug(): string
    {
        return 'engagement';
    }

    protected function build(Window $window): array
    {
        [$since, $until] = [$window->since(), $window->until()];
        [$prevSince, $prevUntil] = [$window->prevSince(), $window->prevUntil()];

        $counts = UserEvent::query()
            ->whereBetween('occurred_at', [$since, $until])
            ->selectRaw('name, COUNT(*) as total, COUNT(DISTINCT user_id) as people')
            ->groupBy('name')
            ->get()
            ->keyBy('name');

        $total = fn (string $name) => (int) ($counts[$name]->total ?? 0);
        $people = fn (string $name) => (int) ($counts[$name]->people ?? 0);

        $remindersSet = $people(UserEvent::REMINDERS_SET);
        $granted = (int) UserEvent::where('name', UserEvent::NOTIFICATION_PERMISSION)
            ->where('subject', 'granted')
            ->whereBetween('occurred_at', [$since, $until])
            ->distinct()->count('user_id');
        $asked = (int) UserEvent::where('name', UserEvent::NOTIFICATION_PERMISSION)
            ->whereBetween('occurred_at', [$since, $until])
            ->distinct()->count('user_id');
        $tapped = $people(UserEvent::REMINDER_TAPPED);

        $prevRemindersSet = (int) UserEvent::where('name', UserEvent::REMINDERS_SET)
            ->whereBetween('occurred_at', [$prevSince, $prevUntil])
            ->distinct()->count('user_id');

        // The quiz and the tours, as ratios. A completion count on its own says
        // nothing: 400 is excellent or dreadful depending on how many saw it.
        $quizDone = $total(UserEvent::QUIZ_COMPLETED);
        $quizSeen = $quizDone + $total(UserEvent::QUIZ_SKIPPED);
        $tourDone = $total(UserEvent::TOUR_COMPLETED);
        $tourSeen = $tourDone + $total(UserEvent::TOUR_SKIPPED);

        $deletions = AccountDeletion::whereBetween('deleted_at', [$since, $until]);

        return [
            'cards' => [
                [
                    'label' => 'People who set reminders',
                    'value' => number_format($remindersSet),
                    'detail' => $asked > 0
                        ? $granted.' of '.$asked.' also allowed notifications'
                        : 'Android has not been asked yet on these builds',
                    'delta' => Delta::of($remindersSet, $prevRemindersSet),
                    'means' => 'Saving a reminder schedule is the single strongest sign somebody will still be here in a month.',
                    'ifLow' => $asked > 0 && $granted / $asked < 0.6
                        ? 'More than 4 in 10 are refusing the notification prompt. It is probably being asked for too early, before anyone knows why they would want it.'
                        : null,
                ],
                [
                    'label' => 'Reminders tapped',
                    'value' => PlainWords::percent($tapped, $remindersSet),
                    'detail' => $remindersSet > 0
                        ? PlainWords::people($tapped).' of those who set one'
                        : 'nobody has set a reminder yet',
                    'delta' => null,
                    'means' => 'Of the people who set reminders, how many actually came back through one. A reminder nobody taps is a notification nobody wanted.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'Quiz finished',
                    'value' => PlainWords::percent($quizDone, $quizSeen),
                    'detail' => $quizSeen > 0 ? $quizDone.' of '.$quizSeen.' who saw it' : 'nobody has reached it yet',
                    'delta' => null,
                    'means' => 'The first-run questions, answered through to the end rather than skipped.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'Tours read',
                    'value' => PlainWords::percent($tourDone, $tourSeen),
                    'detail' => $tourSeen > 0
                        ? $tourDone.' finished, '.($tourSeen - $tourDone).' dismissed'
                        : 'no tours shown yet',
                    'delta' => null,
                    'means' => 'Guided tours read to the last card. A tour that is always dismissed is a tour worth deleting.',
                    'ifLow' => null,
                ],
            ],
            'perTour' => $this->perTour($since, $until),
            'locks' => $this->grouped(UserEvent::LOCK_TAPPED, $since, $until),
            'lessons' => $this->grouped(UserEvent::LESSON_COMPLETED, $since, $until),
            'appearance' => $this->grouped(UserEvent::APPEARANCE_CHANGED, $since, $until),
            'languages' => $this->languages($since, $until),
            'versions' => $this->appVersions($since, $until),
            'timezones' => $this->timezones(),
            'errors' => $this->grouped(UserEvent::ERROR_BOUNDARY_HIT, $since, $until),
            'deletions' => [
                'count' => (clone $deletions)->count(),
                'averageDays' => (clone $deletions)->avg('days_since_signup'),
                'werePaying' => (clone $deletions)->where('had_subscription', true)->count(),
            ],
            'hasData' => UserEvent::whereBetween('occurred_at', [$since, $until])->exists(),
            'totalAccounts' => User::where('is_admin', false)->count(),
            'reminderSentence' => PlainWords::inTen(
                $remindersSet,
                max(1, (int) UserEvent::whereBetween('occurred_at', [$since, $until])->distinct()->count('user_id')),
                'of the people who used the app in this window set reminders.',
            ),
        ];
    }

    /**
     * Per tour, because "tours get skipped" is not actionable and "the schedule
     * tour gets skipped 8 times in 10" is.
     */
    private function perTour(mixed $since, mixed $until): array
    {
        return UserEvent::query()
            ->whereBetween('occurred_at', [$since, $until])
            ->whereIn('name', [UserEvent::TOUR_COMPLETED, UserEvent::TOUR_SKIPPED])
            ->selectRaw('subject, name, COUNT(*) as total')
            ->groupBy('subject', 'name')
            ->get()
            ->groupBy('subject')
            ->map(function ($rows, $subject) {
                $done = (int) ($rows->firstWhere('name', UserEvent::TOUR_COMPLETED)->total ?? 0);
                $skipped = (int) ($rows->firstWhere('name', UserEvent::TOUR_SKIPPED)->total ?? 0);
                $seen = $done + $skipped;

                return [
                    'label' => $subject ?: 'unknown',
                    'done' => $done,
                    'skipped' => $skipped,
                    'seen' => $seen,
                    'rate' => $seen > 0 ? (int) round($done / $seen * 100) : null,
                ];
            })
            ->sortByDesc('seen')
            ->values()
            ->all();
    }

    /** One event name, counted by subject: people first, then how often. */
    private function grouped(string $name, mixed $since, mixed $until): array
    {
        return UserEvent::query()
            ->where('name', $name)
            ->whereBetween('occurred_at', [$since, $until])
            ->selectRaw('subject, COUNT(*) as total, COUNT(DISTINCT user_id) as people')
            ->groupBy('subject')
            ->orderByDesc('people')
            ->limit(12)
            ->get()
            ->map(fn ($row) => [
                'label' => $row->subject ?: 'unknown',
                'people' => (int) $row->people,
                'total' => (int) $row->total,
            ])
            ->all();
    }

    /**
     * Language, read from the devices rather than from the change event: most
     * people never change it, and counting only the ones who did would say the
     * app is used in three languages when it is used in fifteen.
     */
    private function languages(mixed $since, mixed $until): array
    {
        return Device::query()
            ->whereBetween('last_seen_at', [$since, $until])
            ->whereNotNull('locale')
            ->groupBy('locale')
            ->orderByDesc('people')
            ->select(['locale', DB::raw('COUNT(DISTINCT user_id) as people')])
            ->get()
            ->map(fn ($row) => ['label' => $row->locale, 'people' => (int) $row->people])
            ->all();
    }

    /**
     * Which build is out there. Android updates on its own schedule, so an old
     * version with a lot of installs is the reason a fix "did not work".
     */
    private function appVersions(mixed $since, mixed $until): array
    {
        $rows = Device::query()
            ->whereBetween('last_seen_at', [$since, $until])
            ->whereNotNull('app_version')
            ->groupBy('app_version')
            ->select(['app_version', DB::raw('COUNT(*) as installs')])
            ->get()
            ->map(fn ($row) => ['label' => $row->app_version, 'installs' => (int) $row->installs])
            // Sorted as version strings, so 1.10.0 comes after 1.9.0 rather
            // than before it.
            ->sortByDesc(fn ($row) => $row['label'], SORT_NATURAL)
            ->values()
            ->all();

        $installs = array_sum(array_column($rows, 'installs'));
        $newest = $rows[0] ?? null;

        return [
            'rows' => $rows,
            'installs' => $installs,
            'newest' => $newest['label'] ?? null,
            'onNewestPct' => $newest && $installs > 0 ? (int) round($newest['installs'] / $installs * 100) : null,
        ];
    }

    /**
     * Timezone, which is NOT country.
     *
     * It is set by the phone and stored so that a training day ends at midnight
     * where the person is. It says nothing about where anybody actually is, and
     * the page says so.
     */
    private function timezones(): array
    {
        return User::query()
            ->where('is_admin', false)
            ->whereNotNull('timezone')
            ->groupBy('timezone')
            ->orderByDesc('people')
            ->limit(12)
            ->select(['timezone', DB::raw('COUNT(*) as people')])
            ->get()
            ->map(fn ($row) => ['label' => $row->timezone, 'people' => (int) $row->people])
            ->all();
    }
}
