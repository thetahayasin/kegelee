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
        // 1. Authorization check if webhook secret configured
        $configuredSecret = (string) ($settings->get('revenuecat_webhook_secret') ?: config('services.revenuecat.webhook_secret', ''));
        if (! empty($configuredSecret)) {
            $authHeader = $request->header('Authorization', '');
            $providedSecret = str_replace('Bearer ', '', $authHeader);
            if ($providedSecret !== $configuredSecret) {
                Log::warning('RevenueCat webhook unauthorized attempt', [
                    'ip' => $request->ip(),
                ]);
                return response('Unauthorized', 401);
            }
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
            default            => null,
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

        try {
            Mail::to($sub->user)->send(new SubscriptionCanceledMail($sub->fresh()));
        } catch (\Throwable $e) {
            Log::warning('Failed to send revocation email via RevenueCat webhook', ['error' => $e->getMessage()]);
        }
    }
}
