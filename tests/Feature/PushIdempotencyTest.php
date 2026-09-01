<?php

namespace Tests\Feature;

use App\Models\Measurement;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A retried push must not duplicate the row.
 *
 * The device stamps client_id when it WRITES a session, not when it sends one,
 * so a push that succeeded on the server and lost its reply arrives again
 * carrying the same key. That is the case this exists for: the phone has no
 * way to know the difference between "the server never got it" and "the server
 * got it and the reply died".
 *
 * This replaces a +/-5 second window on the timestamp, which was right in
 * practice only because sessions are minutes apart.
 */
class PushIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\PlanSeeder::class);
        $this->user = User::factory()->create(['is_admin' => false]);
    }

    /** Same token header the device uses. */
    private function push(User $as, array $payload)
    {
        return $this->withHeaders(['X-User-Token' => $as->apiToken()])
            ->postJson('/api/v1/user/push', $payload);
    }

    private function sessionPayload(array $overrides = []): array
    {
        return array_merge([
            'client_id' => 'session-abc',
            'exercise_slug' => 'trembling',
            'duration_seconds' => 90,
            'completed_at_iso' => now()->toIso8601String(),
            'is_extra' => false,
        ], $overrides);
    }

    public function test_the_same_session_pushed_twice_is_stored_once(): void
    {
        $this->push($this->user, ['workout_sessions' => [$this->sessionPayload()]])->assertOk();
        $this->push($this->user, ['workout_sessions' => [$this->sessionPayload()]])->assertOk();

        $this->assertSame(1, WorkoutSession::where('user_id', $this->user->id)->count());
    }

    public function test_two_genuinely_different_sessions_both_land(): void
    {
        // The old timestamp window would have discarded the second of these
        // for being within five seconds of the first. Different keys mean
        // different sessions, whatever the clock says.
        $at = now()->toIso8601String();

        $this->push($this->user, ['workout_sessions' => [
            $this->sessionPayload(['client_id' => 'one', 'completed_at_iso' => $at]),
            $this->sessionPayload(['client_id' => 'two', 'completed_at_iso' => $at]),
        ]])->assertOk();

        $this->assertSame(2, WorkoutSession::where('user_id', $this->user->id)->count());
    }

    public function test_a_session_without_a_key_is_refused(): void
    {
        // Clients that do not send one are not supported. Guessing is what
        // this replaced.
        $payload = $this->sessionPayload();
        unset($payload['client_id']);

        $this->push($this->user, ['workout_sessions' => [$payload]])->assertOk();

        $this->assertSame(0, WorkoutSession::where('user_id', $this->user->id)->count());
    }

    public function test_the_same_key_from_a_different_user_is_a_different_row(): void
    {
        // The key is unique per account, not globally. Two phones generating
        // the same string must not collide.
        $this->push($this->user, ['workout_sessions' => [$this->sessionPayload()]])->assertOk();

        $other = User::factory()->create(['is_admin' => false]);
        $this->push($other, ['workout_sessions' => [$this->sessionPayload()]])->assertOk();

        $this->assertSame(1, WorkoutSession::where('user_id', $this->user->id)->count());
        $this->assertSame(1, WorkoutSession::where('user_id', $other->id)->count());
    }

    public function test_measurements_deduplicate_the_same_way(): void
    {
        $measurement = [
            'client_id' => 'measure-abc',
            'seconds' => 42.5,
            'measured_at_iso' => now()->toIso8601String(),
        ];

        $this->push($this->user, ['measurements' => [$measurement]])->assertOk();
        $this->push($this->user, ['measurements' => [$measurement]])->assertOk();

        $this->assertSame(1, Measurement::where('user_id', $this->user->id)->count());
    }
}
