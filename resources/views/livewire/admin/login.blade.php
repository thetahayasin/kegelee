<div class="grid min-h-screen place-items-center px-6">
    <div class="w-full max-w-sm">
        <h1 class="mb-1 text-2xl font-bold">Admin sign in</h1>
        <p class="mb-6 text-sm text-muted">Manage exercises, levels, billing and branding.</p>

        <form wire:submit="authenticate" class="space-y-4">
            <div>
                <label class="mb-1 block text-sm text-muted">Email</label>
                <input type="email" wire:model="email" autocomplete="username"
                       class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 focus:border-accent focus:outline-none">
                @error('email') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Password</label>
                <input type="password" wire:model="password" autocomplete="current-password"
                       class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 focus:border-accent focus:outline-none">
                @error('password') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <button type="submit" class="h-12 w-full rounded-xl bg-accent font-semibold text-white tap">Sign in</button>
        </form>

        <p class="mt-6 text-center text-xs text-muted">Default: admin@kegel.test / password</p>
    </div>
</div>
