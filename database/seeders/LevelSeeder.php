<?php

namespace Database\Seeders;

use App\Models\Level;
use App\Support\LevelCatalog;
use Illuminate\Database\Seeder;

/**
 * Mirrors the hardcoded {@see LevelCatalog} into the database. Levels are not
 * editable from the backend; this exists only so relations keep working.
 */
class LevelSeeder extends Seeder
{
    public function run(): void
    {
        foreach (LevelCatalog::all() as $i => $data) {
            Level::updateOrCreate(
                ['number' => $data['number']],
                $data + [
                    'days_to_complete' => 30,
                    'sessions_per_day' => null,
                    'is_active' => true,
                    'sort_order' => $i,
                ]
            );
        }

        // Retire any level that is no longer in the catalogue.
        Level::whereNotIn('number', array_keys(LevelCatalog::all()))->update(['is_active' => false]);
    }
}
