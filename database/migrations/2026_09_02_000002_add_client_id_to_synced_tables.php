<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A real idempotency key for the two tables the device pushes.
 *
 * Pushed rows were deduplicated by asking whether another one landed within
 * five seconds of this one. That works because sessions are minutes long, not
 * because it is correct: it is a heuristic standing in where identity belongs,
 * and it both misses genuine duplicates outside the window and would discard a
 * genuine second row inside it.
 *
 * The device now stamps a client_id when it WRITES the row, not when it sends
 * it, so a push that succeeds and loses its reply is recognised as the same row
 * on retry.
 *
 * reminders are deliberately excluded: they already upsert on
 * (user_id, weekday), which is a real natural key and better than a synthetic
 * one. user_events already has this and is the pattern being followed.
 *
 * Nullable, because every row already stored predates the key. The unique index
 * is on the pair, and repeated NULLs do not collide in any engine used here.
 */
return new class extends Migration
{
    private const TABLES = ['workout_sessions', 'measurements'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (! Schema::hasColumn($table, 'client_id')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->string('client_id', 64)->nullable()->after('user_id');
                });
            }

            Schema::table($table, function (Blueprint $t) use ($table) {
                $t->unique(['user_id', 'client_id'], "{$table}_client_id_unique");
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) use ($table) {
                $t->dropUnique("{$table}_client_id_unique");
                $t->dropColumn('client_id');
            });
        }
    }
};
