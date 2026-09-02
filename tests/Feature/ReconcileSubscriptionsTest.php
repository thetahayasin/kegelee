<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Webhooks are the fast path, not a guarantee. They are dropped while the app
 * is down, refused while a secret is misconfigured, and skipped for an account
 * the server cannot resolve - and every one of those failures leaves a row
 * saying 'active' with nothing behind it. Entitlement reads that row.
 *
 * This is the slow path that closes the gap, so it has to be safe to run every
 * night: idempotent, and harmless with no credentials.
 */
class ReconcileSubscriptionsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
    }

    private function subscription(array $attrs = []): Subscription
    {
        return Subscription::create(array_merge([
            'user_id' => $this->user->id,
            'plan_id' => Plan::where('slug', 'premium-monthly')->value('id'),
            'status' => 'active',
            'store' => 'revenuecat',
            'purchase_token' => 'tok-' . uniqid(),
            'started_at' => now()->subMonth(),
            'ends_at' => now()->addWeek(),
            'auto_renewing' => true,
        ], $attrs));
    }

    private function fakeSubscriber(?array $subscriber): void
    {
        config(['services.revenuecat.api_key' => 'rc-test-key-not-a-real-secret']);

        Http::fake([
            'api.revenuecat.com/*' => Http::response([
                'subscriber' => $subscriber ?? ['entitlements' => []],
            ], 200),
        ]);
    }

    private function entitled(\Carbon\Carbon $expiry, string $basePlan = 'p1y', array $storeExtras = []): array
    {
        return [
            'original_app_user_id' => (string) $this->user->id,
            'entitlements' => [
                'premium' => [
                    'expires_date' => $expiry->toIso8601String(),
                    'product_identifier' => 'premium_monthly',
                    'product_plan_identifier' => $basePlan,
                ],
            ],
            'subscriptions' => [
                'premium_monthly:' . $basePlan => array_merge([
                    'expires_date' => $expiry->toIso8601String(),
                    'period_type' => 'normal',
                ], $storeExtras),
            ],
        ];
    }

    /** No credentials must mean no damage, not a crash and not a mass expiry. */
    public function test_it_exits_cleanly_when_revenuecat_is_not_configured(): void
    {
        config(['services.revenuecat.api_key' => '']);
        \App\Models\Setting::updateOrCreate(['key' => 'revenuecat_api_key'], ['value' => '']);

        $sub = $this->subscription();

        $this->artisan('subscriptions:reconcile')
            ->expectsOutputToContain('RevenueCat is not configured')
            ->assertExitCode(0);

        $this->assertSame('active', $sub->fresh()->status);
    }

    /** The missed EXPIRATION: nothing live at the store, and the period is over. */
    public function test_it_expires_a_row_the_store_no_longer_honours(): void
    {
        $this->fakeSubscriber(null);

        $sub = $this->subscription(['ends_at' => now()->subHours(2)]);

        $this->artisan('subscriptions:reconcile')->assertExitCode(0);

        $this->assertSame('expired', $sub->fresh()->status);
        $this->assertFalse($this->user->fresh()->isSubscribed());
    }

    /**
     * Inside the paid period it is left alone: RevenueCat can lag a renewal by
     * minutes, and expiring a paying customer is the worse mistake.
     */
    public function test_it_leaves_a_row_alone_while_its_paid_period_is_still_running(): void
    {
        $this->fakeSubscriber(null);

        $sub = $this->subscription(['ends_at' => now()->addWeek()]);

        $this->artisan('subscriptions:reconcile')->assertExitCode(0);

        $this->assertSame('active', $sub->fresh()->status);
    }

    /** The live entitlement is authoritative over whatever the row still says. */
    public function test_it_takes_the_expiry_and_plan_from_the_live_entitlement(): void
    {
        $expiry = now()->addYear();
        $this->fakeSubscriber($this->entitled($expiry, 'p1y'));

        $sub = $this->subscription([
            'plan_id' => Plan::where('slug', 'premium-monthly')->value('id'),
            'ends_at' => now()->subDay(),
            'status' => 'past_due',
        ]);

        $this->artisan('subscriptions:reconcile')->assertExitCode(0);

        $sub->refresh();
        $this->assertSame('active', $sub->status);
        $this->assertSame(Plan::where('slug', 'premium-yearly')->value('id'), $sub->plan_id);
        $this->assertEqualsWithDelta($expiry->timestamp, $sub->ends_at->timestamp, 2);
        $this->assertTrue($this->user->fresh()->isSubscribed());
    }

    /** Auto-renew off at the store has to show here, or the admin cannot see it coming. */
    public function test_it_records_a_cancellation_detected_at_the_store(): void
    {
        $expiry = now()->addMonth();
        $this->fakeSubscriber($this->entitled($expiry, 'monthly', [
            'unsubscribe_detected_at' => now()->subDay()->toIso8601String(),
        ]));

        $sub = $this->subscription();

        $this->artisan('subscriptions:reconcile')->assertExitCode(0);

        $sub->refresh();
        $this->assertSame('canceled', $sub->status);
        $this->assertFalse((bool) $sub->auto_renewing);
        // Still inside the paid period, so still entitled.
        $this->assertTrue($sub->isEntitled());
    }

    public function test_it_records_a_grace_period(): void
    {
        $expiry = now()->addWeeks(2);
        $graceEnds = now()->addDays(10);

        $this->fakeSubscriber($this->entitled($expiry, 'monthly', [
            'billing_issues_detected_at' => now()->subHour()->toIso8601String(),
            'grace_period_expires_date' => $graceEnds->toIso8601String(),
        ]));

        $sub = $this->subscription();

        $this->artisan('subscriptions:reconcile')->assertExitCode(0);

        $sub->refresh();
        $this->assertSame('past_due', $sub->status);
        $this->assertEqualsWithDelta($graceEnds->timestamp, $sub->grace_period_ends_at->timestamp, 2);
        $this->assertTrue($sub->isEntitled(), 'a grace period keeps access');
    }

    /** A second run must change nothing, or this cannot be scheduled. */
    public function test_it_is_idempotent(): void
    {
        $expiry = now()->addYear();
        $this->fakeSubscriber($this->entitled($expiry, 'p1y'));

        $sub = $this->subscription(['ends_at' => now()->subDay()]);

        $this->artisan('subscriptions:reconcile')->assertExitCode(0);
        $first = $sub->fresh()->updated_at;

        $this->artisan('subscriptions:reconcile')->assertExitCode(0);

        $this->assertTrue($first->equalTo($sub->fresh()->updated_at), 'a no-op run must not rewrite the row');
    }

    /**
     * The sweep runs whatever the store says and needs no credentials: a row a
     * day past its expiry that still claims to be active is simply wrong.
     */
    public function test_it_sweeps_long_lapsed_rows_without_asking_the_store(): void
    {
        config(['services.revenuecat.api_key' => '']);
        \App\Models\Setting::updateOrCreate(['key' => 'revenuecat_api_key'], ['value' => '']);

        $sub = $this->subscription([
            'store' => 'google_play',
            'ends_at' => now()->subDays(3),
        ]);

        $this->artisan('subscriptions:reconcile')->assertExitCode(0);

        $this->assertSame('expired', $sub->fresh()->status);
    }
}
