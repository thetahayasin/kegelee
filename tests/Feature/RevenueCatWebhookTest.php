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
            // RevenueCat stamps every event with an id and a timestamp. Both
            // matter here: the id is how a redelivery is recognised, and the
            // timestamp is how an event that overtook a newer one is dropped.
            'id' => 'evt-' . uniqid(),
            'event_timestamp_ms' => now()->getTimestampMs(),
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

    public function test_app_store_purchase_grants_the_matching_premium_plan(): void
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event([
            'store' => 'APP_STORE',
            'product_id' => 'com.kegelee.premium.yearly',
            'entitlement_ids' => ['premium'],
            'transaction_id' => '2000000123456789',
            'expiration_at_ms' => now()->addYear()->getTimestampMs(),
        ]), $this->secret)->assertOk();

        $this->assertDatabaseHas('subscriptions', [
            'user_id' => $this->user->id,
            'plan_id' => Plan::where('slug', 'premium-yearly')->value('id'),
            'store_transaction_id' => '2000000123456789',
            'status' => 'active',
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

    public function test_the_dashboard_test_event_is_acknowledged_and_does_nothing(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event(['type' => 'TEST']), $this->secret)->assertOk();

        $this->assertDatabaseCount('subscriptions', 0);
        $this->assertDatabaseHas('billing_webhook_events', ['source' => 'revenuecat', 'note' => 'test']);
    }

    // ------------------------------------------------------- delivery guarantees

    /**
     * RevenueCat retries on any non-2xx and on a timeout it never saw the
     * answer to, so the same event arrives more than once as a matter of
     * course. The second copy must change nothing.
     */
    public function test_a_redelivered_event_id_is_a_no_op(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $event = $this->event(['id' => 'evt-fixed']);
        $this->send($event, $this->secret)->assertOk();

        // Move the row so a re-application would be visible.
        Subscription::first()->update(['status' => 'canceled', 'auto_renewing' => false]);

        $this->send($event, $this->secret)->assertOk();

        $this->assertSame('canceled', Subscription::first()->status);
        $this->assertDatabaseCount('subscriptions', 1);
        $this->assertDatabaseCount('billing_webhook_events', 1);
    }

    /**
     * Webhooks are not ordered. An EXPIRATION delayed behind the RENEWAL that
     * superseded it would otherwise cancel a subscription the customer has
     * already paid to continue.
     */
    public function test_an_expiration_older_than_the_last_renewal_is_ignored(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event(['event_timestamp_ms' => now()->subHour()->getTimestampMs()]), $this->secret)->assertOk();

        // The renewal lands, pushing the period out.
        $this->send($this->event([
            'type' => 'RENEWAL',
            'event_timestamp_ms' => now()->getTimestampMs(),
            'expiration_at_ms' => now()->addMonths(2)->getTimestampMs(),
        ]), $this->secret)->assertOk();

        // The expiry it replaced arrives late.
        $this->send($this->event([
            'type' => 'EXPIRATION',
            'event_timestamp_ms' => now()->subMinutes(30)->getTimestampMs(),
        ]), $this->secret)->assertOk();

        $sub = Subscription::first();
        $this->assertSame('active', $sub->status, 'a stale expiry must not undo a newer renewal');
        $this->assertTrue($this->user->fresh()->isSubscribed());
        $this->assertDatabaseHas('billing_webhook_events', ['note' => 'stale']);
    }

    /**
     * A terminal event names one transaction. When no row carries it, the
     * answer is "we do not know what this is about" - not "cancel whatever the
     * account happens to be on", which is usually the subscription that
     * REPLACED the expiring one.
     */
    public function test_a_terminal_event_for_an_unknown_transaction_leaves_the_live_row_alone(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);
        $this->send($this->event(), $this->secret)->assertOk();

        $this->send($this->event([
            'type' => 'EXPIRATION',
            'transaction_id' => 'txn-from-a-subscription-we-never-recorded',
        ]), $this->secret)->assertOk();

        $sub = Subscription::first();
        $this->assertSame('active', $sub->status);
        $this->assertTrue($this->user->fresh()->isSubscribed());
        $this->assertDatabaseHas('billing_webhook_events', ['note' => 'unknown_transaction']);
    }

    /**
     * A purchase for an account this server cannot resolve is money taken with
     * nothing to show for it, so it is recorded rather than dropped in silence.
     */
    public function test_an_unresolvable_app_user_id_is_recorded_for_reconciliation(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event(['app_user_id' => 'nobody@example.com']), $this->secret)->assertOk();

        $this->assertDatabaseCount('subscriptions', 0);
        $this->assertDatabaseHas('billing_webhook_events', ['note' => 'unknown_user']);
    }

    /**
     * With no transaction id there is nothing to key the token on, and the old
     * value was built from the user and plan alone - so a second purchase on
     * the same plan collided with the first.
     */
    public function test_a_purchase_without_a_transaction_id_still_gets_a_unique_token(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event(['transaction_id' => '', 'original_transaction_id' => '']), $this->secret)->assertOk();

        $token = Subscription::first()->purchase_token;
        $this->assertStringStartsWith('rc:' . $this->user->id . ':', $token);
        $this->assertGreaterThan(20, strlen($token), 'the synthesised token must carry a uuid');
    }

    // ------------------------------------------------------------------ mail

    /** One welcome email per subscription, however many times the event lands. */
    public function test_a_redelivered_purchase_does_not_re_send_the_welcome_email(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        // Two DIFFERENT event ids for the same transaction, which is what a
        // RevenueCat replay after an id change looks like.
        $this->send($this->event(['id' => 'evt-a']), $this->secret)->assertOk();
        $this->send($this->event(['id' => 'evt-b']), $this->secret)->assertOk();

        Mail::assertSentCount(1);
    }

    // --------------------------------------------------------------- reports

    /**
     * The store is the only witness to money changing hands, so the reports
     * read these events rather than anything the device claims.
     */
    public function test_a_purchase_records_a_subscription_started_event(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event(['period_type' => 'TRIAL']), $this->secret)->assertOk();

        $row = \App\Models\UserEvent::where('name', \App\Models\UserEvent::SUBSCRIPTION_STARTED)->sole();

        $this->assertSame($this->user->id, $row->user_id);
        $this->assertSame('monthly', $row->subject);
        $this->assertSame('trial', $row->detail);
        $this->assertSame(['store' => 'revenuecat'], $row->meta);
    }

    public function test_the_same_event_delivered_twice_records_one_row(): void
    {
        // Webhooks are delivered AT LEAST once. Without an idempotency key
        // every money figure would be inflated by the retry rate.
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $event = $this->event(['id' => 'evt-report-1']);
        $this->send($event, $this->secret)->assertOk();
        $this->send($event, $this->secret)->assertOk();

        $this->assertSame(
            1,
            \App\Models\UserEvent::where('name', \App\Models\UserEvent::SUBSCRIPTION_STARTED)->count(),
        );
    }

    public function test_a_cancellation_records_why_it_ended(): void
    {
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $this->send($this->event(), $this->secret)->assertOk();
        $this->send($this->event(['id' => 'evt-cancel', 'type' => 'CANCELLATION']), $this->secret)->assertOk();

        $row = \App\Models\UserEvent::where('name', \App\Models\UserEvent::SUBSCRIPTION_ENDED)->sole();

        $this->assertSame('monthly', $row->subject);
        $this->assertSame('canceled', $row->detail);
    }

    public function test_an_expiration_records_the_difficulty_going_back(): void
    {
        // The level reset and the subscription ending arrive in one webhook,
        // and they are two facts. Keyed apart, or the second would be dropped
        // as a duplicate of the first.
        config(['services.revenuecat.webhook_secret' => $this->secret]);

        $first = \App\Models\Level::where('is_active', true)->orderBy('number')->firstOrFail();
        $second = \App\Models\Level::where('is_active', true)->where('number', '>', $first->number)->orderBy('number')->firstOrFail();
        $this->user->update(['onboarding_level' => $first->id, 'level_id' => $second->id]);

        $this->send($this->event(), $this->secret)->assertOk();
        $this->send($this->event(['id' => 'evt-expire', 'type' => 'EXPIRATION']), $this->secret)->assertOk();

        $row = \App\Models\UserEvent::where('name', \App\Models\UserEvent::LEVEL_CHANGED)->sole();

        $this->assertSame('down', $row->subject);
        $this->assertSame('lapse', $row->detail);
        $this->assertSame($second->id, $row->meta['from']);
        $this->assertSame($first->id, $row->meta['to']);

        $this->assertSame(
            1,
            \App\Models\UserEvent::where('name', \App\Models\UserEvent::SUBSCRIPTION_ENDED)->count(),
        );
    }
}
