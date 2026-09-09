<?php

namespace App\Livewire\Admin;

use App\Models\Device;
use App\Models\Measurement;
use App\Models\Plan;
use App\Models\TrainingDay;
use App\Models\User;
use App\Models\UserEvent;
use App\Models\WorkoutSession;
use App\Support\AdminClock;
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

    /** How far back the activity figures look. */
    private const WINDOW_DAYS = 90;

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
            'activity' => $this->activity(),
            'measurements' => $this->measurements(),
            'lessons' => $user->completedLessons()->orderByDesc('knowledge_lesson_user.completed_at')->get(),
            'devices' => Device::where('user_id', $user->id)->orderByDesc('last_seen_at')->get(),
            // Grouped into days for the view, and counted before grouping:
            // after it, count() is a number of days, and "show more" compares
            // against a number of events.
            'timeline' => $this->timeline()->groupBy(
                fn (UserEvent $ev) => $ev->occurred_at
                    ->copy()
                    ->setTimezone(AdminClock::zoneFor($user))
                    ->toDateString()
            ),
            'timelineShown' => $this->timeline()->count(),
            'timelineTotal' => $this->timelineQuery()->count(),
            'eventNames' => $this->eventNames(),
            // Every timestamp on this page is printed on both, and every daily
            // figure is bucketed on the first. Passed down rather than looked
            // up per row: one page, one answer about which clocks it is on.
            'zones' => AdminClock::pair($user),
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

        // The `date` column, not completed_at. Both describe the same day, but
        // only one of them is already the user's own: `date` is written in
        // their zone by the sync (see SyncController::push), while completed_at
        // is the UTC instant, and folding that to a date here would put a
        // 21:30 session in Karachi on the day before and break the streak the
        // app is showing them.
        $days = TrainingDay::where('user_id', $this->user->id)
            ->whereNotNull('completed_at')
            ->orderBy('date')
            ->pluck('date')
            // A DATE column comes back as Y-m-d, but a legacy row written as a
            // full timestamp would not match a date string on the way out.
            ->map(fn ($day) => substr((string) $day, 0, 10));

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
            'currentStreak' => $this->streak($days, AdminClock::zoneFor($this->user)),
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
     * "Today" is theirs, not the server's. On UTC it ran a day ahead of anyone
     * far enough east: their current day was not in the set yet, the cursor
     * stepped back to what was still today for them, and a live streak was
     * reported one short of what the app was showing.
     *
     * @param  Collection<int, string>  $days  Y-m-d, already in the user's zone
     */
    private function streak(Collection $days, string $zone): int
    {
        if ($days->isEmpty()) {
            return 0;
        }

        $set = $days->flip();
        $cursor = Carbon::today($zone);

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
     * Finished workouts per day, as a calendar grid.
     *
     * Bucketed on the account's own midnight, which is the same boundary the
     * app and the sync already use, so a cell here means the day the person
     * actually trained. It used to fold DATE(completed_at) in SQL, which is
     * UTC: a 21:30 session in Karachi landed on the day before, and the chart
     * disagreed with both the streak beside it and the app in their hand.
     *
     * Folded in PHP rather than pushed into the query on purpose. The window
     * can straddle a DST change, so there is no one offset to add to the
     * column, and the portable way to say it in SQL differs per driver. This
     * is one person's sessions - a few hundred rows at the outside.
     *
     * Figures, not a picture. Every one of these is a sentence somebody could
     * read down the phone to a customer.
     *
     * @return array<string, mixed>
     */
    private function activity(): array
    {
        $zone = AdminClock::zoneFor($this->user);
        $today = Carbon::today($zone);
        $start = $today->copy()->subDays(self::WINDOW_DAYS - 1);

        $counts = WorkoutSession::where('user_id', $this->user->id)
            ->whereNotNull('completed_at')
            // Converted before it is bound. A Carbon in a non-UTC zone is
            // formatted at its own wall time on the way into the query, which
            // would move the window's edge by the offset it was meant to
            // account for.
            ->where('completed_at', '>=', $start->copy()->utc()->toDateTimeString())
            ->pluck('completed_at')
            ->countBy(fn (Carbon $at) => $at->copy()->setTimezone($zone)->toDateString());

        $byWeekday = array_fill(1, 7, 0);
        $thisWeek = 0;
        $lastWeek = 0;
        $weekStart = $today->copy()->startOfWeek(Carbon::MONDAY);
        $priorWeekStart = $weekStart->copy()->subWeek();

        foreach ($counts as $date => $value) {
            $day = Carbon::parse($date, $zone);
            $byWeekday[$day->dayOfWeekIso] += $value;

            if ($day->greaterThanOrEqualTo($weekStart)) {
                $thisWeek += $value;
            } elseif ($day->greaterThanOrEqualTo($priorWeekStart)) {
                $lastWeek += $value;
            }
        }

        arsort($byWeekday);
        $topWeekday = array_key_first($byWeekday);

        return [
            'zone' => $zone,
            'windowDays' => self::WINDOW_DAYS,
            'from' => $start->format('j M Y'),
            'to' => $today->format('j M Y'),
            'total' => (int) $counts->sum(),
            // Days with at least one finished workout. countBy only ever
            // creates a key for a day that had one, so this is the count of
            // keys rather than a second pass.
            'daysTrained' => $counts->count(),
            'thisWeek' => $thisWeek,
            'lastWeek' => $lastWeek,
            // Null rather than "Monday" for somebody who has never trained:
            // arsort over an all-zero list still has a first key, and printing
            // it would invent a habit out of no data at all.
            'busiestWeekday' => $byWeekday[$topWeekday] > 0
                ? Carbon::now($zone)->startOfWeek(Carbon::MONDAY)->addDays($topWeekday - 1)->format('l')
                : null,
        ];
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

    /**
     * The rows on screen, fetched once.
     *
     * Memoised because render() needs them twice - grouped into days to draw,
     * and counted flat to decide whether "show more" has anything left to
     * show - and a private property is not state Livewire has to carry between
     * requests, only within one.
     *
     * @var Collection<int, UserEvent>|null
     */
    private ?Collection $timelineCache = null;

    /** @return Collection<int, UserEvent> */
    private function timeline(): Collection
    {
        return $this->timelineCache ??= $this->timelineQuery()
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
     *
     * Grouped into areas, and the areas kept in AREA_LABELS order rather than
     * in count order: forty chips sorted by frequency is a wall, and the same
     * chip moves every time somebody trains. Under a heading each one sits
     * where it sat last time, which is what makes it findable.
     */
    private function eventNames(): Collection
    {
        $rows = UserEvent::where('user_id', $this->user->id)
            ->selectRaw('name, COUNT(*) as total')
            ->groupBy('name')
            ->orderByDesc('total')
            ->get()
            ->groupBy(fn (UserEvent $row) => UserEvent::AREAS[$row->name] ?? UserEvent::AREA_SETTINGS);

        return collect(UserEvent::AREA_LABELS)
            ->map(fn (string $label, string $area) => [
                'label' => $label,
                'rows' => $rows->get($area, collect()),
            ])
            ->filter(fn (array $group) => $group['rows']->isNotEmpty())
            ->values();
    }
}
