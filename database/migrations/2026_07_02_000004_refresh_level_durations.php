<?php

use Illuminate\Database\Migrations\Migration;

/**
 * Level 1 sessions changed from 1.5 minutes to 1 minute; re-mirror the
 * level catalogue so existing databases pick up the new durations.
 */
return new class extends Migration
{
    public function up(): void
    {
        (new \Database\Seeders\LevelSeeder)->run();
    }

    public function down(): void
    {
        // Reference data refresh; nothing to undo.
    }
};
