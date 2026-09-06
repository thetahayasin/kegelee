<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Models\UserEvent;
use App\Support\Reports\SubscriptionMetrics;
use App\Support\Reports\Window;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The revenue arithmetic, pinned.
 *
 * These are the numbers somebody makes a decision on, and every one of them is
 * derived rather than recorded - there is no ledger, only subscription rows and
 * list prices. So the failure mode is not a crash, it is a plausible wrong
 * number that nobody questions, which is exactly what the dashboard's
 * "3 subscribers" was.
 *
 * The two that matter most are the ones that separate sets people usually
 * conflate: MRR counts who will PAY again, headcounts count who has ACCESS,
 * and churn counts PEOPLE rather than rows.
 */
class SubscriptionMetricsTest extends TestCase
{
    use RefreshDatabase;

    private function plan(string $slug, float $price, string $interval, int $count = 1): Plan
    {
        return Plan::create([
            'name' => $slug,
            'slug' => $slug,
            'price' => $price,
            'currency' => 'USD',
            'interval' => $interval,
            'interval_count' => $count,
        ]);
    }

    private function sub(Plan $plan, string $status, ?string $endsAt, bool $autoRenewing = true): Subscription
    {
        return Subscription::create([
            'user_id' => User::factory()->create()->id,
            'plan_id' => $plan->id,
            'status' => $status,
            'store' => 'revenuecat',
            'purchase_token' => 'TOKEN-'.uniqid('', true),
            'started_at' => now()->subMonths(3),
            'ends_at' => $endsAt,
            'auto_renewing' => $autoRenewing,
        ]);
    }

    public function test_a_year_of_revenue_is_spread_across_twelve_months(): void
    {
        // The whole point of "monthly recurring": a $60 yearly plan is $5 a
        // month, not $60, and adding the two plan types together without this
        // overstates a yearly customer twelvefold.
        $this->sub($this->plan('yearly', 60.00, 'year'), 'active', now()->addMonths(6)->toDateTimeString());
        $this->sub($this->plan('monthly', 5.99, 'month'), 'active', now()->addWeek()->toDateTimeString());

        $mrr = SubscriptionMetrics::mrr();

        $this->assertEqualsWithDelta(10.99, $mrr['amount'], 0.01);
        $this->assertSame(2, $mrr['subscribers']);
    }

    public function test_a_quarterly_plan_is_a_third_of_its_price_per_month(): void
    {
        $this->sub($this->plan('quarterly', 15.99, 'month', 3), 'active', now()->addMonth()->toDateTimeString());

        $this->assertEqualsWithDelta(5.33, SubscriptionMetrics::mrr()['amount'], 0.01);
    }

    public function test_a_cancelled_subscriber_is_not_recurring_revenue(): void
    {
        // They still have access, and they still count as a subscriber
        // everywhere else. Their next payment is never arriving, so counting
        // them here reports somebody who has left as income for one more period.
        $plan = $this->plan('monthly', 5.99, 'month');
        $this->sub($plan, 'canceled', now()->addWeek()->toDateTimeString(), autoRenewing: false);

        $this->assertSame(1, Subscription::entitled()->count(), 'they do still have access');
        $this->assertSame(0.0, SubscriptionMetrics::mrr()['amount']);
    }

    public function test_a_trial_is_not_revenue_and_a_lifetime_plan_is_not_recurring(): void
    {
        $this->sub($this->plan('monthly', 5.99, 'month'), 'trialing', now()->addWeek()->toDateTimeString());
        $this->sub($this->plan('forever', 199.00, 'lifetime'), 'active', null);

        $mrr = SubscriptionMetrics::mrr();

        // Neither is spread over a guessed number of months. A lifetime plan is
        // real money and simply is not RECURRING money.
        $this->assertSame(0.0, $mrr['amount']);
        $this->assertSame(0, $mrr['subscribers']);
    }

    public function test_a_lapsed_row_is_not_counted_however_the_renew_flag_reads(): void
    {
        // auto_renewing stays true on a row whose expiry was never delivered.
        $this->sub($this->plan('monthly', 5.99, 'month'), 'active', now()->subDay()->toDateTimeString());

        $this->assertSame(0.0, SubscriptionMetrics::mrr()['amount']);
    }

    public function test_revenue_per_subscriber_divides_by_the_same_population_it_sums(): void
    {
        $plan = $this->plan('monthly', 6.00, 'month');
        $this->sub($plan, 'active', now()->addWeek()->toDateTimeString());
        $this->sub($plan, 'active', now()->addWeek()->toDateTimeString());
        // A cancelled subscriber is in neither half, so ARPU must not move.
        $this->sub($plan, 'canceled', now()->addWeek()->toDateTimeString(), autoRenewing: false);

        $this->assertEqualsWithDelta(6.00, SubscriptionMetrics::arpu(), 0.01);
    }

    public function test_arpu_is_null_rather_than_zero_when_nobody_is_paying(): void
    {
        // Zero would be a claim. Null is the absence of one, and the card says
        // so in words.
        $this->assertNull(SubscriptionMetrics::arpu());
        $this->assertNull(SubscriptionMetrics::ltv(Window::of(30)));
    }

