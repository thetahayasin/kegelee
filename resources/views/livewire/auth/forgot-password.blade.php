<div class="flex min-h-[100dvh] flex-col justify-center px-6 py-10">
    <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold">Forgot password</h1>
        <p class="mt-1 text-muted">We'll email you a 6-digit reset code</p>
    </div>

    <form wire:submit="send" class="space-y-3">
        <div>
            <input wire:model="email" type="email" placeholder="Email" autocomplete="email"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('email') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
        </div>
        <button type="submit" class="grid h-12 w-full place-items-center rounded-xl bg-accent font-semibold tap">Send reset code</button>
    </form>

    <p class="mt-6 text-center text-sm text-muted">
        <a href="{{ route('login') }}" wire:navigate class="font-semibold text-accent">Back to log in</a>
    </p>
</div>
