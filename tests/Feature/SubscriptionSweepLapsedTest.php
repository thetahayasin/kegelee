<?php

namespace Tests\Feature;

use App\Livewire\Admin\Subscriptions;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * Lapsed rows get written down without a scheduler.
 *
 * The daily reconcile was the only caller of this sweep, so on a host whose
 * scheduler is not firing the status column drifted indefinitely. The same
 * sweep now runs on the pull endpoint and when an admin opens the
 * subscriptions page, which is enough for a row to correct itself the next
 * time anybody looks at or syncs the account.
 */
class SubscriptionSweepLapsedTest extends TestCase
{
    use RefreshDatabase;

    private function sub(User $user, string $status, ?string $endsAt): Subscription
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);

        return Subscription::create([
            'user_id' => $user->id,
            'plan_id' => Plan::where('slug', 'premium-monthly')->value('id'),
            'status' => $status,
            'store' => 'revenuecat',
            'purchase_token' => 'TOKEN-' . uniqid(),
            'started_at' => now()->subMonths(2),
            'ends_at' => $endsAt,
            'auto_renewing' => true,
        ]);
    }

    public function test_it_expires_a_row_that_ran_out_over_a_day_ago(): void
    {
        $sub = $this->sub(User::factory()->create(), 'active', now()->subDays(3)->toDateTimeString());

        Subscription::sweepLapsed();

        $sub->refresh();
        $this->assertSame('expired', $sub->status);
        $this->assertFalse((bool) $sub->auto_renewing);
    }

    public function test_it_leaves_a_row_inside_the_day_of_slack_alone(): void
    {
        // A renewal and the expiry it replaces are not simultaneous. Writing
        // 'expired' here would lock out a customer whose renewal lands next.
        $sub = $this->sub(User::factory()->create(), 'active', now()->subHours(2)->toDateTimeString());

        Subscription::sweepLapsed();

        $this->assertSame('active', $sub->refresh()->status);
    }

    public function test_it_leaves_live_and_open_ended_rows_alone(): void
    {
        $user = User::factory()->create();
        $live = $this->sub($user, 'active', now()->addMonth()->toDateTimeString());
        $comp = $this->sub($user, 'active', null);

        Subscription::sweepLapsed();

        $this->assertSame('active', $live->refresh()->status);
        $this->assertSame('active', $comp->refresh()->status);
    }

    public function test_it_never_removes_access(): void
    {
        // The safety property the request-path callers rest on: every row the
        // sweep touches was already non-entitled before it ran.
        $sub = $this->sub(User::factory()->create(), 'active', now()->subDays(3)->toDateTimeString());
        $this->assertFalse($sub->isEntitled());

        Subscription::sweepLapsed();

        $this->assertFalse($sub->refresh()->isEntitled());
    }

    public function test_scoping_to_a_user_leaves_other_accounts_untouched(): void
    {
        $mine = User::factory()->create();
        $theirs = User::factory()->create();
        $a = $this->sub($mine, 'active', now()->subDays(3)->toDateTimeString());
        $b = $this->sub($theirs, 'active', now()->subDays(3)->toDateTimeString());

        Subscription::sweepLapsed($mine->id);

        $this->assertSame('expired', $a->refresh()->status);
        $this->assertSame('active', $b->refresh()->status);
    }

    public function test_the_admin_page_writes_lapsed_rows_down_on_load(): void
    {
        $sub = $this->sub(User::factory()->create(), 'active', now()->subDays(3)->toDateTimeString());
        $admin = User::factory()->create(['is_admin' => true]);

        Livewire::actingAs($admin)->test(Subscriptions::class);

        $this->assertSame('expired', $sub->refresh()->status);
    }

    public function test_the_pull_writes_the_syncing_account_down(): void
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        $sub = $this->sub($user, 'active', now()->subDays(3)->toDateTimeString());

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull')
            ->assertOk();

        $this->assertSame('expired', $sub->refresh()->status);
    }

    public function test_the_pull_leaves_a_paying_account_alone(): void
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        $sub = $this->sub($user, 'active', now()->addMonth()->toDateTimeString());

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull')
            ->assertOk();

        $sub->refresh();
        $this->assertSame('active', $sub->status);
        $this->assertTrue($sub->isEntitled());
    }

    public function test_the_status_filter_finds_the_row_once_it_is_written_down(): void
    {
        // The point of sweeping on load: the filter is a WHERE on the raw
        // column, so it can only agree with the badges if the column is right.
        $user = User::factory()->create(['name' => 'Lapsed Larry']);
        $this->sub($user, 'active', now()->subDays(3)->toDateTimeString());
        $admin = User::factory()->create(['is_admin' => true]);

        Livewire::actingAs($admin)->test(Subscriptions::class)
            ->set('filterStatus', 'expired')
            ->assertSee('Lapsed Larry');
    }
}
