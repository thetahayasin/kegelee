<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Too many subscriptions must not fail the whole push.
 *
 * Local subscription rows only accumulate on a device: every plan change,
 * resubscribe and restore is a new purchase token and therefore a new row, and
 * nothing has ever deleted one. The client sent all of them on every sync,
 * against a cap of ten.
 *
 * Past that, the endpoint answered 422. The client returns early when a push
 * fails, so the pull never ran either: workouts, measurements and events all
 * stopped moving, in both directions, permanently, because of a subscription
 * the account may have finished with long ago. Reinstalling the app was the
 * only thing that cleared it, which is precisely what the reports looked like.
 *
 * The cap is right. Rejecting the request over it was not - the comment beside
 * it already says one bad row must never fail the same sync forever.
 */
class PushSubscriptionCapTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::create([
            'name' => 'Serial Subscriber',
            'email' => 'serial@example.com',
            'password' => bcrypt('secret'),
            'email_verified_at' => now(),
        ]);
    }

    /** More rows than the cap, oldest first so the trim has to sort. */
    private function subscriptions(int $count): array
    {
        return collect(range(1, $count))->map(fn (int $i) => [
            'purchase_token' => 'tok-'.$i,
            'plan_slug' => 'premium-monthly',
            'store' => 'revenuecat',
            'started_at' => now()->subDays($count - $i)->toIso8601String(),
        ])->all();
    }

    public function test_a_long_subscription_list_no_longer_rejects_the_push(): void
    {
        $user = $this->user();

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', [
                'subscriptions' => $this->subscriptions(15),
            ])
            ->assertOk();
    }

    public function test_the_workouts_in_that_push_still_land(): void
    {
        /**
         * The part that actually hurt. A workout has nothing to do with
         * billing, and it was being thrown away because of it.
         */
        $user = $this->user();

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', [
                'subscriptions' => $this->subscriptions(15),
                'workout_sessions' => [[
                    'client_id' => 'session-kept',
                    'exercise_slug' => null,
                    'duration_seconds' => 120,
                    'completed_at_iso' => now()->toIso8601String(),
                ]],
            ])
            ->assertOk();

        $this->assertSame(
            1,
            WorkoutSession::where('user_id', $user->id)->where('client_id', 'session-kept')->count(),
        );
    }

    public function test_a_list_within_the_cap_is_untouched(): void
    {
        $user = $this->user();

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', [
                'subscriptions' => $this->subscriptions(3),
            ])
            ->assertOk();
    }
}
