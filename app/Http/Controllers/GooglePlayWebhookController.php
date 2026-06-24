<?php

namespace App\Http\Controllers;

use App\Models\Subscription;
use App\Services\GooglePlayBillingService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
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

    public function handle(Request $request, GooglePlayBillingService $billing): Response
    {
        // Pub/Sub pushes a base64-encoded JSON payload in message.data
        $encoded = $request->input('message.data', '');
        $payload = json_decode(base64_decode($encoded), true);

        if (! $payload) {
            return response('invalid payload', 400);
        }

        // Google Play sends either subscriptionNotification or oneTimeProductNotification
        $notification = $payload['subscriptionNotification'] ?? null;
        if (! $notification) {
            return response('ok'); // not a subscription event; ignore
        }

        $purchaseToken = $notification['purchaseToken'] ?? null;
        $productId = $notification['subscriptionId'] ?? null;
        $type = (int) ($notification['notificationType'] ?? 0);

        if (! $purchaseToken || ! $productId) {
            return response('missing fields', 400);
        }

        $subscription = Subscription::where('purchase_token', $purchaseToken)->first();

        try {
            $this->dispatch($type, $subscription, $billing, $productId, $purchaseToken);
        } catch (\Throwable $e) {
            Log::error('Google Play webhook handler failed', [
                'type' => $type,
                'productId' => $productId,
                'error' => $e->getMessage(),
            ]);
        }

        // Always return 200 so Pub/Sub does not keep retrying
        return response('ok');
    }

    private function dispatch(
        int $type,
        ?Subscription $sub,
        GooglePlayBillingService $billing,
        string $productId,
        string $purchaseToken,
    ): void {
        match ($type) {
            self::SUBSCRIPTION_RECOVERED,
            self::SUBSCRIPTION_RENEWED,
            self::SUBSCRIPTION_RESTARTED => $this->renew($sub, $billing, $productId, $purchaseToken),

            self::SUBSCRIPTION_CANCELED,
            self::SUBSCRIPTION_REVOKED => $sub?->update(['status' => 'canceled', 'canceled_at' => now()]),

            self::SUBSCRIPTION_ON_HOLD,
            self::SUBSCRIPTION_IN_GRACE_PERIOD => $sub?->update(['status' => 'past_due']),

            self::SUBSCRIPTION_EXPIRED => $sub?->update(['status' => 'expired']),

            // SUBSCRIPTION_PURCHASED is usually handled app-side; just acknowledge if we missed it
            self::SUBSCRIPTION_PURCHASED => $this->acknowledgeIfNeeded($billing, $productId, $purchaseToken),

            default => null,
        };
    }

    private function renew(
        ?Subscription $sub,
        GooglePlayBillingService $billing,
        string $productId,
        string $purchaseToken,
    ): void {
        if (! $sub) {
            return;
        }

        $data = $billing->verifySubscription($productId, $purchaseToken);

        $sub->update([
            'status' => 'active',
            'purchase_token' => $purchaseToken,
            'google_order_id' => $data['orderId'] ?? $sub->google_order_id,
            'ends_at' => isset($data['expiryTimeMillis'])
                ? Carbon::createFromTimestampMs($data['expiryTimeMillis'])
                : $sub->ends_at,
        ]);
    }

    private function acknowledgeIfNeeded(
        GooglePlayBillingService $billing,
        string $productId,
        string $purchaseToken,
    ): void {
        // Only acknowledge if the subscription exists in our DB (app-side already created it)
        if (Subscription::where('purchase_token', $purchaseToken)->exists()) {
            $billing->acknowledgeSubscription($productId, $purchaseToken);
        }
    }
}
