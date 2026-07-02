<?php

namespace App\Livewire\App;

use App\Mail\SubscriptionStartedMail;
use App\Models\Plan;
use App\Models\Subscription;
use App\Services\GooglePlayBillingService;
use App\Services\SettingsService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Livewire\Attributes\Layout;
use Livewire\Attributes\On;
use Livewire\Component;
use Native\Mobile\Facades\InAppPurchase;

#[Layout('components.layouts.app')]
class Paywall extends Component
{
    /**
     * Google Play replacement modes for plan switches.
     * - WITH_TIME_PRORATION (upgrade): switch immediately and credit the unused
     *   portion of the old plan as extra time on the new one.
     * - DEFERRED (downgrade): keep the current plan until the paid period ends,
     *   then start the new (cheaper) plan — the user keeps what they paid for.
     */
    private const PRORATION_MODE = 'WITH_TIME_PRORATION';
    private const DEFERRED_MODE = 'DEFERRED';

    public ?int $selectedPlan = null;
    public ?string $message = null;
    public bool $purchasing = false;
    public bool $showAutoRenewalNotice = false;
    public bool $autoRenewing = true;

    public function mount(): void
    {
        $this->selectedPlan = Plan::where('is_active', true)->where('is_featured', true)->value('id')
            ?? Plan::where('is_active', true)->where('price', '>', 0)->orderBy('sort_order')->value('id');

        // Pre-select current plan for existing subscribers so they can upgrade
        $active = auth()->user()?->activeSubscription();
        if ($active?->plan_id) {
            $this->selectedPlan = $active->plan_id;
        }
    }

    public function subscribe(int $planId): void
    {
        $plan = Plan::findOrFail($planId);
        $user = auth()->user();

        if ($plan->price <= 0) {
            $this->createSubscription($plan, $user, 'free');
            $this->redirectRoute('home', navigate: true);
            return;
        }

        // The native app always bills through Google Play. The manual path
        // only exists for the backend website (admin testing).
        $gpEnabled = \App\Services\Sync\BackendClient::isClient()
            || app(SettingsService::class)->get('google_play_enabled', false);
        if ($gpEnabled && ! empty($plan->store_product_id)) {
            $this->initiateGooglePlayPurchase($plan);
            return;
        }

        // Web / manual fallback
        $this->createSubscription($plan, $user, 'manual');
        $this->redirectRoute('home', navigate: true);
    }

    private function initiateGooglePlayPurchase(Plan $plan): void
    {
        $this->purchasing = true;
        $this->message = null;

        $current = auth()->user()->activeSubscription();

        // Switching from an existing Google Play subscription uses Play's native
        // proration: hand Google the old purchase token + replacement mode and it
        // credits/charges and replaces the old subscription itself. We pick the
        // mode by direction — upgrades switch now, downgrades defer to period end
        // (by absolute price, so monthly→yearly is an upgrade, yearly→monthly a
        // downgrade, matching Google's recommended behaviour). A first-time
        // subscriber just buys fresh.
        if ($current && $current->isGooglePlay() && $current->purchase_token && $current->plan_id !== $plan->id) {
            $currentPlan = $current->plan;
            $isUpgrade = ! $currentPlan || $plan->price >= $currentPlan->price;

            InAppPurchase::purchase(
                $plan->store_product_id,
                $current->purchase_token,
                $isUpgrade ? self::PRORATION_MODE : self::DEFERRED_MODE,
            );
        } else {
            InAppPurchase::purchase($plan->store_product_id);
        }
    }

