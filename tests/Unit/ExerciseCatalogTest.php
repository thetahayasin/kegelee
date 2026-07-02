<?php

namespace Tests\Unit;

use App\Support\ExerciseCatalog;
use App\Support\LevelCatalog;
use PHPUnit\Framework\TestCase;

class ExerciseCatalogTest extends TestCase
{
    public function test_catalogue_has_all_seventeen_exercises_in_unlock_order(): void
    {
        $all = ExerciseCatalog::all();

        $this->assertCount(17, $all);
        $this->assertSame('trembling', array_key_first($all));
        $this->assertSame('elevator', array_key_last($all));

        $unlocks = array_column($all, 'unlock_after_days');
        $sorted = $unlocks;
        sort($sorted);
        $this->assertSame($sorted, $unlocks, 'unlock days must not decrease across the catalogue');
    }

    public function test_every_definition_is_complete(): void
    {
        foreach (ExerciseCatalog::all() as $slug => $def) {
            $this->assertNotEmpty($def['name'], $slug);
            $this->assertNotEmpty($def['description'], $slug);
            $this->assertNotEmpty($def['how_to'], $slug);
            $this->assertNotEmpty($def['summary'], $slug);
            $this->assertNotEmpty($def['pattern'], $slug);
            $this->assertGreaterThan(0, ExerciseCatalog::cycleSeconds($slug), $slug);

            foreach ($def['pattern'] as $seg) {
                $this->assertContains($seg['phase'], ['contract', 'relax'], $slug);
                $this->assertGreaterThan(0, $seg['seconds'], $slug);
                $this->assertGreaterThanOrEqual(0, min($seg['from'], $seg['to']), $slug);
                $this->assertLessThanOrEqual(1, max($seg['from'], $seg['to']), $slug);
                $this->assertNotSame('', $seg['label'], $slug);
            }
        }
    }

    public function test_user_facing_copy_has_no_long_dashes(): void
    {
        foreach (ExerciseCatalog::all() as $slug => $def) {
            $copy = $def['description'].$def['how_to'].$def['summary']
                .implode('', array_column($def['pattern'], 'label'));

            $this->assertStringNotContainsString("\u{2014}", $copy, $slug); // em dash
            $this->assertStringNotContainsString("\u{2013}", $copy, $slug); // en dash
        }
    }

    public function test_steps_fill_the_duration_with_whole_cycles(): void
    {
        $cycle = ExerciseCatalog::cycleSeconds('holding'); // 1 + 3 + 1 = 5s
        $this->assertEqualsWithDelta(5.0, $cycle, 0.01);

        $steps = ExerciseCatalog::steps('holding', 27.0); // 5 whole cycles
        $this->assertEqualsWithDelta(25.0, array_sum(array_column($steps, 'seconds')), 0.01);
        $this->assertSame(['Contract', 'Hold', 'Release'], array_slice(array_column($steps, 'label'), 0, 3));

        // Shorter than one cycle still plays one full cycle.
        $this->assertEqualsWithDelta(5.0, array_sum(array_column(ExerciseCatalog::steps('holding', 3.0), 'seconds')), 0.01);
    }

    public function test_patterns_hold_only_the_movement_never_a_rest(): void
    {
        // Rest happens BETWEEN exercises (inserted by the SessionBuilder), so
        // no pattern may contain a flat zero-intensity segment or a Rest label.
        foreach (ExerciseCatalog::all() as $slug => $def) {
            foreach ($def['pattern'] as $seg) {
                $this->assertFalse(
                    $seg['from'] === $seg['to'] && (float) $seg['to'] === 0.0,
                    "$slug contains an in-pattern rest segment",
                );
                $this->assertNotSame('Rest', $seg['label'], $slug);
            }
        }
    }

    public function test_elevator_pattern_keeps_its_floor_labels(): void
    {
        $labels = array_column(ExerciseCatalog::get('elevator')['pattern'], 'label');

        $this->assertSame(
            ['Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Top', 'Down 4', 'Down 3', 'Down 2', 'Down 1', 'Ground'],
            $labels,
        );
    }

    public function test_levels_follow_the_minutes_rule(): void
    {
        $levels = LevelCatalog::all();

        $this->assertCount(5, $levels);
        $this->assertSame(90, $levels[1]['total_session_seconds']);   // 1.5 min
        $this->assertSame(120, $levels[2]['total_session_seconds']);  // 2 min
        $this->assertSame(180, $levels[3]['total_session_seconds']);  // 3 min
        $this->assertSame(240, $levels[4]['total_session_seconds']);  // 4 min
        $this->assertSame(300, $levels[5]['total_session_seconds']);  // 5 min
    }
}
