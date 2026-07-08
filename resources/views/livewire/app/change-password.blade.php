<div class="fixed inset-0 z-50 flex flex-col justify-end"
     x-data="{ offline: !navigator.onLine }"
     @offline.window="offline = true"
     @online.window="offline = false"
     @app-offline.window="offline = true"
     @app-online.window="offline = false">

    {{-- Backdrop (tap to close) --}}
    <a href="{{ route('app.settings') }}" wire:navigate
       class="absolute inset-0 bg-black/60" aria-label="Close"></a>

    {{-- Bottom sheet --}}
    <div x-transition:enter="transition ease-out duration-300" x-transition:enter-start="translate-y-full" x-transition:enter-end="translate-y-0"
         class="modal-panel relative mx-auto w-full max-w-[440px] rounded-t-3xl border-t border-white/10 bg-surface px-6 pt-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
        <div class="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20"></div>

        <div class="flex items-center justify-between">
            <h1 class="text-lg font-bold">Change password</h1>
            <a href="{{ route('app.settings') }}" wire:navigate
               class="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-muted tap" aria-label="Close">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </a>
        </div>

        {{-- Online-only: a password change must reach the server. --}}
        <div x-show="offline" x-cloak class="mt-4 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent-soft">
            <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
            No internet connection - connect to change your password.
        </div>

        <form wire:submit="update" class="mt-4 space-y-3">
            @if ($saved)
                <div class="rounded-xl bg-success/15 px-4 py-3 text-sm font-semibold text-success">Password updated.</div>
            @endif
            <div>
                <input wire:model="current" type="password" placeholder="Current password" autocomplete="current-password"
                       class="h-12 w-full rounded-xl border border-white/10 bg-bg px-4 placeholder:text-muted focus:border-accent focus:outline-none">
                @error('current') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <input wire:model="password" type="password" placeholder="New password (6+ characters, 1 number)" autocomplete="new-password"
                       class="h-12 w-full rounded-xl border border-white/10 bg-bg px-4 placeholder:text-muted focus:border-accent focus:outline-none">
                @error('password') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <input wire:model="password_confirmation" type="password" placeholder="Confirm new password" autocomplete="new-password"
                       class="h-12 w-full rounded-xl border border-white/10 bg-bg px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            </div>
            <button type="submit" x-bind:disabled="offline" wire:loading.attr="disabled"
                    class="grid h-12 w-full place-items-center rounded-xl bg-accent font-semibold tap disabled:opacity-60">
                <span x-show="offline">Offline</span>
                <span x-show="!offline" wire:loading.remove>Update password</span>
                <span x-show="!offline" wire:loading><svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg></span>
            </button>
        </form>
    </div>
</div>
