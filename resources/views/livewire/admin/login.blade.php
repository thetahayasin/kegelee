<div class="flex min-h-[100dvh] flex-col justify-center px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))]">
    <div class="rounded-3xl bg-surface p-6">
        <h1 class="text-2xl font-bold">Admin sign in</h1>
        <p class="mt-1 text-sm text-muted">Manage exercises, levels, billing and branding.</p>

        <form wire:submit="authenticate" class="mt-6 space-y-4">
            <div>
                <label class="mb-1 block text-sm text-muted">Email</label>
                <input type="email" wire:model="email" autocomplete="username"
                       class="h-12 w-full rounded-xl border border-white/10 bg-surface-2 px-4 focus:border-accent focus:outline-none">
                @error('email') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Password</label>
                <input type="password" wire:model="password" autocomplete="current-password"
                       class="h-12 w-full rounded-xl border border-white/10 bg-surface-2 px-4 focus:border-accent focus:outline-none">
                @error('password') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <button type="submit" class="grid h-12 w-full place-items-center rounded-xl bg-accent font-semibold tap">
                <span wire:loading.remove wire:target="authenticate">Sign in</span>
                <span wire:loading wire:target="authenticate">Signing in…</span>
            </button>
        </form>

        <p class="mt-6 text-center text-xs text-muted">Authorized personnel only.</p>
    </div>
</div>
