<?php

namespace App\Livewire\App;

use App\Livewire\Concerns\HandlesGoogleAuth;
use App\Mail\SubscriptionStartedMail;
use App\Models\Level;
use App\Models\Plan;
use App\Models\Subscription;
use App\Services\GooglePlayBillingService;
use App\Services\SettingsService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Livewire\Attributes\On;
use Livewire\Component;
use Native\Mobile\Facades\InAppPurchase;

/**
 * Bottom-sheet paywall for guests on public knowledge pages.
 * Handles plan selection, inline registration/login, and Google Play purchase.
 */
class SubscribeSheet extends Component
{
    use HandlesGoogleAuth;

    public bool $showSheet  = false;
    public string $step     = 'plans'; // 'plans' | 'auth'
    public string $authMode = 'register';
    public ?int $selectedPlan = null;
    public bool $purchasing = false;
    public ?string $message = null;

    /** Where to send the user if they dismiss the sheet (e.g. onboarding sends
     *  them to the basics). Null keeps the current "just hide" behaviour. */
    public ?string $closeTo = null;

    /** The sticky "Subscribe" CTA bar shown when the sheet is closed. On the
     *  knowledge sales pages it's the funnel; onboarding hides it and opens the
     *  sheet from its own final CTA instead. */
    public bool $showBar = true;

    public function mount(bool $showBar = true): void
    {
        $this->showBar = $showBar;
    }

    // Auth fields
    public string $name     = '';
    public string $email    = '';
    public string $password = '';
    public string $password_confirmation = '';

    public function getGoogleEnabledProperty(): bool
    {
        return (bool) app(SettingsService::class)->get('google_login_enabled');
    }

    #[On('open-subscribe-sheet')]
    public function open(?string $closeTo = null): void
    {
        $this->closeTo      = $closeTo;
        $this->showSheet    = true;
        $this->step         = 'plans';
        $this->message      = null;
        $this->selectedPlan = Plan::where('is_active', true)->where('is_featured', true)->value('id')
            ?? Plan::where('is_active', true)->where('price', '>', 0)->orderBy('sort_order')->value('id');
    }

    public function close()
    {
        $this->showSheet  = false;
        $this->purchasing = false;
        $this->message    = null;
        $this->reset(['name', 'email', 'password', 'password_confirmation']);
        $this->resetValidation();

        // Opened from onboarding: dismissing the plans goes to the basics.
        if ($this->closeTo) {
            $target = $this->closeTo;
            $this->closeTo = null;
            return $this->redirect($target, navigate: true);
        }
    }

    public function selectPlan(int $planId): void
    {
        $this->selectedPlan = $planId;
    }

    public function selectAndProceed(int $planId): void
    {
        $this->selectedPlan = $planId;
        $this->step         = 'auth';
        $this->message      = null;
        $this->resetValidation();
    }

    public function switchAuth(string $mode): void
    {
        $this->authMode = $mode;
        $this->resetValidation();
    }

    public function register(): void
    {
        $this->validate([
            'name'     => 'required|string|max:120',
            'email'    => 'required|email|max:190',
            'password' => 'required|string|min:6|regex:/[0-9]/|confirmed',
        ], [
            'name.required'      => 'Name is required.',
            'email.required'     => 'Email is required.',
            'email.email'        => 'Enter a valid email address.',
            'password.required'  => 'Password is required.',
            'password.min'       => 'Password must be at least 6 characters and include a number.',
            'password.regex'     => 'Password must be at least 6 characters and include a number.',
            'password.confirmed' => "Passwords don't match.",
        ]);

        // On the device the backend owns accounts: register there first, then
        // mirror the confirmed account locally. Requires internet.
        if (\App\Services\Sync\BackendClient::isClient()) {
            $result = \App\Services\RemoteAuth::register(trim($this->name), strtolower($this->email), $this->password);

            if (empty($result['user'])) {
                $this->addError('email', $result['error'] ?? 'Could not reach the server. Check your internet connection and try again.');
                return;
            }

            $user = \App\Services\RemoteAuth::mirror($result['user']);
        } else {
            $this->validate(['email' => 'unique:users,email'], ['email.unique' => 'This email is already registered.']);

            $user = \App\Models\User::create([
                'name'              => trim($this->name),
                'email'             => strtolower($this->email),
                'password'          => Hash::make($this->password),
                'email_verified_at' => now(),
                'level_id'          => Level::where('is_active', true)->orderBy('number')->value('id'),
            ]);
        }

        Auth::login($user, true);
        session()->regenerate();

        $this->triggerPurchase();
    }

