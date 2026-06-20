<div class="flex min-h-[100dvh] flex-col justify-center px-6 py-10">
    <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold">Sign Up</h1>
    </div>

    <form wire:submit="register" class="space-y-3">
        <div>
            <input wire:model="name" type="text" placeholder="Name" autocomplete="name"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('name') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
        </div>
        <div>
            <input wire:model="email" type="email" placeholder="Email" autocomplete="email"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('email') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
        </div>
        <div>
            <input wire:model="password" type="password" placeholder="Password" autocomplete="new-password"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('password') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
        </div>
        <button type="submit" class="mt-1 grid h-12 w-full place-items-center rounded-xl bg-accent font-semibold tap">Create account</button>
    </form>

    @if ($googleEnabled)
        <div class="my-5 flex items-center gap-3 text-xs text-muted"><div class="h-px flex-1 bg-white/10"></div>or<div class="h-px flex-1 bg-white/10"></div></div>
        <a href="{{ route('auth.google') }}" class="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-surface font-semibold tap">
            <svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8a6 6 0 1 1 0-12 5.4 5.4 0 0 1 3.8 1.5l2.6-2.5A9.2 9.2 0 0 0 12 2.7a9.3 9.3 0 1 0 0 18.6c5.4 0 8.9-3.8 8.9-9.1 0-.6 0-1.1-.2-1.6z"/></svg>
            Continue with Google
        </a>
    @endif

    <p class="mt-6 text-center text-sm text-muted">Already have an account?
        <a href="{{ route('login') }}" wire:navigate class="font-semibold text-accent">Log in</a>
    </p>
</div>
