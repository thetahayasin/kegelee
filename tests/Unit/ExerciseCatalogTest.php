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
        $cycle = ExerciseCatalog::cycleSeconds('clamp'); // 3s up + 3s down
        $this->assertEqualsWithDelta(6.0, $cycle, 0.01);

        $steps = ExerciseCatalog::steps('clamp', 27.0); // 4 whole cycles
        $this->assertEqualsWithDelta(24.0, array_sum(array_column($steps, 'seconds')), 0.01);
        $this->assertSame(['Contract & hold', 'Relax'], array_slice(array_column($steps, 'label'), 0, 2));

        // Shorter than one cycle still plays one full cycle.
        $this->assertEqualsWithDelta(6.0, array_sum(array_column(ExerciseCatalog::steps('clamp', 3.0), 'seconds')), 0.01);
    }

    public function test_patterns_never_contain_rest_segments(): void
    {
        // Rest happens BETWEEN exercises (inserted by the SessionBuilder);
        // a pattern only ever loops its own movement rhythm.
        foreach (ExerciseCatalog::all() as $slug => $def) {
            foreach ($def['pattern'] as $seg) {
                $this->assertNotSame('Rest', $seg['label'], $slug);
            }
        }
    }

    public function test_signature_rhythms_match_the_original_app(): void
    {
        // Holding: one continuous hold, nothing else.
        $holding = ExerciseCatalog::get('holding')['pattern'];
        $this->assertCount(1, $holding);
        $this->assertSame([1.0, 1.0], [(float) $holding[0]['from'], (float) $holding[0]['to']]);

        // Front Clamp: squeeze up slowly over 3s, then let go at once.
        $front = ExerciseCatalog::get('front-clamp')['pattern'];
        $this->assertEqualsWithDelta(3.0, $front[0]['seconds'], 0.01);
        $this->assertSame([0.0, 1.0], [(float) $front[0]['from'], (float) $front[0]['to']]); // ramp up
        $this->assertSame([0.0, 0.0], [(float) $front[1]['from'], (float) $front[1]['to']]); // instant drop

        // Reverse Clamp mirrors it: an instant squeeze straight into the
        // slow 3s release - no hold in between.
        $reverse = ExerciseCatalog::get('reverse-clamp')['pattern'];
        $this->assertCount(2, $reverse);
        $this->assertLessThan(0.6, $reverse[0]['seconds']); // instant squeeze
        $this->assertSame([0.0, 1.0], [(float) $reverse[0]['from'], (float) $reverse[0]['to']]);
        $this->assertEqualsWithDelta(3.0, $reverse[1]['seconds'], 0.01);
        $this->assertSame([1.0, 0.0], [(float) $reverse[1]['from'], (float) $reverse[1]['to']]); // slow release

        // Steady Trembling: squeeze at once, hold a couple of seconds, then relax.
        $steady = ExerciseCatalog::get('steady-trembling')['pattern'];
        $this->assertSame([1.0, 1.0], [(float) $steady[0]['from'], (float) $steady[0]['to']]);
        $this->assertGreaterThan(1.5, $steady[0]['seconds']);
        $this->assertSame([1.0, 0.0], [(float) $steady[1]['from'], (float) $steady[1]['to']]);

        // Clamp: 3 seconds slowly up, 3 seconds slowly down.
        $clamp = ExerciseCatalog::get('clamp')['pattern'];
        $this->assertEqualsWithDelta(3.0, $clamp[0]['seconds'], 0.01);
        $this->assertEqualsWithDelta(3.0, $clamp[1]['seconds'], 0.01);
        $this->assertSame([0.0, 1.0], [(float) $clamp[0]['from'], (float) $clamp[0]['to']]);
        $this->assertSame([1.0, 0.0], [(float) $clamp[1]['from'], (float) $clamp[1]['to']]);
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
