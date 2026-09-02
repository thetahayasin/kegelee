<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The level reset does not depend on a webhook arriving.
 *
 * LevelResetOnLapseTest covers the fast path: RevenueCat sends EXPIRATION or
 * REVOCATION and the level goes back. That path is fine when it fires, and it
 * was the only one there was. A lapse that arrived any other way - a Play
 * notification rather than a RevenueCat one, a webhook dropped while the app
 * was down, or `ends_at` simply passing with no event behind it - left the
 * account entitled to nothing and stuck on a paid difficulty, because the
 * level picker is padlocked for free accounts. There is no scheduled sweep to
 * catch it either.
 *
 * So the pull derives it instead, which cannot be missed.
 */
class LevelResetOnPullTest extends TestCase
{
    use RefreshDatabase;

    private function user(int $level, ?int $onboardingLevel): User
    {
        $this->seed(\Database\Seeders\PlanSeeder::class);

        return User::factory()->create([
            'level_id' => $level,
            'onboarding_level' => $onboardingLevel,
            'email_verified_at' => now(),
        ]);
    }

    private function sub(User $user, string $status, \DateTimeInterface $endsAt): Subscription
    {
        return Subscription::create([
            'user_id' => $user->id,
            'plan_id' => Plan::where('slug', 'premium-yearly')->value('id'),
            'status' => $status,
            'store' => 'revenuecat',
            'purchase_token' => 'TOKEN-'.$user->id,
            'started_at' => now()->subMonths(2),
            'ends_at' => $endsAt,
            'auto_renewing' => false,
        ]);
    }

    private function pull(User $user): \Illuminate\Testing\TestResponse
    {
        return $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull');
    }

    public function test_a_lapse_with_no_webhook_still_returns_the_level(): void
    {
        // The row is simply out of time. Nothing ever told us so.
        $user = $this->user(level: 5, onboardingLevel: 2);
        $this->sub($user, 'active', now()->subDay());

        $this->pull($user)->assertOk();

        $this->assertSame(2, (int) $user->fresh()->level_id);
    }

    public function test_the_pull_reports_the_returned_level(): void
    {
        $user = $this->user(level: 5, onboardingLevel: 2);
        $this->sub($user, 'expired', now()->subDay());

        $this->pull($user)
            ->assertOk()
            ->assertJsonPath('user.level_id', 2)
            // The same response must also say the account is not entitled, or
            // the device would take the new level and keep the old gate.
            ->assertJsonPath('user.is_subscribed', false);
    }

    public function test_a_paying_subscriber_keeps_their_level(): void
    {
        $user = $this->user(level: 5, onboardingLevel: 2);
        $this->sub($user, 'active', now()->addMonth());

        $this->pull($user)->assertOk();

        $this->assertSame(5, (int) $user->fresh()->level_id);
    }

    public function test_a_cancelled_subscriber_keeps_it_until_the_period_ends(): void
    {
        // Cancelled means auto-renew off, not access off. They paid for this
        // period and the difficulty is part of what they paid for.
        $user = $this->user(level: 5, onboardingLevel: 2);
        $this->sub($user, 'canceled', now()->addWeek());

        $this->pull($user)->assertOk();

        $this->assertSame(5, (int) $user->fresh()->level_id);
    }

    public function test_it_leaves_accounts_with_no_quiz_level_alone(): void
    {
        // Nowhere to go back to. Guessing is worse than leaving it.
        $user = $this->user(level: 4, onboardingLevel: null);
        $this->sub($user, 'expired', now()->subDay());

        $this->pull($user)->assertOk();

        $this->assertSame(4, (int) $user->fresh()->level_id);
    }

    public function test_it_records_the_change_once_not_on_every_pull(): void
    {
        $user = $this->user(level: 5, onboardingLevel: 2);
        $this->sub($user, 'expired', now()->subDay());

        $this->pull($user)->assertOk();
        $this->pull($user)->assertOk();
        $this->pull($user)->assertOk();

        // Idempotent by construction: once the ids match, the method returns
        // before writing anything.
        $this->assertSame(1, \App\Models\UserEvent::where('user_id', $user->id)
            ->where('name', \App\Models\UserEvent::LEVEL_CHANGED)
            ->where('detail', 'lapse')
            ->count());
    }
}
