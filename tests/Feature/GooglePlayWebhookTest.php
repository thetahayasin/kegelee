<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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
 *
 * The endpoint itself was also unauthenticated: Pub/Sub signs every push with
 * an OIDC token, and nothing checked it, so anyone who knew the URL could
 * expire or extend a subscription by POSTing a purchase token.
 */
class GooglePlayWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const ON_HOLD = 5;
    private const IN_GRACE_PERIOD = 6;
    private const PAUSED = 10;
    private const REVOKED = 12;
    private const EXPIRED = 13;
    private const RENEWED = 2;

    private string $audience = 'https://kegelee.test/webhooks/google-play';

    private string $serviceAccount = 'rtdn-push@kegelee.iam.gserviceaccount.com';

    private string $package = 'com.kegeltrainer.app';

    /** What Google's tokeninfo endpoint answers with. Tests change it in place. */
    private array $tokenClaims = [];

    private int $tokenStatus = 200;

    /** What the Play Developer API answers a purchase lookup with. */
    private array $playPurchase = [];

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        config([
            'services.google_play.package_name' => $this->package,
            'services.google_play.rtdn_audience' => $this->audience,
            'services.google_play.rtdn_service_account' => $this->serviceAccount,
        ]);

        // The claims a genuine Pub/Sub push carries.
        $this->tokenClaims = [
            'iss' => 'https://accounts.google.com',
            'aud' => $this->audience,
            'email' => $this->serviceAccount,
            'email_verified' => 'true',
        ];

        // Registered once and resolved per request, so a test can change the
        // answer by assigning to the property. Calling Http::fake() a second
        // time only APPENDS a stub, and the first match wins - so re-faking in
        // a test would silently keep answering with these.
        Http::fake([
            'oauth2.googleapis.com/tokeninfo*' => fn () => Http::response($this->tokenClaims, $this->tokenStatus),
            'androidpublisher.googleapis.com/*' => fn () => Http::response($this->playPurchase, 200),
        ]);

        // Skips the JWT signing path; there is no real service account here.
        \Illuminate\Support\Facades\Cache::put('google_play_access_token', 'fake-token', 3500);
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

    private function payload(int $type, string $purchaseToken, ?int $eventTimeMs = null): array
    {
        return [
            'version' => '1.0',
            'packageName' => $this->package,
            'eventTimeMillis' => (string) ($eventTimeMs ?? now()->getTimestampMs()),
            'subscriptionNotification' => [
                'version' => '1.0',
                'notificationType' => $type,
                'purchaseToken' => $purchaseToken,
                'subscriptionId' => 'premium_monthly',
            ],
        ];
    }

    /**
     * Post a notification. $messageId is the Pub/Sub message id, which is what
     * makes a redelivery recognisable as one.
     */
    private function pushNotification(array $payload, ?string $messageId = null, ?string $bearer = 'valid-push-token')
    {
        $headers = $bearer === null ? [] : ['Authorization' => 'Bearer ' . $bearer];

        return $this->withHeaders($headers)->postJson('/webhooks/google-play', [
            'message' => [
                'messageId' => $messageId ?? ('msg-' . uniqid()),
                'data' => base64_encode(json_encode($payload)),
            ],
        ]);
    }

    private function notify(int $type, Subscription $sub, ?int $eventTimeMs = null, ?string $messageId = null)
    {
        return $this->pushNotification($this->payload($type, $sub->purchase_token, $eventTimeMs), $messageId);
    }

    // ------------------------------------------------------------ authorization

    public function test_a_push_without_a_token_is_rejected(): void
    {
        $sub = $this->subscription();

        $this->pushNotification($this->payload(self::EXPIRED, $sub->purchase_token), bearer: null)
            ->assertStatus(401);

        $this->assertSame('active', $sub->fresh()->status);
    }

    public function test_a_token_google_will_not_vouch_for_is_rejected(): void
    {
        $this->tokenStatus = 400;

        $sub = $this->subscription();

        $this->notify(self::EXPIRED, $sub)->assertStatus(401);

        $this->assertSame('active', $sub->fresh()->status);
    }

    /**
     * A valid Google token is not enough: it has to be OUR push subscription's
     * token. Any Google account can obtain one for some other audience.
     */
    public function test_a_token_for_another_audience_is_rejected(): void
    {
        $this->tokenClaims['aud'] = 'https://somebody-elses-app.example';

        $sub = $this->subscription();

        $this->notify(self::EXPIRED, $sub)->assertStatus(401);
        $this->assertSame('active', $sub->fresh()->status);
    }

    public function test_a_token_from_another_service_account_is_rejected(): void
    {
        $this->tokenClaims['email'] = 'someone-else@example.iam.gserviceaccount.com';

        $sub = $this->subscription();

        $this->notify(self::EXPIRED, $sub)->assertStatus(401);
        $this->assertSame('active', $sub->fresh()->status);
    }

    /**
     * Unconfigured is our fault, not the caller's, and a 503 makes Pub/Sub hold
     * the notification instead of discarding it.
     */
    public function test_unconfigured_authentication_refuses_the_notification(): void
    {
        config([
            'services.google_play.rtdn_audience' => '',
            'services.google_play.rtdn_service_account' => '',
        ]);

        $sub = $this->subscription();

        $this->notify(self::EXPIRED, $sub)->assertStatus(503);

        $this->assertSame('active', $sub->fresh()->status);
    }

    /** A notification about someone else's app changes nothing here. */
    public function test_a_notification_for_another_package_is_ignored(): void
    {
        $sub = $this->subscription();

        $payload = $this->payload(self::EXPIRED, $sub->purchase_token);
        $payload['packageName'] = 'com.someone.else';

        $this->pushNotification($payload)->assertOk();

        $this->assertSame('active', $sub->fresh()->status);
    }

    // ------------------------------------------------------------ notification types

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
        $this->assertSame('in_grace', $sub->store_state);
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
        $this->assertSame('on_hold', $sub->store_state);
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
        // The status is coarse; this is where a pause stays tellable.
        $this->assertSame('paused', $sub->store_state);
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
        $this->pushNotification($this->payload(self::EXPIRED, 'token-that-does-not-exist'))->assertOk();
    }

    /**
     * And it must not be applied to whatever subscription the account happens
     * to have instead.
     */
    public function test_an_unknown_token_never_touches_a_live_subscription(): void
    {
        $sub = $this->subscription();

        $this->pushNotification($this->payload(self::EXPIRED, 'some-other-token'))->assertOk();

        $this->assertSame('active', $sub->fresh()->status);
        $this->assertTrue($sub->fresh()->isEntitled());
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

    /**
     * The same Pub/Sub message id is the same message, and the second copy must
     * not be processed at all.
     */
    public function test_a_redelivered_message_id_is_dropped(): void
    {
        $sub = $this->subscription();

        $this->notify(self::EXPIRED, $sub, messageId: 'msg-fixed')->assertOk();
        $sub->refresh()->update(['status' => 'active', 'ends_at' => now()->addWeek()]);

        $this->notify(self::EXPIRED, $sub, messageId: 'msg-fixed')->assertOk();

        // Untouched: the redelivery was recognised, not re-applied.
        $this->assertSame('active', $sub->fresh()->status);
        $this->assertDatabaseCount('billing_webhook_events', 1);
    }

    /**
     * Notifications are not ordered. An EXPIRATION that arrives after the
     * renewal which superseded it must not expire a subscription the customer
     * has already paid to continue.
     */
    public function test_an_out_of_order_expiry_is_ignored(): void
    {
        $sub = $this->subscription([
            'last_event_at' => now(),
            'ends_at' => now()->addMonth(),
        ]);

        $this->notify(self::EXPIRED, $sub, eventTimeMs: now()->subHour()->getTimestampMs())->assertOk();

        $sub->refresh();
        $this->assertSame('active', $sub->status);
        $this->assertTrue($sub->isEntitled());
    }

    /** The newer one still applies, so the guard is a guard and not a wall. */
    public function test_a_newer_notification_is_applied(): void
    {
        $sub = $this->subscription(['last_event_at' => now()->subDay()]);

        $this->notify(self::EXPIRED, $sub, eventTimeMs: now()->getTimestampMs())->assertOk();

        $this->assertSame('expired', $sub->fresh()->status);
    }

    /**
     * A renewal re-reads the purchase, and a deferred plan change is exactly
     * where the base plan on the row stops matching what Play is billing.
     */
    public function test_a_renewal_takes_the_plan_from_the_verified_purchase(): void
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);

        $monthly = Plan::where('slug', 'premium-monthly')->first();
        $yearly = Plan::where('slug', 'premium-yearly')->first();
        $sub = $this->subscription(['plan_id' => $monthly->id]);

        $expiry = now()->addYear();

        $this->playPurchase = [
            'expiryTimeMillis' => (string) $expiry->getTimestampMs(),
            'autoRenewing' => true,
            'orderId' => 'GPA.9999',
            'lineItems' => [[
                'productId' => 'premium_monthly',
                'offerDetails' => ['basePlanId' => 'p1y'],
            ]],
        ];

        $this->notify(self::RENEWED, $sub)->assertOk();

        $sub->refresh();
        $this->assertSame($yearly->id, $sub->plan_id, 'the verified base plan names the plan, not the old row');
        $this->assertSame('active', $sub->status);
        $this->assertEqualsWithDelta($expiry->timestamp, $sub->ends_at->timestamp, 2);
    }
}
