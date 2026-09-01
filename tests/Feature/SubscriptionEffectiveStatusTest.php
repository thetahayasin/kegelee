<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A lapsed subscription must not read as active.
 *
 * `status` only moves when a webhook says so; `ends_at` is a fact recorded at
 * purchase. When an EXPIRATION event never arrives the row keeps saying
 * 'active' with an expiry in the past, which is how the admin came to show
 * "Active" and "No access" on the same row and to count lapsed subscribers as
 * paying ones.
 */
class SubscriptionEffectiveStatusTest extends TestCase
{
    use RefreshDatabase;

    private function sub(string $status, ?string $endsAt): Subscription
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);

        return Subscription::create([
            'user_id' => User::factory()->create()->id,
            'plan_id' => Plan::where('slug', 'premium-monthly')->value('id'),
            'status' => $status,
            'store' => 'revenuecat',
            'purchase_token' => 'TOKEN-' . uniqid(),
            'started_at' => now()->subMonths(2),
            'ends_at' => $endsAt,
            'auto_renewing' => true,
        ]);
    }

    public function test_an_active_row_with_a_past_expiry_reads_as_expired(): void
    {
        $sub = $this->sub('active', now()->subDay()->toDateTimeString());

        $this->assertSame('expired', $sub->effective_status);
        $this->assertFalse($sub->isEntitled());
    }

    public function test_a_trialing_row_with_a_past_expiry_reads_as_expired(): void
    {
        $sub = $this->sub('trialing', now()->subHour()->toDateTimeString());

        $this->assertSame('expired', $sub->effective_status);
    }

    public function test_a_live_subscription_is_untouched(): void
    {
        $sub = $this->sub('active', now()->addMonth()->toDateTimeString());

        $this->assertSame('active', $sub->effective_status);
        $this->assertTrue($sub->isEntitled());
    }

    public function test_an_open_ended_subscription_is_untouched(): void
    {
        // A null expiry is open-ended, not lapsed.
        $sub = $this->sub('active', null);

        $this->assertSame('active', $sub->effective_status);
        $this->assertTrue($sub->isEntitled());
    }

    public function test_cancelled_and_past_due_keep_their_own_status(): void
    {
        // Both carry intent worth keeping: one chose to stop, the other had a
        // payment retried. Both already read as finished once the period ends,
        // so rewriting them to 'expired' would lose information for nothing.
        $cancelled = $this->sub('canceled', now()->subDay()->toDateTimeString());
        $pastDue = $this->sub('past_due', now()->subDay()->toDateTimeString());

        $this->assertSame('canceled', $cancelled->effective_status);
        $this->assertSame('past_due', $pastDue->effective_status);
        $this->assertFalse($cancelled->isEntitled());
        $this->assertFalse($pastDue->isEntitled());
    }

    public function test_a_cancelled_subscription_still_inside_its_period_keeps_access(): void
    {
        // Auto-renew off, but paid through the end of the period.
        $sub = $this->sub('canceled', now()->addWeek()->toDateTimeString());

        $this->assertSame('canceled', $sub->effective_status);
        $this->assertTrue($sub->isEntitled());
    }
}
