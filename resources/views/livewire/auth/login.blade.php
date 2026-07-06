<div class="relative flex min-h-[100dvh] flex-col justify-center px-6 py-10">
    <a href="{{ route('landing') }}" wire:navigate
       class="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Close">
        <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </a>
    <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold">Log In</h1>
    </div>

    <form wire:submit="login" class="space-y-3">
        <div>
            <input wire:model="email" type="email" placeholder="Email" autocomplete="email"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('email') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
        </div>
        <div>
            <input wire:model="password" type="password" placeholder="Password" autocomplete="current-password"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('password') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
        </div>
        <div class="flex justify-end">
            <button type="button" @click="Livewire.dispatch('open-reset-modal', { email: $wire.get('email') })" class="text-sm text-muted tap">Forgot password?</button>
        </div>
        <button type="submit" wire:loading.attr="disabled" class="grid h-12 w-full place-items-center rounded-xl bg-accent font-semibold tap disabled:opacity-60">
            <span wire:loading.remove>Log in</span>
            <span wire:loading><svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg></span>
        </button>
    </form>

    @if ($googleEnabled)
        <div class="my-5 flex items-center gap-3 text-xs text-muted"><div class="h-px flex-1 bg-white/10"></div>or<div class="h-px flex-1 bg-white/10"></div></div>
        <a wire:click="continueWithGoogle" role="button" class="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-surface font-semibold tap">
            <svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8a6 6 0 1 1 0-12 5.4 5.4 0 0 1 3.8 1.5l2.6-2.5A9.2 9.2 0 0 0 12 2.7a9.3 9.3 0 1 0 0 18.6c5.4 0 8.9-3.8 8.9-9.1 0-.6 0-1.1-.2-1.6z"/></svg>
            Continue with Google
        </a>
    @endif

    <p class="mt-6 text-center text-sm text-muted">New here?
        <a href="{{ route('register') }}" wire:navigate class="font-semibold text-accent">Create account</a>
    </p>

    <livewire:auth.password-reset-modal />
</div>
