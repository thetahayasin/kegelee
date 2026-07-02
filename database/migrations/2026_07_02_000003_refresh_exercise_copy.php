<?php

use Illuminate\Database\Migrations\Migration;

/**
 * The exercise rhythms and their wording were corrected after the first
 * catalogue seed, so re-mirror the catalogue into the database. The exercise
 * detail page reads its copy straight from the catalogue in code now, but
 * the database rows should match too.
 */
return new class extends Migration
{
    public function up(): void
    {
        (new \Database\Seeders\ExerciseSeeder)->run();
    }

    public function down(): void
    {
        // Reference data refresh; nothing to undo.
    }
};
