<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * What a device may and may not decide about its own subscription.
 *
 * The push is the only path where the CLIENT speaks first, so everything that
 * determines entitlement has to come from the store instead: who the
 * subscriber is, which product they bought, and whether the token is theirs.
 */
class SubscriptionPushSecurityTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.revenuecat.api_key' => 'rc-test-key-not-a-real-secret',
            'services.google_play.package_name' => 'com.kegeltrainer.app',
        ]);

        $this->user = User::factory()->create();
    }

    private function push(array $subscription)
    {
        return $this->withHeaders(['X-User-Token' => $this->user->apiToken()])
            ->postJson('/api/v1/user/push', ['subscriptions' => [$subscription]]);
    }

    /** A subscriber payload RevenueCat would return for this account. */
    private function subscriber(string $productId, string $basePlan, ?string $owner = null): array
    {
        return [
            'subscriber' => [
                'original_app_user_id' => $owner ?? (string) $this->user->id,
                'entitlements' => [
                    'premium' => [
                        'expires_date' => now()->addMonth()->toIso8601String(),
                        'period_type' => 'NORMAL',
                        'product_identifier' => $productId,
                        'product_plan_identifier' => $basePlan,
                    ],
                ],
            ],
        ];
    }

    /**
     * The app user id is pinned to the signed-in account. Naming someone
     * else's subscriber id used to be enough to inherit their entitlement.
     */
    public function test_a_foreign_revenuecat_app_user_id_creates_nothing(): void
    {
        Http::fake([
            // The stranger's subscriber does hold a live entitlement...
            'api.revenuecat.com/v1/subscribers/victim-123' => Http::response(
                $this->subscriber('premium_monthly', 'p1y', 'victim-123'),
                200,
            ),
            // ...but ours is who we are allowed to ask about, and has nothing.
            'api.revenuecat.com/*' => Http::response(['subscriber' => ['entitlements' => []]], 200),
        ]);

        $res = $this->push([
            'plan_slug' => 'premium-yearly',
            'purchase_token' => 'stolen-entitlement',
            'store' => 'revenuecat',
            'revenuecat_app_user_id' => 'victim-123',
        ]);

        $res->assertOk();
        $res->assertJsonPath('synced.subscriptions', 0);
        $this->assertSame(0, Subscription::count());
        $this->assertFalse($this->user->fresh()->isSubscribed());

        // The lookup went to OUR id, so the client's never reached RevenueCat.
        Http::assertSent(fn ($request) => str_contains($request->url(), '/subscribers/'.$this->user->id));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'victim-123'));
    }

    /** A subscriber that is not ours is refused even if RevenueCat returns one. */
    public function test_a_subscriber_belonging_to_another_account_is_refused(): void
    {
        Http::fake([
            'api.revenuecat.com/*' => Http::response(
                $this->subscriber('premium_monthly', 'p1y', 'someone-else'),
                200,
            ),
        ]);

        $res = $this->push([
            'plan_slug' => 'premium-yearly',
            'purchase_token' => 'not-my-subscriber',
            'store' => 'revenuecat',
        ]);

        $res->assertJsonPath('synced.subscriptions', 0);
        $this->assertSame(0, Subscription::count());
    }

    /**
     * The plan is read off the verified product, not off the slug the client
     * typed. A month's money must not buy a year of access.
     */
    public function test_the_plan_comes_from_the_verified_product_not_the_pushed_slug(): void
    {
        Http::fake([
            'api.revenuecat.com/*' => Http::response($this->subscriber('premium_monthly', 'monthly'), 200),
        ]);

        $res = $this->push([
            // The client claims the yearly plan...
            'plan_slug' => 'premium-yearly',
            'purchase_token' => 'rc-monthly-token',
            'store' => 'revenuecat',
        ]);

        $res->assertOk();
        $res->assertJsonPath('synced.subscriptions', 1);

        // ...and gets the monthly one, because that is what was bought.
        $sub = Subscription::sole();
        $this->assertSame(Plan::where('slug', 'premium-monthly')->value('id'), $sub->plan_id);
        $this->assertSame('active', $sub->status);
    }

    /** No resolvable product means no row: a plan-less subscription grants
     *  access nobody can price, renew or explain. */
    public function test_an_unknown_product_records_nothing(): void
    {
        Http::fake([
            'api.revenuecat.com/*' => Http::response($this->subscriber('some_other_app_product', ''), 200),
        ]);

        $this->push([
            'plan_slug' => 'premium-monthly',
            'purchase_token' => 'unknown-product-token',
            'store' => 'revenuecat',
        ])->assertJsonPath('synced.subscriptions', 0);

        $this->assertSame(0, Subscription::count());
    }

    /**
     * A purchase token proves ONE account paid. Pushing a token already
     * recorded against another account must not move it.
     */
    public function test_a_token_owned_by_another_account_is_never_re_attributed(): void
    {
        Http::fake();

        $owner = User::factory()->create();
        Subscription::create([
            'user_id' => $owner->id,
            'plan_id' => Plan::where('slug', 'premium-monthly')->value('id'),
            'status' => 'active',
            'store' => 'revenuecat',
            'purchase_token' => 'someone-elses-token',
            'started_at' => now()->subDay(),
            'ends_at' => now()->addMonth(),
            'auto_renewing' => true,
        ]);

        $res = $this->push([
            'plan_slug' => 'premium-monthly',
            'purchase_token' => 'someone-elses-token',
            'store' => 'revenuecat',
        ]);

        $res->assertOk();
        $res->assertJsonPath('synced.subscriptions', 0);

        $this->assertSame($owner->id, Subscription::sole()->user_id);
        $this->assertFalse($this->user->fresh()->isSubscribed());
        // Not even a verification attempt: the token was settled before that.
        Http::assertNothingSent();
    }

    /**
     * Play's API is addressed by SUBSCRIPTION id. Our store_product_id is the
     * base plan (`premium_monthly:p1y`), and sending that whole string 404s on
     * every verify and acknowledge.
     */
    public function test_google_play_verification_uses_the_bare_subscription_id(): void
    {
        Cache::put('google_play_access_token', 'fake-token', 3500);

        Http::fake([
            'androidpublisher.googleapis.com/*' => Http::response([
                'paymentState' => 1,
                'autoRenewing' => true,
                'orderId' => 'GPA.9999',
                'expiryTimeMillis' => (string) now()->addYear()->getTimestampMs(),
            ], 200),
        ]);

        $res = $this->push([
            'plan_slug' => 'premium-yearly',
            'purchase_token' => 'play-token-abc',
            'store' => 'google_play',
        ]);

        $res->assertOk();
        $res->assertJsonPath('synced.subscriptions', 1);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/subscriptions/premium_monthly/tokens/'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'premium_monthly:p1y'));

        $sub = Subscription::sole();
        $this->assertSame(Plan::where('slug', 'premium-yearly')->value('id'), $sub->plan_id);
    }
}
