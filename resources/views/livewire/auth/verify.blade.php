<div class="flex min-h-[100dvh] flex-col justify-center px-6 py-10">
    <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold">Verify your email</h1>
        <p class="mt-1 text-muted">Enter the 6-digit code we sent to<br><span class="text-content">{{ $email }}</span></p>
    </div>

    <form wire:submit="verify" class="space-y-4">
        <input wire:model="code" inputmode="numeric" maxlength="6" placeholder="––––––"
               class="h-16 w-full rounded-2xl border border-white/10 bg-surface text-center text-3xl font-bold tracking-[0.5em] placeholder:text-muted focus:border-accent focus:outline-none">
        @error('code') <p class="text-center text-sm text-accent-soft">{{ $message }}</p> @enderror
        <button type="submit" class="grid h-12 w-full place-items-center rounded-xl bg-accent font-semibold tap">Verify</button>
    </form>

    <div class="mt-6 text-center text-sm text-muted">
        @if ($resent)
            <span class="text-success">A new code has been sent.</span>
        @else
            Didn't get it? <button wire:click="resend" class="font-semibold text-accent tap">Resend code</button>
        @endif
    </div>
</div>
