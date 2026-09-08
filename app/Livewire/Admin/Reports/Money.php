<?php

namespace App\Livewire\Admin\Reports;

use App\Models\Subscription;
use App\Models\UserEvent;
use App\Support\Reports\Delta;
use App\Support\Reports\PlainWords;
use App\Support\Reports\SubscriptionMetrics;
use App\Support\Reports\Window;
use Illuminate\Support\Facades\DB;

/**
 * Who pays, where they were standing when they decided, and who stops.
 *
 * The most useful thing on this page is not the total: it is which screen sent
 * somebody to the paywall. "The paywall converts at 4%" is a fact nobody can
 * act on; "the paywall opened from the difficulty picker converts three times
 * better than the one opened from settings" is a decision about where to put a
 * button.
 */
class Money extends ReportPage
{
    /**
     * Why a purchase did not finish, in words.
     *
     * The order matters as much as the wording. "Cancelled" is first and is
     * labelled as normal, because it is by far the biggest bucket and reading
     * it as failure is how a healthy checkout gets rebuilt for no reason.
     */
    private const FAILURE_LABELS = [
        'cancelled' => 'Changed their mind - not a problem',
        'pending' => 'Waiting on the store (slow payment method)',
        'already_owned' => 'They already own it',
        'network' => 'No connection',
        'store_error' => 'The store refused it',
    ];

    private const RESTORE_LABELS = [
        'succeeded' => 'Found their subscription',
        'nothing_found' => 'Nothing to restore',
        'unmatched' => 'Found one, but on another account',
        'expired' => 'Found one, but it had run out',
        'failed' => 'The store could not answer',
    ];

    private const ENDING_LABELS = [
        'canceled' => 'They cancelled',
        'expired' => 'It ran out',
        'billing_issue' => 'The card failed',
        'revoked' => 'Refunded or revoked',
    ];

    public function slug(): string
    {
        return 'money';
    }

    protected function build(Window $window): array
    {
        [$since, $until] = [$window->since(), $window->until()];
        [$prevSince, $prevUntil] = [$window->prevSince(), $window->prevUntil()];

        $purchases = fn ($from, $to) => $this->eventCount(UserEvent::PURCHASE_COMPLETED, $from, $to);
        $started = fn ($from, $to) => $this->eventCount(UserEvent::PURCHASE_STARTED, $from, $to);
        $failed = fn ($from, $to) => $this->eventCount(UserEvent::PURCHASE_FAILED, $from, $to);
        $paywalls = fn ($from, $to) => (int) UserEvent::where('name', UserEvent::PAYWALL_VIEWED)
            ->whereBetween('occurred_at', [$from, $to])->distinct()->count('user_id');

        $bought = $purchases($since, $until);
        $sawPaywall = $paywalls($since, $until);
        $checkouts = $started($since, $until);

        return [
            'cards' => [
                [
                    'label' => 'Purchases',
                    'value' => number_format($bought),
                    'detail' => 'confirmed by the store in '.$window->label(),
                    'delta' => Delta::of($bought, $purchases($prevSince, $prevUntil)),
                    'means' => 'Every purchase the store confirmed, including upgrades and the first payment of a trial.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'People who saw the paywall',
                    'value' => number_format($sawPaywall),
                    'detail' => $sawPaywall > 0 ? PlainWords::percent($bought, $sawPaywall).' of them bought something' : 'nobody reached it',
                    'delta' => Delta::of($sawPaywall, $paywalls($prevSince, $prevUntil)),
                    'means' => 'Different accounts that opened the paywall at least once. The table below says which screen sent them.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'Checkouts finished',
                    'value' => PlainWords::percent($bought, $checkouts),
                    'detail' => $checkouts > 0
                        ? number_format($checkouts).' checkouts opened'
                        : 'no checkouts opened yet',
                    'delta' => Delta::of(
                        $checkouts > 0 ? $bought / $checkouts : 0,
                        $started($prevSince, $prevUntil) > 0
                            ? $purchases($prevSince, $prevUntil) / $started($prevSince, $prevUntil)
                            : 0,
                    ),
                    'means' => 'Once the store sheet is open, how often it ends in a purchase. Most of the rest changed their mind, which is normal.',
                    'ifLow' => null,
                ],
                [
                    'label' => 'Purchases that failed',
                    'value' => number_format($failed($since, $until)),
                    'detail' => 'most of these are people changing their mind',
                    'delta' => Delta::of($failed($since, $until), $failed($prevSince, $prevUntil)),
                    'means' => 'Checkouts that ended without a purchase, for any reason. The breakdown below separates the ordinary from the broken.',
                    'ifLow' => null,
                ],
            ],
            'recurring' => $this->recurring($window),
            'bySource' => $this->paywallSources($since, $until),
            'plans' => $this->planMix($since, $until),
            'switches' => $this->switches($since, $until),
            'failures' => $this->failures($since, $until),
            'restores' => $this->restores($since, $until),
            'endings' => $this->endings($since, $until),
            // lapsed(), not a hand-rolled copy of it. The copy also excluded
            // status IN (active, trialing), which is the one shape a lapsed
            // row takes when its EXPIRATION never arrived - so the count
            // dropped exactly the subscriptions it existed to find.
            'lapsed' => Subscription::lapsed()
                ->whereBetween('ends_at', [$since, $until])
                ->count(),
            'recent' => $this->recentPurchases(),
            'sourceSentence' => $this->sourceSentence($since, $until),
            'hasMoneyEvents' => UserEvent::whereIn('name', [
                UserEvent::PAYWALL_VIEWED,
                UserEvent::PURCHASE_COMPLETED,
                UserEvent::SUBSCRIPTION_STARTED,
            ])->whereBetween('occurred_at', [$since, $until])->exists(),
        ];
    }

