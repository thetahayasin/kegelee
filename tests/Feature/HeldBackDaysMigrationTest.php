<?php

namespace Tests\Feature;

use App\Models\TrainingDay;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Days the old free cap held open are closed once, and nothing else moves.
 */
class HeldBackDaysMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function day(User $user, string $date, int $sessions, int $required, bool $completed = false): TrainingDay
    {
        return TrainingDay::create([
            'user_id' => $user->id,
            'date' => $date,
            'sessions_count' => $sessions,
            'required_sessions' => $required,
            'completed_at' => $completed ? now()->subDays(5) : null,
        ]);
    }

    public function test_a_full_day_left_open_is_closed_and_a_partial_one_is_not(): void
    {
        $user = User::factory()->create();
        $heldBack = $this->day($user, '2026-10-02', 2, 2);
        $partial = $this->day($user, '2026-10-03', 1, 2);
        $done = $this->day($user, '2026-10-01', 2, 2, completed: true);
        $before = $done->fresh()->completed_at->toIso8601String();

        $migration = require database_path('migrations/2026_10_17_000001_complete_days_held_back_by_the_free_cap.php');
        $migration->up();

        $this->assertNotNull($heldBack->fresh()->completed_at);
        $this->assertNull($partial->fresh()->completed_at);
        $this->assertSame($before, $done->fresh()->completed_at->toIso8601String());
    }
}