    public function login(): void
    {
        $this->validate([
            'email'    => 'required|email',
            'password' => 'required',
        ], [
            'email.required'    => 'Email is required.',
            'password.required' => 'Password is required.',
        ]);

        if (\App\Services\Sync\BackendClient::isClient()) {
            $result = \App\Services\RemoteAuth::login(strtolower($this->email), $this->password);

            if (empty($result['user'])) {
                $this->addError('email', match ($result['reason'] ?? '') {
                    'invalid' => 'Email or password is incorrect.',
                    'server' => 'The server hit a problem. Please try again in a moment.',
                    default => 'Could not reach the server. Check your internet connection and try again.',
                });
                return;
            }

            $user = \App\Services\RemoteAuth::mirror($result['user']);
        } else {
            $user = \App\Models\User::where('email', strtolower($this->email))->first();

            if (! $user || ! $user->password || ! Hash::check($this->password, $user->password)) {
                $this->addError('email', 'Email or password is incorrect.');
                return;
            }
        }

        Auth::login($user, true);
        session()->regenerate();

        \App\Services\RemoteAuth::syncAfterLogin($user);

        if ($user->isSubscribed()) {
            $this->redirectRoute('home', navigate: true);
            return;
        }

        $this->triggerPurchase();
    }

    private function triggerPurchase(): void
    {
        $plan = Plan::find($this->selectedPlan);
        if (! $plan) {
            $this->message = 'Plan not found. Please try again.';
            return;
        }

        // The native app always bills through Google Play. The manual path
        // only exists for the backend website (admin testing).
        $gpEnabled = \App\Services\Sync\BackendClient::isClient()
            || app(SettingsService::class)->get('google_play_enabled', false);

        if ($gpEnabled && ! empty($plan->store_product_id)) {
            $this->purchasing = true;
            $this->message    = null;
            InAppPurchase::purchase($plan->store_product_id);
        } else {
            $this->createSubscription($plan, auth()->user(), 'manual');
            $this->redirectRoute('home', navigate: true);
        }
    }

    #[On('native:InAppPurchase.purchaseCompleted')]
    public function onPurchaseCompleted(string $purchaseToken, string $productId, ?string $orderId = null): void
    {
        $this->purchasing = false;

        if (! auth()->check()) {
            $this->message = 'Session expired. Please try again.';
            return;
        }

        $plan = Plan::where('store_product_id', $productId)->where('is_active', true)->first();
        if (! $plan) {
            $this->message = 'Purchase received but plan could not be matched. Contact support.';
            return;
        }

        // Idempotency: ignore a re-delivered completion for a known token.
        if (Subscription::where('purchase_token', $purchaseToken)->exists()) {
            $this->redirectRoute('home', navigate: true);
            return;
        }

        // On the device: record locally for instant access and report the
        // token; the backend verifies it with Google before storing.
        if (\App\Services\Sync\BackendClient::isClient()) {
            $user = auth()->user();

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

            $this->redirectRoute('home', navigate: true);
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

            $expiresAt   = isset($data['expiryTimeMillis'])
                ? Carbon::createFromTimestampMs((int) $data['expiryTimeMillis'])
                : null;
            $isTrial     = ($data['paymentState'] ?? 0) === 2;
            $autoRenewing = (bool) ($data['autoRenewing'] ?? true);

            $this->createSubscription(
                plan: $plan,
                user: auth()->user(),
                store: 'google_play',
                purchaseToken: $purchaseToken,
                orderId: $data['orderId'] ?? $orderId,
                status: $isTrial ? 'trialing' : 'active',
                endsAt: $expiresAt,
                trialEndsAt: $isTrial ? $expiresAt : null,
                autoRenewing: $autoRenewing,
            );

            $this->redirectRoute('home', navigate: true);
        } catch (\Throwable $e) {
            Log::error('SubscribeSheet purchase verification failed', ['error' => $e->getMessage()]);
            $this->message = 'Purchase could not be verified. Please contact support.';
        }
    }

    #[On('native:InAppPurchase.purchaseFailed')]
    public function onPurchaseFailed(): void
    {
        $this->purchasing = false;
        $this->message    = 'Purchase failed. Please try again.';
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
            Log::warning('Failed to send subscription email', ['error' => $e->getMessage()]);
        }

        return $subscription;
    }

    public function render()
    {
        return view('livewire.app.subscribe-sheet', [
            'plans'     => Plan::where('is_active', true)->where('price', '>', 0)->orderBy('sort_order')->get(),
        ]);
    }
}
