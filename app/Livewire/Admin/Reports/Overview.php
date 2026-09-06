<?php

namespace App\Livewire\Admin\Reports;

use App\Models\Subscription;
use App\Models\User;
use App\Models\UserEvent;
use App\Models\WorkoutSession;
use App\Support\Reports\Delta;
use App\Support\Reports\PlainWords;
use App\Support\Reports\Window;
use Illuminate\Support\Facades\DB;

/**
 * Is the app growing, and is anyone paying?
 *
 * Six numbers, chosen because between them they answer the only two questions
 * that decide what to do next. Everything else on the other five pages exists
 * to explain a number on this one.
 */
class Overview extends ReportPage
{
    public function slug(): string
    {
        return 'overview';
    }

    protected function build(Window $window): array
    {
        [$since, $until] = [$window->since(), $window->until()];
        [$prevSince, $prevUntil] = [$window->prevSince(), $window->prevUntil()];

        $active = fn ($from, $to) => $this->activePeople($from, $to);
        $signups = fn ($from, $to) => User::where('is_admin', false)
            ->whereBetween('created_at', [$from, $to])->count();
        $sessions = fn ($from, $to) => WorkoutSession::whereBetween('completed_at', [$from, $to])->count();

        $activeNow = $active($since, $until);
        $signupsNow = $signups($since, $until);
        $sessionsNow = $sessions($since, $until);

        // Finished against finished-plus-quit. A count of finished workouts on
        // its own says nothing: 400 is excellent or dreadful depending on how
        // many were started.
        $finished = $this->eventCount(UserEvent::WORKOUT_COMPLETED, $since, $until);
        $quit = $this->eventCount(UserEvent::WORKOUT_ABANDONED, $since, $until);
        $prevFinished = $this->eventCount(UserEvent::WORKOUT_COMPLETED, $prevSince, $prevUntil);
        $prevQuit = $this->eventCount(UserEvent::WORKOUT_ABANDONED, $prevSince, $prevUntil);
        $attempts = $finished + $quit;

        // Subscribers are a snapshot of right now, not a count over a window,
        // so they carry no "vs last period": the comparison would be against a
        // number nobody recorded at the time.
        $subscriberCounts = $this->subscriberCounts();

        [$trials, $trialsPaid] = $this->trialToPaid($since, $until);

        $monthly = $this->monthlyMoney();

        $totalAccounts = User::where('is_admin', false)->count();

        return [
            'hasEvents' => UserEvent::whereBetween('occurred_at', [$since, $until])->exists(),
            'totalAccounts' => $totalAccounts,
            'cards' => [
                [
                    'label' => 'People who opened the app',
                    'value' => number_format($activeNow),
                    'detail' => 'out of '.PlainWords::people($totalAccounts).' with an account',
                    'delta' => Delta::of($activeNow, $active($prevSince, $prevUntil)),
                    'means' => 'How many different accounts had the app open at least once in '.$window->label().'. Not workouts - just opened.',
                    'ifLow' => $activeNow < max(1, (int) round($totalAccounts * 0.2))
                        ? 'Most accounts are dormant. Check Engagement: reminders are the single thing that brings people back.'
                        : null,
                ],
                [
                    'label' => 'New accounts',
                    'value' => number_format($signupsNow),
                    'detail' => 'created in '.$window->label(),
                    'delta' => Delta::of($signupsNow, $signups($prevSince, $prevUntil)),
                    'means' => 'People who finished signing up. Anyone still poking about without an account is invisible here.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'Workouts finished',
                    'value' => number_format($sessionsNow),
                    'detail' => 'two of them make a completed day',
                    'delta' => Delta::of($sessionsNow, $sessions($prevSince, $prevUntil)),
                    'means' => 'Every workout recorded as done in '.$window->label().', by everybody.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'Workouts run to the end',
                    'value' => PlainWords::percent($finished, $attempts),
                    'detail' => $attempts > 0
                        ? number_format($finished).' finished, '.number_format($quit).' quit part way'
                        : 'no workouts started yet',
                    'delta' => Delta::of(
                        $attempts > 0 ? $finished / $attempts : 0,
                        ($prevFinished + $prevQuit) > 0 ? $prevFinished / ($prevFinished + $prevQuit) : 0,
                    ),
                    'means' => 'Of the workouts people started, how many they saw through. Quitting part way is normal; a lot of it is not.',
                    'ifLow' => $attempts > 0 && $finished / $attempts < 0.6
                        ? 'More than 4 in 10 workouts are being abandoned. Training shows where in the workout people stop.'
                        : null,
                ],
                [
                    'label' => 'Subscribers right now',
                    'value' => number_format($subscriberCounts['total']),
                    'detail' => $subscriberCounts['trialing'].' of them on a free trial',
                    'delta' => null,
                    'means' => 'Accounts with a live subscription at this moment, trials included. A snapshot, so there is nothing to compare it with.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'Trials that became paid',
                    'value' => PlainWords::percent($trialsPaid, $trials),
                    'detail' => $trials > 0
                        ? $trialsPaid.' of '.$trials.' trials started in '.$window->label()
                        : 'no trials started in this window',
                    'delta' => null,
                    'means' => 'Of the free trials that began in this window, how many the store has since charged for.',
                    'ifLow' => $trials > 0 && $trialsPaid / $trials < 0.3
                        ? 'Most trials are ending without a payment. Money shows which screen sent them to the paywall in the first place.'
                        : null,
                ],
            ],
            'money' => $monthly,
            'trialSentence' => PlainWords::inTen($trialsPaid, $trials, 'free trials went on to be paid for.'),
            'activeSentence' => PlainWords::inTen($activeNow, $totalAccounts, 'accounts opened the app in '.$window->label().'.'),
        ];
    }

