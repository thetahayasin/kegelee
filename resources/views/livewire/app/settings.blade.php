<div class="min-h-[100dvh] pb-16 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('profile') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold">Settings</h1>
    </header>

    {{-- Subscription --}}
    <p class="px-6 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Subscription</p>
    <div class="mx-4 overflow-hidden rounded-2xl bg-surface">
        @if ($subscription)
            <div class="px-5 py-4">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <p class="font-semibold">{{ $subscription->plan?->name ?? 'Premium' }}</p>
                        <p class="mt-0.5 text-sm {{ $subscription->status === 'trialing' ? 'text-accent-soft' : 'text-success' }}">
                            {{ $subscription->status === 'trialing' ? 'Free trial' : 'Active' }}{{ $subscription->ends_at ? ' · renews '.$subscription->ends_at->format('j M Y') : '' }}
                        </p>
                    </div>
                    <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold {{ $subscription->auto_renewing ? 'bg-success/15 text-success' : 'bg-white/10 text-muted' }}">
                        Auto-renew {{ $subscription->auto_renewing ? 'on' : 'off' }}
                    </span>
                </div>
            </div>
            <div class="divide-y divide-white/5 border-t border-white/5">
                <a href="{{ route('paywall') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
                    <span>Change plan</span><span class="text-muted">›</span>
                </a>
                @if ($manageUrl)
                    <a href="{{ $manageUrl }}" target="_blank" rel="noopener" class="flex items-center justify-between px-5 py-4 tap">
                        <span>Manage or cancel in Google Play</span>
                        <svg viewBox="0 0 24 24" class="h-4 w-4 text-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
                    </a>
                @endif
            </div>
            @if ($subscription->isGooglePlay())
                <p class="px-5 pb-4 text-xs text-muted">Auto-renewal is managed by Google Play. Use the link above to turn it off or cancel - you'll keep access until {{ $subscription->ends_at?->format('j M Y') ?? 'the period ends' }}.</p>
            @endif
        @else
            <a href="{{ route('paywall') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
                <div>
                    <p class="font-semibold">No active subscription</p>
                    <p class="mt-0.5 text-sm text-muted">Subscribe to unlock full access</p>
                </div>
                <span class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">Subscribe</span>
            </a>
        @endif
    </div>

    {{-- Account --}}
    <p class="px-6 pb-2 pt-6 text-xs font-semibold uppercase tracking-wide text-muted">Account</p>
    <div class="mx-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-surface">
        <a href="{{ route('app.change-password') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
            <span>Change password</span><span class="text-muted">›</span>
        </a>
    </div>

    {{-- Legal / content pages --}}
    @if ($pages->isNotEmpty())
        <p class="px-6 pb-2 pt-6 text-xs font-semibold uppercase tracking-wide text-muted">Terms</p>
        <div class="mx-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-surface">
            @foreach ($pages as $p)
                <a href="{{ route('page.show', $p) }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
                    <span>{{ $p->title }}</span><span class="text-muted">›</span>
                </a>
            @endforeach
        </div>
    @endif

    {{-- Standalone actions --}}
    <div class="mt-10 space-y-3 px-4"
         x-data="{ showReset: false, offline: !navigator.onLine, _backOff: null }"
         x-init="$watch('showReset', open => { if (open) { _backOff = window.appBack?.register(() => { showReset = false; }); } else { _backOff?.(); _backOff = null; } })"
         @offline.window="offline = true" @online.window="offline = false"
         @app-offline.window="offline = true" @app-online.window="offline = false">
        <button @click="showReset = true"
                class="h-14 w-full rounded-2xl bg-surface font-semibold tap">Reset progress</button>
        <button wire:click="logout" @click="window.beginLogout && window.beginLogout()"
                wire:loading.attr="disabled" wire:target="logout"
                class="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-semibold tap disabled:opacity-70">
            <svg wire:loading wire:target="logout" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
            <span wire:loading.remove wire:target="logout">Log out</span>
            <span wire:loading wire:target="logout">Signing out...</span>
        </button>

        {{-- Reset progress confirmation modal --}}
        <template x-teleport="body">
            <div x-show="showReset" x-cloak
                 class="fixed inset-0 z-50 flex items-center justify-center px-6"
                 @keydown.escape.window="showReset = false">

                {{-- Backdrop --}}
                <div x-show="showReset"
                     x-transition:enter="transition ease-out duration-200"
                     x-transition:enter-start="opacity-0"
                     x-transition:enter-end="opacity-100"
                     x-transition:leave="transition ease-in duration-150"
                     x-transition:leave-start="opacity-100"
                     x-transition:leave-end="opacity-0"
                     @click="showReset = false"
                     class="absolute inset-0 bg-black/70"></div>

                {{-- Panel --}}
                <div x-show="showReset"
                     x-transition:enter="transition ease-out duration-200"
                     x-transition:enter-start="opacity-0 scale-95"
                     x-transition:enter-end="opacity-100 scale-100"
                     x-transition:leave="transition ease-in duration-150"
                     x-transition:leave-start="opacity-100 scale-100"
                     x-transition:leave-end="opacity-0 scale-95"
                     class="relative w-full max-w-sm rounded-3xl bg-surface border border-white/10 p-6 text-center shadow-2xl">

                    <h2 class="text-lg font-bold text-content">Reset progress?</h2>
                    <p class="mt-2 text-sm text-muted leading-relaxed">This will clear your training days, sessions, measurements and knowledge progress. This action cannot be undone.</p>

                    <div x-show="offline" x-cloak class="mt-3 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-medium text-accent-soft">
                        No internet connection — connect to reset your progress.
                    </div>
                    @error('reset') <p class="mt-3 text-sm text-accent-soft">{{ $message }}</p> @enderror

                    <div class="mt-6 flex gap-3">
                        <button @click="showReset = false"
                                class="h-12 flex-1 rounded-xl bg-white/5 font-semibold text-content tap">Cancel</button>
                        <button wire:click="resetProgress" x-bind:disabled="offline" wire:loading.attr="disabled" wire:target="resetProgress"
                                class="h-12 flex-1 rounded-xl bg-accent font-semibold text-white tap disabled:opacity-60">
                            <span x-show="offline">No internet</span>
                            <span x-show="!offline" wire:loading.remove wire:target="resetProgress">Reset</span>
                            <span x-show="!offline" wire:loading wire:target="resetProgress">Resetting...</span>
                        </button>
                    </div>
                </div>
            </div>
        </template>
    </div>
</div>
