<?php

namespace App\Support\Reports;

use App\Models\Subscription;
use App\Models\UserEvent;
use Illuminate\Support\Facades\DB;

/**
 * The revenue arithmetic, in one place.
 *
 * Every figure here is derived rather than recorded: there is no ledger to
 * read, because Play takes the money and tells RevenueCat, which tells us that
 * something happened without ever telling us an amount. So MRR is list prices
 * spread over the months each plan covers, and churn is counted from
 * subscription rows rather than from a billing statement.
 *
 * That makes these numbers a measure of SIZE and SHAPE, not of what landed in
 * the bank. Every caller prints that caveat next to the number, because a
 * money figure with an unstated assumption is worse than no money figure.
 *
 * It exists as a class because the alternative already went wrong once. The
 * monthly-value calculation lived inside the Overview report, so anything else
 * wanting it had to write a second copy - and two copies of an arithmetic rule
 * is how a dashboard comes to disagree with the report it links to.
 */
final class SubscriptionMetrics
{
    /**
     * How many months one payment of a plan covers.
     *
     * A lifetime plan returns null and is left out of recurring revenue
     * entirely, rather than being spread over a guessed number of years. It is
     * not recurring; putting a number on it would be inventing one.
     */
    public static function monthsCovered(?string $interval, ?int $intervalCount): ?float
    {
        $count = max(1, (int) $intervalCount);

        $months = match ($interval) {
            'day' => $count / 30,
            'week' => $count * 7 / 30,
            'month' => (float) $count,
            'year' => (float) $count * 12,
            default => null,
        };

        return ($months !== null && $months > 0) ? $months : null;
    }

    /**
     * Monthly recurring revenue, and how many subscriptions make it up.
     *
     * renewing(), not entitled(). Somebody who cancelled last week still has
     * access and is still a subscriber, but their next payment is never
     * arriving - counting them here would report a customer who has already
     * left as income for one more period. Trials are excluded for the same
     * reason in the other direction: nobody has paid for one yet.
     *
     * @return array{amount: float, subscribers: int}
     */
    public static function mrr(): array
    {
        $rows = Subscription::renewing()
            ->join('plans', 'plans.id', '=', 'subscriptions.plan_id')
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
            $months = self::monthsCovered($row->interval, (int) $row->interval_count);

            if ($months === null) {
                continue;
            }

            $amount += ((float) $row->price / $months) * (int) $row->total;
            $subscribers += (int) $row->total;
        }

