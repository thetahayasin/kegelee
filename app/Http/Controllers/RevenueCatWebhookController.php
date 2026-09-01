<?php

namespace App\Http\Controllers;

use App\Mail\SubscriptionCanceledMail;
use App\Mail\SubscriptionRenewedMail;
use App\Mail\SubscriptionStartedMail;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\RevenueCatService;
use App\Services\SettingsService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class RevenueCatWebhookController extends Controller
{
    public function handle(Request $request, RevenueCatService $rcService, SettingsService $settings): Response
    {
        // 1. Authorization. This endpoint MINTS SUBSCRIPTIONS from its request
        //    body - handleInitialPurchase resolves the account straight out of
        //    app_user_id (which may be an email) and creates a row with an
        //    expiry taken from the payload. So it must never run unauthenticated.
        //
        //    It previously skipped the check entirely when no secret was
        //    configured, and the secret defaults to empty in both
        //    SettingsService and config/services.php - which meant a fresh
        //    deployment would hand a free subscription of any length to anyone
        //    who could POST this URL. Refuse to process instead.
        $configuredSecret = (string) ($settings->get('revenuecat_webhook_secret') ?: config('services.revenuecat.webhook_secret', ''));
        if ($configuredSecret === '') {
            Log::critical('RevenueCat webhook secret is not configured - refusing to process events. Set it in Admin -> Settings (or REVENUECAT_WEBHOOK_SECRET) AND in RevenueCat Dashboard -> Integrations -> Webhooks -> Authorization Header. Subscription events are being REJECTED until then.');

            // 503, not 401: this is our misconfiguration, and it makes
            // RevenueCat retry rather than discard the event, so nothing is
            // lost once the secret is set.
            return response('webhook secret not configured', 503);
        }

        $authHeader = (string) $request->header('Authorization', '');
        $providedSecret = preg_replace('/^Bearer\s+/i', '', trim($authHeader));
        // hash_equals: constant time, so the secret can't be recovered by
        // timing repeated guesses against this endpoint.
        if (! hash_equals($configuredSecret, (string) $providedSecret)) {
            Log::warning('RevenueCat webhook unauthorized attempt', [
                'ip' => $request->ip(),
            ]);
            return response('Unauthorized', 401);
        }

        $payload = $request->json()->all();
        $event = $payload['event'] ?? null;

        if (! $event) {
            return response('invalid payload', 400);
        }

        $type = (string) ($event['type'] ?? '');
        $appUserId = (string) ($event['app_user_id'] ?? '');
        $productId = (string) ($event['product_id'] ?? '');

        if (empty($type) || empty($appUserId)) {
            return response('missing required event fields', 400);
        }

        Log::info("RevenueCat webhook received: {$type}", [
            'app_user_id' => $appUserId,
            'product_id'  => $productId,
        ]);

        try {
            $this->processEvent($type, $event, $rcService);
        } catch (\Throwable $e) {
            Log::error('RevenueCat webhook processing failed', [
                'type'        => $type,
                'app_user_id' => $appUserId,
                'product_id'  => $productId,
                'error'       => $e->getMessage(),
            ]);

            // Returning 500 triggers RevenueCat retry mechanism
            return response('handler failed', 500);
        }

        return response('ok');
    }

    private function processEvent(string $type, array $event, RevenueCatService $rcService): void
    {
        $appUserId = (string) ($event['app_user_id'] ?? '');
        $productId = (string) ($event['product_id'] ?? '');
        $transactionId = (string) ($event['transaction_id'] ?? ($event['original_transaction_id'] ?? ''));

        // Match user by app_user_id (which could be user ID integer or email)
        $user = is_numeric($appUserId)
            ? User::find((int) $appUserId)
            : (User::where('email', strtolower($appUserId))->first() ?? User::where('id', $appUserId)->first());

        $plan = $rcService->resolvePlan($productId);

        // Find existing subscription by transaction id or user
        $sub = null;
        if (! empty($transactionId)) {
            $sub = Subscription::where('store_transaction_id', $transactionId)
                ->orWhere('purchase_token', $transactionId)
                ->first();
        }

        if (! $sub && $user) {
            $sub = $user->activeSubscription() ?? $user->subscriptions()->latest('id')->first();
        }

        match ($type) {
            'INITIAL_PURCHASE' => $this->handleInitialPurchase($event, $user, $plan, $sub),
            'RENEWAL'          => $this->handleRenewal($event, $user, $plan, $sub),
            'CANCELLATION'     => $this->handleCancellation($event, $sub),
            'UNCANCELLATION'   => $this->handleUncancellation($event, $sub),
            'PRODUCT_CHANGE'   => $this->handleProductChange($event, $user, $plan, $sub),
            'EXPIRATION'       => $this->handleExpiration($event, $sub),
            'BILLING_ISSUE'    => $this->handleBillingIssue($event, $sub),
            'REVOCATION'       => $this->handleRevocation($event, $sub),
            'SUBSCRIPTION_PAUSED' => $this->handlePaused($event, $sub),
            'SUBSCRIPTION_EXTENDED' => $this->handleExtended($event, $sub),
            'TRANSFER'         => $this->handleTransfer($event),
            'NON_RENEWING_PURCHASE' => $this->handleNonRenewingPurchase($event, $user, $plan, $sub),
            'TEMPORARY_ENTITLEMENT_GRANT' => $this->handleTemporaryGrant($event, $sub),
            default            => Log::info("RevenueCat webhook event ignored: {$type}"),
        };
    }

    private function handleInitialPurchase(array $event, ?User $user, ?Plan $plan, ?Subscription $existingSub): void
    {
        if (! $user) {
            return;
        }

        $expiresAt = isset($event['expiration_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['expiration_at_ms'])
            : null;
        $startedAt = isset($event['purchased_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['purchased_at_ms'])
            : now();
        $isTrial = ($event['period_type'] ?? '') === 'TRIAL';
        $transactionId = (string) ($event['transaction_id'] ?? ($event['original_transaction_id'] ?? ''));
        $store = strtolower((string) ($event['store'] ?? 'revenuecat'));

        if ($existingSub && $existingSub->store_transaction_id === $transactionId) {
            $existingSub->update([
                'status'        => $isTrial ? 'trialing' : 'active',
                'ends_at'       => $expiresAt,
                'auto_renewing' => true,
            ]);
            return;
        }

        // Retire whatever the user was on before, for the same reason as the
        // sync push: a plan change is a product change at the store, so Play
        // replaces the old subscription rather than running both. Creating
        // without retiring left two 'active' rows on the account, which
        // double-counted in the admin list and kept isSubscribed() true off
        // the stale row after the real subscription was cancelled.
        Subscription::where('user_id', $user->id)
            ->where('store_transaction_id', '!=', $transactionId)
            ->whereIn('status', ['active', 'trialing'])
            ->update([
                'status'        => 'expired',
                'auto_renewing' => false,
            ]);

        $sub = Subscription::create([
            'user_id'              => $user->id,
            'plan_id'              => $plan?->id,
            'status'               => $isTrial ? 'trialing' : 'active',
            'store'                => 'revenuecat',
            'store_transaction_id' => $transactionId,
            'purchase_token'       => $transactionId ?: ('rc:' . $user->id . ':' . ($plan?->slug ?? 'sub')),
            'trial_ends_at'        => $isTrial ? $expiresAt : null,
            'started_at'           => $startedAt,
            'ends_at'              => $expiresAt,
            'auto_renewing'        => true,
        ]);

        try {
            Mail::to($user)->send(new SubscriptionStartedMail($sub));
        } catch (\Throwable $e) {
            Log::warning('Failed to send subscription started email via RevenueCat webhook', ['error' => $e->getMessage()]);
        }
    }

    private function handleRenewal(array $event, ?User $user, ?Plan $plan, ?Subscription $sub): void
    {
        if (! $sub && $user && $plan) {
            $this->handleInitialPurchase($event, $user, $plan, null);
            return;
        }

        if (! $sub) {
            return;
        }

        $expiresAt = isset($event['expiration_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['expiration_at_ms'])
            : $sub->ends_at;

        $sub->update([
            'status'        => 'active',
            'plan_id'       => $plan?->id ?? $sub->plan_id,
            'ends_at'       => $expiresAt,
            'canceled_at'   => null,
            'auto_renewing' => true,
        ]);

        try {
            Mail::to($sub->user)->send(new SubscriptionRenewedMail($sub->fresh()));
        } catch (\Throwable $e) {
            Log::warning('Failed to send subscription renewed email via RevenueCat webhook', ['error' => $e->getMessage()]);
        }
    }

    private function handleCancellation(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        $expiresAt = isset($event['expiration_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['expiration_at_ms'])
            : $sub->ends_at;

        $sub->update([
            'status'        => 'canceled',
            'canceled_at'   => now(),
            'ends_at'       => $expiresAt,
            'auto_renewing' => false,
        ]);

        try {
            Mail::to($sub->user)->send(new SubscriptionCanceledMail($sub->fresh()));
        } catch (\Throwable $e) {
            Log::warning('Failed to send subscription canceled email via RevenueCat webhook', ['error' => $e->getMessage()]);
        }
    }

    private function handleUncancellation(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        $expiresAt = isset($event['expiration_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['expiration_at_ms'])
            : $sub->ends_at;

        $sub->update([
            'status'        => 'active',
            'canceled_at'   => null,
            'ends_at'       => $expiresAt,
            'auto_renewing' => true,
        ]);
    }

    private function handleProductChange(array $event, ?User $user, ?Plan $newPlan, ?Subscription $sub): void
    {
        $expiresAt = isset($event['expiration_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['expiration_at_ms'])
            : null;

        if ($sub && $newPlan) {
            $sub->update([
                'plan_id'       => $newPlan->id,
                'status'        => 'active',
                'ends_at'       => $expiresAt ?? $sub->ends_at,
                'auto_renewing' => true,
            ]);
        } elseif ($user && $newPlan) {
            $this->handleInitialPurchase($event, $user, $newPlan, null);
        }
    }

    private function handleExpiration(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        $sub->update([
            'status'        => 'expired',
            'auto_renewing' => false,
        ]);

        $this->resetLevelToOnboarding($sub);
    }

    /**
     * Put a lapsed subscriber back on the level their quiz chose.
     *
     * Choosing a difficulty is part of the subscription, so someone who lapses
     * keeps the level they picked while paying and has no way to leave it. That
     * strands them on a level they may not want, with paying again as the only
     * exit. The quiz level is where the app put them on its own judgement, and
     * is where a free user would be, so it is the honest place to land.
     *
     * Only when the account has no other live subscription: a plan change can
     * expire the old row while the new one is running, and dropping a paying
     * customer's difficulty in the middle of that would be its own bug.
     */
    private function resetLevelToOnboarding(Subscription $sub): void
    {
        $user = $sub->user;
        if (! $user || ! $user->onboarding_level) {
            return;
        }

        if ($user->activeSubscription()) {
            return;
        }

        if ((int) $user->level_id === (int) $user->onboarding_level) {
            return;
        }

        $user->update(['level_id' => (int) $user->onboarding_level]);

        Log::info('Level reset to the onboarding level after lapse', [
            'user_id' => $user->id,
            'level_id' => (int) $user->onboarding_level,
        ]);
    }

    private function handleBillingIssue(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        $sub->update([
            'status' => 'past_due',
        ]);
    }

    /**
     * Google Play lets a subscriber PAUSE rather than cancel. The pause takes
     * effect at the end of the paid period, so this is the same shape as a
     * cancellation from our side: stop expecting a renewal, but keep serving
     * until the period they already paid for runs out.
     *
     * Mapped onto 'canceled' because the status column is an enum without a
     * 'paused' member; the distinction does not change entitlement, and a
     * resume arrives as UNCANCELLATION or RENEWAL which restores the row.
     */
    private function handlePaused(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        $expiresAt = isset($event['expiration_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['expiration_at_ms'])
            : $sub->ends_at;

        $sub->update([
            'status'        => 'canceled',
            'ends_at'       => $expiresAt,
            'auto_renewing' => false,
        ]);
    }

    /**
     * The paid period was extended - a support gesture, a Play price-change
     * grace, or a developer-granted extension. Push the expiry out; never pull
     * it in, since an extension can only ever add time.
     */
    private function handleExtended(array $event, ?Subscription $sub): void
    {
        if (! $sub || ! isset($event['expiration_at_ms'])) {
            return;
        }

        $expiresAt = Carbon::createFromTimestampMs((int) $event['expiration_at_ms']);
        if ($sub->ends_at && $expiresAt->lessThanOrEqualTo($sub->ends_at)) {
            return;
        }

        $sub->update([
            'status'  => in_array($sub->status, ['expired', 'past_due'], true) ? 'active' : $sub->status,
            'ends_at' => $expiresAt,
        ]);
    }

    /**
     * The purchase moved to a different RevenueCat customer - typically the
     * same human signing in on a new account, or a shared device.
     *
     * Entitlement follows the store transaction, so the accounts it moved AWAY
     * from must lose it. Leaving them entitled is how one purchase ends up
     * unlocking several accounts forever.
     */
    private function handleTransfer(array $event): void
    {
        $from = (array) ($event['transferred_from'] ?? []);
        $to   = (array) ($event['transferred_to'] ?? []);

        foreach ($from as $appUserId) {
            $user = $this->resolveUser((string) $appUserId);
            if (! $user) {
                continue;
            }
            Subscription::where('user_id', $user->id)
                ->whereIn('status', ['active', 'trialing', 'past_due'])
                ->update([
                    'status'        => 'expired',
                    'auto_renewing' => false,
                ]);
        }

        // The receiving account is entitled from RevenueCat's point of view,
        // but this event carries no product/expiry to build a row from. The
        // device's own sync push (verified against the RevenueCat REST API)
        // creates it, and an INITIAL_PURCHASE/RENEWAL for the new app_user_id
        // fills it in server-side. Log so a stuck transfer is diagnosable.
        foreach ($to as $appUserId) {
            Log::info('RevenueCat transfer received', ['to' => (string) $appUserId]);
        }
    }

    /**
     * A one-off, non-renewing purchase. Recorded so it grants access for its
     * period, but explicitly not auto-renewing - treating it as a subscription
     * would leave the account entitled forever once ends_at passed unnoticed.
     */
    private function handleNonRenewingPurchase(array $event, ?User $user, ?Plan $plan, ?Subscription $sub): void
    {
        if (! $user) {
            return;
        }

        $this->handleInitialPurchase($event, $user, $plan, $sub);

        $transactionId = (string) ($event['transaction_id'] ?? ($event['original_transaction_id'] ?? ''));
        Subscription::where('user_id', $user->id)
            ->when($transactionId !== '', fn ($q) => $q->where('store_transaction_id', $transactionId))
            ->update(['auto_renewing' => false]);
    }

    /**
     * RevenueCat could not reach the store and is granting provisional access
     * so a paying customer is not locked out by an outage. Extend, never
     * downgrade: a real entitlement already on file outranks this.
     */
    private function handleTemporaryGrant(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        $this->handleExtended($event, $sub);
    }

    /** Resolve the account an app_user_id refers to. RevenueCat is configured with the user id, but older clients used the email. */
    private function resolveUser(string $appUserId): ?User
    {
        if ($appUserId === '') {
            return null;
        }

        return is_numeric($appUserId)
            ? User::find((int) $appUserId)
            : User::where('email', strtolower($appUserId))->first();
    }

    private function handleRevocation(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        // Refund/Revocation removes access immediately
        $sub->update([
            'status'        => 'canceled',
            'canceled_at'   => now(),
            'ends_at'       => now(),
            'auto_renewing' => false,
        ]);

        // Access is gone this instant, not at a period end, so the difficulty
        // goes back with it.
        $this->resetLevelToOnboarding($sub);

        try {
            Mail::to($sub->user)->send(new SubscriptionCanceledMail($sub->fresh()));
        } catch (\Throwable $e) {
            Log::warning('Failed to send revocation email via RevenueCat webhook', ['error' => $e->getMessage()]);
        }
    }
}
