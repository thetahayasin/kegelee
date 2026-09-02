<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When this account last had the app open, near enough.
 *
 * Stamped on every push, which is the only moment the backend hears from a
 * device at all. It is the cheapest possible answer to "is this account still
 * alive": counting app_opened events gives the same shape but needs a scan of
 * the event table, and an account from before events shipped has none.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'last_seen_at')) {
                $table->timestamp('last_seen_at')->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('last_seen_at');
        });
    }
};
