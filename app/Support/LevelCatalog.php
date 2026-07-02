<?php

namespace App\Support;

/**
 * The hardcoded training levels - the single source of truth for session
 * length and structure at each difficulty.
 *
 * Level 1 = 1.5 minutes, then the level number is the session length in
 * minutes: level 2 = 2 minutes, level 3 = 3, level 4 = 4, level 5 = 5.
 * The LevelSeeder mirrors this into the database so relations
 * (users.level_id, workout_sessions.level_id) keep working.
 */
final class LevelCatalog
{
    /** @return array<int, array<string, mixed>> keyed by level number */
    public static function all(): array
    {
        return [
            1 => [
                'number' => 1,
                'name' => 'Level 1',
                'description' => 'Gentle start. Short 1.5 minute sessions.',
                'total_session_seconds' => 90,
                'rest_seconds' => 5,
                'min_exercises' => 3,
            ],
            2 => [
                'number' => 2,
                'name' => 'Level 2',
                'description' => 'A little longer. 2 minute sessions.',
                'total_session_seconds' => 120,
                'rest_seconds' => 6,
                'min_exercises' => 3,
            ],
            3 => [
                'number' => 3,
                'name' => 'Level 3',
                'description' => 'Balanced training. 3 minute sessions.',
                'total_session_seconds' => 180,
                'rest_seconds' => 6,
                'min_exercises' => 4,
            ],
            4 => [
                'number' => 4,
                'name' => 'Level 4',
                'description' => 'Longer sessions for stronger muscles. 4 minutes.',
                'total_session_seconds' => 240,
                'rest_seconds' => 8,
                'min_exercises' => 5,
            ],
            5 => [
                'number' => 5,
                'name' => 'Level 5',
                'description' => 'Advanced endurance and control. 5 minutes.',
                'total_session_seconds' => 300,
                'rest_seconds' => 8,
                'min_exercises' => 6,
            ],
        ];
    }
}
