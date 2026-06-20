<div class="min-h-[100dvh] pb-16 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('app.settings') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold">Change password</h1>
    </header>

    <form wire:submit="update" class="space-y-3 px-4 pt-4">
        @if ($saved)
            <div class="rounded-xl bg-success/15 px-4 py-3 text-sm font-semibold text-success">Password updated.</div>
        @endif
        <div>
            <input wire:model="current" type="password" placeholder="Current password" autocomplete="current-password"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('current') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
        </div>
        <div>
            <input wire:model="password" type="password" placeholder="New password" autocomplete="new-password"
                   class="h-12 w-full rounded-xl border border-white/10 bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none">
            @error('password') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
        </div>
        <button type="submit" class="grid h-12 w-full place-items-center rounded-xl bg-accent font-semibold tap">Update password</button>
    </form>
</div>
