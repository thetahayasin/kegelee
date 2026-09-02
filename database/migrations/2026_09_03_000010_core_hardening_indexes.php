<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two indexes that encode rules the code already assumed.
 *
 * 1. email_codes (email, purpose) is unique. issue() deleted the old rows and
 *    inserted a new one, which is only atomic by luck: two requests could both
 *    insert, and verify() reads the first row it finds - so one of the two
 *    codes that went out would never work. It is an upsert now, and this index
 *    is what makes that an upsert rather than a race.
 *
 * 2. workout_sessions.created_at gets an index. The admin dashboard groups the
 *    last fortnight of sessions by day; without this that is a full scan of the
 *    biggest table in the schema on every page load.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Any duplicates predate the rule and would block the index. The
        // newest row for each pair is the one that was emailed last, so it is
        // the one worth keeping.
        $duplicates = DB::table('email_codes')
            ->select('email', 'purpose', DB::raw('MAX(id) as keep_id'))
            ->groupBy('email', 'purpose')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicates as $row) {
            DB::table('email_codes')
                ->where('email', $row->email)
                ->where('purpose', $row->purpose)
                ->where('id', '!=', $row->keep_id)
                ->delete();
        }

        Schema::table('email_codes', function (Blueprint $table) {
            $table->unique(['email', 'purpose'], 'email_codes_email_purpose_unique');
        });

        Schema::table('workout_sessions', function (Blueprint $table) {
            $table->index('created_at', 'workout_sessions_created_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('email_codes', function (Blueprint $table) {
            $table->dropUnique('email_codes_email_purpose_unique');
        });

        Schema::table('workout_sessions', function (Blueprint $table) {
            $table->dropIndex('workout_sessions_created_at_index');
        });
    }
};