    private function eventCount(string $name, mixed $from, mixed $to): int
    {
        return UserEvent::where('name', $name)->whereBetween('occurred_at', [$from, $to])->count();
    }

    /**
     * Which screen sent people to the paywall, and how many of them bought.
     *
     * Folded in PHP from two small lists rather than joined: the second list is
     * "everybody who bought anything in the window", which is short enough to
     * hold, and joining events to events on user_id invites double counting the
     * moment somebody opens the paywall twice.
     */
    private function paywallSources(mixed $since, mixed $until): array
    {
        $views = UserEvent::where('name', UserEvent::PAYWALL_VIEWED)
            ->whereBetween('occurred_at', [$since, $until])
            ->select('user_id', 'subject')
            ->distinct()
            ->get();

        $buyers = UserEvent::where('name', UserEvent::PURCHASE_COMPLETED)
            ->whereBetween('occurred_at', [$since, $until])
            ->distinct()
            ->pluck('user_id')
            ->flip();

        $sources = [];

        foreach ($views as $view) {
            $key = $view->subject ?: 'unknown';
            $sources[$key] ??= ['label' => $key, 'people' => 0, 'bought' => 0];
            $sources[$key]['people']++;

            if ($buyers->has($view->user_id)) {
                $sources[$key]['bought']++;
            }
        }

        return collect($sources)
            ->map(fn ($row) => $row + [
                'pct' => $row['people'] > 0 ? (int) round($row['bought'] / $row['people'] * 100) : 0,
            ])
            ->sortByDesc('people')
            ->values()
            ->all();
    }

    private function sourceSentence(mixed $since, mixed $until): ?string
    {
        $best = collect($this->paywallSources($since, $until))
            ->filter(fn ($row) => $row['people'] >= 5)
            ->sortByDesc('pct')
            ->first();

        if (! $best) {
            return null;
        }

        return PlainWords::inTen(
            $best['bought'],
            $best['people'],
            'people who reached the paywall from "'.$best['label'].'" went on to pay. That is the best-performing place to ask.',
        );
    }

