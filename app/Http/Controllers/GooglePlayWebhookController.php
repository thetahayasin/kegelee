<?php

namespace App\Http\Controllers;

use App\Models\BillingWebhookEvent;
use App\Models\Plan;
use App\Models\Subscription;
use App\Services\GooglePlayBillingService;
use App\Services\RevenueCatService;
use App\Services\SubscriptionMailer;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GooglePlayWebhookController extends Controller
{
    // Google Play RTDN notification types
    private const SUBSCRIPTION_RECOVERED = 1;
    private const SUBSCRIPTION_RENEWED = 2;
    private const SUBSCRIPTION_CANCELED = 3;
    private const SUBSCRIPTION_PURCHASED = 4;
    private const SUBSCRIPTION_ON_HOLD = 5;
    private const SUBSCRIPTION_IN_GRACE_PERIOD = 6;
    private const SUBSCRIPTION_RESTARTED = 7;
    private const SUBSCRIPTION_PRICE_CHANGE_CONFIRMED = 8;
    private const SUBSCRIPTION_DEFERRED = 9;
    private const SUBSCRIPTION_PAUSED = 10;
    private const SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED = 11;
    private const SUBSCRIPTION_REVOKED = 12;
    private const SUBSCRIPTION_EXPIRED = 13;

    /** The subscriptionsv2 states, mapped to the short word we store. */
    private const STORE_STATES = [
        'SUBSCRIPTION_STATE_ACTIVE' => 'active',
        'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' => 'in_grace',
        'SUBSCRIPTION_STATE_ON_HOLD' => 'on_hold',
        'SUBSCRIPTION_STATE_PAUSED' => 'paused',
        'SUBSCRIPTION_STATE_CANCELED' => 'canceled',
        'SUBSCRIPTION_STATE_EXPIRED' => 'expired',
        'SUBSCRIPTION_STATE_PENDING' => 'pending',
    ];

    /**
     * When Google says this notification happened. Held on the instance (one
     * controller per request) so every write can stamp the row it touches.
     */
    private ?Carbon $eventAt = null;

    public function handle(Request $request, GooglePlayBillingService $billing, RevenueCatService $rcService): Response
    {
        // 1. Authenticate the push. This endpoint changes entitlement from its
        //    request body, and the URL is the only thing that used to protect
        //    it - anyone who learned it could expire or extend any subscription
        //    whose purchase token they could guess or replay.
        $audience = (string) config('services.google_play.rtdn_audience', '');
        $serviceAccount = (string) config('services.google_play.rtdn_service_account', '');

        if ($audience === '' || $serviceAccount === '') {
            Log::critical('Google Play RTDN authentication is not configured - refusing to process notifications. In the Pub/Sub push subscription enable authentication, pick a service account, and set GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT (its email) and GOOGLE_PLAY_RTDN_AUDIENCE (the audience string). Play notifications are being REJECTED until then.');

            // 503, not 401: this is our misconfiguration. Pub/Sub retries a 503
            // for days, so nothing is lost once the settings arrive.
            return response('rtdn authentication not configured', 503);
        }

        $token = (string) preg_replace('/^Bearer\s+/i', '', trim((string) $request->header('Authorization', '')));

        if ($token === '' || ! $this->verifyPushToken($token, $audience, $serviceAccount)) {
            Log::warning('Google Play RTDN unauthorized attempt', ['ip' => $request->ip()]);

            return response('Unauthorized', 401);
        }

        // 2. Decode. Pub/Sub pushes a base64-encoded JSON payload in message.data
        $encoded = (string) $request->input('message.data', '');
        $payload = json_decode(base64_decode($encoded), true);

        if (! is_array($payload)) {
            return response('invalid payload', 400);
        }

        $eventId = $this->eventId($request, $encoded);
        $this->eventAt = isset($payload['eventTimeMillis'])
            ? Carbon::createFromTimestampMs((int) $payload['eventTimeMillis'])
            : null;

        $record = BillingWebhookEvent::firstOrCreate(
            ['source' => 'google_play', 'event_id' => $eventId],
            [
                'event_type' => (string) ($payload['subscriptionNotification']['notificationType'] ?? 'unknown'),
                'occurred_at' => $this->eventAt,
                'payload' => $payload,
            ],
        );

        // Pub/Sub guarantees at-least-once delivery, so a slow response is
        // answered with a second copy of the same notification.
        if (! $record->wasRecentlyCreated && $record->handled_at !== null) {
            Log::info('Google Play notification already handled - dropping the redelivery', [
                'event_id' => $eventId,
            ]);

            return response('ok');
        }

        // 3. It must be about this app. A notification for another package is
        //    not ours to act on, and retrying it could never make it ours - so
        //    it is accepted and dropped rather than left to redeliver forever.
        $expectedPackage = (string) config('services.google_play.package_name', '');
        $package = (string) ($payload['packageName'] ?? '');
        if ($expectedPackage !== '' && $package !== $expectedPackage) {
            Log::warning('Google Play notification for an unexpected package', [
                'package' => $package,
                'expected' => $expectedPackage,
            ]);
            $record->markHandled('foreign_package');

            return response('ok');
        }

        if (isset($payload['testNotification'])) {
            Log::info('Google Play test notification received', ['version' => $payload['testNotification']['version'] ?? null]);
            $record->markHandled('test');

            return response('ok');
        }

        // Google Play sends either subscriptionNotification or oneTimeProductNotification
        $notification = $payload['subscriptionNotification'] ?? null;
        if (! $notification) {
            $record->markHandled('not_a_subscription');

            return response('ok'); // not a subscription event; ignore
        }

        $purchaseToken = $notification['purchaseToken'] ?? null;
        $productId = $notification['subscriptionId'] ?? null;
        $type = (int) ($notification['notificationType'] ?? 0);

        if (! $purchaseToken || ! $productId) {
            return response('missing fields', 400);
        }

        $subscription = Subscription::where('purchase_token', $purchaseToken)->first();

        if (! $subscription) {
            // Not fatal - a renewal or purchase notification can still be
            // attributed from Play's own copy (see adopt()) - but a terminal
            // notification for a token we have no row for is a gap worth
            // seeing, and it is never applied to some other subscription.
            Log::warning('Google Play notification names a purchase token with no subscription row', [
                'type' => $type,
                'product_id' => $productId,
            ]);
        }

        if ($subscription && $this->isStale($subscription)) {
            Log::warning('Google Play notification is older than the last one applied - ignoring', [
                'type' => $type,
                'subscription_id' => $subscription->id,
                'event_at' => $this->eventAt?->toIso8601String(),
                'last_event_at' => $subscription->last_event_at?->toIso8601String(),
            ]);
            $record->markHandled('stale', $subscription->user_id, $subscription->id);

            return response('ok');
        }

        try {
            $this->dispatch($type, $subscription, $billing, $rcService, $productId, $purchaseToken);
        } catch (\Throwable $e) {
            Log::error('Google Play webhook handler failed', [
                'type' => $type,
                'productId' => $productId,
                'error' => $e->getMessage(),
            ]);

            // Non-2xx makes Pub/Sub redeliver, so a transient failure (e.g. the
            // Play API being briefly down during a renewal) heals on retry
            // instead of leaving the row stale until the next event.
            return response('handler failed', 500);
        }

        $subscription = $subscription?->fresh()
            ?? Subscription::where('purchase_token', $purchaseToken)->first();
        $record->markHandled(null, $subscription?->user_id, $subscription?->id);

        return response('ok');
    }

    /**
     * Verify the OIDC token Pub/Sub signs each push with.
     *
     * Google's tokeninfo endpoint, the same one SyncController uses for Google
     * sign-in, rather than local JWKS verification: one round trip, no key
     * cache to go stale, and the claims come back already parsed. Protected so
     * a test can drive it without a real Google token.
     */
    protected function verifyPushToken(string $token, string $audience, string $serviceAccount): bool
    {
        try {
            $response = Http::timeout(10)->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $token]);
        } catch (\Throwable $e) {
            Log::warning('Could not reach Google to verify an RTDN push token', ['error' => $e->getMessage()]);

            return false;
        }

        if (! $response->ok()) {
            return false;
        }

        $claims = (array) $response->json();
        $emailVerified = $claims['email_verified'] ?? null;
        $emailVerified = $emailVerified === true || $emailVerified === 'true';

        // Every clause matters. Without the audience check any Google-issued
        // token at all would pass; without the email check any Google account
        // could mint one for our audience.
        return in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
            && (string) ($claims['aud'] ?? '') === $audience
            && strtolower((string) ($claims['email'] ?? '')) === strtolower($serviceAccount)
            && $emailVerified;
    }

    /**
     * Pub/Sub's own message id, which is stable across redeliveries of the same
     * message. The hash is the fallback for a push that somehow arrives without
     * one, so dedupe still has a key.
     */
    private function eventId(Request $request, string $encoded): string
    {
        $messageId = (string) ($request->input('message.messageId')
            ?? $request->input('message.message_id')
            ?? '');

        return $messageId !== '' ? $messageId : 'sha256:' . hash('sha256', $encoded);
    }

    /** Has a newer notification already been applied to this row? */
    private function isStale(Subscription $sub): bool
    {
        return $this->eventAt !== null
            && $sub->last_event_at !== null
            && $this->eventAt->lessThan($sub->last_event_at);
    }

    /** Write to a subscription, recording which notification did it. */
    private function apply(Subscription $sub, array $attributes): void
    {
        if ($this->eventAt !== null) {
            $attributes['last_event_at'] = $this->eventAt;
        }

        $sub->update($attributes);
    }

    private function dispatch(
        int $type,
        ?Subscription $sub,
        GooglePlayBillingService $billing,
        RevenueCatService $rcService,
        string $productId,
        string $purchaseToken,
    ): void {
        match ($type) {
            self::SUBSCRIPTION_RECOVERED,
            self::SUBSCRIPTION_RENEWED,
            self::SUBSCRIPTION_RESTARTED => $this->renew($sub, $billing, $rcService, $productId, $purchaseToken),

            self::SUBSCRIPTION_CANCELED => $this->cancel($sub),

            // Revocation (refund) removes access immediately, unlike a
            // cancellation which keeps it until the paid period ends.
            self::SUBSCRIPTION_REVOKED => $this->cancel($sub, immediately: true),

            // Grace period: the card failed but Google is retrying and expects
            // us to KEEP SERVING. ends_at is left alone, so the user stays
            // entitled - that is the whole point of the state.
            self::SUBSCRIPTION_IN_GRACE_PERIOD => $sub ? $this->apply($sub, [
                'status' => 'past_due',
                'store_state' => 'in_grace',
                'grace_period_ends_at' => $sub->ends_at,
            ]) : null,

            // Account hold is the opposite, and these two used to share a line.
            // Hold means the grace period is OVER: Google has suspended the
            // subscription and the user has lost access. Leaving ends_at in the
            // future kept them entitled through a hold that can run 30 days, so
            // a subscription Google had already stopped honouring carried on
            // unlocking the app. Ending it here is recoverable - RECOVERED
            // re-reads the real expiry from the Play API.
            self::SUBSCRIPTION_ON_HOLD => $this->hold($sub),

            // Renewal pushed out - a deferred downgrade, or an extension Google
            // granted. Unhandled, the row kept its old ends_at and the app
            // expired a subscriber who had in fact been given longer.
            self::SUBSCRIPTION_DEFERRED => $this->renew($sub, $billing, $rcService, $productId, $purchaseToken),

            // Paused: Google stops billing at the END of the paid period, so
            // access runs to ends_at and then stops. Same shape as a
            // cancellation, and the same shape RevenueCat's handlePaused uses.
            // Previously fell through to default and the row stayed 'active'
            // with a future ends_at, so a paused subscription kept working.
            self::SUBSCRIPTION_PAUSED => $this->cancel($sub, storeState: 'paused'),

            // A pause can be brought forward, pushed back or called off, and
            // the notification says which only by implication. Ignoring it left
            // a row cancelled for a pause the user had since abandoned, so the
            // real state is re-read from Play instead.
            self::SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED => $this->resync($sub, $billing, $rcService, $productId, $purchaseToken),

            self::SUBSCRIPTION_EXPIRED => $sub ? $this->apply($sub, [
                'status' => 'expired',
                'auto_renewing' => false,
                'store_state' => 'expired',
            ]) : null,

            // SUBSCRIPTION_PURCHASED is usually handled app-side; just acknowledge if we missed it
            self::SUBSCRIPTION_PURCHASED => $this->acknowledgeIfNeeded($sub, $billing, $rcService, $productId, $purchaseToken),

            // PRICE_CHANGE_CONFIRMED carries no entitlement change, so ignoring
            // it is correct rather than an oversight.
            default => null,
        };
    }

    private function renew(
        ?Subscription $sub,
        GooglePlayBillingService $billing,
        RevenueCatService $rcService,
        string $productId,
        string $purchaseToken,
        bool $notify = true,
    ): void {
        // A renewal for a token we have never seen is a real, paid-for
        // subscription this server is failing to serve. Ask Play who it belongs
        // to before giving up on it.
        $sub ??= $this->adopt($billing, $rcService, $productId, $purchaseToken);

        if (! $sub) {
            return;
        }

        $data = $billing->verifySubscription($productId, $purchaseToken);

        $plan = $this->planFrom($data, $rcService);

        $this->apply($sub, [
            'status'         => 'active',
            'purchase_token' => $purchaseToken,
            // The verified purchase names the base plan, and a deferred
            // downgrade is exactly the case where it stops matching the row.
            'plan_id'        => $plan?->id ?? $sub->plan_id,
            'google_order_id' => $data['orderId'] ?? $sub->google_order_id,
            'auto_renewing'  => $this->autoRenewingFrom($data, default: true),
            'ends_at'        => $this->expiryFrom($data) ?? $sub->ends_at,
            'store_state'    => $this->storeStateFrom($data),
            'grace_period_ends_at' => null,
        ]);

        if ($notify) {
            SubscriptionMailer::renewed($sub->fresh());
        }
    }

    /**
     * Re-read the purchase and write back whatever Play now says.
     *
     * Used where the notification announces that something changed without
     * saying what it changed to.
     */
    private function resync(
        ?Subscription $sub,
        GooglePlayBillingService $billing,
        RevenueCatService $rcService,
        string $productId,
        string $purchaseToken,
    ): void {
        if (! $sub) {
            return;
        }

        $data = $billing->verifySubscription($productId, $purchaseToken);
        $state = $this->storeStateFrom($data);
        $expiry = $this->expiryFrom($data) ?? $sub->ends_at;

        // Paused means billing stops at the end of the paid period: same shape
        // as a cancellation, access until ends_at.
        if ($state === 'paused') {
            $this->apply($sub, [
                'status' => 'canceled',
                'ends_at' => $expiry,
                'auto_renewing' => false,
                'store_state' => 'paused',
            ]);

            return;
        }

        // The pause was called off or pushed past the current period, so the
        // subscription is simply running again.
        $this->apply($sub, [
            'status' => 'active',
            'canceled_at' => null,
            'ends_at' => $expiry,
            'auto_renewing' => $this->autoRenewingFrom($data, default: (bool) $sub->auto_renewing),
            'store_state' => $state,
        ]);
    }

    private function cancel(?Subscription $sub, bool $immediately = false, string $storeState = 'canceled'): void
    {
        if (! $sub) {
            return;
        }

        $this->apply($sub, array_merge(
            [
                'status' => 'canceled',
                'canceled_at' => now(),
                'auto_renewing' => false,
                'store_state' => $immediately ? 'revoked' : $storeState,
            ],
            $immediately ? ['ends_at' => now()] : [],
        ));

        SubscriptionMailer::canceled($sub->fresh());
    }

    /**
     * Account hold: grace is over and Google has suspended the subscription.
     *
     * Access has to stop now. `past_due` is kept rather than `expired` because
     * a hold is recoverable - the user can fix their card and Google sends
     * RECOVERED, which re-reads the true expiry from the Play API and restores
     * both the status and the date. Zeroing ends_at is what actually removes
     * the entitlement, since every entitlement check is "status plus a future
     * ends_at" rather than status alone.
     */
    private function hold(?Subscription $sub): void
    {
        if (! $sub) {
            return;
        }

        $this->apply($sub, [
            'status' => 'past_due',
            'ends_at' => now(),
            'store_state' => 'on_hold',
        ]);
    }

    private function acknowledgeIfNeeded(
        ?Subscription $sub,
        GooglePlayBillingService $billing,
        RevenueCatService $rcService,
        string $productId,
        string $purchaseToken,
    ): void {
        // An unacknowledged purchase is REFUNDED by Google after three days, so
        // a purchase whose token never reached us is the one case that must not
        // be skipped. Ask Play who bought it and record it first.
        $sub ??= $this->adopt($billing, $rcService, $productId, $purchaseToken);

        if (! $sub) {
            return;
        }

        $billing->acknowledgeSubscription($productId, $purchaseToken);
    }

    /**
     * Attribute a purchase token we have no row for, and record it.
     *
     * Two ways in, both from Play's own copy of the purchase: the obfuscated
     * account id the app sets at checkout, and the linked purchase token an
     * upgrade or plan change leaves pointing at the subscription it replaced.
     * Returns null (with a warning) when neither identifies an account, because
     * inventing an owner is worse than the gap.
     */
    private function adopt(
        GooglePlayBillingService $billing,
        RevenueCatService $rcService,
        string $productId,
        string $purchaseToken,
    ): ?Subscription {
        try {
            $data = $billing->verifySubscription($productId, $purchaseToken);
        } catch (\Throwable $e) {
            Log::warning('Google Play RTDN: could not verify an unknown purchase token', [
                'product_id' => $productId,
                'error' => $e->getMessage(),
            ]);

            return null;
        }

        $userId = $this->userIdFrom($data);

        if (! $userId) {
            Log::warning('Google Play RTDN: a purchase token we have no record of could not be attributed to an account', [
                'product_id' => $productId,
            ]);

            return null;
        }

        $plan = $this->planFrom($data, $rcService);

        Log::info('Google Play RTDN: adopting a purchase this server had no record of', [
            'user_id' => $userId,
            'plan_id' => $plan?->id,
        ]);

        return Subscription::updateOrCreate(
            ['purchase_token' => $purchaseToken],
            [
                'user_id' => $userId,
                'plan_id' => $plan?->id,
                'status' => 'active',
                'store' => 'google_play',
                'store_transaction_id' => $data['orderId'] ?? null,
                'google_order_id' => $data['orderId'] ?? null,
                'started_at' => $this->startFrom($data) ?? now(),
                'ends_at' => $this->expiryFrom($data),
                'auto_renewing' => $this->autoRenewingFrom($data, default: true),
                'store_state' => $this->storeStateFrom($data),
                'last_event_at' => $this->eventAt,
            ],
        );
    }

    /** The account a verified purchase belongs to, if Play's copy says. */
    private function userIdFrom(array $data): ?int
    {
        $obfuscated = (string) ($data['obfuscatedExternalAccountId']
            ?? $data['externalAccountIdentifiers']['obfuscatedExternalAccountId']
            ?? '');

        if ($obfuscated !== '' && $userId = Subscription::userIdFromObfuscatedAccountId($obfuscated)) {
            return $userId;
        }

        // A plan change issues a new token and points it at the old one, so the
        // subscription it replaced names the owner.
        $linked = (string) ($data['linkedPurchaseToken'] ?? '');
        if ($linked !== '') {
            $previous = Subscription::where('purchase_token', $linked)->first();
            if ($previous) {
                return (int) $previous->user_id;
            }
        }

        return null;
    }

    /**
     * The plan a verified purchase names.
     *
     * Only the subscription id plus the base plan id identify a price, and they
     * arrive separately (v2) or not at all (v3). Anything less resolves to
     * null, which is the honest answer - resolvePlan deliberately refuses to
     * guess a plan from the parent subscription id.
     */
    private function planFrom(array $data, RevenueCatService $rcService): ?Plan
    {
        $lineItem = $data['lineItems'][0] ?? [];
        $product = (string) ($lineItem['productId'] ?? '');
        $basePlan = (string) ($lineItem['offerDetails']['basePlanId'] ?? '');

        if ($product === '' || $basePlan === '') {
            return null;
        }

        return $rcService->resolvePlan(str_contains($product, ':') ? $product : "{$product}:{$basePlan}");
    }

    /** Play sends the expiry as epoch millis (v3) or RFC 3339 (v2). */
    private function expiryFrom(array $data): ?Carbon
    {
        if (isset($data['expiryTimeMillis'])) {
            return Carbon::createFromTimestampMs((int) $data['expiryTimeMillis']);
        }

        $expiry = $data['lineItems'][0]['expiryTime'] ?? null;

        return is_string($expiry) && $expiry !== '' ? Carbon::parse($expiry) : null;
    }

    private function startFrom(array $data): ?Carbon
    {
        if (isset($data['startTimeMillis'])) {
            return Carbon::createFromTimestampMs((int) $data['startTimeMillis']);
        }

        $start = $data['startTime'] ?? null;

        return is_string($start) && $start !== '' ? Carbon::parse($start) : null;
    }

    private function autoRenewingFrom(array $data, bool $default): bool
    {
        if (array_key_exists('autoRenewing', $data)) {
            return (bool) $data['autoRenewing'];
        }

        $renewing = $data['lineItems'][0]['autoRenewingPlan']['autoRenewEnabled'] ?? null;

        return $renewing === null ? $default : (bool) $renewing;
    }

    /** Play's own word for the state, across both API shapes. */
    private function storeStateFrom(array $data): ?string
    {
        $state = (string) ($data['subscriptionState'] ?? '');

        if ($state !== '') {
            return self::STORE_STATES[$state] ?? strtolower(str_replace('SUBSCRIPTION_STATE_', '', $state));
        }

        // v3 has no state field; a resume time is only ever set while paused.
        if (isset($data['autoResumeTimeMillis'])) {
            return 'paused';
        }

        return null;
    }
}
