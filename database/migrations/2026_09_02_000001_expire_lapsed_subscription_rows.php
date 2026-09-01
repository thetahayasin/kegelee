<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Mark rows expired that ran out without an EXPIRATION event ever arriving.
 *
 * `status` only moves when a webhook says so, and Google Play's notifications
 * were never delivered to RevenueCat until the Pub/Sub topic was wired up - so
 * every subscription that lapsed before then still says 'active' with an
 * expiry in the past.
 *
 * Access was never granted wrongly: activeSubscription() bounds on the date as
 * well. But the admin counted raw status, so lapsed rows were reported as
 * paying customers and a single row could read "Active" and "No access" at
 * once.
 *
 * Only 'active' and 'trialing' are healed. 'canceled' and 'past_due' carry
 * intent worth keeping - one chose to stop, the other had a payment retried -
 * and both already read as finished once their period ends.
 *
 * The accessor added alongside this makes the same correction at read time, so
 * a future missed event cannot reintroduce the contradiction. This migration
 * is for the history already on disk.
 */
return new class extends Migration
{
    public function up(): void
    {
        $healed = DB::table('subscriptions')
            ->whereIn('status', ['active', 'trialing'])
            ->whereNotNull('ends_at')
            ->where('ends_at', '<', now())
            ->update([
                'status' => 'expired',
                'auto_renewing' => false,
            ]);

        if ($healed > 0) {
            \Illuminate\Support\Facades\Log::info(
                "Expired {$healed} subscription rows that had lapsed without an EXPIRATION event."
            );
        }
    }

    public function down(): void
    {
        // Deliberately irreversible. These rows were expired in fact before
        // this ran; restoring 'active' would put the lie back, and there is no
        // record of which of them said 'active' versus 'trialing'.
    }
};
