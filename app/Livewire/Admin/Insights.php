<?php

namespace App\Livewire\Admin;

use App\Models\User;
use App\Models\UserEvent;
use Illuminate\Support\Carbon;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * What people do, as opposed to what they end up being.
 *
 * The dashboard already answers "how many accounts, how far down the funnel".
 * It cannot answer the questions that decide what to build next, because those
 * are about behaviour rather than state: does the quiz get finished or bailed
 * on, do the tours get read or dismissed, which padlock sends people to the
 * paywall.
 *
 * Every figure here is a count over `user_events` in a window. No sampling, no
 * derived scores, nothing that needs explaining before it can be trusted - if
 * a number looks wrong it can be checked against the timeline on the user
 * page, which reads the same rows.
 */
#[Layout('components.layouts.admin')]
class Insights extends Component
{
    /** Days back. In the URL so a view can be shared or bookmarked. */
    #[Url]
    public int $days = 30;

    public function setDays(int $days): void
    {
        // Bounded rather than trusted: this comes off the query string, and an
        // unbounded value here is a full table scan on request.
        $this->days = in_array($days, [7, 30, 90], true) ? $days : 30;
    }

    public function render()
    {
        $days = in_array($this->days, [7, 30, 90], true) ? $this->days : 30;
        $since = Carbon::today()->subDays($days - 1);

        $counts = UserEvent::query()
            ->where('occurred_at', '>=', $since)
            ->selectRaw('name, COUNT(*) as total, COUNT(DISTINCT user_id) as people')
            ->groupBy('name')
            ->get()
            ->keyBy('name');

        $total = fn (string $name) => (int) ($counts[$name]->total ?? 0);
        $people = fn (string $name) => (int) ($counts[$name]->people ?? 0);

        /**
         * The quiz, as a ratio.
         *
         * A completion count on its own says nothing - 400 completions is
         * excellent or dreadful depending on how many started. Finished
         * against finished-plus-skipped is the number that means something.
         */
        $quizDone = $total(UserEvent::QUIZ_COMPLETED);
        $quizSkipped = $total(UserEvent::QUIZ_SKIPPED);
        $quizSeen = $quizDone + $quizSkipped;

        $tourDone = $total(UserEvent::TOUR_COMPLETED);
        $tourSkipped = $total(UserEvent::TOUR_SKIPPED);
        $tourSeen = $tourDone + $tourSkipped;

        /**
         * Per-tour, because "tours get skipped" is not actionable and "the
         * schedule tour gets skipped 80% of the time" is.
         */
        $perTour = UserEvent::query()
            ->where('occurred_at', '>=', $since)
            ->whereIn('name', [UserEvent::TOUR_COMPLETED, UserEvent::TOUR_SKIPPED])
            ->selectRaw('subject, name, COUNT(*) as total')
            ->groupBy('subject', 'name')
            ->get()
            ->groupBy('subject')
            ->map(function ($rows) {
                $done = (int) ($rows->firstWhere('name', UserEvent::TOUR_COMPLETED)->total ?? 0);
                $skipped = (int) ($rows->firstWhere('name', UserEvent::TOUR_SKIPPED)->total ?? 0);
                $seen = $done + $skipped;
                return [
                    'done' => $done,
                    'skipped' => $skipped,
                    'seen' => $seen,
                    'rate' => $seen > 0 ? (int) round($done / $seen * 100) : null,
                ];
            })
            ->sortByDesc('seen');

        /** Which padlock people actually press. The clearest demand signal here. */
        $locks = UserEvent::query()
            ->where('occurred_at', '>=', $since)
            ->where('name', UserEvent::LOCK_TAPPED)
            ->selectRaw('subject, COUNT(*) as total, COUNT(DISTINCT user_id) as people')
            ->groupBy('subject')
            ->orderByDesc('total')
            ->get();

        /** Which lesson people stop at. */
        $lessons = UserEvent::query()
            ->where('occurred_at', '>=', $since)
            ->where('name', UserEvent::LESSON_COMPLETED)
            ->selectRaw('subject, COUNT(DISTINCT user_id) as people')
            ->groupBy('subject')
            ->orderByDesc('people')
            ->get();

        /** Appearance, which decides whether light mode is worth maintaining. */
        $appearance = UserEvent::query()
            ->where('occurred_at', '>=', $since)
            ->where('name', UserEvent::APPEARANCE_CHANGED)
            ->selectRaw('subject, COUNT(DISTINCT user_id) as people')
            ->groupBy('subject')
            ->orderByDesc('people')
            ->get();

        return view('livewire.admin.insights', [
            'days' => $days,
            'hasData' => UserEvent::where('occurred_at', '>=', $since)->exists(),
            'cards' => [
                [
                    'label' => 'Quiz finished',
                    'value' => $quizSeen > 0 ? round($quizDone / $quizSeen * 100) . '%' : '-',
                    'detail' => $quizSeen > 0
                        ? "{$quizDone} of {$quizSeen} who saw it"
                        : 'Nobody has reached it yet',
                ],
                [
                    'label' => 'Tours read',
                    'value' => $tourSeen > 0 ? round($tourDone / $tourSeen * 100) . '%' : '-',
                    'detail' => $tourSeen > 0
                        ? "{$tourDone} finished, {$tourSkipped} dismissed"
                        : 'No tours shown yet',
                ],
                [
                    'label' => 'Paywall opens',
                    'value' => (string) $total(UserEvent::PAYWALL_VIEWED),
                    'detail' => $people(UserEvent::PAYWALL_VIEWED) . ' people',
                ],
                [
                    'label' => 'Reminders set',
                    'value' => (string) $people(UserEvent::REMINDERS_SET),
                    'detail' => 'people, at least once',
                ],
            ],
            'perTour' => $perTour,
            'locks' => $locks,
            'lessons' => $lessons,
            'appearance' => $appearance,
            'totalAccounts' => User::where('is_admin', false)->count(),
        ]);
    }
}
