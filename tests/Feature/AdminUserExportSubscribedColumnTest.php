<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The users export's "subscribed now" column, bounded by the date.
 *
 * It counted `status IN (active, trialing)` with no bound on ends_at, so every
 * row whose EXPIRATION never arrived exported as a paying customer - the one
 * unguarded status read left after entitled() was introduced.
 */
class AdminUserExportSubscribedColumnTest extends TestCase
{
    use RefreshDatabase;

    private function subscribe(User $user, string $status, ?string $endsAt): void
    {
        Subscription::create([
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

    private function csv(): string
    {
        $admin = User::factory()->create(['is_admin' => true]);

        $response = $this->actingAs($admin)->get(route('admin.reports.export', 'users'));
        $response->assertOk();

        return $response->streamedContent();
    }

    public function test_a_lapsed_active_row_does_not_export_as_subscribed(): void
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);

        $lapsed = User::factory()->create(['name' => 'Lapsed Larry', 'is_admin' => false]);
        $this->subscribe($lapsed, 'active', now()->subDays(2)->toDateTimeString());

        $this->assertMatchesRegularExpression('/Lapsed Larry.*,no\r?\n/', $this->csv());
    }

    public function test_a_live_row_exports_as_subscribed(): void
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);

        $live = User::factory()->create(['name' => 'Live Lucy', 'is_admin' => false]);
        $this->subscribe($live, 'active', now()->addMonth()->toDateTimeString());

        $this->assertMatchesRegularExpression('/Live Lucy.*,yes\r?\n/', $this->csv());
    }

    public function test_a_cancelled_row_inside_its_paid_period_exports_as_subscribed(): void
    {
        // Still a customer: cancelled, but paid through the end of the period.
        $this->seed(\Database\Seeders\PlanSeeder::class);

        $paid = User::factory()->create(['name' => 'Cancelled Cara', 'is_admin' => false]);
        $this->subscribe($paid, 'canceled', now()->addWeek()->toDateTimeString());

        $this->assertMatchesRegularExpression('/Cancelled Cara.*,yes\r?\n/', $this->csv());
    }
}
