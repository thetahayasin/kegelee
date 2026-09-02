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

    public function test_it_survives_levels_whose_ids_do_not_match_their_numbers(): void
    {
        /**
         * The one that took production down.
         *
         * onboarding_level is a NUMBER; users.level_id is a foreign key to
         * levels.id. A fresh test database hands out ids 1..5 in number order,
         * so the two look interchangeable and every test passed while the code
         * wrote a number straight into the key. On a database where they have
         * drifted - the seeder matches on `number`, so recreating a level is
         * enough - that is a foreign key violation, thrown on EVERY pull,
         * which took down syncing entirely rather than just the level reset.
         *
         * Push the ids away from the numbers and the difference stops being
         * invisible.
         */
        $user = $this->user(level: 5, onboardingLevel: 2);

        // A level whose number and id cannot coincide: the catalogue seeds
        // 1-5, so this one lands on the next id while carrying number 9.
        // Renumbering the seeded rows instead would only fight the foreign
        // keys already pointing at them.
        $odd = \App\Models\Level::create([
            'number' => 9,
            'name' => 'Drifted',
            'days_to_complete' => 30,
            'is_active' => true,
            'sort_order' => 9,
        ]);
        $this->assertNotSame(9, (int) $odd->id, 'fixture must have id != number');

        $user->update(['onboarding_level' => 9]);
        $this->sub($user, 'expired', now()->subDay());

        // The old code assigned level_id = 9, which no level has.
        $this->pull($user)->assertOk();

        $this->assertSame((int) $odd->id, (int) $user->fresh()->level_id);
    }

    public function test_a_broken_level_reset_can_never_break_the_pull(): void
    {
        // A number no level has. The reset has nowhere to go, and the only
        // acceptable outcome is that the pull is unaffected - it is how every
        // device gets its state, and a convenience must not be able to stop it.
        $user = $this->user(level: 5, onboardingLevel: 4);
        \App\Models\Level::where('number', 4)->delete();
        $this->sub($user, 'expired', now()->subDay());

        $this->pull($user)->assertOk()->assertJsonPath('user.is_subscribed', false);
    }

    public function test_a_lapsed_device_cannot_push_its_paid_level_back(): void
    {
        /**
         * Why the reset never stuck.
         *
         * A sync pushes before it pulls, and the device is still holding the
         * level it had while paying. The push accepted any level from anybody,
         * so: server resets to 2, device pushes 5, server writes 5, and the
         * pull that follows agrees. Every sync, forever - the customer locked
         * to a difficulty they could no longer change, which is the exact state
         * the reset exists to undo.
         */
        $user = $this->user(level: 5, onboardingLevel: 2);
        $this->sub($user, 'expired', now()->subDay());
        $paidLevel = (int) $user->level_id;

        // First sync: the pull performs the reset.
        $this->pull($user)->assertOk()->assertJsonPath('user.level_id', 2);

        // Second sync. The device has not applied the reset yet - it pushes
        // before it pulls - so it offers the level it was on while paying.
        // That offer is what used to undo the reset on every single sync.
        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', ['level_id' => $paidLevel])
            ->assertOk();

        $this->assertSame(2, (int) $user->fresh()->level_id);
        $this->pull($user)->assertOk()->assertJsonPath('user.level_id', 2);
    }

    public function test_a_paying_subscriber_can_still_change_level(): void
    {
        // The picker is theirs while they pay, and this must not take it away.
        $user = $this->user(level: 2, onboardingLevel: 2);
        $this->sub($user, 'active', now()->addMonth());
        $target = (int) \App\Models\Level::where('number', 4)->value('id');

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', ['level_id' => $target])
            ->assertOk();

        $this->assertSame($target, (int) $user->fresh()->level_id);
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
