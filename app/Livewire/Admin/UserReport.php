<?php

namespace App\Livewire\Admin;

use App\Models\Device;
use App\Models\Measurement;
use App\Models\Plan;
use App\Models\TrainingDay;
use App\Models\User;
use App\Models\UserEvent;
use App\Models\WorkoutSession;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * Everything known about one person, on one page.
 *
 * The users table can only ever show what fits in a row, so answering "what
 * happened with this account" meant reading the timeline, then the
 * subscriptions page filtered by hand, then guessing at the training history
 * from a session count. Three screens, none of which agreed on what a
 * subscriber was, which is how a support question turned into an
 * investigation.
 *
 * Every figure here goes through the same scopes the reports use -
 * Subscription::entitled() and renewing() - so this page cannot say something
 * the dashboard contradicts. That is the whole point of it existing as a page
 * rather than as another set of hand-written queries.
 *
 * Deliberately NOT cached. The report pages hold their figures for ten minutes
 * because they fold the whole table; this folds one user, costs almost
 * nothing, and is usually opened precisely because somebody has just changed
 * something and wants to see it.
 */
#[Layout('components.layouts.admin')]
class UserReport extends Component
{
    public User $user;

    /** Filter the timeline to one event name. In the URL so it can be shared. */
    #[Url]
    public string $event = '';

    /** The timeline is long; this is how many rows are on screen. */
    public int $timelineLimit = 100;

    /** Days of history in the activity chart. */
    private const CHART_DAYS = 90;

    public function mount(User $user): void
    {
        $this->user = $user;
    }

    public function showMoreTimeline(): void
    {
        $this->timelineLimit += 200;
    }

    public function filterEvent(string $name): void
    {
        // Clicking the active filter clears it, so the chips are a toggle
        // rather than a one-way trip that needs the URL edited to undo.
        $this->event = $this->event === $name ? '' : $name;
        $this->timelineLimit = 100;
    }

    public function render()
    {
        $user = $this->user;

        return view('livewire.admin.user-report', [
            'entitlement' => $this->entitlement(),
            'subscriptions' => $user->subscriptions()->with('plan')->orderByDesc('id')->get(),
            'money' => $this->money(),
            'training' => $this->training(),
            'activity' => $this->activityChart(),
            'measurements' => $this->measurements(),
            'lessons' => $user->completedLessons()->orderByDesc('knowledge_lesson_user.completed_at')->get(),
            'devices' => Device::where('user_id', $user->id)->orderByDesc('last_seen_at')->get(),
            'timeline' => $this->timeline(),
            'timelineTotal' => $this->timelineQuery()->count(),
            'eventNames' => $this->eventNames(),
        ])->title($user->name ?: $user->email);
    }

    /**
     * What access this account has right now, and on what terms.
     *
     * activeSubscription() rather than "the newest row", because the newest
     * row is frequently an expired one sitting above the grant that actually
     * counts, and reading the top of the list is how the admin came to
     * disagree with the app about who was a subscriber.
     */
    private function entitlement(): array
    {
        $sub = $this->user->activeSubscription();

        return [
            'subscribed' => $this->user->isSubscribed(),
            'subscription' => $sub,
            // An admin bypasses the paywall to preview the app, so their
            // "subscribed" is not a sale and must not read as one.
            'viaAdmin' => $this->user->is_admin && ! $sub,
        ];
    }

    /**
     * What this account has paid, at list prices.
     *
     * There is no ledger to read: Play takes the money and RevenueCat reports
     * the event, so the closest honest figure is every payment event priced at
     * the plan it names. Before Google's cut, before tax, before refunds - the
     * view says so, because a money figure with an unstated assumption is
     * worse than no money figure.
     *
     * A trial start is not a payment and is excluded. The first RENEWAL after
     * one IS the moment money moved, and is counted.
     */
    private function money(): array
    {
        $prices = Plan::pluck('price', 'slug');

        $payments = UserEvent::where('user_id', $this->user->id)
            ->where(function ($q) {
                $q->where('name', UserEvent::SUBSCRIPTION_RENEWED)
                    ->orWhere(fn ($w) => $w->where('name', UserEvent::SUBSCRIPTION_STARTED)
                        ->where('detail', 'paid'));
            })
            ->orderBy('occurred_at')
            ->get(['name', 'subject', 'detail', 'occurred_at']);

        $total = $payments->sum(fn (UserEvent $e) => (float) ($prices[$e->subject] ?? 0));

        // Months between the first payment and now, so "per month" describes
        // the life of the account rather than dividing by a constant.
        $first = $payments->first()?->occurred_at;
        $months = $first ? max(1, $first->diffInMonths(now()) + 1) : 0;

        return [
            'payments' => $payments,
            'count' => $payments->count(),
            'total' => $total,
            'first' => $first,
            'latest' => $payments->last()?->occurred_at,
            'perMonth' => $months > 0 ? $total / $months : 0.0,
            // A plan named in an event that no longer exists prices at zero,
            // and silently understating what somebody paid is exactly the kind
            // of quiet wrongness this page is meant to end.
            'unpriced' => $payments->filter(fn (UserEvent $e) => ! isset($prices[$e->subject]))->count(),
        ];
    }

