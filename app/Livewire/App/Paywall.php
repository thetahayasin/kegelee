<?php

namespace App\Livewire\App;

use App\Models\Discount;
use App\Models\Plan;
use App\Models\Subscription;
use App\Services\GooglePlayBillingService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Livewire\Attributes\Layout;
use Livewire\Attributes\On;
use Livewire\Component;
use Native\Mobile\Facades\InAppPurchase;

#[Layout('components.layouts.app')]
class Paywall extends Component
{
    public ?int $selectedPlan = null;

    public string $code = '';

    public ?Discount $discount = null;

    public ?string $message = null;

    public bool $purchasing = false;

    public function mount(): void
    {
        $this->selectedPlan = Plan::where('is_active', true)->where('is_featured', true)->value('id')
            ?? Plan::where('is_active', true)->where('price', '>', 0)->orderBy('sort_order')->value('id');
    }

    public function applyCode(): void
    {
        $discount = Discount::where('code', strtoupper(trim($this->code)))->first();

        if (! $discount || ! $discount->isRedeemable()) {
            $this->discount = null;
            $this->message = 'That code is not valid.';

            return;
        }

        $this->discount = $discount;
        $this->message = 'Code applied: '.($discount->type === 'percent' ? $discount->value.'% off' : '$'.$discount->value.' off');
    }

    /**
     * Entry point for the subscribe button.
     * Routes to Google Play billing when a store_product_id is set on the plan,
     * otherwise falls back to manual subscription (for web / admin-gifted subs).
     */
    public function subscribe(int $planId): void
    {
        $plan = Plan::findOrFail($planId);
        $user = auth()->user();

        if ($plan->price <= 0) {
            $this->redirectRoute('home', navigate: true);

            return;
        }

        // Route to Google Play billing when the plan has a Play Store product ID
        if (! empty($plan->store_product_id)) {
            $this->initiateGooglePlayPurchase($plan);

            return;
        }

        // Manual / web fallback
        $this->createSubscription($plan, $user, 'manual');
        $this->redirectRoute('profile', navigate: true);
    }

    // -------------------------------------------------------------------------
    // Google Play billing
    // -------------------------------------------------------------------------

    private function initiateGooglePlayPurchase(Plan $plan): void
    {
        $this->purchasing = true;
        $this->message = null;

        // Triggers the native Android billing sheet via NativePHP Mobile
        InAppPurchase::purchase($plan->store_product_id);
    }

    /**
     * Fired by NativePHP Mobile when the user completes a Play Store purchase.
     * The event name follows NativePHP Mobile v3's convention.
     */
    #[On('native:InAppPurchase.purchaseCompleted')]
    public function onPurchaseCompleted(string $purchaseToken, string $productId, ?string $orderId = null): void
    {
        $this->purchasing = false;

        $plan = Plan::where('store_product_id', $productId)->where('is_active', true)->first();

        if (! $plan) {
            $this->message = 'Purchase received but plan could not be matched. Contact support.';

            return;
        }

        try {
            /** @var GooglePlayBillingService $billing */
            $billing = app(GooglePlayBillingService::class);

            $data = $billing->verifySubscription($productId, $purchaseToken);

            // paymentState: 0=pending, 1=received, 2=free trial
            if (! in_array($data['paymentState'] ?? -1, [1, 2], true)) {
                $this->message = 'Payment is still processing. Please check back shortly.';

                return;
            }

            $billing->acknowledgeSubscription($productId, $purchaseToken);

            $expiresAt = isset($data['expiryTimeMillis'])
                ? Carbon::createFromTimestampMs((int) $data['expiryTimeMillis'])
                : null;

            $isTrial = ($data['paymentState'] ?? 0) === 2;

            $this->createSubscription(
                plan: $plan,
                user: auth()->user(),
                store: 'google_play',
                purchaseToken: $purchaseToken,
                orderId: $data['orderId'] ?? $orderId,
                status: $isTrial ? 'trialing' : 'active',
                endsAt: $expiresAt,
                trialEndsAt: $isTrial ? $expiresAt : null,
            );

            $this->redirectRoute('profile', navigate: true);
        } catch (\Throwable $e) {
            Log::error('Google Play purchase verification failed', [
                'error' => $e->getMessage(),
                'productId' => $productId,
            ]);
            $this->message = 'Purchase could not be verified. Please contact support.';
        }
    }

    #[On('native:InAppPurchase.purchaseFailed')]
    public function onPurchaseFailed(?string $error = null): void
    {
        $this->purchasing = false;
        $this->message = 'Purchase failed. Please try again.';
    }

    #[On('native:InAppPurchase.purchaseCancelled')]
    public function onPurchaseCancelled(): void
    {
        $this->purchasing = false;
    }

    // -------------------------------------------------------------------------

    private function createSubscription(
        Plan $plan,
        \App\Models\User $user,
        string $store,
        ?string $purchaseToken = null,
        ?string $orderId = null,
        ?string $status = null,
        ?\DateTimeInterface $endsAt = null,
        ?\DateTimeInterface $trialEndsAt = null,
    ): Subscription {
        $status ??= $plan->trial_days > 0 ? 'trialing' : 'active';
        $trialEndsAt ??= $plan->trial_days > 0 ? now()->addDays($plan->trial_days) : null;
        $endsAt ??= match ($plan->interval) {
            'day' => now()->addDays($plan->interval_count),
            'week' => now()->addWeeks($plan->interval_count),
            'month' => now()->addMonths($plan->interval_count),
            'year' => now()->addYears($plan->interval_count),
            default => null,
        };

        $subscription = Subscription::create([
            'user_id' => $user->id,
            'plan_id' => $plan->id,
            'discount_id' => $this->discount?->id,
            'status' => $status,
            'store' => $store,
            'store_transaction_id' => $orderId,
            'purchase_token' => $purchaseToken,
            'google_order_id' => $orderId,
            'trial_ends_at' => $trialEndsAt,
            'started_at' => now(),
            'ends_at' => $endsAt,
        ]);

        if ($this->discount) {
            $this->discount->increment('redemptions');
        }

        return $subscription;
    }

    public function render()
    {
        return view('livewire.app.paywall', [
            'plans' => Plan::where('is_active', true)->orderBy('sort_order')->get(),
        ]);
    }
}
