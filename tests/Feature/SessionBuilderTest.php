<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SessionBuilder;
use App\Support\LevelCatalog;
use Database\Seeders\ExerciseSeeder;
use Database\Seeders\LevelSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SessionBuilderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(LevelSeeder::class);
        $this->seed(ExerciseSeeder::class);
    }

    private function userAtLevel(int $number): User
    {
        return User::create([
            'name' => 'Test',
            'email' => "level{$number}@example.com",
            'password' => bcrypt('secret'),
            'level_id' => \App\Models\Level::where('number', $number)->value('id'),
        ]);
    }

    public function test_daily_session_lands_near_the_level_total(): void
    {
        foreach (LevelCatalog::all() as $number => $def) {
            $playlist = app(SessionBuilder::class)->daily($this->userAtLevel($number));

            $this->assertNotEmpty($playlist['steps'], "level $number");

            // Whole-cycle quantisation cannot hit the total exactly; it must
            // land within one longest-cycle (15s) of the target.
            $this->assertEqualsWithDelta(
                (float) $def['total_session_seconds'],
                $playlist['total'],
                15.0,
                "level $number should run about {$def['total_session_seconds']}s, got {$playlist['total']}s",
            );
        }
    }

    public function test_steps_carry_keyframes_and_cue_labels(): void
    {
        $playlist = app(SessionBuilder::class)->daily($this->userAtLevel(1));

        foreach ($playlist['steps'] as $step) {
            $this->assertArrayHasKey('label', $step);
            $this->assertArrayHasKey('exercise', $step);

            if ($step['phase'] !== 'rest') {
                $this->assertArrayHasKey('from', $step, 'movement steps are keyframed');
                $this->assertArrayHasKey('to', $step, 'movement steps are keyframed');
            }
        }
    }

    public function test_new_user_only_gets_unlocked_exercises(): void
    {
        $playlist = app(SessionBuilder::class)->daily($this->userAtLevel(1));

        // Day 0 unlocks only Trembling and Holding.
        $this->assertNotEmpty($playlist['exercises']);
        foreach ($playlist['exercises'] as $name) {
            $this->assertContains($name, ['Trembling', 'Holding']);
        }
    }

    public function test_single_run_uses_whole_cycles(): void
    {
        $user = $this->userAtLevel(2);
        $exercise = \App\Models\Exercise::where('slug', 'holding')->firstOrFail();

        $playlist = app(SessionBuilder::class)->single($user, $exercise);

        $cycle = 3.0; // holding: one continuous 3s hold beat, repeated seamlessly
        $this->assertEqualsWithDelta(0.0, fmod($playlist['total'], $cycle), 0.01);
        $this->assertGreaterThanOrEqual($cycle, $playlist['total']);
    }
}
