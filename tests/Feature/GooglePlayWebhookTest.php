<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Google Play's notification types are not interchangeable, and treating two of
 * them as the same thing quietly hands out or withholds access.
 *
 * ON_HOLD and IN_GRACE_PERIOD shared one line here and both wrote 'past_due'.
 * They mean opposite things: in a grace period Google is retrying the card and
 * expects the app to keep serving, while account hold means the grace period is
 * over, Google has suspended the subscription and the user has lost access. The
 * shared mapping left an unpaid account entitled for the length of a hold,
 * which can run 30 days.
 *
 * DEFERRED and PAUSED were not handled at all and fell through to `default =>
 * null`, so a deferred renewal kept its stale end date and a paused
 * subscription stayed active indefinitely.
 */
class GooglePlayWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const ON_HOLD = 5;
    private const IN_GRACE_PERIOD = 6;
    private const PAUSED = 10;
    private const REVOKED = 12;
    private const EXPIRED = 13;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function subscription(array $attrs = []): Subscription
    {
        $user = User::factory()->create();
        $plan = Plan::first() ?? Plan::create([
            'name' => 'Monthly',
            'slug' => 'monthly',
            'price' => 599,
            'currency' => 'USD',
            'interval' => 'month',
            'interval_count' => 1,
            'is_active' => true,
            'sort_order' => 1,
        ]);

        return Subscription::create(array_merge([
            'user_id' => $user->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'store' => 'google_play',
            'purchase_token' => 'tok_' . uniqid(),
            'started_at' => now()->subMonth(),
            'ends_at' => now()->addWeeks(2),
            'auto_renewing' => true,
        ], $attrs));
    }

    private function notify(int $type, Subscription $sub)
    {
        $payload = base64_encode(json_encode([
            'subscriptionNotification' => [
                'notificationType' => $type,
                'purchaseToken' => $sub->purchase_token,
                'subscriptionId' => 'premium_monthly',
            ],
        ]));

        return $this->postJson('/webhooks/google-play', ['message' => ['data' => $payload]]);
    }

    /** Grace period keeps the user training: Google is still trying to charge. */
    public function test_grace_period_keeps_access(): void
    {
        $sub = $this->subscription();
        $endsAt = $sub->ends_at;

        $this->notify(self::IN_GRACE_PERIOD, $sub)->assertOk();

        $sub->refresh();
        $this->assertSame('past_due', $sub->status);
        $this->assertTrue($sub->ends_at->equalTo($endsAt), 'grace must not move ends_at');
        $this->assertTrue($sub->isEntitled(), 'a grace period must keep access');
    }

    /** Account hold is the opposite, and used to share a line with grace. */
    public function test_account_hold_removes_access(): void
    {
        $sub = $this->subscription();

        $this->notify(self::ON_HOLD, $sub)->assertOk();

        $sub->refresh();
        $this->assertFalse(
            $sub->isEntitled(),
            'account hold means Google suspended the subscription; access must stop'
        );
        // Recoverable rather than final - RECOVERED restores it from the API.
        $this->assertSame('past_due', $sub->status);
    }

    /** Paused: billing stops at the end of the paid period, like a cancel. */
    public function test_pause_ends_the_subscription_at_the_period_end(): void
    {
        $sub = $this->subscription();

        $this->notify(self::PAUSED, $sub)->assertOk();

        $sub->refresh();
        $this->assertSame('canceled', $sub->status);
        $this->assertFalse((bool) $sub->auto_renewing);
        // Still inside the paid period, so still entitled until it runs out.
        $this->assertTrue($sub->isEntitled());
    }

    /** A refund pulls access immediately, unlike a cancellation. */
    public function test_revocation_removes_access_immediately(): void
    {
        $sub = $this->subscription();

        $this->notify(self::REVOKED, $sub)->assertOk();

        $sub->refresh();
        $this->assertSame('canceled', $sub->status);
        $this->assertFalse($sub->isEntitled(), 'a refund must not leave access behind');
    }

    public function test_expiry_ends_it(): void
    {
        $sub = $this->subscription();

        $this->notify(self::EXPIRED, $sub)->assertOk();

        $sub->refresh();
        $this->assertSame('expired', $sub->status);
        $this->assertFalse($sub->isEntitled());
    }

    /**
     * An unknown token must not 500. Google retries non-2xx, so a notification
     * for a subscription this server has never seen would otherwise be
     * redelivered forever.
     */
    public function test_an_unknown_purchase_token_is_accepted_quietly(): void
    {
        $payload = base64_encode(json_encode([
            'subscriptionNotification' => [
                'notificationType' => self::EXPIRED,
                'purchaseToken' => 'token-that-does-not-exist',
                'subscriptionId' => 'premium_monthly',
            ],
        ]));

        $this->postJson('/webhooks/google-play', ['message' => ['data' => $payload]])
            ->assertOk();
    }

    /** Replays must be safe: Pub/Sub delivers at least once, not exactly once. */
    public function test_repeating_a_notification_is_idempotent(): void
    {
        $sub = $this->subscription();

        $this->notify(self::ON_HOLD, $sub)->assertOk();
        $first = $sub->fresh()->status;

        $this->notify(self::ON_HOLD, $sub)->assertOk();

        $this->assertSame($first, $sub->fresh()->status);
        $this->assertFalse($sub->fresh()->isEntitled());
    }
}
