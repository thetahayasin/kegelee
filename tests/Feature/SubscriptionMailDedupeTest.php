<?php

namespace Tests\Feature;

use App\Mail\SubscriptionCanceledMail;
use App\Mail\SubscriptionRenewedMail;
use App\Mail\SubscriptionStartedMail;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\SubscriptionMailer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * One purchase reaches three code paths - the paywall, the device's sync push
 * and the RevenueCat webhook - and stores redeliver on top of that. Each path
 * used to mail the customer directly, so a single renewal could be announced
 * three times in a minute and a purchase welcomed twice.
 */
class SubscriptionMailDedupeTest extends TestCase
{
    use RefreshDatabase;

    private Subscription $sub;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $user = User::factory()->create();
        // The catalogue is seeded by migration, so take what is there.
        $plan = Plan::where('slug', 'premium-monthly')->firstOrFail();

        $this->sub = Subscription::create([
            'user_id' => $user->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'store' => 'revenuecat',
            'purchase_token' => 'tok-mail-dedupe',
            'started_at' => now(),
            'ends_at' => now()->addMonth(),
            'auto_renewing' => true,
        ]);
    }

    public function test_the_welcome_email_is_sent_once_per_subscription(): void
    {
        $this->assertTrue(SubscriptionMailer::started($this->sub));
        $this->assertFalse(SubscriptionMailer::started($this->sub));
        $this->assertFalse(SubscriptionMailer::started($this->sub->fresh()));

        Mail::assertSent(SubscriptionStartedMail::class, 1);
    }

    /**
     * The renewal key carries the period being announced, so a replay of one
     * renewal is dropped and next month's genuine renewal still mails.
     */
    public function test_a_renewal_mails_once_per_period(): void
    {
        $this->assertTrue(SubscriptionMailer::renewed($this->sub));
        $this->assertFalse(SubscriptionMailer::renewed($this->sub));

        $this->sub->update(['ends_at' => now()->addMonths(2)]);

        $this->assertTrue(SubscriptionMailer::renewed($this->sub->fresh()));

        Mail::assertSent(SubscriptionRenewedMail::class, 2);
    }

    /**
     * A cancellation followed by a refund fires two events for one ending, and
     * telling the customer twice reads as a system stuck in a loop.
     */
    public function test_a_cancellation_is_announced_once(): void
    {
        $this->assertTrue(SubscriptionMailer::canceled($this->sub));
        $this->assertFalse(SubscriptionMailer::canceled($this->sub));

        Mail::assertSent(SubscriptionCanceledMail::class, 1);
    }

    /**
     * A row with no plan is legitimate: an unrecognised product id leaves
     * plan_id empty. Reading ->name off it threw from inside the webhook, which
     * turned a missing plan name into a 500 and a store retry loop.
     */
    public function test_every_mailable_renders_without_a_plan(): void
    {
        $this->sub->update(['plan_id' => null]);
        $sub = $this->sub->fresh();

        foreach ([SubscriptionStartedMail::class, SubscriptionRenewedMail::class, SubscriptionCanceledMail::class] as $mailable) {
            $rendered = (new $mailable($sub))->render();
            $this->assertStringContainsString('Premium', $rendered);
        }
    }
}
