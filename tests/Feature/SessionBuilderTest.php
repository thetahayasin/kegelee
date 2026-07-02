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

            // Exercises keep their natural whole-cycle durations, so the
            // session can only land within about half an exercise (up to
            // 60s + rest) of the level total.
            $this->assertEqualsWithDelta(
                (float) $def['total_session_seconds'],
                $playlist['total'],
                35.0,
                "level $number should run about {$def['total_session_seconds']}s, got {$playlist['total']}s",
            );
        }
    }

    public function test_exercise_durations_follow_level_bounds(): void
    {
        $l1 = \App\Models\Level::where('number', 1)->firstOrFail();
        $l5 = \App\Models\Level::where('number', 5)->firstOrFail();

        // Holding runs 12s at level 1 up to 30s at level 5.
        $holding = \App\Models\Exercise::where('slug', 'holding')->firstOrFail();
        $this->assertEqualsWithDelta(12.0, $holding->durationForLevel($l1), 0.01);
        $this->assertEqualsWithDelta(30.0, $holding->durationForLevel($l5), 0.01);

        // Everything else runs about 20s at level 1 up to 60s at level 5,
        // within one whole movement cycle.
        foreach (\App\Support\ExerciseCatalog::all() as $slug => $def) {
            $exercise = \App\Models\Exercise::where('slug', $slug)->firstOrFail();
            $cycle = $exercise->cycleSeconds();
            [$min, $max] = \App\Support\ExerciseCatalog::durationBounds($slug);

            $this->assertGreaterThanOrEqual($min - $cycle, $exercise->durationForLevel($l1), $slug);
            $this->assertLessThanOrEqual($max + 0.01, $exercise->durationForLevel($l5), $slug);
            $this->assertGreaterThan($exercise->durationForLevel($l1) - 0.01, $exercise->durationForLevel($l5) + 0.01, "$slug should not shrink as levels rise");
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