    /** @return array<string, mixed> */
    private function training(): array
    {
        $sessions = WorkoutSession::where('user_id', $this->user->id);

        $finished = (clone $sessions)->whereNotNull('completed_at')->count();
        $started = (clone $sessions)->count();

        $days = TrainingDay::where('user_id', $this->user->id)
            ->whereNotNull('completed_at')
            ->orderBy('completed_at')
            ->pluck('completed_at');

        return [
            'started' => $started,
            'finished' => $finished,
            // Guarded: a brand new account divides by zero here, and the page
            // must render for somebody who has done nothing at all.
            'completionRate' => $started > 0 ? round($finished / $started * 100) : null,
            'averageSeconds' => (int) round((clone $sessions)->whereNotNull('completed_at')->avg('duration_seconds') ?? 0),
            'totalSeconds' => (int) (clone $sessions)->whereNotNull('completed_at')->sum('duration_seconds'),
            'daysTrained' => $days->count(),
            'firstSession' => (clone $sessions)->min('started_at'),
            'lastSession' => (clone $sessions)->max('completed_at'),
            'currentStreak' => $this->streak($days),
            'level' => $this->user->level,
        ];
    }

    /**
     * Consecutive days trained, counting back from today.
     *
     * Today not being trained yet does not break a streak - it is not over -
     * so the count starts at yesterday in that case. Anything stricter reports
     * every streak as broken for most of the day.
     *
     * @param  Collection<int, Carbon>  $days
     */
    private function streak(Collection $days): int
    {
        if ($days->isEmpty()) {
            return 0;
        }

        $set = $days->map(fn (Carbon $d) => $d->toDateString())->flip();
        $cursor = Carbon::today();

        if (! $set->has($cursor->toDateString())) {
            $cursor = $cursor->subDay();
        }

        $streak = 0;

        while ($set->has($cursor->toDateString())) {
            $streak++;
            $cursor = $cursor->subDay();
        }

        return $streak;
    }

    /**
     * Finished workouts per day for the chart.
     *
     * Bucketed on UTC dates, like every other daily figure in the admin. The
     * app stores a timezone per account and this does not use it, so a session
     * finished late at night in a positive offset lands on the previous day
     * here. The view says so rather than leaving it to be discovered.
     *
     * @return Collection<int, array{date: string, label: string, value: int}>
     */
    private function activityChart(): Collection
    {
        $since = Carbon::today()->subDays(self::CHART_DAYS - 1);

        $counts = WorkoutSession::where('user_id', $this->user->id)
            ->whereNotNull('completed_at')
            ->where('completed_at', '>=', $since)
            ->selectRaw('DATE(completed_at) as day, COUNT(*) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        return collect(range(0, self::CHART_DAYS - 1))
            ->map(function (int $offset) use ($since, $counts) {
                $date = $since->copy()->addDays($offset);
                $key = $date->toDateString();

                return [
                    'date' => $key,
                    'label' => $date->format('j M'),
                    'value' => (int) ($counts[$key] ?? 0),
                ];
            });
    }

    /** @return array<string, mixed> */
    private function measurements(): array
    {
        $rows = Measurement::where('user_id', $this->user->id)
            ->orderBy('measured_at')
            ->get(['seconds', 'measured_at']);

        return [
            'rows' => $rows,
            'first' => $rows->first(),
            'best' => $rows->max('seconds'),
            'latest' => $rows->last(),
            // The number people actually care about: has the hold improved
            // since the first reading. Null rather than 0 when there is only
            // one, because "no change" and "nothing to compare" are different.
            'change' => $rows->count() >= 2
                ? (float) $rows->last()->seconds - (float) $rows->first()->seconds
                : null,
        ];
    }

    private function timelineQuery()
    {
        return UserEvent::where('user_id', $this->user->id)
            ->when($this->event !== '', fn ($q) => $q->where('name', $this->event));
    }

    private function timeline(): Collection
    {
        return $this->timelineQuery()
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit($this->timelineLimit)
            ->get();
    }

    /**
     * The event names this account actually has, with counts, for the chips.
     *
     * Built from their own rows rather than from UserEvent::NAMES, so the
     * filter never offers something that would return an empty list.
     */
    private function eventNames(): Collection
    {
        return UserEvent::where('user_id', $this->user->id)
            ->selectRaw('name, COUNT(*) as total')
            ->groupBy('name')
            ->orderByDesc('total')
            ->get();
    }
}
