<?php

namespace App\Http\Controllers;

use App\Models\BillingWebhookEvent;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Models\UserEvent;
use App\Services\RevenueCatService;
use App\Services\SettingsService;
use App\Services\SubscriptionMailer;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class RevenueCatWebhookController extends Controller
{
    /**
     * Events that can only ever take access away.
     *
     * These must never be matched to a subscription by guesswork. The old
     * "fall back to the user's active subscription" rule meant an EXPIRATION
     * for a transaction we have no row for cancelled whatever the account
     * happened to be on - including a brand new subscription bought minutes
     * earlier, since the expiring one is usually the one it replaced.
     */
    private const TERMINAL_EVENTS = ['EXPIRATION', 'CANCELLATION', 'REVOCATION', 'BILLING_ISSUE'];

    /**
     * When the store says this event happened.
     *
     * Held on the instance (one controller per request) so every handler can
     * stamp the row it writes without threading the value through a dozen
     * signatures.
     */
    private ?Carbon $eventAt = null;

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

        $this->eventAt = isset($event['event_timestamp_ms'])
            ? Carbon::createFromTimestampMs((int) $event['event_timestamp_ms'])
            : null;

        // Idempotency. RevenueCat retries on any non-2xx and on a timeout it
        // never saw the answer to, so the same event arrives more than once as
        // a matter of course. Without this a redelivered RENEWAL re-sent the
        // renewal email and a redelivered PRODUCT_CHANGE re-ran a plan switch.
        $record = BillingWebhookEvent::firstOrCreate(
            ['source' => 'revenuecat', 'event_id' => $this->eventId($event)],
            [
                'event_type' => $type,
                'occurred_at' => $this->eventAt,
                'payload' => $event,
            ],
        );

        if (! $record->wasRecentlyCreated && $record->handled_at !== null) {
            Log::info('RevenueCat webhook event already handled - dropping the redelivery', [
                'event_id' => $record->event_id,
                'type' => $type,
            ]);

            return response('ok');
        }

        // RevenueCat's dashboard "send test event" button. Answering it with a
        // 200 is the entire contract; processing it is not.
        if ($type === 'TEST') {
            Log::info('RevenueCat test event received', ['app_user_id' => $appUserId]);
            $record->markHandled('test');

            return response('ok');
        }

        try {
            $this->processEvent($type, $event, $rcService, $record);
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

    private function processEvent(string $type, array $event, RevenueCatService $rcService, BillingWebhookEvent $record): void
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

        $isTerminal = in_array($type, self::TERMINAL_EVENTS, true);

        // Taking access away is only ever done to the exact row the store named.
        if (! $sub && $user && ! $isTerminal) {
            $sub = $user->activeSubscription() ?? $user->subscriptions()->latest('id')->first();
        }

        if (! $user && ! $sub && $type !== 'TRANSFER') {
            // Error, not silence: this is a paying customer whose purchase this
            // server cannot attribute to an account, and the recorded event row
            // is what makes it fixable afterwards.
            Log::error('RevenueCat event for an app_user_id that matches no account', [
                'app_user_id' => $appUserId,
                'type' => $type,
                'product_id' => $productId,
            ]);
            $record->markHandled('unknown_user');

            return;
        }

        if ($isTerminal && ! $sub) {
            Log::warning('RevenueCat terminal event names a transaction with no subscription row - ignoring', [
                'type' => $type,
                'transaction_id' => $transactionId,
                'app_user_id' => $appUserId,
            ]);
            $record->markHandled('unknown_transaction', $user?->id);

            return;
        }

        if ($sub && $this->isStale($sub)) {
            Log::warning('RevenueCat event is older than the last one applied - ignoring', [
                'type' => $type,
                'subscription_id' => $sub->id,
                'event_at' => $this->eventAt?->toIso8601String(),
                'last_event_at' => $sub->last_event_at?->toIso8601String(),
            ]);
            $record->markHandled('stale', $user?->id, $sub->id);

            return;
        }

        $record->forceFill([
            'user_id' => $user?->id,
            'subscription_id' => $sub?->id,
        ])->save();

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

        $record->markHandled(null, $user?->id, $sub?->id);
    }

    /**
     * The store's id for this event, or a fingerprint of it.
     *
     * RevenueCat always sends event.id; the hash is only there so a malformed
     * payload still gets a stable key rather than dropping out of the dedupe.
     */
    private function eventId(array $event): string
    {
        $id = trim((string) ($event['id'] ?? ''));

        return $id !== '' ? $id : 'sha256:' . hash('sha256', (string) json_encode($event));
    }

    /**
     * Has a newer event already been applied to this row?
     *
     * Webhooks are not ordered. A slow EXPIRATION arriving behind the RENEWAL
     * that superseded it would otherwise cancel a subscription the customer had
     * already paid to continue.
     */
    private function isStale(Subscription $sub): bool
    {
        return $this->eventAt !== null
            && $sub->last_event_at !== null
            && $this->eventAt->lessThan($sub->last_event_at);
    }

    /**
     * Write to a subscription, recording which event did it.
     *
     * Every mutation goes through here so last_event_at can never drift out of
     * step with the data it is meant to guard.
     */
    private function apply(Subscription $sub, array $attributes): void
    {
        if ($this->eventAt !== null) {
            $attributes['last_event_at'] = $this->eventAt;
        }

        $sub->update($attributes);
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

        if ($existingSub && $transactionId !== '' && $existingSub->store_transaction_id === $transactionId) {
            $this->apply($existingSub, [
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
        //
        // The null branch matters: SQL's `!=` drops NULL rows, so an admin
        // grant (no transaction id) used to survive the sweep and keep the
        // account on two live subscriptions.
        Subscription::where('user_id', $user->id)
            ->where(fn ($q) => $q->whereNull('store_transaction_id')
                ->orWhere('store_transaction_id', '!=', $transactionId))
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
            // Null, never '': the column is unique now, and empty strings all
            // collide with each other.
            'store_transaction_id' => $transactionId ?: null,
            // With no transaction id to key on, the token has to be unique by
            // construction. The old value was derived from the user and plan
            // alone, so a second purchase on the same plan collided with the
            // first and, with the unique index, would now fail outright.
            'purchase_token'       => $transactionId ?: ('rc:' . $user->id . ':' . ($plan?->slug ?? 'sub') . ':' . Str::uuid()),
            'trial_ends_at'        => $isTrial ? $expiresAt : null,
            'started_at'           => $startedAt,
            'ends_at'              => $expiresAt,
            'auto_renewing'        => true,
            'last_event_at'        => $this->eventAt,
        ]);

        SubscriptionMailer::started($sub);

        $this->recordBillingEvent($event, $user->id, UserEvent::SUBSCRIPTION_STARTED, $plan?->slug, $isTrial ? 'trial' : 'paid', ['store' => 'revenuecat']);
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

        $this->apply($sub, [
            'status'        => 'active',
            'plan_id'       => $plan?->id ?? $sub->plan_id,
            'ends_at'       => $expiresAt,
            'canceled_at'   => null,
            'auto_renewing' => true,
            // A renewal cleared the billing problem, if there was one.
            'grace_period_ends_at' => null,
            'store_state'   => null,
        ]);

        SubscriptionMailer::renewed($sub->fresh());

        $this->recordBillingEvent($event, $sub->user_id, UserEvent::SUBSCRIPTION_RENEWED, $plan?->slug ?? $sub->plan?->slug);
    }

    private function handleCancellation(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        $expiresAt = isset($event['expiration_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['expiration_at_ms'])
            : $sub->ends_at;

        $this->apply($sub, [
            'status'        => 'canceled',
            'canceled_at'   => now(),
            'ends_at'       => $expiresAt,
            'auto_renewing' => false,
            'store_state'   => 'canceled',
        ]);

        SubscriptionMailer::canceled($sub->fresh());

        $this->recordBillingEvent($event, $sub->user_id, UserEvent::SUBSCRIPTION_ENDED, $sub->plan?->slug, 'canceled');
    }

    private function handleUncancellation(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        $expiresAt = isset($event['expiration_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['expiration_at_ms'])
            : $sub->ends_at;

        $this->apply($sub, [
            'status'        => 'active',
            'canceled_at'   => null,
            'ends_at'       => $expiresAt,
            'auto_renewing' => true,
            'store_state'   => null,
        ]);
    }

    private function handleProductChange(array $event, ?User $user, ?Plan $newPlan, ?Subscription $sub): void
    {
        $expiresAt = isset($event['expiration_at_ms'])
            ? Carbon::createFromTimestampMs((int) $event['expiration_at_ms'])
            : null;

        if ($sub && $newPlan) {
            $this->apply($sub, [
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

        $this->apply($sub, [
            'status'        => 'expired',
            'auto_renewing' => false,
            'store_state'   => 'expired',
        ]);

        $this->recordBillingEvent($event, $sub->user_id, UserEvent::SUBSCRIPTION_ENDED, $sub->plan?->slug, 'expired');

        $this->resetLevelToOnboarding($sub, $event);
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
    private function resetLevelToOnboarding(Subscription $sub, array $event = []): void
    {
        $user = $sub->user;
        if (! $user || ! $user->onboarding_level) {
            return;
        }

        if ($user->activeSubscription()) {
            return;
        }

        /**
         * onboarding_level is a level NUMBER; level_id is a foreign key to
         * levels.id. This used to assign the first straight into the second,
         * which is only ever correct on a database whose ids happen to have
         * been handed out in number order - the seeder matches on `number`, so
         * they drift as soon as a level is recreated. Everywhere else it is
         * either the wrong difficulty or a foreign key violation thrown inside
         * a webhook handler.
         */
        $toNumber = (int) $user->onboarding_level;
        $to = (int) (\App\Models\Level::where('number', $toNumber)->value('id') ?? 0);

        if ($to === 0 || (int) $user->level_id === $to) {
            return;
        }

        $from = (int) $user->level_id;
        $fromNumber = (int) ($user->level?->number ?? 0);

        $user->update(['level_id' => $to]);

        // Keyed apart from the subscription event this arrived with: both come
        // from one webhook, and one key for two rows means the second is
        // silently dropped by the idempotency check.
        $this->recordBillingEvent(
            $event,
            $user->id,
            UserEvent::LEVEL_CHANGED,
            $toNumber > $fromNumber ? 'up' : 'down',
            'lapse',
            ['from' => $from, 'to' => $to],
            'rc-lvl-',
        );

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

        // Grace period: the card failed but the store is retrying and expects
        // us to keep serving, so ends_at is deliberately untouched.
        $this->apply($sub, [
            'status' => 'past_due',
            'store_state' => 'in_grace',
            'grace_period_ends_at' => $sub->ends_at,
        ]);

        // Counted as an ending even though access continues through the grace
        // period: from the reports' point of view this is money that stopped
        // arriving, and the detail says it was the card rather than a decision.
        $this->recordBillingEvent($event, $sub->user_id, UserEvent::SUBSCRIPTION_ENDED, $sub->plan?->slug, 'billing_issue');
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

        $this->apply($sub, [
            'status'        => 'canceled',
            'ends_at'       => $expiresAt,
            'auto_renewing' => false,
            // The status is coarse on purpose; this is where the store's own
            // word for it survives, so a paused row is still tellable from a
            // cancelled one.
            'store_state'   => 'paused',
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

        $this->apply($sub, [
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

    /**
     * Record one thing the store told us, once.
     *
     * Keyed on RevenueCat's own event id, because webhooks are delivered AT
     * LEAST once: the same RENEWAL arriving three times has to leave one row,
     * or every money figure on the reports is inflated by the retry rate.
     *
     * $keyPrefix exists because one webhook can produce two events (an
     * expiration also moves the difficulty back), and two rows keyed the same
     * way are one row.
     *
     * Wrapped in rescue(): a webhook that has already changed a subscription
     * must return 200, or the store will send it again. Failing to write a
     * report row is not a reason to re-run a cancellation.
     */
    private function recordBillingEvent(
        array $event,
        ?int $userId,
        string $name,
        ?string $subject = null,
        ?string $detail = null,
        ?array $meta = null,
        string $keyPrefix = 'rc-',
    ): void {
        if (! $userId) {
            return;
        }

        rescue(function () use ($event, $userId, $name, $subject, $detail, $meta, $keyPrefix) {
            /**
             * The device's own purchase confirmation records the same sale
             * from the other side (SyncController::recordRevenueCatPurchase),
             * and the two have no id in common - one knows the store's
             * purchase token, the other the store's event id. They land within
             * minutes of each other, so a start already recorded today is the
             * same start, not a second one. A renewal is a different event and
             * is unaffected.
             */
            if ($name === UserEvent::SUBSCRIPTION_STARTED
                && UserEvent::where('user_id', $userId)
                    ->where('name', UserEvent::SUBSCRIPTION_STARTED)
                    ->where('occurred_at', '>=', now()->subDay())
                    ->exists()
            ) {
                return;
            }

            UserEvent::record($userId, $name, $subject, $detail, $meta, $keyPrefix.$this->eventId($event));
        }, report: false);
    }

    private function handleRevocation(array $event, ?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        // Refund/Revocation removes access immediately
        $this->apply($sub, [
            'status'        => 'canceled',
            'canceled_at'   => now(),
            'ends_at'       => now(),
            'auto_renewing' => false,
            'store_state'   => 'revoked',
        ]);

        $this->recordBillingEvent($event, $sub->user_id, UserEvent::SUBSCRIPTION_ENDED, $sub->plan?->slug, 'revoked');

        // Access is gone this instant, not at a period end, so the difficulty
        // goes back with it.
        $this->resetLevelToOnboarding($sub, $event);

        SubscriptionMailer::canceled($sub->fresh());
    }
}
