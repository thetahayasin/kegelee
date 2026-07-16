<div class="flex min-h-[100dvh] flex-col justify-center px-6 py-10">
    <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold">Reset password</h1>
        <p class="mt-1 text-muted">Enter the code we emailed and your new password</p>
    </div>

    <form wire:submit="submit" class="space-y-3">
        <div>
            <input wire:model="email" type="email" placeholder="Email" autocomplete="email"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('email') <p class="mt-1 text-sm text-red-400">{{ $message }}</p> @enderror
        </div>
        <div>
            <input wire:model="code" inputmode="numeric" maxlength="6" placeholder="6-digit code"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 tracking-widest placeholder:text-muted focus:border-accent focus:outline-none">
            @error('code') <p class="mt-1 text-sm text-red-400">{{ $message }}</p> @enderror
        </div>
        <div>
            <input wire:model="password" type="password" placeholder="New password (6+ characters, 1 number)" autocomplete="new-password"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('password') <p class="mt-1 text-sm text-red-400">{{ $message }}</p> @enderror
        </div>
        <button type="submit" wire:loading.attr="disabled" class="grid h-12 w-full place-items-center rounded-xl bg-accent font-semibold tap disabled:opacity-60">
            <span wire:loading.remove>Reset password</span>
            <span wire:loading><svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg></span>
        </button>
    </form>

    <p class="mt-6 text-center text-sm text-muted">
        <a href="{{ route('login') }}" wire:navigate class="font-semibold text-accent">Back to log in</a>
    </p>
</div>
