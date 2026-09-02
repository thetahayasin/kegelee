<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A second short label beside `subject`, and the index the reports read on.
 *
 * `subject` answers "what was this about" - the tour's id, the screen the
 * paywall opened from. A lot of events also need "which kind": a purchase that
 * failed because the customer changed their mind is a different fact from one
 * that failed because the card was declined, and a workout done on the free
 * tier is a different fact from one done by a subscriber.
 *
 * Two short columns rather than digging that out of the JSON `meta`: every
 * report on it is a plain GROUP BY, which SQLite and MySQL both do the same
 * way and both index. A JSON extract is neither.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_events', function (Blueprint $table) {
            if (! Schema::hasColumn('user_events', 'detail')) {
                $table->string('detail', 48)->nullable()->after('subject');
            }
        });

        Schema::table('user_events', function (Blueprint $table) {
            // Every report page asks the same shape: one event name, inside a
            // window, counted per person. Named so a later migration can drop
            // it without guessing what the database called it.
            $table->index(['name', 'occurred_at', 'user_id'], 'user_events_report_index');
        });
    }

    public function down(): void
    {
        Schema::table('user_events', function (Blueprint $table) {
            $table->dropIndex('user_events_report_index');
            $table->dropColumn('detail');
        });
    }
};
