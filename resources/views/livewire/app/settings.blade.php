<div class="min-h-[100dvh] pb-16 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('profile') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold">Settings</h1>
    </header>

    {{-- Account --}}
    <p class="px-6 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Account</p>
    <div class="mx-4 overflow-hidden rounded-2xl bg-surface">
        <a href="{{ route('app.change-password') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
            <span>Change password</span><span class="text-muted">›</span>
        </a>
    </div>

    {{-- Legal / content pages --}}
    @if ($pages->isNotEmpty())
        <p class="px-6 pb-2 pt-6 text-xs font-semibold uppercase tracking-wide text-muted">About</p>
        <div class="mx-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-surface">
            @foreach ($pages as $p)
                <a href="{{ route('page.show', $p) }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
                    <span>{{ $p->title }}</span><span class="text-muted">›</span>
                </a>
            @endforeach
        </div>
    @endif

    {{-- Standalone actions --}}
    <div class="mt-10 space-y-3 px-4">
        <button wire:click="resetProgress" wire:confirm="Reset your progress? This clears your training days, sessions, measurements and knowledge."
                class="h-14 w-full rounded-2xl bg-surface font-semibold tap">Reset progress</button>
        <button wire:click="logout" class="h-14 w-full rounded-2xl bg-accent font-semibold tap">Log out</button>
    </div>
</div>
