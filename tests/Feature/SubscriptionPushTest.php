<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * A device reports Google Play purchase tokens through /v1/user/push. The
 * backend must verify every unknown token with the Play Developer API before
 * storing it - a forged token must never grant a subscription.
 */
class SubscriptionPushTest extends TestCase
{
    use RefreshDatabase;

    private string $apiKey = 'testing-key-not-a-real-secret';

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.sync_api_key' => $this->apiKey,
            // A syntactically valid (throwaway) service account so the billing
            // service can build its JWT; the HTTP layer is faked below.
            'services.google_play.package_name' => 'com.kegeltrainer.app',
        ]);

        $this->user = User::create([
            'name' => 'Buyer',
            'email' => 'buyer@example.com',
            'password' => bcrypt('secret'),
            'email_verified_at' => now(),
        ]);
    }

    private function push(array $subscription)
    {
        return $this->withHeaders([
            'Authorization' => 'Bearer '.$this->apiKey,
            'X-User-Email' => $this->user->email,
            'X-User-Password-Hash' => $this->user->password,
        ])->postJson('/api/v1/user/push', ['subscriptions' => [$subscription]]);
    }

    public function test_verified_token_creates_subscription_with_google_expiry(): void
    {
        $expiry = now()->addMonth();

        Http::fake([
            'androidpublisher.googleapis.com/*' => Http::response([
                'paymentState' => 1,
                'autoRenewing' => true,
                'orderId' => 'GPA.1234',
                'expiryTimeMillis' => (string) ($expiry->getTimestampMs()),
            ], 200),
        ]);

        // Pre-warm the cached access token so the JWT signing path is skipped.
        \Illuminate\Support\Facades\Cache::put('google_play_access_token', 'fake-token', 3500);

        $res = $this->push([
            'plan_slug' => 'premium-monthly',
            'purchase_token' => 'real-token-123',
            'status' => 'active',
            'store' => 'google_play',
            'started_at' => now()->toIso8601String(),
        ]);

        $res->assertStatus(200);
        $res->assertJsonPath('synced.subscriptions', 1);

        $sub = Subscription::where('purchase_token', 'real-token-123')->first();
        $this->assertNotNull($sub);
        $this->assertSame($this->user->id, $sub->user_id);
        $this->assertSame(Plan::where('slug', 'premium-monthly')->value('id'), $sub->plan_id);
        $this->assertSame('active', $sub->status);
        $this->assertSame('GPA.1234', $sub->google_order_id);
        $this->assertEqualsWithDelta($expiry->timestamp, $sub->ends_at->timestamp, 2);
        $this->assertTrue($this->user->fresh()->isSubscribed());
    }

    public function test_forged_token_is_rejected(): void
    {
        Http::fake([
            'androidpublisher.googleapis.com/*' => Http::response(['error' => 'invalid token'], 400),
        ]);

        // Pre-warm the cached access token so the JWT signing path is skipped.
        \Illuminate\Support\Facades\Cache::put('google_play_access_token', 'fake-token', 3500);

        $res = $this->push([
            'plan_slug' => 'premium-monthly',
            'purchase_token' => 'forged-token',
            'status' => 'active',
        ]);

        $res->assertStatus(200);
        $res->assertJsonPath('synced.subscriptions', 0);
        $this->assertNull(Subscription::where('purchase_token', 'forged-token')->first());
        $this->assertFalse($this->user->fresh()->isSubscribed());
    }

    public function test_known_token_is_not_rewritten_by_pushes(): void
    {
        Http::fake(); // verification must not even be attempted

        Subscription::create([
            'user_id' => $this->user->id,
            'plan_id' => Plan::where('slug', 'premium-monthly')->value('id'),
            'status' => 'canceled',
            'store' => 'google_play',
            'purchase_token' => 'existing-token',
            'started_at' => now()->subMonth(),
            'ends_at' => now()->subDay(),
            'auto_renewing' => false,
        ]);

        $res = $this->push([
            'plan_slug' => 'premium-yearly',
            'purchase_token' => 'existing-token',
            'status' => 'active',
            'ends_at' => now()->addYear()->toIso8601String(),
        ]);

        $res->assertStatus(200);
        $res->assertJsonPath('synced.subscriptions', 0);

        // The backend record stays authoritative - still canceled.
        $sub = Subscription::where('purchase_token', 'existing-token')->first();
        $this->assertSame('canceled', $sub->status);
        Http::assertNothingSent();
    }
}
