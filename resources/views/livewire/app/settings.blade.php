<div class="min-h-[100dvh] pb-16 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('profile') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold">Settings</h1>
    </header>

    {{-- Subscription: just the status. Google Play manages billing, renewal
         and cancellation, so everything else lives there. --}}
    <p class="px-6 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Subscription</p>
    <div class="mx-4 overflow-hidden rounded-2xl bg-surface">
        @if ($subscription)
            <div class="flex items-center justify-between gap-3 px-5 py-4">
                <p class="font-semibold">Subscription</p>
                <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold {{ $subscription->status === 'trialing' ? 'bg-accent/15 text-accent-soft' : 'bg-success/15 text-success' }}">
                    {{ $subscription->status === 'trialing' ? 'Free trial' : 'Active' }}
                </span>
            </div>
            @if ($manageUrl)
                <div class="border-t border-white/5">
                    <a href="{{ $manageUrl }}" target="_blank" rel="noopener" class="flex items-center justify-between px-5 py-4 tap">
                        <div>
                            <p class="font-semibold">Cancel subscription</p>
                            <p class="mt-0.5 text-sm text-muted">Opens Google Play — the only place to cancel or turn off auto-renew.</p>
                        </div>
                        <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
                    </a>
                </div>
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

    {{-- Account. Changing the password needs the server, so it is disabled offline. --}}
    <p class="px-6 pb-2 pt-6 text-xs font-semibold uppercase tracking-wide text-muted">Account</p>
    <div class="mx-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-surface"
         x-data="{ offline: !navigator.onLine }"
         @offline.window="offline = true" @online.window="offline = false"
         @app-offline.window="offline = true" @app-online.window="offline = false">
        <a href="{{ route('app.change-password') }}" wire:navigate
           x-bind:class="offline ? 'pointer-events-none opacity-50' : ''"
           class="flex items-center justify-between px-5 py-4 tap">
            <span>Change password <span x-show="offline" x-cloak class="ml-1 text-xs text-muted">(needs internet)</span></span>
            <span class="text-muted">›</span>
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
         x-data="{ showReset: false, showDelete: false, offline: !navigator.onLine, _backOff: null, _backOffDel: null }"
         x-init="
            $watch('showReset', open => { if (open) { _backOff = window.appBack?.register(() => { showReset = false; }); } else { _backOff?.(); _backOff = null; } });
            $watch('showDelete', open => {
                if (open) { $wire.set('deleteStep', 'warn'); $wire.set('deleteCode', ''); _backOffDel = window.appBack?.register(() => { showDelete = false; }); }
                else { _backOffDel?.(); _backOffDel = null; }
            })"
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

        <button @click="showDelete = true"
                class="h-14 w-full rounded-2xl border border-red-500/30 bg-red-500/5 font-semibold text-red-400 tap">Delete account</button>

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
                     class="modal-panel relative w-full max-w-sm rounded-3xl bg-surface border border-white/10 p-6 text-center shadow-2xl">

                    <h2 class="text-lg font-bold text-content">Reset progress?</h2>
                    <p class="mt-2 text-sm text-muted leading-relaxed">This will clear your training days, sessions, measurements and knowledge progress. This action cannot be undone.</p>

                    <div x-show="offline" x-cloak class="mt-3 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-medium text-accent-soft">
                        No internet connection. Connect to reset your progress.
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

        {{-- Delete account modal (online only, emailed code) --}}
        <template x-teleport="body">
            <div x-show="showDelete" x-cloak
                 class="fixed inset-0 z-50 flex items-center justify-center px-6"
                 @keydown.escape.window="showDelete = false">

                <div x-show="showDelete"
                     x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100"
                     x-transition:leave="transition ease-in duration-150" x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0"
                     @click="showDelete = false"
                     class="absolute inset-0 bg-black/70"></div>

                <div x-show="showDelete"
                     x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100"
                     x-transition:leave="transition ease-in duration-150" x-transition:leave-start="opacity-100 scale-100" x-transition:leave-end="opacity-0 scale-95"
                     class="modal-panel relative w-full max-w-sm rounded-3xl bg-surface border border-white/10 p-6 shadow-2xl">

                    @if ($deleteStep === 'warn')
                        <h2 class="text-lg font-bold text-content">Delete account?</h2>
                        <p class="mt-2 text-sm text-muted leading-relaxed">This permanently deletes your account and all of your data — training days, sessions, measurements and progress. This <strong class="text-content">cannot be undone</strong>.</p>

                        <div class="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-left text-xs font-medium leading-relaxed text-red-300">
                            This does <strong>not</strong> cancel your Google Play subscription. Cancel it in Google Play first to stop being billed.
                        </div>

                        <div x-show="offline" x-cloak class="mt-3 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-medium text-accent-soft">
                            No internet connection. Connect to delete your account.
                        </div>
                        @error('delete') <p class="mt-3 text-sm text-red-400">{{ $message }}</p> @enderror

                        <div class="mt-6 flex gap-3">
                            <button @click="showDelete = false" class="h-12 flex-1 rounded-xl bg-white/5 font-semibold text-content tap">Cancel</button>
                            <button wire:click="sendDeleteCode" x-bind:disabled="offline" wire:loading.attr="disabled" wire:target="sendDeleteCode"
                                    class="h-12 flex-1 rounded-xl bg-red-500 font-semibold text-white tap disabled:opacity-60">
                                <span x-show="offline">No internet</span>
                                <span x-show="!offline" wire:loading.remove wire:target="sendDeleteCode">Send code</span>
                                <span x-show="!offline" wire:loading wire:target="sendDeleteCode">Sending...</span>
                            </button>
                        </div>
                    @else
                        <h2 class="text-lg font-bold text-content">Enter the code</h2>
                        <p class="mt-2 text-sm text-muted leading-relaxed">We emailed a 6-digit code to <strong class="text-content">{{ auth()->user()->email }}</strong>. Enter it to permanently delete your account.</p>

                        <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
                               wire:model="deleteCode" wire:keydown.enter="deleteAccount"
                               placeholder="000000"
                               class="mt-4 h-14 w-full rounded-xl border border-white/10 bg-surface-2 text-center text-2xl font-bold tracking-[0.4em] text-content focus:border-red-500 focus:outline-none">
                        @error('deleteCode') <p class="mt-2 text-sm text-red-400">{{ $message }}</p> @enderror
                        @error('delete') <p class="mt-2 text-sm text-red-400">{{ $message }}</p> @enderror

                        <div class="mt-3 flex items-center justify-between text-xs">
                            <button type="button" @click="showDelete = false" class="text-muted tap">Cancel</button>
                            <button type="button" wire:click="sendDeleteCode" wire:loading.attr="disabled" wire:target="sendDeleteCode" class="font-semibold text-accent tap">Resend code</button>
                        </div>

                        <button wire:click="deleteAccount" x-bind:disabled="offline" wire:loading.attr="disabled" wire:target="deleteAccount"
                                class="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-500 font-semibold text-white tap disabled:opacity-60">
                            <svg wire:loading wire:target="deleteAccount" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
                            <span wire:loading.remove wire:target="deleteAccount">Delete permanently</span>
                            <span wire:loading wire:target="deleteAccount">Deleting...</span>
                        </button>
                    @endif
                </div>
            </div>
        </template>
    </div>
</div>
