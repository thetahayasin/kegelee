<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * What a device gets back when it asks for everything.
 *
 * Three fields were missing, and each of them cost the app something real on a
 * reinstall: how far into the current level the account was, when it had
 * actually finished signing up, and which exercise a pulled workout was.
 */
class PullPayloadTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_returns_the_level_progress_and_the_signup_date(): void
    {
        $user = User::factory()->create([
            'is_admin' => false,
            'level_started_days' => 4,
            'onboarded_at' => now()->subDays(3),
        ]);

        $response = $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull')
            ->assertOk();

        $this->assertSame(4, $response->json('user.level_started_days'));
        $this->assertSame(
            $user->onboarded_at->toIso8601String(),
            $response->json('user.onboarded_at'),
        );
    }

    public function test_a_pulled_workout_carries_its_exercise_slug_and_client_id(): void
    {
        // The app stores exercises by slug - it ships its own catalogue - so a
        // pulled session used to arrive with no exercise on it at all.
        $user = User::factory()->create(['is_admin' => false]);
        $exercise = Exercise::where('is_active', true)->orderBy('sort_order')->firstOrFail();

        WorkoutSession::create([
            'user_id' => $user->id,
            'client_id' => 'pulled-session-1',
            'exercise_id' => $exercise->id,
            'level_id' => $user->level_id,
            'started_at' => now()->subMinutes(3),
            'completed_at' => now(),
            'duration_seconds' => 120,
            'is_extra' => false,
        ]);

        $session = $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull')
            ->assertOk()
            ->json('workout_sessions.0');

        $this->assertSame($exercise->slug, $session['exercise_slug']);
        $this->assertSame('pulled-session-1', $session['client_id']);
    }

    public function test_a_workout_with_no_exercise_still_comes_back(): void
    {
        // Session mode records no exercise at all, and a null there must not
        // turn into a missing row or an error.
        $user = User::factory()->create(['is_admin' => false]);

        WorkoutSession::create([
            'user_id' => $user->id,
            'client_id' => 'pulled-session-2',
            'exercise_id' => null,
            'started_at' => now()->subMinutes(3),
            'completed_at' => now(),
            'duration_seconds' => 120,
        ]);

        $session = $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull')
            ->assertOk()
            ->json('workout_sessions.0');

        $this->assertNull($session['exercise_slug']);
    }
}
