<?php

namespace Database\Seeders;

use App\Models\Exercise;
use App\Models\Level;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ExerciseSeeder extends Seeder
{
    private array $definitions = [
        [
            'name' => 'Trembling',
            'unlock' => 0,
            'contract' => 0.7,
            'relax' => 0.4,
            'min_duration' => 18,
            'max_duration' => 40,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'relax',
            'contract_glow_mode' => 'at_once',
            'relax_glow_mode' => 'at_once',
            'contract_label' => 'Contract',
            'relax_label' => 'Relax',
            'desc' => 'Rapid short contractions that make the muscle "tremble" and build fast-twitch response.'
        ],
        [
            'name' => 'Holding',
            'unlock' => 0,
            'contract' => 3,
            'relax' => 3,
            'min_duration' => 15,
            'max_duration' => 25,
            'full_hold' => true,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Contract and hold to build baseline endurance in the pelvic floor.'
        ],
        [
            'name' => 'Front Clamp',
            'unlock' => 1,
            'contract' => 2.6,
            'relax' => 0.4,
            'min_duration' => 25,
            'max_duration' => 60,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Focused contraction of the front pelvic floor muscles.'
        ],
        [
            'name' => 'Reverse Clamp',
            'unlock' => 3,
            'contract' => 0.4,
            'relax' => 2.6,
            'min_duration' => 25,
            'max_duration' => 60,
            'full_hold' => false,
            'hold_seconds' => 0.1,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'at_once',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Engages the rear pelvic floor for balanced strength.'
        ],
        [
            'name' => 'Flash',
            'unlock' => 5,
            'contract' => 0.3,
            'relax' => 0.3,
            'min_duration' => 15,
            'max_duration' => 20,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'at_once',
            'relax_glow_mode' => 'at_once',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Very fast flicks to train explosive muscle response.'
        ],
        [
            'name' => 'Steady Trembling',
            'unlock' => 7,
            'contract' => 2.4,
            'relax' => 0.5,
            'min_duration' => 25,
            'max_duration' => 60,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'at_once',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract Slowly',
            'relax_label' => 'Relax',
            'desc' => 'Sustained trembling contractions at a steady rhythm.'
        ],
        [
            'name' => 'Clamp',
            'unlock' => 14,
            'contract' => 3,
            'relax' => 3,
            'min_duration' => 30,
            'max_duration' => 70,
            'full_hold' => false,
            'hold_seconds' => 0.3,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'A firm full contraction held under control.'
        ],
        [
            'name' => 'Starter',
            'unlock' => 20,
            'contract' => 2,
            'relax' => 1,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'A warm-up routine to prepare the pelvic floor for harder work.'
        ],
        [
            'name' => 'Short Holding',
            'unlock' => 36,
            'contract' => 4,
            'relax' => 1,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Short, strong holds.'
        ],
        [
            'name' => 'Waves',
            'unlock' => 43,
            'contract' => 3,
            'relax' => 2,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Wave-like contractions building and releasing tension.'
        ],
        [
            'name' => 'Pulsation',
            'unlock' => 50,
            'contract' => 1,
            'relax' => 1,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Rhythmic pulses to improve muscle stamina and timing.'
        ],
        [
            'name' => 'Push',
            'unlock' => 57,
            'contract' => 5,
            'relax' => 1,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Push the contraction to its peak and hold firmly.'
        ],
        [
            'name' => 'Upstairs',
            'unlock' => 69,
            'contract' => 2,
            'relax' => 1,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Step up the intensity in graduated contractions like climbing stairs.'
        ],
        [
            'name' => 'Steady Clamp',
            'unlock' => 79,
            'contract' => 5,
            'relax' => 5,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Long, steady clamps that demand sustained control.'
        ],
        [
            'name' => 'Downstairs',
            'unlock' => 89,
            'contract' => 2,
            'relax' => 1,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Graduated release contractions, descending in intensity.'
        ],
        [
            'name' => 'Long Steady Clamp',
            'unlock' => 99,
            'contract' => 10,
            'relax' => 5,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'Extended maximal holds for peak endurance.'
        ],
        [
            'name' => 'Elevator',
            'unlock' => 109,
            'contract' => 5,
            'relax' => 5,
            'min_duration' => 30,
            'max_duration' => 120,
            'full_hold' => false,
            'hold_seconds' => 0,
            'start_phase' => 'contract',
            'contract_glow_mode' => 'slowly',
            'relax_glow_mode' => 'slowly',
            'contract_label' => 'Contract & hold',
            'relax_label' => 'Relax',
            'desc' => 'The signature elevator: lift the contraction and hold at the top.'
        ]
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
                    'is_active' => true,
                    'sort_order' => $i,
                    'start_phase' => $def['start_phase'],
                    'contract_label' => $def['contract_label'],
                    'relax_label' => $def['relax_label'],
                    'full_hold' => $def['full_hold'],
                    'contract_glow_mode' => $def['contract_glow_mode'],
                    'relax_glow_mode' => $def['relax_glow_mode'],
                    'hold_seconds' => $def['hold_seconds'],
                    'min_duration' => $def['min_duration'],
                    'max_duration' => $def['max_duration'],
                ]
            );

            // Calculate durations for each level
            $pivot = [];
            $minL = 1;
            $maxL = (int) ($levels->max('number') ?? 5);
            if ($maxL <= $minL) {
                $maxL = $minL + 1;
            }
            $minD = (float) $def['min_duration'];
            $maxD = (float) $def['max_duration'];

            foreach ($levels as $level) {
                $currentL = (int) $level->number;
                if ($currentL <= $minL) {
                    $dur = $minD;
                } elseif ($currentL >= $maxL) {
                    $dur = $maxD;
                } else {
                    $pct = ($currentL - $minL) / ($maxL - $minL);
                    $dur = $minD + $pct * ($maxD - $minD);
                }
                $pivot[$level->id] = [
                    'duration_seconds' => round($dur),
                ];
            }
            $exercise->levels()->sync($pivot);
        }
    }
}
