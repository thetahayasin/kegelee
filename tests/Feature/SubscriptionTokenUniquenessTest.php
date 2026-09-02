<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The purchase token is the store's primary key for a subscription, and nothing
 * used to stop two rows carrying the same one. A redelivered webhook or a
 * repeated sync push was enough to produce duplicate "active" rows on one
 * account: the admin double-counted them, and entitlement read whichever was
 * newest - including one the store had already stopped honouring.
 */
class SubscriptionTokenUniquenessTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::factory()->create();
    }

    private function planId(): int
    {
        return (int) Plan::where('slug', 'premium-monthly')->value('id');
    }

    /** Undo the migration's indexes so duplicates can be planted for it. */
    private function dropTheIndexes(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropUnique(['purchase_token']);
            $table->dropUnique(['store_transaction_id']);
            $table->dropIndex(['user_id', 'status', 'ends_at']);
        });
    }

    private function runTheMigration(): void
    {
        $migration = require database_path('migrations/2026_09_03_000002_harden_subscription_billing_columns.php');
        $migration->up();
    }

    public function test_the_index_rejects_a_second_row_with_the_same_token(): void
    {
        $user = $this->user();

        Subscription::create([
            'user_id' => $user->id,
            'plan_id' => $this->planId(),
            'status' => 'active',
            'store' => 'google_play',
            'purchase_token' => 'tok-shared',
            'ends_at' => now()->addMonth(),
        ]);

        $this->expectException(QueryException::class);

        Subscription::create([
            'user_id' => $user->id,
            'plan_id' => $this->planId(),
            'status' => 'active',
            'store' => 'google_play',
            'purchase_token' => 'tok-shared',
            'ends_at' => now()->addYear(),
        ]);
    }

    /** Rows with no store identifier are not duplicates of each other. */
    public function test_rows_without_a_token_are_unaffected(): void
    {
        $user = $this->user();

        foreach (range(1, 3) as $i) {
            Subscription::create([
                'user_id' => $user->id,
                'plan_id' => $this->planId(),
                'status' => 'expired',
                'store' => 'manual',
                'purchase_token' => null,
                'store_transaction_id' => null,
            ]);
        }

        $this->assertSame(3, Subscription::count());
    }

    /**
     * Existing duplicates have to be resolved before the index can go on, and
     * the newest row is the one that represents the live purchase.
     */
    public function test_the_migration_keeps_the_newest_row_per_token(): void
    {
        $this->dropTheIndexes();

        $user = $this->user();

        $ids = [];
        foreach ([now()->subMonths(2), now()->subMonth(), now()->addMonth()] as $endsAt) {
            $ids[] = DB::table('subscriptions')->insertGetId([
                'user_id' => $user->id,
                'plan_id' => $this->planId(),
                'status' => 'active',
                'store' => 'google_play',
                'purchase_token' => 'tok-duplicated',
                'store_transaction_id' => 'GPA.duplicated',
                'ends_at' => $endsAt,
                'auto_renewing' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $this->runTheMigration();

        $newest = Subscription::find(end($ids));
        $this->assertSame('tok-duplicated', $newest->purchase_token);
        $this->assertSame('GPA.duplicated', $newest->store_transaction_id);
        $this->assertSame('active', $newest->status);

        foreach (array_slice($ids, 0, 2) as $loserId) {
            $loser = Subscription::find($loserId);
            $this->assertNull($loser->purchase_token, 'the older row must release the token');
            $this->assertNull($loser->store_transaction_id);
            $this->assertSame('expired', $loser->status);
            $this->assertFalse((bool) $loser->auto_renewing);
            // Traceable rather than merely gone.
            $this->assertStringContainsString('#' . end($ids), (string) $loser->notes);
        }

        // Exactly one row answers a lookup for that token, which is the whole
        // point: entitlement no longer depends on which duplicate it finds.
        $this->assertSame(1, Subscription::where('purchase_token', 'tok-duplicated')->count());
    }

    /** Empty strings are not identifiers, and they all collide with each other. */
    public function test_the_migration_treats_empty_identifiers_as_absent(): void
    {
        $this->dropTheIndexes();

        $user = $this->user();

        foreach (range(1, 2) as $i) {
            DB::table('subscriptions')->insert([
                'user_id' => $user->id,
                'plan_id' => $this->planId(),
                'status' => 'active',
                'store' => 'manual',
                'purchase_token' => '',
                'store_transaction_id' => '',
                'ends_at' => now()->addMonth(),
                'auto_renewing' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $this->runTheMigration();

        $this->assertSame(0, Subscription::whereNotNull('purchase_token')->count());
        // Both survive as live rows: they were never really duplicates.
        $this->assertSame(2, Subscription::where('status', 'active')->count());
    }
}
