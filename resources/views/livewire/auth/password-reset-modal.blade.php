<div>
    <template x-teleport="body">
        <div x-data="{ show: @entangle('show'), offline: !navigator.onLine, _backOff: null }"
             x-init="$watch('show', open => { if (open) { _backOff = window.appBack?.register(() => $wire.close()); } else { _backOff?.(); _backOff = null; } })"
             @offline.window="offline = true" @online.window="offline = false"
             @app-offline.window="offline = true" @app-online.window="offline = false">

            <div x-show="show" x-cloak
                 class="fixed inset-0 z-[60] flex items-center justify-center px-6"
                 @keydown.escape.window="$wire.close()">

                {{-- Backdrop --}}
                <div x-show="show"
                     x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100"
                     x-transition:leave="transition ease-in duration-150" x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0"
                     @click="$wire.close()"
                     class="absolute inset-0 bg-black/70"></div>

                {{-- Panel --}}
                <div x-show="show"
                     x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0 scale-95" x-transition:enter-end="opacity-100 scale-100"
                     x-transition:leave="transition ease-in duration-150" x-transition:leave-start="opacity-100 scale-100" x-transition:leave-end="opacity-0 scale-95"
                     class="modal-panel relative w-full max-w-sm rounded-3xl bg-surface border border-white/10 p-6 shadow-2xl">

                    <div class="flex items-center justify-between gap-3">
                        <h2 class="text-lg font-bold text-content">Reset password</h2>
                        <button @click="$wire.close()" class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-muted tap" aria-label="Close">
                            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </div>

                    <div x-show="offline" x-cloak class="mt-3 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-medium text-accent-soft">
                        No internet connection. Resetting your password needs the internet.
                    </div>

                    @if ($step === 'request')
                        <p class="mt-2 text-sm text-muted leading-relaxed">Enter your email address and we'll send you a 6-digit reset code.</p>

                        <form wire:submit="sendCode" class="mt-4 space-y-3">
                            <div>
                                <input type="email" autocomplete="email" wire:model="email" placeholder="name@example.com"
                                       class="h-12 w-full rounded-xl border border-white/10 bg-surface-2 px-4 text-sm text-content focus:border-accent focus:outline-none">
                                @error('email') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
                            </div>
                            <button type="submit" x-bind:disabled="offline" wire:loading.attr="disabled" wire:target="sendCode"
                                    class="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold tap disabled:opacity-60">
                                <svg wire:loading wire:target="sendCode" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
                                <span wire:loading.remove wire:target="sendCode">Send code</span>
                                <span wire:loading wire:target="sendCode">Sending...</span>
                            </button>
                        </form>
                    @else
                        <p class="mt-2 text-sm text-muted leading-relaxed">Enter the code sent to <strong class="text-content">{{ $email }}</strong> and choose a new password.</p>
 
                        <form wire:submit="submit" class="mt-4 space-y-3">
                            <div>
                                <input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" wire:model="code" placeholder="000000"
                                       class="h-12 w-full rounded-xl border border-white/10 bg-surface-2 text-center text-lg font-bold tracking-[0.3em] text-content focus:border-accent focus:outline-none">
                                @error('code') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
                            </div>
                            <div>
                                <input type="password" autocomplete="new-password" wire:model="password" placeholder="New password (6+ characters, 1 number)"
                                       class="h-12 w-full rounded-xl border border-white/10 bg-surface-2 px-4 text-sm text-content focus:border-accent focus:outline-none">
                                @error('password') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
                            </div>
                            <button type="submit" x-bind:disabled="offline" wire:loading.attr="disabled" wire:target="submit"
                                    class="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold tap disabled:opacity-60">
                                <svg wire:loading wire:target="submit" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
                                <span wire:loading.remove wire:target="submit">Reset password</span>
                                <span wire:loading wire:target="submit">Resetting...</span>
                            </button>
                        </form>

                        <div class="mt-3 text-center">
                            <button type="button" wire:click="sendCode" wire:loading.attr="disabled" wire:target="sendCode" class="text-xs font-semibold text-accent tap">Resend code</button>
                        </div>
                    @endif
                </div>
            </div>
        </div>
    </template>
</div>