    /**
     * People the app was open for.
     *
     * Two sources, because neither is complete on its own: the app_opened
     * event, which is exact but only exists on builds that send it, and
     * last_seen_at, which every sync writes and so covers accounts on older
     * builds. A person counted by both is still one person - this is a count
     * of user rows, not of either signal.
     */
    private function activePeople(mixed $from, mixed $to): int
    {
        return User::where('is_admin', false)
            ->where(function ($q) use ($from, $to) {
                $q->whereBetween('last_seen_at', [$from, $to])
                    ->orWhereExists(function ($e) use ($from, $to) {
                        $e->selectRaw('1')
                            ->from('user_events')
                            ->whereColumn('user_events.user_id', 'users.id')
                            ->where('user_events.name', UserEvent::APP_OPENED)
                            ->whereBetween('user_events.occurred_at', [$from, $to]);
                    });
            })
            ->count();
    }

    private function eventCount(string $name, mixed $from, mixed $to): int
    {
        return UserEvent::where('name', $name)->whereBetween('occurred_at', [$from, $to])->count();
    }

    /**
     * @return array{total: int, trialing: int}
     *
     * Both figures go through Subscription::entitled() rather than a local
     * copy of the rule. The copy that used to live here bounded the dates
     * correctly but only looked at 'active' and 'trialing', so every
     * subscriber who had cancelled and was still inside the period they paid
     * for was missing from "Subscribers right now" while the app was still
     * serving them - the same misstatement as the dashboard's, pointing the
     * other way.
     */
    private function subscriberCounts(): array
    {
        return [
            'total' => (int) Subscription::entitled()->distinct()->count('user_id'),
            'trialing' => (int) Subscription::entitled()
                ->where('status', 'trialing')->distinct()->count('user_id'),
        ];
    }

    /**
     * Trials started in the window, and how many of them the store has since
     * charged for. A renewal IS the payment: the first one is the moment a
     * trial stops being free.
     *
     * @return array{0: int, 1: int}
     */
    private function trialToPaid(mixed $since, mixed $until): array
    {
        $trialUsers = UserEvent::where('name', UserEvent::SUBSCRIPTION_STARTED)
            ->where('detail', 'trial')
            ->whereBetween('occurred_at', [$since, $until])
            ->distinct()
            ->pluck('user_id');

        if ($trialUsers->isEmpty()) {
            return [0, 0];
        }

        $paid = UserEvent::where('name', UserEvent::SUBSCRIPTION_RENEWED)
            ->whereIn('user_id', $trialUsers)
            ->distinct()
            ->count('user_id');

        return [$trialUsers->count(), (int) $paid];
    }

    /**
     * Roughly what a month of the current subscribers is worth.
     *
     * List prices added up and spread over the months each plan covers. It is
     * before Google's cut, before tax and before refunds, so it is a measure of
     * size rather than of what lands in the bank - which the card says out
     * loud, because a money figure with an unstated assumption is worse than
     * no money figure.
     *
     * Trials are excluded: nobody has paid for one yet.
     *
     * renewing(), NOT entitled(), and the difference is the whole character of
     * the number. Entitled counts everyone with access today, which includes
     * people who cancelled last week and are running out their period - real
     * subscribers, but their next payment is never arriving. Recurring revenue
     * is a forecast, so it may only count money that will actually recur, and
     * the two sets have to be kept apart or this card quietly reports churned
     * customers as income for one more period.
     *
     * @return array{amount: float, subscribers: int}
     */
    private function monthlyMoney(): array
    {
        $rows = Subscription::renewing()
            ->join('plans', 'plans.id', '=', 'subscriptions.plan_id')
            // Trials have a price attached but nobody has been charged it yet.
            ->where('subscriptions.status', '!=', 'trialing')
            ->groupBy('plans.price', 'plans.interval', 'plans.interval_count')
            ->select([
                'plans.price',
                'plans.interval',
                'plans.interval_count',
                DB::raw('COUNT(*) as total'),
            ])
            ->get();

        $amount = 0.0;
        $subscribers = 0;

        foreach ($rows as $row) {
            $count = max(1, (int) $row->interval_count);

            // How many months one payment covers. A lifetime plan is left out
            // rather than spread over a guessed number of years.
            $months = match ($row->interval) {
                'day' => $count / 30,
                'week' => $count * 7 / 30,
                'month' => $count,
                'year' => $count * 12,
                default => null,
            };

            if ($months === null || $months <= 0) {
                continue;
            }

            $amount += ((float) $row->price / $months) * (int) $row->total;
            $subscribers += (int) $row->total;
        }

        return ['amount' => round($amount, 2), 'subscribers' => $subscribers];
    }
}
