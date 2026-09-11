<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Services\RevenueCatService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Resolving a store product id to a plan.
 *
 * All three plans are base plans of the single `premium_monthly` Play
 * subscription, which is what makes the free trial once per account instead of
 * once per plan: Play scopes trial eligibility to the subscription.
 *
 * The consequence worth pinning is that the parent id alone identifies
 * nothing. Anything that strips the base plan suffix answers "1 Month" for a
 * yearly purchase, and every renewal, expiry and revenue figure downstream
 * inherits a customer recorded on a tenth of what they paid.
 */
class PlanResolutionTest extends TestCase
{
    use RefreshDatabase;

    private function service(): RevenueCatService
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);

        return app(RevenueCatService::class);
    }

    public function test_it_resolves_each_base_plan(): void
    {
        $service = $this->service();

        $this->assertSame('premium-monthly', $service->resolvePlan('premium_monthly:monthly')?->slug);
        $this->assertSame('premium-quarterly', $service->resolvePlan('premium_monthly:p3m')?->slug);
        $this->assertSame('premium-yearly', $service->resolvePlan('premium_monthly:p1y')?->slug);
    }

    public function test_it_carries_the_right_price_with_the_right_plan(): void
    {
        $service = $this->service();

        $this->assertSame(5.99, $service->resolvePlan('premium_monthly:monthly')?->price);
        $this->assertSame(15.99, $service->resolvePlan('premium_monthly:p3m')?->price);
        $this->assertSame(59.99, $service->resolvePlan('premium_monthly:p1y')?->price);
    }

    public function test_app_store_products_resolve_to_the_same_plans_as_play(): void
    {
        $service = $this->service();

        $this->assertSame(
            $service->resolvePlan('premium_monthly:monthly')?->id,
            $service->resolvePlan('com.kegelee.premium.monthly')?->id,
        );
        $this->assertSame('premium-quarterly', $service->resolvePlan('com.kegelee.premium.quarterly')?->slug);
        $this->assertSame('premium-yearly', $service->resolvePlan('com.kegelee.premium.yearly')?->slug);
        $this->assertNull($service->resolvePlan('com.kegelee.premium.unknown'));
        $this->assertNull($service->resolvePlan('com.kegelee.premium.yearly:monthly'));
    }

    public function test_it_refuses_to_guess_from_the_parent_subscription(): void
    {
        // `premium_monthly` is the parent of all three base plans, so resolving
        // it to any one of them is a coin flip on somebody's money.
        $this->assertNull($this->service()->resolvePlan('premium_monthly'));
    }

    public function test_it_declines_anything_it_does_not_recognise(): void
    {
        $service = $this->service();

        $this->assertNull($service->resolvePlan(''));
        $this->assertNull($service->resolvePlan('   '));
        $this->assertNull($service->resolvePlan('premium_monthly:nope'));
        $this->assertNull($service->resolvePlan('something_else'));
    }

    public function test_an_inactive_plan_is_not_resolved(): void
    {
        $service = $this->service();
        Plan::where('slug', 'premium-yearly')->update(['is_active' => false]);

        // is_active is how a plan gets retired, so it has to gate the lookup.
        $this->assertNull($service->resolvePlan('premium_monthly:p1y'));
        $this->assertNull($service->resolvePlan('com.kegelee.premium.yearly'));
    }

    public function test_the_seeded_catalogue_matches_play(): void
    {
        $this->service();

        // Verified against the live Play catalogue. A base plan id can never be
        // renamed once created, so these are fixed for the life of the app.
        $this->assertSame(
            ['premium_monthly:monthly', 'premium_monthly:p3m', 'premium_monthly:p1y'],
            Plan::orderBy('sort_order')->pluck('store_product_id')->all(),
        );
    }
}
