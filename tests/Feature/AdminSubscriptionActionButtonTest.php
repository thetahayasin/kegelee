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
 * The row's action button must agree with the badge beside it.
 *
 * The badge reads effective_status and the button read the raw column, so a
 * row left 'active' with a date in the past showed "Expired / No access" and
 * offered Cancel - an action that would have gone to the Play API for a
 * subscription that had already ended.
 */
class AdminSubscriptionActionButtonTest extends TestCase
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

    private function page(): \Livewire\Features\SupportTesting\Testable
    {
        $admin = User::factory()->create(['is_admin' => true]);

        return Livewire::actingAs($admin)->test(Subscriptions::class);
    }

    public function test_a_lapsed_active_row_offers_reactivate_not_cancel(): void
    {
        $this->sub('active', now()->subDays(2)->toDateTimeString());

        $this->page()
            ->assertSee('Reactivate')
            ->assertDontSee('wire:click="cancel(', false);
    }

    public function test_a_live_row_still_offers_cancel(): void
    {
        $this->sub('active', now()->addMonth()->toDateTimeString());

        $this->page()
            ->assertSee('wire:click="cancel(', false)
            ->assertDontSee('Reactivate');
    }

    public function test_a_cancelled_row_inside_its_period_offers_reactivate(): void
    {
        // Still entitled, but there is nothing left to cancel.
        $this->sub('canceled', now()->addWeek()->toDateTimeString());

        $this->page()->assertSee('Reactivate');
    }
}
