<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "Does this subscription grant access right now?" is not answerable from the
 * status column, and getting it wrong has already cost users their access
 * once: `past_due` was excluded from the entitlement query, so a card Google
 * was still retrying locked a paying subscriber straight out of the app.
 *
 * Subscription::isEntitled() exists so the admin table can state the answer
 * instead of leaving an admin to infer it from a pill that says "Canceled" on
 * a row that is still perfectly entitled. These tests pin it to the same
 * behaviour as User::activeSubscription(), which is the query the API and the
 * app actually gate on - the two must never drift apart.
 */
class SubscriptionEntitlementTest extends TestCase
{
    use RefreshDatabase;

    private function sub(array $attrs = []): Subscription
    {
        $user = User::factory()->create();
        $plan = Plan::first() ?? Plan::create([
            'name' => 'Monthly',
            'slug' => 'monthly',
            'price' => 599,
            'currency' => 'USD',
            'interval' => 'month',
            'interval_count' => 1,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        return Subscription::create(array_merge([
            'user_id' => $user->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'store' => 'manual',
            'started_at' => now()->subMonth(),
            'ends_at' => now()->addMonth(),
            'auto_renewing' => true,
        ], $attrs));
    }

    /** The straightforward cases. */
    public function test_active_and_trialing_are_entitled_until_they_expire(): void
    {
        $this->assertTrue($this->sub(['status' => 'active'])->isEntitled());
        $this->assertTrue($this->sub(['status' => 'trialing'])->isEntitled());

        $this->assertFalse($this->sub(['status' => 'active', 'ends_at' => now()->subDay()])->isEntitled());
        $this->assertFalse($this->sub(['status' => 'trialing', 'ends_at' => now()->subDay()])->isEntitled());
    }

    /** A null end date is a lifetime grant, not an expired one. */
    public function test_a_null_end_date_is_entitled(): void
    {
        $this->assertTrue($this->sub(['status' => 'active', 'ends_at' => null])->isEntitled());
    }

    /**
     * The case the status pill gets wrong. Cancelling in Google Play turns off
     * auto-renew; it does not refund the period already paid for.
     */
    public function test_canceled_keeps_access_until_the_paid_period_ends(): void
    {
        $this->assertTrue($this->sub(['status' => 'canceled', 'ends_at' => now()->addWeek()])->isEntitled());
        $this->assertFalse($this->sub(['status' => 'canceled', 'ends_at' => now()->subDay()])->isEntitled());
    }

    /** The regression that already shipped once. */
    public function test_past_due_keeps_access_while_google_retries(): void
    {
        $this->assertTrue($this->sub(['status' => 'past_due', 'ends_at' => now()->addWeek()])->isEntitled());
        $this->assertFalse($this->sub(['status' => 'past_due', 'ends_at' => now()->subDay()])->isEntitled());
    }

    public function test_expired_is_never_entitled(): void
    {
        $this->assertFalse($this->sub(['status' => 'expired', 'ends_at' => now()->addYear()])->isEntitled());
    }

    /**
     * isEntitled() must agree with the query the app gates on. If these two
     * ever disagree, the admin is reading a different truth from the user.
     */
    public function test_it_agrees_with_the_query_the_app_gates_on(): void
    {
        foreach ([
            ['active', 1], ['trialing', 1], ['canceled', 1], ['past_due', 1], ['expired', 1],
            ['active', -1], ['trialing', -1], ['canceled', -1], ['past_due', -1], ['expired', -1],
        ] as [$status, $direction]) {
            $sub = $this->sub([
                'status' => $status,
                'ends_at' => $direction > 0 ? now()->addWeek() : now()->subWeek(),
            ]);

            $viaQuery = $sub->user->activeSubscription() !== null;

            $this->assertSame(
                $viaQuery,
                $sub->isEntitled(),
                "isEntitled() disagreed with activeSubscription() for status={$status}, "
                    . ($direction > 0 ? 'future' : 'past') . ' end date'
            );
        }
    }

    /** Renewal is about money moving again, which a dead row cannot do. */
    public function test_will_renew_requires_both_the_flag_and_a_live_status(): void
    {
        $this->assertTrue($this->sub(['status' => 'active', 'auto_renewing' => true])->willRenew());
        $this->assertTrue($this->sub(['status' => 'past_due', 'auto_renewing' => true])->willRenew());

        $this->assertFalse($this->sub(['status' => 'active', 'auto_renewing' => false])->willRenew());
        $this->assertFalse($this->sub(['status' => 'canceled', 'auto_renewing' => true])->willRenew());
        $this->assertFalse($this->sub(['status' => 'expired', 'auto_renewing' => true])->willRenew());
    }
}
