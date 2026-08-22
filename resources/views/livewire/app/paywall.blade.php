<div class="min-h-[100dvh] pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]">
    @php($subscribed = auth()->user()?->isSubscribed())
    <header class="relative flex items-center justify-center px-5 py-4">
        @if ($subscribed || ! auth()->check())
            <a href="{{ $subscribed ? route('home') : route('knowledge.index') }}" wire:navigate class="absolute left-3 grid h-11 w-11 place-items-center rounded-full text-muted tap" aria-label="Close">
                <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </a>
        @else
            {{-- Signed in without a subscription: the paywall is the whole app,
                 so the only way out is signing out. --}}
            <button wire:click="logout" @click="window.beginLogout && window.beginLogout()"
                    wire:loading.attr="disabled" wire:target="logout"
                    class="absolute left-4 rounded-full px-3 py-1.5 text-sm font-semibold text-muted tap">
                Log out
            </button>
        @endif
        <h1 class="text-xl font-bold">{{ $subscribed ? 'Manage Plan' : 'Premium' }}</h1>
    </header>

    <div class="px-6 pt-2 text-center">
        <h2 class="text-2xl font-bold leading-tight">{{ $subscribed ? 'Unlock the full programme' : 'Start your transformation journey now' }}</h2>
    </div>

    <div class="mt-6 space-y-3 px-4">
        @foreach ($plans as $plan)
            @php($selected = $selectedPlan === $plan->id)
            @php($isFree = $plan->price <= 0)
            @php($isCurrentPlan = $activeSub?->plan_id === $plan->id)
            @php($intervalLabel = $plan->interval === 'lifetime'
                ? ''
                : '/'.($plan->interval_count > 1
                    ? $plan->interval_count.' '.\Illuminate\Support\Str::plural($plan->interval, $plan->interval_count)
                    : $plan->interval))
            <button wire:click="$set('selectedPlan', {{ $plan->id }})"
                    class="relative w-full rounded-2xl border-2 p-4 text-left tap {{ $selected ? 'border-accent bg-accent/10' : 'border-white/10 bg-surface' }}">
                @if ($plan->is_featured)
                    <span class="absolute -top-2.5 right-4 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">Best value</span>
                @endif
                @if ($isCurrentPlan)
                    <span class="absolute -top-2.5 left-4 rounded-full bg-success/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-success">Current plan</span>
                @endif
                <div class="flex items-center justify-between">
                    <div>
                        <p class="font-bold">{{ $plan->name }}</p>
                        <p class="text-sm text-muted">{{ $plan->description }}</p>
                    </div>
                    <div class="text-right">
                        @if ($isFree)
                            <p class="text-lg font-bold">Free</p>
                        @else
                            <p class="text-lg font-bold">${{ number_format($plan->price, 2) }}</p>
                            <p class="text-xs text-muted">{{ $intervalLabel }}</p>
                        @endif
                    </div>
                </div>
            </button>
        @endforeach
    </div>

    @if ($message)
        <p class="mx-4 mt-4 text-sm text-accent-soft">{{ $message }}</p>
    @endif

    <div class="fixed inset-x-0 bottom-0 mx-auto max-w-[440px] border-t border-white/5 bg-bg/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        @php($selectedPlanModel = $selectedPlan ? $plans->firstWhere('id', $selectedPlan) : null)
        @php($selectedIsFree = $selectedPlanModel && $selectedPlanModel->price <= 0)
        @php($isUpgrade = $activeSub && $selectedPlan && $activeSub->plan_id !== $selectedPlan)
        <button wire:click="subscribe({{ $selectedPlan }})" @disabled(! $selectedPlan || $purchasing)
                wire:loading.attr="disabled" wire:target="subscribe"
                class="relative grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap disabled:opacity-50">
            {{-- Spinner during the subscribe round-trip --}}
            <svg wire:loading wire:target="subscribe" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            <span wire:loading.remove wire:target="subscribe" class="grid place-items-center">
                @if ($purchasing)
                    <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                @elseif ($isUpgrade)
                    Switch to {{ $selectedPlanModel?->name }}
                @elseif ($selectedIsFree)
                    Continue with Free
                @else
                    Continue
                @endif
            </span>
        </button>
        @if (! $selectedIsFree && ! $purchasing)
            <p class="mt-2 text-center text-[11px] leading-relaxed text-muted">
                Payment is charged to your Google&nbsp;Play account on confirmation. Your subscription renews automatically at the price shown until you cancel it in Google&nbsp;Play; uninstalling the app does not cancel or refund it. By continuing you agree to our
                <a href="{{ route('page.show', 'terms') }}" class="text-accent underline">Terms</a>
                and the
                <a href="https://play.google.com/about/play-terms/" target="_blank" rel="noopener" class="text-accent underline">Google&nbsp;Play Terms</a>.
            </p>
        @endif
        @if ($message && $selectedIsFree)
            <p class="mt-1 text-center text-xs text-accent-soft">{{ $message }}</p>
        @endif
    </div>

    {{-- Auto-renewal notice after purchase --}}
    @if ($showAutoRenewalNotice)
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
            <div class="modal-panel w-full max-w-[440px] rounded-t-[2.5rem] bg-surface border-t border-white/10 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl animate-[scale-in_200ms_ease]">
                <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/10"></div>
                <div class="mb-5 flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-success/15">
                    <svg viewBox="0 0 24 24" class="h-7 w-7 text-success" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>
                </div>
                <h2 class="text-center text-xl font-bold">Subscription activated!</h2>
                <p class="mt-2 text-center text-sm text-muted">Your subscription is now active and full access has been unlocked.</p>

                <div class="mt-4 rounded-xl bg-surface-2 p-4 text-sm">
                    <div class="flex items-center justify-between">
                        <span class="text-muted">Auto-renewal</span>
                        <span class="font-semibold {{ $autoRenewing ? 'text-success' : 'text-accent-soft' }}">
                            {{ $autoRenewing ? 'On' : 'Off' }}
                        </span>
                    </div>
                    <p class="mt-2 text-xs text-muted">
                        {{ $autoRenewing
                            ? 'Your subscription renews automatically. You can turn this off anytime in your subscription settings.'
                            : 'Auto-renewal is off. Your access will end at the expiry date.' }}
                    </p>
                </div>

                <button wire:click="continueToApp" class="mt-4 grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">
                    Continue to App
                </button>
            </div>
        </div>
    @endif
</div>
