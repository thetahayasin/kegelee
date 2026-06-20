<?php

namespace Database\Seeders;

use App\Models\Level;
use Illuminate\Database\Seeder;

class LevelSeeder extends Seeder
{
    public function run(): void
    {
        $levels = [
            [
                'number' => 1,
                'name' => 'Level 1',
                'description' => 'Gentle introduction - short sessions.',
                'total_session_seconds' => 60,
                'rest_seconds' => 4,
                'min_exercises' => 3
            ],
            [
                'number' => 2,
                'name' => 'Level 2',
                'description' => 'A little longer.',
                'total_session_seconds' => 120,
                'rest_seconds' => 6,
                'min_exercises' => 4
            ],
            [
                'number' => 3,
                'name' => 'Level 3',
                'description' => 'Balanced training for steady gains.',
                'total_session_seconds' => 180,
                'rest_seconds' => 8,
                'min_exercises' => 5
            ],
            [
                'number' => 4,
                'name' => 'Level 4',
                'description' => 'Longer sessions for stronger muscles.',
                'total_session_seconds' => 240,
                'rest_seconds' => 10,
                'min_exercises' => 6
            ],
            [
                'number' => 5,
                'name' => 'Level 5',
                'description' => 'Advanced endurance and control.',
                'total_session_seconds' => 300,
                'rest_seconds' => 12,
                'min_exercises' => 7
            ],
        ];

        foreach ($levels as $i => $data) {
            Level::updateOrCreate(
                ['number' => $data['number']],
                $data + [
                    'days_to_complete' => 30,
                    'sessions_per_day' => null,
                    'is_active' => true,
                    'sort_order' => $i + 1,
                ]
            );
        }
    }
}
