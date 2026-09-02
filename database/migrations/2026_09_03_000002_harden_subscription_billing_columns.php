<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The purchase token is the store's primary key for a subscription, but nothing
 * stopped two rows carrying the same one. That is how a redelivered webhook or
 * a repeated sync push ended up with duplicate "active" rows on one account:
 * the admin double-counted them and entitlement kept reading whichever row was
 * newest, including one the store had already stopped honouring.
 *
 * Also adds the columns the ordering and store-state work needs.
 */
return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        // ---- New columns ------------------------------------------------------
        Schema::table('subscriptions', function (Blueprint $table) {
            if (! Schema::hasColumn('subscriptions', 'last_event_at')) {
                // The timestamp of the newest store event applied to this row.
                // Stores deliver out of order, so an EXPIRATION that overtook
                // the RENEWAL which superseded it used to expire a live
                // subscription. This is what lets us drop the older one.
                $table->timestamp('last_event_at')->nullable();
            }

            if (! Schema::hasColumn('subscriptions', 'grace_period_ends_at')) {
                $table->timestamp('grace_period_ends_at')->nullable();
            }

            if (! Schema::hasColumn('subscriptions', 'store_state')) {
                // The store's own word for the state (paused / on_hold /
                // in_grace). Our `status` is deliberately coarser, so without
                // this the reason behind a 'past_due' row was unrecoverable.
                $table->string('store_state', 32)->nullable();
            }

            if (! Schema::hasColumn('subscriptions', 'notes')) {
                $table->text('notes')->nullable();
            }
        });

        // ---- purchase_token: text cannot carry a unique index on MySQL --------
        // SQLite has no ALTER COLUMN and treats every string as TEXT anyway, so
        // it needs (and gets) nothing here.
        if ($driver !== 'sqlite' && Schema::hasColumn('subscriptions', 'purchase_token')) {
            Schema::table('subscriptions', function (Blueprint $table) {
                $table->string('purchase_token', 255)->nullable()->change();
            });
        }

        // ---- De-duplicate before the unique indexes go on --------------------
        // Empty strings are not identifiers; they would collide with each other
        // the moment the index exists.
        DB::table('subscriptions')->where('purchase_token', '')->update(['purchase_token' => null]);
        DB::table('subscriptions')->where('store_transaction_id', '')->update(['store_transaction_id' => null]);

        $this->deduplicate('purchase_token');
        $this->deduplicate('store_transaction_id');

        // ---- Indexes ---------------------------------------------------------
        Schema::table('subscriptions', function (Blueprint $table) {
            // NULL never collides in a unique index on either engine, so rows
            // without a store identifier (admin grants) are unaffected.
            $table->unique('purchase_token');
            $table->unique('store_transaction_id');
            // The entitlement lookup: user, status, and "is it still running".
            $table->index(['user_id', 'status', 'ends_at']);
        });

        // ---- Widen the status enum (MySQL only) ------------------------------
        // SQLite renders an enum as a CHECK constraint it cannot alter, and no
        // code writes these two yet - the store's paused/on_hold states live in
        // `store_state`, while `status` stays coarse. Widening MySQL now means
        // the column is ready if that changes.
        if ($driver === 'mysql') {
            DB::statement(
                "ALTER TABLE subscriptions MODIFY status "
                . "ENUM('trialing','active','past_due','canceled','expired','paused','on_hold') "
                . "NOT NULL DEFAULT 'active'"
            );
        }
    }

    /**
     * Keep the newest row per identifier and release the identifier from the
     * older ones, which are expired at the same time.
     *
     * Deleting them would destroy billing history, and leaving the identifier
     * in place would simply block the index. Releasing it means only the row
     * that actually represents the live purchase answers a token lookup.
     */
    private function deduplicate(string $column): void
    {
        $duplicates = DB::table('subscriptions')
            ->select($column)
            ->whereNotNull($column)
            ->groupBy($column)
            ->havingRaw('COUNT(*) > 1')
            ->pluck($column);

        foreach ($duplicates as $value) {
            $ids = DB::table('subscriptions')
                ->where($column, $value)
                ->orderByDesc('id')
                ->pluck('id');

            $keep = $ids->shift();

            DB::table('subscriptions')->whereIn('id', $ids)->update([
                $column => null,
                'status' => 'expired',
                'auto_renewing' => false,
                'notes' => "Duplicate {$column} released to subscription #{$keep} during the billing migration.",
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropUnique(['purchase_token']);
            $table->dropUnique(['store_transaction_id']);
            $table->dropIndex(['user_id', 'status', 'ends_at']);
            $table->dropColumn(['last_event_at', 'grace_period_ends_at', 'store_state', 'notes']);
        });
    }
};
