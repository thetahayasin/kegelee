<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The timezone is client-supplied: the device reports its own zone on every
 * sync and the server stores it. Only real IANA zones are accepted, and the
 * sessions pushed under one are always recorded.
 */
class TimezoneManipulationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function pushDay(User $user, string $date, string $prefix): void
    {
        $sessions = [];

        for ($n = 0; $n < 2; $n++) {
            $sessions[] = [
                'client_id' => $prefix.'-'.$n,
                'exercise_slug' => 'trembling',
                'duration_seconds' => 120,
                'completed_at_iso' => $date.'T1'.$n.':00:00+00:00',
            ];
        }

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', array_merge(
                ['workout_sessions' => $sessions],
                ['timezone' => $user->fresh()->timezone],
            ))
            ->assertOk();
    }

    public function test_an_invalid_timezone_is_refused_rather_than_stored(): void
    {
        $user = User::factory()->create(['timezone' => 'Europe/Rome']);

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', ['timezone' => 'Mars/Olympus_Mons'])
            ->assertOk();

        $this->assertSame('Europe/Rome', $user->fresh()->timezone);
    }

    public function test_the_sessions_themselves_are_still_recorded(): void
    {
        $user = User::factory()->create(['is_admin' => false, 'timezone' => 'UTC']);

        $this->pushDay($user, '2026-08-01', 'a');
        $this->pushDay($user, '2026-08-02', 'b');

        $this->assertSame(4, $user->workoutSessions()->count());
        // Both days close: there is no free allowance any more.
        $this->assertSame(2, $user->trainingDays()->whereNotNull('completed_at')->count());
    }
}
