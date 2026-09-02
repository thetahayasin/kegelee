<?php

namespace Tests\Feature;

use App\Models\TrainingDay;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * A pushed session lands on the day the USER trained, not the day UTC was
 * having.
 *
 * The push keyed the training day off the raw instant, while every read
 * (pull's `today`, the day counter, the streak) asks in the user's timezone.
 * For anyone west of Greenwich, an evening session was filed under tomorrow:
 * the day never completed, and the app showed 0/3 minutes after finishing.
 */
class PushTrainingDayTimezoneTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_an_evening_session_in_new_york_counts_for_that_evening(): void
    {
        // 21:35 on Jan 1st in New York, which is already Jan 2nd in UTC.
        Carbon::setTestNow(Carbon::parse('2026-01-02T02:35:00Z'));

        $user = User::factory()->create(['timezone' => 'America/New_York']);

        $res = $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', ['workout_sessions' => [[
                'client_id' => 'evening-session',
                'duration_seconds' => 120,
                // 21:30 local.
                'completed_at_iso' => '2026-01-02T02:30:00Z',
            ]]]);

        $res->assertOk();
        $res->assertJsonPath('synced.sessions', 1);

        $day = TrainingDay::where('user_id', $user->id)->sole();
        $this->assertSame('2026-01-01', $day->date);
        $this->assertSame(1, (int) $day->sessions_count);

        // And the pull agrees, because it asks the same question in the same
        // timezone. This is the pairing that was broken.
        $pull = $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull');

        $pull->assertOk();
        $pull->assertJsonPath('today.done', 1);

        // The instant itself is untouched - only the day key is localised.
        $this->assertSame(
            Carbon::parse('2026-01-02T02:30:00Z')->timestamp,
            $user->workoutSessions()->sole()->completed_at->timestamp,
        );
    }

    public function test_a_user_without_a_timezone_falls_back_to_the_app_timezone(): void
    {
        config(['app.timezone' => 'UTC']);
        Carbon::setTestNow(Carbon::parse('2026-01-02T02:35:00Z'));

        $user = User::factory()->create(['timezone' => null]);

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', ['workout_sessions' => [[
                'client_id' => 'utc-session',
                'duration_seconds' => 120,
                'completed_at_iso' => '2026-01-02T02:30:00Z',
            ]]])->assertOk();

        $this->assertSame('2026-01-02', TrainingDay::where('user_id', $user->id)->sole()->date);
    }
}