    #[On('native:InAppPurchase.purchaseCompleted')]
    public function onPurchaseCompleted(string $purchaseToken, string $productId, ?string $orderId = null): void
    {
        $this->purchasing = false;

        $plan = Plan::where('store_product_id', $productId)->where('is_active', true)->first();
        if (! $plan) {
            $this->message = 'Purchase received but plan could not be matched. Contact support.';
            return;
        }

        // Idempotency: a re-delivered completion for a token we already recorded
        // must not create a duplicate subscription or re-send the welcome email.
        if (Subscription::where('purchase_token', $purchaseToken)->exists()) {
            $this->showAutoRenewalNotice = true;
            return;
        }

        // On the device the Play client just completed a real purchase, but the
        // verification key lives only on the backend. Record the subscription
        // locally now (instant access) and report the token; the backend
        // verifies it with Google before storing its authoritative copy.
        if (\App\Services\Sync\BackendClient::isClient()) {
            $user   = auth()->user();
            $oldSub = $user->activeSubscription();
            if ($oldSub && $oldSub->plan_id !== $plan->id) {
                $oldSub->update(['status' => 'canceled', 'canceled_at' => now(), 'auto_renewing' => false]);
            }

            $this->createSubscription(
                plan: $plan,
                user: $user,
                store: 'google_play',
                purchaseToken: $purchaseToken,
                orderId: $orderId,
                status: 'active',
                autoRenewing: true,
            );

            try {
                app(\App\Services\Sync\UserSyncService::class)->push($user);
            } catch (\Throwable $e) {
                // Offline right now - the background sync delivers the token later.
            }

            $this->autoRenewing = true;
            $this->showAutoRenewalNotice = true;
            return;
        }

        try {
            $billing = app(GooglePlayBillingService::class);
            $data    = $billing->verifySubscription($productId, $purchaseToken);

            if (! in_array($data['paymentState'] ?? -1, [1, 2], true)) {
                $this->message = 'Payment is still processing. Please check back shortly.';
                return;
            }

            $billing->acknowledgeSubscription($productId, $purchaseToken);

            $expiresAt       = isset($data['expiryTimeMillis'])
                ? Carbon::createFromTimestampMs((int) $data['expiryTimeMillis'])
                : null;
            $isTrial         = ($data['paymentState'] ?? 0) === 2;
            $this->autoRenewing = (bool) ($data['autoRenewing'] ?? true);

            $user   = auth()->user();
            $oldSub = $user->activeSubscription();

            // With native proration Google has already replaced the old
            // subscription and returned the correct prorated expiry in
            // expiryTimeMillis — no manual day-carry. Just retire our old record;
            // Google also fires a CANCELED webhook for it as a backstop.
            if ($oldSub && $oldSub->plan_id !== $plan->id) {
                $oldSub->update([
                    'status'        => 'canceled',
                    'canceled_at'   => now(),
                    'auto_renewing' => false,
                ]);
            }

            $this->createSubscription(
                plan: $plan,
                user: $user,
                store: 'google_play',
                purchaseToken: $purchaseToken,
                orderId: $data['orderId'] ?? $orderId,
                status: $isTrial ? 'trialing' : 'active',
                endsAt: $expiresAt,
                trialEndsAt: $isTrial ? $expiresAt : null,
                autoRenewing: $this->autoRenewing,
            );

            // Show auto-renewal notice before redirecting
            $this->showAutoRenewalNotice = true;
        } catch (\Throwable $e) {
            Log::error('Google Play purchase verification failed', [
                'error'     => $e->getMessage(),
                'productId' => $productId,
            ]);
            $this->message = 'Purchase could not be verified. Please contact support.';
        }
    }

    public function continueToApp(): void
    {
        $this->redirectRoute('home', navigate: true);
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

    private function createSubscription(
        Plan $plan,
        \App\Models\User $user,
        string $store,
        ?string $purchaseToken = null,
        ?string $orderId = null,
        ?string $status = null,
        ?\DateTimeInterface $endsAt = null,
        ?\DateTimeInterface $trialEndsAt = null,
        bool $autoRenewing = true,
    ): Subscription {
        $trialDays   = (int) app(SettingsService::class)->get('subscription_trial_days', 0);
        $status    ??= $trialDays > 0 ? 'trialing' : 'active';
        $trialEndsAt ??= $trialDays > 0 ? now()->addDays($trialDays) : null;
        $endsAt    ??= match ($plan->interval) {
            'day'   => now()->addDays($plan->interval_count),
            'week'  => now()->addWeeks($plan->interval_count),
            'month' => now()->addMonths($plan->interval_count),
            'year'  => now()->addYears($plan->interval_count),
            default => null,
        };

        $subscription = Subscription::create([
            'user_id'              => $user->id,
            'plan_id'              => $plan->id,
            'status'               => $status,
            'store'                => $store,
            'store_transaction_id' => $orderId,
            'purchase_token'       => $purchaseToken,
            'google_order_id'      => $orderId,
            'trial_ends_at'        => $trialEndsAt,
            'started_at'           => now(),
            'ends_at'              => $endsAt,
            'auto_renewing'        => $autoRenewing,
        ]);

        try {
            Mail::to($user)->send(new SubscriptionStartedMail($subscription));
        } catch (\Throwable $e) {
            Log::warning('Failed to send subscription started email', ['error' => $e->getMessage()]);
        }

        return $subscription;
    }

    public function render(SettingsService $settings)
    {
        return view('livewire.app.paywall', [
            'plans'      => Plan::where('is_active', true)->orderBy('sort_order')->get(),
            'trialDays'  => (int) $settings->get('subscription_trial_days', 0),
            'activeSub'  => auth()->user()?->activeSubscription(),
        ]);
    }
}
