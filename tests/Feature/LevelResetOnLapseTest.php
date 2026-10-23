<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A lapsed subscriber goes back to the level their quiz chose.
 *
 * Choosing a difficulty is part of the subscription: the picker is padlocked
 * for a free account. So someone who lapses keeps the level they picked while
 * paying and has no way to leave it, stranded on a level they may not want
 * with paying again as the only exit. onboarding_level is where the app put
 * them on its own judgement, and where a free user would be.
 *
 * This runs on the EXPIRATION webhook rather than in the app, because that is
 * the authoritative moment and it arrives whether or not anyone opens the app.
 */
class LevelResetOnLapseTest extends TestCase
{
    use RefreshDatabase;

    private function seedPlans(): void
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);
    }

    private function secret(): string
    {
        config(['services.revenuecat.webhook_secret' => 'test-secret']);

        return 'test-secret';
    }

    private function send(array $event): \Illuminate\Testing\TestResponse
    {
        return $this->withHeaders(['Authorization' => 'Bearer ' . $this->secret()])
            ->postJson('/webhooks/revenuecat', ['event' => $event]);
    }

    private function subscriber(int $level, int $onboardingLevel): User
    {
        $this->seedPlans();

        $user = User::factory()->create([
            'level_id' => $level,
            'onboarding_level' => $onboardingLevel,
        ]);

        Subscription::create([
            'user_id' => $user->id,
            'plan_id' => Plan::where('slug', 'premium-yearly')->value('id'),
            'status' => 'active',
            'store' => 'revenuecat',
            'purchase_token' => 'TOKEN-1',
            'store_transaction_id' => 'TXN-1',
            'started_at' => now()->subMonths(2),
            'ends_at' => now()->addDay(),
            'auto_renewing' => false,
        ]);

        return $user;
    }

    public function test_expiry_returns_the_user_to_their_quiz_level(): void
    {
        $user = $this->subscriber(level: 5, onboardingLevel: 2);

        $this->send([
            'type' => 'EXPIRATION',
            'app_user_id' => (string) $user->id,
            'product_id' => 'premium_monthly:p1y',
            'transaction_id' => 'TXN-1',
        ])->assertOk();

        $this->assertSame(2, (int) $user->fresh()->level_id);
    }

    public function test_a_revoked_purchase_also_returns_the_level(): void
    {
        // A refund removes access this instant rather than at a period end, so
        // the difficulty goes back with it.
        $user = $this->subscriber(level: 5, onboardingLevel: 1);

        $this->send([
            'type' => 'REVOCATION',
            'app_user_id' => (string) $user->id,
            'product_id' => 'premium_monthly:p1y',
            'transaction_id' => 'TXN-1',
        ])->assertOk();

        $this->assertSame(1, (int) $user->fresh()->level_id);
    }

    public function test_it_leaves_the_level_alone_when_another_subscription_is_live(): void
    {
        // A plan change expires the old row while the new one runs. Dropping a
        // paying customer's difficulty in the middle of that would be its own
        // bug, and a worse one than the problem this solves.
        $user = $this->subscriber(level: 5, onboardingLevel: 2);

        Subscription::create([
            'user_id' => $user->id,
            'plan_id' => Plan::where('slug', 'premium-monthly')->value('id'),
            'status' => 'active',
            'store' => 'revenuecat',
            'purchase_token' => 'TOKEN-2',
            'store_transaction_id' => 'TXN-2',
            'started_at' => now(),
            'ends_at' => now()->addMonth(),
            'auto_renewing' => true,
        ]);

        $this->send([
            'type' => 'EXPIRATION',
            'app_user_id' => (string) $user->id,
            'product_id' => 'premium_monthly:p1y',
            'transaction_id' => 'TXN-1',
        ])->assertOk();

        $this->assertSame(5, (int) $user->fresh()->level_id);
    }

    public function test_an_account_with_no_quiz_level_goes_back_to_level_one(): void
    {
        /**
         * This used to return early and write nothing.
         *
         * Accounts from before onboarding was captured, and accounts whose
         * profile push never landed, have no quiz level to go back to - so
         * the one group with no starting level of its own was also the only
         * group that kept a paid difficulty after lapsing, permanently, with
         * the picker padlocked against fixing it. Level 1 is where every
         * account starts and where the free tier sits, so it is the floor.
         */
        $user = $this->subscriber(level: 4, onboardingLevel: 0);
        $user->update(['onboarding_level' => null]);

        $this->send([
            'type' => 'EXPIRATION',
            'app_user_id' => (string) $user->id,
            'product_id' => 'premium_monthly:p1y',
            'transaction_id' => 'TXN-1',
        ])->assertOk();

        $levelOne = (int) \App\Models\Level::where('number', 1)->value('id');
        $this->assertSame($levelOne, (int) $user->fresh()->level_id);
    }
}
