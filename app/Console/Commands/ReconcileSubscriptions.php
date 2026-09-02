<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Services\RevenueCatService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Bring the subscriptions table back in line with what the store actually says.
 *
 * Webhooks are the fast path, not a guarantee: they can be dropped while the
 * app is down, refused while a secret is misconfigured, or arrive for an
 * account this server cannot resolve. Every one of those failures leaves a row
 * saying 'active' with nothing behind it, and entitlement reads that row. This
 * is the slow path that closes the gap, and it is safe to run on a schedule.
 */
class ReconcileSubscriptions extends Command
{
    protected $signature = 'subscriptions:reconcile
                            {--limit=0 : Stop after this many subscribers (0 = all)}';

    protected $description = 'Re-read live RevenueCat state and correct subscriptions that drifted';

    public function handle(RevenueCatService $revenueCat): int
    {
        // Runs first and unconditionally: a row whose paid period ended a day
        // ago is expired whatever any API says, and this needs no credentials.
        $swept = $this->expireLongLapsed();

        if (! $revenueCat->isConfigured()) {
            $this->info("Swept {$swept} lapsed row(s). RevenueCat is not configured, so nothing was reconciled against the store.");

            return self::SUCCESS;
        }

        $limit = (int) $this->option('limit');

        $query = Subscription::query()
            ->whereIn('status', ['active', 'trialing', 'past_due', 'paused', 'on_hold'])
            ->where('store', 'revenuecat')
            ->orderBy('id');

        if ($limit > 0) {
            $query->limit($limit);
        }

        $checked = $updated = $expired = $failed = 0;

        foreach ($query->cursor() as $sub) {
            $checked++;

            try {
                $subscriber = $revenueCat->getSubscriber((string) $sub->user_id);
            } catch (\Throwable $e) {
                $failed++;
                Log::warning('Reconcile could not read a RevenueCat subscriber', [
                    'user_id' => $sub->user_id,
                    'error' => $e->getMessage(),
                ]);

                continue;
            }

            $entitlement = $revenueCat->getActiveEntitlement($subscriber);

            if (! $entitlement) {
                // No live entitlement AND the paid period is over: this is the
                // missed EXPIRATION event. Inside the period it is left alone,
                // because RevenueCat can lag a renewal by minutes and expiring
                // a paying customer is the worse mistake.
                if ($sub->ends_at && $sub->ends_at->isPast() && $sub->status !== 'expired') {
                    $sub->update(['status' => 'expired', 'auto_renewing' => false]);
                    $expired++;
                }

                continue;
            }

            if ($this->applyEntitlement($sub, $subscriber, $entitlement, $revenueCat)) {
                $updated++;
            }
        }

        $this->info("Reconciled {$checked} subscription(s): {$updated} corrected, {$expired} expired, {$failed} unreadable. Swept {$swept} long-lapsed row(s).");

        return self::SUCCESS;
    }

    /**
     * Write the live entitlement onto the row. Returns whether anything moved,
     * so a run that changes nothing reports nothing and stays idempotent.
     */
    private function applyEntitlement(
        Subscription $sub,
        array $subscriber,
        array $entitlement,
        RevenueCatService $revenueCat,
    ): bool {
        $productId = $revenueCat->entitlementProductId($entitlement);
        $store = $this->storeRecord($subscriber, $entitlement, $productId);

        $unsubscribed = ! empty($store['unsubscribe_detected_at']);
        $billingIssue = ! empty($store['billing_issues_detected_at']);
        $isTrial = ($store['period_type'] ?? '') === 'trial';

        $attributes = [
            'status' => match (true) {
                $billingIssue => 'past_due',
                $unsubscribed => 'canceled',
                $isTrial => 'trialing',
                default => 'active',
            },
            'ends_at' => Carbon::parse($entitlement['expires_date']),
            'auto_renewing' => ! $unsubscribed,
            'grace_period_ends_at' => ! empty($store['grace_period_expires_date'])
                ? Carbon::parse($store['grace_period_expires_date'])
                : null,
        ];

        // Only when the store names a plan we know. Overwriting a good plan_id
        // with null because a product id went unrecognised would put the
        // customer on "no plan" in every report downstream.
        if ($productId && $plan = $revenueCat->resolvePlan($productId)) {
            $attributes['plan_id'] = $plan->id;
        }

        $changed = false;
        foreach ($attributes as $key => $value) {
            $current = $sub->getAttribute($key);

            if ($value instanceof Carbon) {
                $differs = $current === null || ! $value->equalTo($current);
            } else {
                $differs = $current != $value;
            }

            if ($differs) {
                $changed = true;
                break;
            }
        }

        if ($changed) {
            $sub->update($attributes);
        }

        return $changed;
    }

    /**
     * RevenueCat's per-product record, which carries the renewal detail the
     * entitlement object leaves out. It is keyed by product identifier, and
     * which form of that identifier appears depends on the store.
     */
    private function storeRecord(array $subscriber, array $entitlement, ?string $productId): array
    {
        $subscriptions = (array) ($subscriber['subscriptions'] ?? []);

        foreach ([$entitlement['product_identifier'] ?? null, $productId] as $key) {
            if (is_string($key) && isset($subscriptions[$key]) && is_array($subscriptions[$key])) {
                return $subscriptions[$key];
            }
        }

        return [];
    }

    /**
     * Rows that ran out over a day ago and never heard otherwise.
     *
     * A day of slack, not zero: an expiry and its renewal are not simultaneous,
     * and expiring somebody mid-renewal would lock out a customer who has just
     * paid.
     */
    private function expireLongLapsed(): int
    {
        return Subscription::whereIn('status', ['active', 'trialing'])
            ->whereNotNull('ends_at')
            ->where('ends_at', '<', now()->subDay())
            ->update(['status' => 'expired', 'auto_renewing' => false]);
    }
}
