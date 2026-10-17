<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Close the training days the old free-day cap left open.
 *
 * While the app was paid, a non-subscriber's day stopped completing once the
 * account had used its free allowance: the sessions were stored and counted,
 * but completed_at was never written. The app went free and the cap is gone,
 * but a day only completes when a NEW session arrives, so every day already
 * held back stayed open for good - and the pull handed that back to the
 * device, leaving the plan position and every unlock countdown frozen.
 *
 * Any day that has its required sessions is complete, so it is marked so.
 * updated_at is when its last session landed, which is when it would have
 * closed. Not reversible: there is no way to tell these rows apart afterwards,
 * and nothing should want them open again.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('training_days')
            ->whereNull('completed_at')
            ->whereColumn('sessions_count', '>=', 'required_sessions')
            ->where('sessions_count', '>', 0)
            ->update(['completed_at' => DB::raw('COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)')]);
    }

    public function down(): void
    {
        // Intentionally empty; see above.
    }
};