    /**
     * The recurring-revenue view of the same customers.
     *
     * Everything above this on the page counts EVENTS - purchases, paywalls,
     * failures - which answers "what happened". These answer "what is it
     * worth and who is leaving", which no amount of event counting gets to.
     *
     * The arithmetic lives in SubscriptionMetrics rather than here, so the
     * Overview's money card and these cards cannot drift apart. That has
     * already gone wrong once with the definition of a subscriber, and money
     * is the worse place for it to happen.
     *
     * Nulls are rendered as a sentence rather than as a zero. "No churn yet,
     * so there is nothing to divide by" is a true and useful thing to read;
     * "$0.00" in the same box is neither.
     *
     * @return array<string, mixed>
     */
    private function recurring(Window $window): array
    {
        $mrr = SubscriptionMetrics::mrr();
        $arpu = SubscriptionMetrics::arpu();
        $churn = SubscriptionMetrics::churn($window);
        $reasons = SubscriptionMetrics::churnReasons($window);
        $refunds = SubscriptionMetrics::refunds($window);
        $ltv = SubscriptionMetrics::ltv($window);

        $money = fn (?float $n) => $n === null ? null : '$'.number_format($n, 2);

        return [
            'rows' => [
                [
                    'label' => 'Monthly recurring revenue',
                    'value' => $money($mrr['amount']),
                    'detail' => PlainWords::people($mrr['subscribers']).' billing again',
                    'means' => 'Every subscription that will bill again, with each plan spread over the months it covers. List prices, before Google\'s cut, tax and refunds - a measure of size, not of what lands in the bank.',
                ],
                [
                    'label' => 'Annual run rate',
                    'value' => $money($mrr['amount'] * 12),
                    'detail' => 'this month, twelve times',
                    'means' => 'What a year at today\'s rate would come to. It assumes nothing changes, which it will, so it is a scale rather than a forecast.',
                ],
                [
                    'label' => 'Revenue per subscriber',
                    'value' => $money($arpu),
                    'detail' => $arpu === null ? 'nobody is billing yet' : 'per month, on average',
                    'means' => 'Recurring revenue divided by the subscriptions that make it up. Someone who has cancelled is in neither half, so this does not fall just because a person left.',
                ],
                [
                    'label' => 'Churn',
                    'value' => $churn['rate'] === null ? null : $churn['rate'].'%',
                    // No "who were": PlainWords::people() says "1 person" for a
                    // single subscriber, and the verb then disagrees with it.
                    'detail' => $churn['base'] > 0
                        ? $churn['churned'].' of '.PlainWords::people($churn['base']).' subscribed when '.$window->label().' began'
                        : 'nobody was subscribed when this window opened',
                    'means' => 'People, not rows: a plan change closes one subscription and opens another, and that is not somebody leaving. Counted by whether they have access NOW, so a missed expiry webhook cannot hide a departure.',
                ],
                [
                    'label' => 'Left by choice',
                    'value' => number_format($reasons['voluntary']),
                    'detail' => $reasons['involuntary'].' more lost to a failed card',
                    'means' => 'Cancellations against payment failures. The first is a product problem and the second is a payments problem, and one "churn" number hides which of the two you have.',
                ],
                [
                    'label' => 'Came back',
                    'value' => number_format($churn['reactivated']),
                    'detail' => 'subscribed again in '.$window->label(),
                    'means' => 'People who were not subscribed when the window opened and are now, on a subscription that began inside it.',
                ],
                [
                    'label' => 'Lifetime value',
                    'value' => $money($ltv),
                    'detail' => $ltv === null ? 'needs some churn to estimate from' : 'at the current churn rate',
                    'means' => 'Revenue per subscriber divided by monthly churn. It assumes today\'s churn continues for ever, so treat it as an order of magnitude and not a figure to plan against.',
                ],
                [
                    'label' => 'Refunded',
                    'value' => $refunds['rate'] === null ? null : $refunds['rate'].'%',
                    'detail' => $refunds['purchases'] > 0
                        ? $refunds['refunds'].' of '.number_format($refunds['purchases']).' purchases'
                        : 'no purchases in this window',
                    'means' => 'Refunds and revocations against purchases. Worth watching apart from churn: a rate that climbs is usually a broken checkout rather than people changing their minds.',
                ],
            ],
        ];
    }

    /** What people bought, and what is live right now. */
    private function planMix(mixed $since, mixed $until): array
    {
        $bought = UserEvent::where('name', UserEvent::PURCHASE_COMPLETED)
            ->whereBetween('occurred_at', [$since, $until])
            ->selectRaw('subject, COUNT(*) as total')
            ->groupBy('subject')
            ->pluck('total', 'subject');

        // "Live" here means entitled: this column answers which plans people
        // are actually on right now, so a cancelled subscriber still inside
        // their paid period belongs in it. The local copy of the rule that
        // used to be here left them out.
        $live = Subscription::entitled()
            ->join('plans', 'plans.id', '=', 'subscriptions.plan_id')
            ->groupBy('plans.slug')
            ->select(['plans.slug', DB::raw('COUNT(*) as total')])
            ->pluck('total', 'slug');

        return $live->keys()
            ->merge($bought->keys())
            ->unique()
            ->map(fn ($slug) => [
                'label' => $slug ?: 'unknown',
                'bought' => (int) ($bought[$slug] ?? 0),
                'live' => (int) ($live[$slug] ?? 0),
            ])
            ->sortByDesc('live')
            ->values()
            ->all();
    }

