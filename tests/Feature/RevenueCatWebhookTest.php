<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The RevenueCat webhook creates subscriptions straight out of its request
 * body, so its authorization is a security boundary, not a nicety.
 *
 * It used to skip the check entirely whenever no secret was configured - and
 * the secret defaults to empty - so any unauthenticated POST could hand a free
 * subscription of arbitrary length to any account, addressed by email. These
 * tests pin the endpoint shut.
 */
class RevenueCatWebhookTest extends TestCase
{
    use RefreshDatabase;

    private string $secret = 'testing-webhook-secret-not-real';

    private User $user;

    private Plan $plan;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $this->user = User::create([
            'name' => 'Subscriber',
            'email' => 'subscriber@example.com',
            'password' => bcrypt('secret'),
            'email_verified_at' => now(),
        ]);

        $this->plan = Plan::create([
            'name' => 'Monthly',
            'slug' => 'monthly',
            'price' => 9.99,
            'currency' => 'USD',
            'interval' => 'month',
            'interval_count' => 1,
            'store_product_id' => 'kegelee_monthly',
            'is_active' => true,
        ]);
    }

    private function event(array $overrides = []): array
    {
        return ['event' => array_merge([
            'type' => 'INITIAL_PURCHASE',
            'app_user_id' => (string) $this->user->id,
            'product_id' => 'kegelee_monthly',
            'transaction_id' => 'txn-1',
            'period_type' => 'NORMAL',
            'purchased_at_ms' => now()->getTimestampMs(),
            'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
            'store' => 'PLAY_STORE',
        ], $overrides)];
    }

    private function send(array $payload, ?string $bearer = null)
    {
        $headers = $bearer === null ? [] : ['Authorization' => 'Bearer ' . $bearer];

        return $this->withHeaders($headers)->postJson('/webhooks/revenuecat', $payload);
    }

    // ------------------------------------------------------------ authorization

    public function test_unconfigured_secret_rejects_the_event_instead_of_trusting_it(): void
    {
        config(['services.revenuecat.webhook_secret' => '']);

        $this->send($this->event())->assertStatus(503);

        $this->assertDatabaseCount('subscriptions', 0);
        $this->assertFalse($this->user->fresh()->isSubscribed());
    }

    public function test_forged_event_without_the_secret_cannot_mint_a_subscription(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        // The attack the old code allowed: address a victim by email and name
        // your own expiry.
        $this->send($this->event([
            'app_user_id' => 'subscriber@example.com',
            'expiration_at_ms' => now()->addYears(10)->getTimestampMs(),
        ]))->assertStatus(401);

        $this->assertDatabaseCount('subscriptions', 0);
        $this->assertFalse($this->user->fresh()->isSubscribed());
    }

    public function test_wrong_secret_is_rejected(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event(), 'not-the-secret')->assertStatus(401);

        $this->assertDatabaseCount('subscriptions', 0);
    }

    public function test_correct_secret_is_accepted_and_creates_the_subscription(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event(), $this->secret)->assertOk();

        $this->assertDatabaseHas('subscriptions', [
            'user_id' => $this->user->id,
            'status' => 'active',
            'store_transaction_id' => 'txn-1',
        ]);
        $this->assertTrue($this->user->fresh()->isSubscribed());
    }

    // ------------------------------------------------------------ grace period

    public function test_billing_issue_keeps_access_for_the_period_already_paid_for(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);
        $this->send($this->event(), $this->secret)->assertOk();

        $this->send($this->event(['type' => 'BILLING_ISSUE']), $this->secret)->assertOk();

        $sub = Subscription::first();
        $this->assertSame('past_due', $sub->status);
        // Google is still retrying the card. Its grace period is defined as the
        // window where the subscriber keeps access; cutting them off here is
        // what locked out paying customers.
        $this->assertTrue($this->user->fresh()->isSubscribed());
    }

    public function test_past_due_stops_granting_access_once_the_paid_period_ends(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);
        $this->send($this->event(), $this->secret)->assertOk();
        $this->send($this->event(['type' => 'BILLING_ISSUE']), $this->secret)->assertOk();

        Subscription::first()->update(['ends_at' => now()->subDay()]);

        $this->assertFalse($this->user->fresh()->isSubscribed());
    }

    public function test_expiration_revokes_access(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);
        $this->send($this->event(), $this->secret)->assertOk();

        $this->send($this->event(['type' => 'EXPIRATION']), $this->secret)->assertOk();

        $this->assertSame('expired', Subscription::first()->status);
        $this->assertFalse($this->user->fresh()->isSubscribed());
    }

    // -------------------------------------------------- previously dropped events

    public function test_pause_keeps_access_until_the_paid_period_ends(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);
        $this->send($this->event(), $this->secret)->assertOk();

        $this->send($this->event(['type' => 'SUBSCRIPTION_PAUSED']), $this->secret)->assertOk();

        $sub = Subscription::first();
        $this->assertSame('canceled', $sub->status);
        $this->assertFalse((bool) $sub->auto_renewing);
        $this->assertTrue($this->user->fresh()->isSubscribed());
    }

    public function test_extension_pushes_the_expiry_out_but_never_pulls_it_in(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);
        $this->send($this->event(), $this->secret)->assertOk();
        $original = Subscription::first()->ends_at;

        $this->send($this->event([
            'type' => 'SUBSCRIPTION_EXTENDED',
            'expiration_at_ms' => now()->addMonths(3)->getTimestampMs(),
        ]), $this->secret)->assertOk();
        $this->assertTrue(Subscription::first()->ends_at->greaterThan($original));

        // An "extension" that shortens the period is not an extension.
        $this->send($this->event([
            'type' => 'SUBSCRIPTION_EXTENDED',
            'expiration_at_ms' => now()->addDay()->getTimestampMs(),
        ]), $this->secret)->assertOk();
        $this->assertTrue(Subscription::first()->ends_at->greaterThan(now()->addMonths(2)));
    }

    public function test_transfer_away_removes_entitlement_from_the_old_account(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);
        $this->send($this->event(), $this->secret)->assertOk();
        $this->assertTrue($this->user->fresh()->isSubscribed());

        $this->send(['event' => [
            'type' => 'TRANSFER',
            'app_user_id' => (string) $this->user->id,
            'transferred_from' => [(string) $this->user->id],
            'transferred_to' => ['999'],
        ]], $this->secret)->assertOk();

        // One purchase must not keep unlocking every account it ever touched.
        $this->assertSame('expired', Subscription::first()->status);
        $this->assertFalse($this->user->fresh()->isSubscribed());
    }

    public function test_unknown_event_types_are_ignored_without_failing(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event(['type' => 'SOMETHING_NEW']), $this->secret)->assertOk();

        $this->assertDatabaseCount('subscriptions', 0);
    }
}
