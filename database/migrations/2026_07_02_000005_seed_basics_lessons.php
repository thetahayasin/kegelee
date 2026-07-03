<?php

use Illuminate\Database\Migrations\Migration;

/**
 * "Learn the basics" changed from streamed videos to three interactive
 * tutorials built into the app. Re-mirror the lesson list so every
 * database (device and backend) carries the new titles.
 */
return new class extends Migration
{
    public function up(): void
    {
        (new \Database\Seeders\KnowledgeSeeder)->run();
    }

    public function down(): void
    {
        // Reference data refresh; nothing to undo.
    }
};
