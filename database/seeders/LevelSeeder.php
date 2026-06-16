<?php

namespace Database\Seeders;

use App\Models\Level;
use Illuminate\Database\Seeder;

class LevelSeeder extends Seeder
{
    public function run(): void
    {
        // total_session = full length of a session (sec); rest = pause between
        // exercises (sec). Higher level = longer session. The session packs
        // randomised available exercises (each its own duration) to fill this.
        $levels = [
            ['number' => 1, 'name' => 'Level 1', 'description' => 'Gentle introduction - short sessions.', 'total_session_seconds' => 120, 'rest_seconds' => 12],
            ['number' => 2, 'name' => 'Level 2', 'description' => 'A little longer.', 'total_session_seconds' => 150, 'rest_seconds' => 11],
            ['number' => 3, 'name' => 'Level 3', 'description' => 'Balanced training for steady gains.', 'total_session_seconds' => 180, 'rest_seconds' => 10],
            ['number' => 4, 'name' => 'Level 4', 'description' => 'Longer sessions for stronger muscles.', 'total_session_seconds' => 240, 'rest_seconds' => 10],
            ['number' => 5, 'name' => 'Level 5', 'description' => 'Advanced endurance and control.', 'total_session_seconds' => 300, 'rest_seconds' => 8],
            ['number' => 6, 'name' => 'Level 6', 'description' => 'Expert level - maximum work time.', 'total_session_seconds' => 420, 'rest_seconds' => 8],
        ];

        foreach ($levels as $i => $data) {
            Level::updateOrCreate(
                ['number' => $data['number']],
                $data + [
                    'days_to_complete' => 30,
                    'sessions_per_day' => null, // fall back to global setting
                    'is_active' => true,
                    'sort_order' => $i,
                ],
            );
        }
    }
}
