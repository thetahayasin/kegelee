<?php

use Illuminate\Database\Migrations\Migration;

/**
 * Exercises, levels and plans are hardcoded in code (App\Support catalogues
 * and the fixed PlanSeeder set). Devices never sync them, so this migration
 * mirrors the catalogues into every database - fresh installs and updates
 * alike. The seeders are idempotent (updateOrCreate), so re-running is safe.
 */
return new class extends Migration
{
    public function up(): void
    {
        (new \Database\Seeders\LevelSeeder)->run();
        (new \Database\Seeders\ExerciseSeeder)->run();
        (new \Database\Seeders\PlanSeeder)->run();
        (new \Database\Seeders\PageSeeder)->run();
    }

    public function down(): void
    {
        // Catalogue rows are reference data; nothing to undo.
    }
};