    /** People moving between plans rather than joining or leaving. */
    private function switches(mixed $since, mixed $until): array
    {
        return UserEvent::where('name', UserEvent::PURCHASE_COMPLETED)
            ->whereIn('detail', ['upgrade', 'downgrade'])
            ->whereBetween('occurred_at', [$since, $until])
            ->selectRaw('subject, detail, COUNT(*) as total')
            ->groupBy('subject', 'detail')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'label' => ($row->detail === 'upgrade' ? 'Moved up to ' : 'Moved down to ').($row->subject ?: 'another plan'),
                'value' => (int) $row->total,
            ])
            ->all();
    }

    private function failures(mixed $since, mixed $until): array
    {
        $rows = UserEvent::where('name', UserEvent::PURCHASE_FAILED)
            ->whereBetween('occurred_at', [$since, $until])
            ->selectRaw('detail, COUNT(*) as total')
            ->groupBy('detail')
            ->get()
            ->keyBy('detail');

        // The known reasons first, in the order that matters, and anything the
        // store invented afterwards under its own raw code.
        $ordered = [];

        foreach (self::FAILURE_LABELS as $key => $label) {
            $ordered[] = ['label' => $label, 'value' => (int) ($rows[$key]->total ?? 0)];
        }

        foreach ($rows as $detail => $row) {
            if (! array_key_exists((string) $detail, self::FAILURE_LABELS)) {
                $ordered[] = ['label' => 'Store code: '.($detail ?: 'none given'), 'value' => (int) $row->total];
            }
        }

        return array_values(array_filter($ordered, fn ($row) => $row['value'] > 0));
    }

    private function restores(mixed $since, mixed $until): array
    {
        $attempted = $this->eventCount(UserEvent::RESTORE_ATTEMPTED, $since, $until);

        $rows = UserEvent::where('name', UserEvent::RESTORE_FINISHED)
            ->whereBetween('occurred_at', [$since, $until])
            ->selectRaw('subject, COUNT(*) as total')
            ->groupBy('subject')
            ->pluck('total', 'subject');

        $outcomes = [];

        foreach (self::RESTORE_LABELS as $key => $label) {
            $value = (int) ($rows[$key] ?? 0);

            if ($value > 0) {
                $outcomes[] = ['label' => $label, 'value' => $value];
            }
        }

        return ['attempted' => $attempted, 'outcomes' => $outcomes];
    }

    private function endings(mixed $since, mixed $until): array
    {
        $rows = UserEvent::where('name', UserEvent::SUBSCRIPTION_ENDED)
            ->whereBetween('occurred_at', [$since, $until])
            ->selectRaw('detail, COUNT(*) as total')
            ->groupBy('detail')
            ->pluck('total', 'detail');

        $out = [];

        foreach (self::ENDING_LABELS as $key => $label) {
            $out[] = ['label' => $label, 'value' => (int) ($rows[$key] ?? 0)];
        }

        return $out;
    }

    /**
     * The last 25 purchases, so a name can be checked against a number.
     *
     * Every report on this page is a count, and counts are exactly the thing
     * that can be subtly wrong for weeks. A short list of real rows is how you
     * find that out.
     */
    private function recentPurchases(): array
    {
        return Subscription::query()
            ->join('users', 'users.id', '=', 'subscriptions.user_id')
            ->leftJoin('plans', 'plans.id', '=', 'subscriptions.plan_id')
            ->orderByDesc('subscriptions.started_at')
            ->limit(25)
            ->select([
                'users.email',
                'users.name',
                'plans.slug as plan',
                'subscriptions.status',
                'subscriptions.started_at',
                // Selected for effectiveStatusFor(). Without it this table
                // printed the raw status, so a lapsed row read "Active"
                // directly beneath figures that had correctly excluded it -
                // in the one table on the page whose whole job is letting a
                // number be checked against a name.
                'subscriptions.ends_at',
                'subscriptions.trial_ends_at',
            ])
            ->get()
            ->map(fn ($row) => [
                'email' => $row->email,
                'name' => $row->name,
                'plan' => $row->plan ?: 'no plan recorded',
                'status' => Subscription::effectiveStatusFor($row->status, $row->ends_at),
                'trial' => $row->trial_ends_at !== null,
                'started' => $row->started_at ? \Illuminate\Support\Carbon::parse($row->started_at)->format('j M Y') : '-',
            ])
            ->all();
    }
}
