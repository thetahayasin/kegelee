<?php

namespace Database\Seeders;

use App\Models\Exercise;
use App\Models\Level;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ExerciseSeeder extends Seeder
{
    /**
     * Each exercise: unlock threshold (matching the reference app) and its
     * universal contract / relax rhythm (the beat the circle follows). The run
     * duration is stored per level (scaled from a base) - longer at higher
     * levels - and the level decides the total session time it packs into.
     */
    private array $definitions = [
        // --- Available from day 0 ---
        ['name' => 'Trembling', 'unlock' => 0, 'contract' => 1, 'relax' => 1, 'base' => 30,
            'desc' => 'Rapid short contractions that make the muscle "tremble" and build fast-twitch response.'],
        ['name' => 'Holding', 'unlock' => 0, 'contract' => 3, 'relax' => 3, 'base' => 30,
            'desc' => 'Contract and hold to build baseline endurance in the pelvic floor.'],
        ['name' => 'Front Clamp', 'unlock' => 0, 'contract' => 2, 'relax' => 1, 'base' => 25,
            'desc' => 'Focused contraction of the front pelvic floor muscles.'],
        ['name' => 'Reverse Clamp', 'unlock' => 0, 'contract' => 2, 'relax' => 1, 'base' => 25,
            'desc' => 'Engages the rear pelvic floor for balanced strength.'],
        ['name' => 'Flash', 'unlock' => 0, 'contract' => 0.5, 'relax' => 0.5, 'base' => 20,
            'desc' => 'Very fast flicks to train explosive muscle response.'],
        ['name' => 'Steady Trembling', 'unlock' => 0, 'contract' => 1, 'relax' => 1, 'base' => 30,
            'desc' => 'Sustained trembling contractions at a steady rhythm.'],

        // --- Progressive unlocks (days match the reference app) ---
        ['name' => 'Clamp', 'unlock' => 20, 'contract' => 3, 'relax' => 2, 'base' => 30,
            'desc' => 'A firm full contraction held under control.'],
        ['name' => 'Starter', 'unlock' => 27, 'contract' => 2, 'relax' => 1, 'base' => 25,
            'desc' => 'A warm-up routine to prepare the pelvic floor for harder work.'],
        ['name' => 'Short Holding', 'unlock' => 36, 'contract' => 4, 'relax' => 1, 'base' => 30,
            'desc' => 'Short, strong holds.'],
        ['name' => 'Waves', 'unlock' => 43, 'contract' => 3, 'relax' => 2, 'base' => 30,
            'desc' => 'Wave-like contractions building and releasing tension.'],
        ['name' => 'Pulsation', 'unlock' => 50, 'contract' => 1, 'relax' => 1, 'base' => 30,
            'desc' => 'Rhythmic pulses to improve muscle stamina and timing.'],
        ['name' => 'Push', 'unlock' => 57, 'contract' => 5, 'relax' => 1, 'base' => 36,
            'desc' => 'Push the contraction to its peak and hold firmly.'],
        ['name' => 'Upstairs', 'unlock' => 69, 'contract' => 2, 'relax' => 1, 'base' => 30,
            'desc' => 'Step up the intensity in graduated contractions like climbing stairs.'],
        ['name' => 'Steady Clamp', 'unlock' => 79, 'contract' => 5, 'relax' => 5, 'base' => 40,
            'desc' => 'Long, steady clamps that demand sustained control.'],
        ['name' => 'Downstairs', 'unlock' => 89, 'contract' => 2, 'relax' => 1, 'base' => 30,
            'desc' => 'Graduated release contractions, descending in intensity.'],
        ['name' => 'Long Steady Clamp', 'unlock' => 99, 'contract' => 10, 'relax' => 5, 'base' => 45,
            'desc' => 'Extended maximal holds for peak endurance.'],
        ['name' => 'Elevator', 'unlock' => 109, 'is_premium' => true, 'contract' => 5, 'relax' => 5, 'base' => 40,
            'desc' => 'The signature elevator: lift the contraction and hold at the top.'],
    ];

    public function run(): void
    {
        $levels = Level::orderBy('number')->get();

        foreach ($this->definitions as $i => $def) {
            $exercise = Exercise::updateOrCreate(
                ['slug' => Str::slug($def['name'])],
                [
                    'name' => $def['name'],
                    'description' => $def['desc'],
                    'instructions' => 'Follow the circle: contract when it says "Contract & hold", release when it says "Relax".',
                    'contract_seconds' => $def['contract'],
                    'relax_seconds' => $def['relax'],
                    'unlock_after_days' => $def['unlock'],
                    'is_premium' => $def['is_premium'] ?? false,
                    'is_active' => true,
                    'sort_order' => $i,
                ],
            );

            // Per-level run duration: base, scaled up at higher levels.
            $pivot = [];
            foreach ($levels as $level) {
                $pivot[$level->id] = [
                    'duration_seconds' => round($def['base'] * (1 + 0.15 * ($level->number - 1))),
                ];
            }
            $exercise->levels()->sync($pivot);
        }
    }
}