    public function test_churn_counts_the_people_who_had_access_and_now_do_not(): void
    {
        $plan = $this->plan('monthly', 5.99, 'month');

        // Two were subscribed when the window opened; one has since run out.
        $this->sub($plan, 'active', now()->addWeek()->toDateTimeString());
        $this->sub($plan, 'active', now()->subDay()->toDateTimeString());

        $churn = SubscriptionMetrics::churn(Window::of(30));

        $this->assertSame(2, $churn['base']);
        $this->assertSame(1, $churn['churned']);
        $this->assertEqualsWithDelta(50.0, $churn['rate'], 0.01);
    }

    public function test_a_departure_whose_expiry_event_did_arrive_is_still_counted(): void
    {
        // The ordinary case, and the one an earlier version of churn() got
        // wrong: the webhook lands, the row is moved to 'expired', and a
        // denominator that filtered on current status then excluded this
        // person from the population they were part of when the window opened.
        // Churn read 0% for ever, because the only people who could count as
        // churned had been filtered out first.
        $plan = $this->plan('monthly', 5.99, 'month');

        Subscription::create([
            'user_id' => User::factory()->create()->id, 'plan_id' => $plan->id,
            'status' => 'expired', 'store' => 'revenuecat', 'purchase_token' => 'gone',
            'started_at' => now()->subMonths(3), 'ends_at' => now()->subDay(), 'auto_renewing' => false,
        ]);

        $churn = SubscriptionMetrics::churn(Window::of(30));

        $this->assertSame(1, $churn['base']);
        $this->assertSame(1, $churn['churned']);
        $this->assertEqualsWithDelta(100.0, $churn['rate'], 0.01);
    }

    public function test_a_plan_change_is_not_a_departure(): void
    {
        // One person, two rows: the old plan closed and the new one opened.
        // Counting rows would call that a churn and a new subscriber at once.
        $user = User::factory()->create();
        $plan = $this->plan('monthly', 5.99, 'month');

        Subscription::create([
            'user_id' => $user->id, 'plan_id' => $plan->id, 'status' => 'expired',
            'store' => 'revenuecat', 'purchase_token' => 'old',
            'started_at' => now()->subMonths(3), 'ends_at' => now()->subDay(), 'auto_renewing' => false,
        ]);
        Subscription::create([
            'user_id' => $user->id, 'plan_id' => $plan->id, 'status' => 'active',
            'store' => 'revenuecat', 'purchase_token' => 'new',
            'started_at' => now()->subDay(), 'ends_at' => now()->addMonth(), 'auto_renewing' => true,
        ]);

        $churn = SubscriptionMetrics::churn(Window::of(30));

        $this->assertSame(1, $churn['base']);
        $this->assertSame(0, $churn['churned'], 'they never lost access');
    }

    public function test_leaving_by_choice_is_told_apart_from_a_failed_card(): void
    {
        // One is a product problem and the other is a payments problem. A
        // single "churn" number hides which of the two you have.
        $a = User::factory()->create();
        $b = User::factory()->create();

        UserEvent::record($a->id, UserEvent::SUBSCRIPTION_ENDED, 'monthly', 'canceled', null, 'e1');
        UserEvent::record($b->id, UserEvent::SUBSCRIPTION_ENDED, 'monthly', 'billing_issue', null, 'e2');

        $reasons = SubscriptionMetrics::churnReasons(Window::of(30));

        $this->assertSame(1, $reasons['voluntary']);
        $this->assertSame(1, $reasons['involuntary']);
    }

    public function test_a_cancellation_followed_by_its_expiry_is_one_departure(): void
    {
        // Play sends CANCELLATION when they decide and EXPIRATION when the
        // period ends. Counting both makes every voluntary churn count twice.
        $user = User::factory()->create();

        UserEvent::record($user->id, UserEvent::SUBSCRIPTION_ENDED, 'monthly', 'canceled', null, 'c1');
        UserEvent::record($user->id, UserEvent::SUBSCRIPTION_ENDED, 'monthly', 'expired', null, 'c2');

        $reasons = SubscriptionMetrics::churnReasons(Window::of(30));

        $this->assertSame(1, $reasons['voluntary'] + $reasons['involuntary']);
        $this->assertSame(1, $reasons['voluntary'], 'the decision is what ended it, not the date it took effect');
    }

    public function test_the_refund_rate_is_refunds_against_purchases(): void
    {
        $user = User::factory()->create();

        foreach (range(1, 4) as $i) {
            UserEvent::record($user->id, UserEvent::PURCHASE_COMPLETED, 'monthly', null, null, 'p'.$i);
        }
        UserEvent::record($user->id, UserEvent::SUBSCRIPTION_ENDED, 'monthly', 'revoked', null, 'r1');

        $refunds = SubscriptionMetrics::refunds(Window::of(30));

        $this->assertSame(1, $refunds['refunds']);
        $this->assertSame(4, $refunds['purchases']);
        $this->assertEqualsWithDelta(25.0, $refunds['rate'], 0.01);
    }
}
