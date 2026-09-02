<?php

namespace App\Livewire\Admin\Reports;

use App\Models\User;
use App\Models\UserEvent;
use App\Support\Reports\Delta;
use App\Support\Reports\PlainWords;
use App\Support\Reports\Window;
use Illuminate\Database\Eloquent\Builder;

/**
 * Of the people who joined recently, where do they stop?
 *
 * The window picks the GROUP - everyone who created an account in it - and
 * then every step is counted whenever it happened, including yesterday. That
 * is the difference between a funnel and six unrelated counts: each step has
 * to be about the same people, or the drop between two rows means nothing.
 *
 * Two sources per step, merged. The event log is exact but only exists on
 * builds that send it; the state columns (onboarding finished, lessons ticked
 * off, sessions recorded) go back to the beginning. An account that satisfies
 * either has done the thing.
 */
class Funnel extends ReportPage
{
    /**
     * The same steps written as verbs, for the sentences between the bars.
     *
     * "3 in 10 of the people who read the basics trained at least once" reads;
     * the same fact built out of the bar labels does not.
     */
    private const PHRASES = [
        'Opened the app' => 'opened the app',
        'Finished the first-run questions' => 'finished the first-run questions',
        'Read the basics' => 'read the basics',
        'Trained once' => 'trained at least once',
        'Saw the paywall' => 'saw the paywall',
        'Started a trial' => 'started a trial',
        'Paid' => 'paid',
    ];

    public function slug(): string
    {
        return 'funnel';
    }

    protected function build(Window $window): array
    {
        $now = $this->steps($window->since(), $window->until());
        $before = $this->steps($window->prevSince(), $window->prevUntil());

        $cohort = $now['Opened the app'];

        $rows = [];
        $previousValue = null;
        $previousLabel = null;

        foreach ($now as $label => $value) {
            $ofCohort = $cohort > 0 ? $value / $cohort : 0;
            $thenCohort = $before['Opened the app'] ?? 0;
            $thenShare = $thenCohort > 0 ? ($before[$label] ?? 0) / $thenCohort : 0;

            $rows[] = [
                'label' => $label,
                'value' => $value,
                'pct' => $cohort > 0 ? (int) round($ofCohort * 100) : 0,
                // Compared as a SHARE, not as a count: a smaller group that
                // gets further is better news, and comparing the raw numbers
                // would call it a collapse.
                'delta' => Delta::of($ofCohort, $thenShare),
                // The sentence sits between this row and the one above it,
                // which is where the drop actually happened.
                'sentence' => $previousValue === null ? null : PlainWords::inTen(
                    $value,
                    $previousValue,
                    'of the people who '.(self::PHRASES[$previousLabel] ?? '').' '
                        .(self::PHRASES[$label] ?? '').'.',
                ),
            ];

            $previousValue = $value;
            $previousLabel = $label;
        }

        return [
            'rows' => $rows,
            'cohort' => $cohort,
            'windowLabel' => $window->label(),
        ];
    }

    /**
     * Every step, for the people who signed up between two dates.
     *
     * @return array<string, int>
     */
    private function steps(mixed $since, mixed $until): array
    {
        $cohort = fn () => User::where('is_admin', false)->whereBetween('created_at', [$since, $until]);

        return [
            // Everyone in the group. They created an account, so they opened
            // the app at least once by definition.
            'Opened the app' => (clone $cohort())->count(),

            'Finished the first-run questions' => (clone $cohort())
                ->where(fn (Builder $q) => $this->didEvent($q, [UserEvent::QUIZ_COMPLETED, UserEvent::QUIZ_SKIPPED])
                    ->orWhereNotNull('onboarding_completed_at'))
                ->count(),

            'Read the basics' => (clone $cohort())
                ->where(fn (Builder $q) => $this->didEvent($q, [UserEvent::LESSON_COMPLETED])
                    ->orWhereExists(fn ($e) => $e->selectRaw('1')
                        ->from('knowledge_lesson_user')
                        ->whereColumn('knowledge_lesson_user.user_id', 'users.id')
                        ->whereNotNull('knowledge_lesson_user.completed_at')))
                ->count(),

            'Trained once' => (clone $cohort())
                ->where(fn (Builder $q) => $this->didEvent($q, [UserEvent::WORKOUT_COMPLETED])
                    ->orWhereExists(fn ($e) => $e->selectRaw('1')
                        ->from('workout_sessions')
                        ->whereColumn('workout_sessions.user_id', 'users.id')))
                ->count(),

            'Saw the paywall' => (clone $cohort())
                ->where(fn (Builder $q) => $this->didEvent($q, [UserEvent::PAYWALL_VIEWED]))
                ->count(),

            'Started a trial' => (clone $cohort())
                ->where(fn (Builder $q) => $this->didEvent($q, [UserEvent::SUBSCRIPTION_STARTED], 'trial')
                    ->orWhereExists(fn ($e) => $e->selectRaw('1')
                        ->from('subscriptions')
                        ->whereColumn('subscriptions.user_id', 'users.id')
                        ->whereNotNull('subscriptions.trial_ends_at')))
                ->count(),

            'Paid' => (clone $cohort())
                ->where(function (Builder $q) {
                    $this->didEvent($q, [UserEvent::SUBSCRIPTION_RENEWED])
                        ->orWhere(fn (Builder $w) => $this->didEvent($w, [UserEvent::SUBSCRIPTION_STARTED], 'paid'))
                        // For accounts older than the event log: a subscription
                        // that was never a trial was paid for.
                        ->orWhereExists(fn ($e) => $e->selectRaw('1')
                            ->from('subscriptions')
                            ->whereColumn('subscriptions.user_id', 'users.id')
                            ->whereNull('subscriptions.trial_ends_at')
                            ->whereIn('subscriptions.status', ['active', 'canceled', 'past_due', 'expired']));
                })
                ->count(),
        ];
    }

    /**
     * "This account has an event of one of these names" as an EXISTS, so the
     * rows are never loaded to be counted.
     */
    private function didEvent(Builder $query, array $names, ?string $detail = null): Builder
    {
        return $query->whereExists(function ($e) use ($names, $detail) {
            $e->selectRaw('1')
                ->from('user_events')
                ->whereColumn('user_events.user_id', 'users.id')
                ->whereIn('user_events.name', $names);

            if ($detail !== null) {
                $e->where('user_events.detail', $detail);
            }
        });
    }
}
