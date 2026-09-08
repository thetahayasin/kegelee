<?php

namespace Tests\Feature;

use App\Livewire\Admin\Reports\Money;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * The lapsed count must not depend on the status column being written down.
 *
 * It hand-rolled lapsed() and added `status NOT IN (active, trialing)` on top,
 * which excludes precisely the row whose EXPIRATION never arrived - so the
 * figure dropped the subscriptions it existed to count, and only agreed with
 * reality on days the reconcile sweep had run.
 */
class MoneyReportLapsedCountTest extends TestCase
{
    use RefreshDatabase;

    private function sub(string $status, string $endsAt): void
    {
        Subscription::create([
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

    private function lapsedCount(): int
    {
        $admin = User::factory()->create(['is_admin' => true]);

        // The report caches its build for ten minutes under a key that only
        // varies by window, so each case has to start from a cold cache.
        Cache::flush();

        return Livewire::actingAs($admin)->test(Money::class)->viewData('lapsed');
    }

    public function test_a_row_still_marked_active_past_its_expiry_counts_as_lapsed(): void
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);
        $this->sub('active', now()->subDays(2)->toDateTimeString());

        $this->assertSame(1, $this->lapsedCount());
    }

    public function test_a_row_written_down_as_expired_still_counts(): void
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);
        $this->sub('expired', now()->subDays(2)->toDateTimeString());

        $this->assertSame(1, $this->lapsedCount());
    }

    public function test_a_live_row_does_not_count(): void
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);
        $this->sub('active', now()->addMonth()->toDateTimeString());

        $this->assertSame(0, $this->lapsedCount());
    }
}
