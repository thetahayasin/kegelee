<div class="flex min-h-[100dvh] flex-col items-center justify-center px-5"
     style="background:radial-gradient(ellipse 80% 50% at 50% -20%,rgba(193,255,114,.07) 0%,transparent 70%),#0a0b0f">

    {{-- Brand mark --}}
    <div class="mb-8 flex flex-col items-center gap-3">
        <div class="grid h-14 w-14 place-items-center rounded-2xl font-black text-xl shadow-lg shadow-accent/20"
             style="background:linear-gradient(135deg,var(--c-accent),color-mix(in srgb,var(--c-accent) 60%,#fff));color:#0c1a00">
            {{ strtoupper(substr(app(\App\Services\SettingsService::class)->get('app_name', 'K'), 0, 1)) }}
        </div>
        <div class="text-center">
            <p class="font-bold">{{ app(\App\Services\SettingsService::class)->get('app_name', 'Kegel Trainer') }}</p>
            <p class="text-xs text-muted">Admin Panel</p>
        </div>
    </div>

    {{-- Card --}}
    <div class="w-full max-w-sm rounded-2xl border border-white/8 p-7 shadow-2xl"
         style="background:rgba(19,21,27,.95);backdrop-filter:blur(16px)">

        <h1 class="mb-1 text-xl font-bold">Welcome back</h1>
        <p class="mb-6 text-sm text-muted">Sign in to manage your app.</p>

        <form wire:submit="authenticate" class="space-y-4">
            <div>
                <label class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Email</label>
                <input type="email" wire:model="email" autocomplete="username"
                       class="h-11 w-full rounded-xl border border-white/10 bg-white/4 px-4 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                       placeholder="admin@example.com">
                @error('email') <p class="mt-1.5 text-xs text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Password</label>
                <input type="password" wire:model="password" autocomplete="current-password"
                       class="h-11 w-full rounded-xl border border-white/10 bg-white/4 px-4 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                       placeholder="••••••••">
                @error('password') <p class="mt-1.5 text-xs text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <button type="submit"
                    class="relative mt-2 grid h-11 w-full place-items-center rounded-xl font-semibold text-sm shadow-lg shadow-accent/15 tap transition-opacity hover:opacity-90"
                    style="background:var(--c-accent);color:#0c1a00">
                <span wire:loading.remove wire:target="authenticate">Sign in</span>
                <span wire:loading wire:target="authenticate" class="flex items-center gap-2">
                    <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    Signing in…
                </span>
            </button>
        </form>

        <p class="mt-4 text-center text-sm">
            <a href="{{ route('password.forgot') }}" wire:navigate class="text-muted transition-colors hover:text-accent-soft">Forgot password?</a>
        </p>

        <p class="mt-4 text-center text-xs text-muted">Authorised personnel only.</p>
    </div>
</div>
