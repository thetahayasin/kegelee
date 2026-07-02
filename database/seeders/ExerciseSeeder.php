<?php

namespace Database\Seeders;

use App\Models\Exercise;
use App\Support\ExerciseCatalog;
use Illuminate\Database\Seeder;

/**
 * Mirrors the hardcoded {@see ExerciseCatalog} into the database. Exercise
 * timing and content are not editable from the backend; the row exists only
 * so foreign keys (workout_sessions.exercise_id) and slug route binding work.
 */
class ExerciseSeeder extends Seeder
{
    public function run(): void
    {
        foreach (ExerciseCatalog::all() as $slug => $def) {
            Exercise::updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => $def['name'],
                    'description' => $def['description'],
                    'instructions' => $def['how_to'],
                    'unlock_after_days' => $def['unlock_after_days'],
                    'sort_order' => $def['sort_order'],
                    'is_active' => true,
                    // Legacy timing columns are unused by the player (the
                    // catalogue's keyframed pattern drives it) but are kept
                    // consistent so nothing that reads them misbehaves.
                    'contract_seconds' => 0,
                    'relax_seconds' => 0,
                    'hold_seconds' => 0,
                    'min_duration' => 0,
                    'max_duration' => 0,
                    'full_hold' => false,
                    'start_phase' => 'contract',
                    'contract_glow_mode' => 'slowly',
                    'relax_glow_mode' => 'slowly',
                    'contract_label' => 'Contract',
                    'relax_label' => 'Relax',
                ]
            );
        }

        // Retire anything not in the catalogue.
        Exercise::whereNotIn('slug', array_keys(ExerciseCatalog::all()))->update(['is_active' => false]);
    }
}