        return ['amount' => round($amount, 2), 'subscribers' => $subscribers];
    }

    /**
     * Average monthly revenue per paying subscriber.
     *
     * Divided by the subscriptions that make up MRR rather than by everyone
     * entitled, so the numerator and denominator describe the same population.
     * Dividing recurring revenue by a headcount that includes people who have
     * cancelled produces a number that falls when nothing has changed except
     * that somebody left.
     */
    public static function arpu(): ?float
    {
        $mrr = self::mrr();

        return $mrr['subscribers'] > 0
            ? round($mrr['amount'] / $mrr['subscribers'], 2)
            : null;
    }

    /**
     * Who was a subscriber when the window opened, and who is gone now.
     *
     * Logo churn, counted on people rather than on rows: somebody whose plan
     * change closed one subscription and opened another has not churned, and
     * counting rows would say they had.
     *
     * "Gone" is deliberately evaluated as "has no entitled subscription NOW"
     * rather than "has an ending event", because an ending event that never
     * arrived is exactly the failure mode this whole audit started with. A
     * missed webhook must not be able to hide a churn.
     *
     * @return array{base: int, churned: int, rate: float|null, reactivated: int}
     */
    public static function churn(Window $window): array
    {
        $since = $window->since();

        // Entitled when the window opened: started on or before it, and had
        // not run out by then. Dates only, and deliberately so.
        //
        // Filtering this on `status` as well looks like the obvious extra
        // safeguard and silently breaks the whole measurement: status describes
        // the row NOW, so every subscription that lapsed during the window has
        // since been moved to 'expired' and would be excluded from the very
        // denominator it belongs in. Churn then reads 0% for ever, because the
        // only people who could count as churned have been filtered out of the
        // population first.
        $base = Subscription::query()
            ->where('started_at', '<=', $since)
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $since))
            ->distinct()
            ->pluck('user_id');

        if ($base->isEmpty()) {
            return ['base' => 0, 'churned' => 0, 'rate' => null, 'reactivated' => 0];
        }

        $stillHere = Subscription::entitled()
            ->whereIn('user_id', $base)
            ->distinct()
            ->pluck('user_id');

        $churned = $base->count() - $stillHere->count();

        // Somebody who was NOT entitled when the window opened and is now.
        // Their subscription has to have begun inside the window, or they were
        // simply already here and this would count them twice.
        $reactivated = Subscription::entitled()
            ->whereNotIn('user_id', $base)
            ->where('started_at', '>=', $since)
            ->distinct()
            ->count('user_id');

        return [
            'base' => $base->count(),
            'churned' => $churned,
            'rate' => $base->count() > 0 ? round($churned / $base->count() * 100, 1) : null,
            'reactivated' => $reactivated,
        ];
    }

    /**
     * Why the people who left, left.
     *
     * Read from the ending events, which carry the store's reason. Counted on
     * distinct people per reason, so one person whose cancellation is followed
     * by an expiry at period end is not two departures.
     *
     * The split is the useful part. Voluntary churn is a product problem and
     * involuntary churn is a payments problem, and averaging them into one
     * "churn" figure hides which of the two you actually have.
     *
     * @return array{voluntary: int, involuntary: int}
     */
    public static function churnReasons(Window $window): array
    {
        $rows = UserEvent::where('name', UserEvent::SUBSCRIPTION_ENDED)
            ->whereBetween('occurred_at', [$window->since(), $window->until()])
            ->get(['user_id', 'detail']);

        // A cancellation outranks the expiry that follows it: the decision is
        // what ended the subscription, and the date it ran out is only when
        // that decision took effect.
        $byUser = [];

        foreach ($rows as $row) {
            $kind = in_array($row->detail, ['billing_issue', 'revoked'], true) ? 'involuntary' : 'voluntary';

            if ($row->detail === 'canceled' || ! isset($byUser[$row->user_id])) {
                $byUser[$row->user_id] = $row->detail === 'canceled' ? 'voluntary' : $kind;
            }
        }

        $counts = array_count_values($byUser);

        return [
            'voluntary' => (int) ($counts['voluntary'] ?? 0),
            'involuntary' => (int) ($counts['involuntary'] ?? 0),
        ];
    }

    /**
     * What a subscriber is worth over their life, at the current churn rate.
     *
     * ARPU divided by monthly churn, which is the standard estimate and is
     * only as good as its inputs: it assumes today's churn continues for ever,
     * which it will not.
     *
     * Null rather than a number in the two cases where it would be a fiction:
     * nobody churned in the window (the formula divides by zero and answers
     * "infinite", which is not a fact about the app), or there is nobody to
     * average over. Callers say so in words instead.
     */
    public static function ltv(Window $window): ?float
    {
        $arpu = self::arpu();
        $churn = self::churn($window);

        if ($arpu === null || $churn['rate'] === null || $churn['rate'] <= 0) {
            return null;
        }

        // The window is 7, 30 or 90 days; churn has to be a MONTHLY rate for
        // the division to mean anything, so it is scaled before it is used.
        $monthlyRate = ($churn['rate'] / 100) * (30 / $window->days);

        return $monthlyRate > 0 ? round($arpu / $monthlyRate, 2) : null;
    }

    /**
     * Refunds and revocations against purchases, in the window.
     *
     * Worth watching on its own rather than as part of churn: a refund is
     * money going back out, and a rate that climbs is usually a broken
     * purchase flow rather than people changing their minds.
     *
     * @return array{refunds: int, purchases: int, rate: float|null}
     */
    public static function refunds(Window $window): array
    {
        $between = [$window->since(), $window->until()];

        $refunds = (int) UserEvent::where('name', UserEvent::SUBSCRIPTION_ENDED)
            ->where('detail', 'revoked')
            ->whereBetween('occurred_at', $between)
            ->count();

        $purchases = (int) UserEvent::where('name', UserEvent::PURCHASE_COMPLETED)
            ->whereBetween('occurred_at', $between)
            ->count();

        return [
            'refunds' => $refunds,
            'purchases' => $purchases,
            'rate' => $purchases > 0 ? round($refunds / $purchases * 100, 1) : null,
        ];
    }
}
