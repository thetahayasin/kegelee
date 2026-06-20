<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <h1 class="text-2xl font-bold">Profile</h1>
        <a href="{{ route('app.settings') }}" wire:navigate class="absolute right-5 grid h-9 w-9 place-items-center rounded-full bg-surface text-muted tap" aria-label="Settings">
            <x-ui-icon name="settings" class="h-5 w-5" />
        </a>
    </header>

    {{-- Identity --}}
    <div class="flex flex-col items-center px-6 pt-2">
        <div class="grid h-20 w-20 place-items-center rounded-full bg-surface text-2xl font-bold text-muted">
            {{ strtoupper(substr($user->name, 0, 1)) }}
        </div>
        <p class="mt-3 text-lg font-bold">{{ $user->name }}</p>
        <p class="text-sm text-muted">{{ $user->email }}</p>
    </div>

    {{-- Stats --}}
    <div class="mx-4 mt-5 grid grid-cols-3 gap-3">
        <div class="rounded-2xl bg-surface p-4 text-center">
            <p class="text-2xl font-bold">{{ $completedDays }}</p>
            <p class="text-xs text-muted">Days done</p>
        </div>
        <div class="rounded-2xl bg-surface p-4 text-center">
            <p class="text-2xl font-bold">{{ $levelName === 'Not set' ? '-' : str_replace('Level ', '', $levelName) }}</p>
            <p class="text-xs text-muted">Level</p>
        </div>
        <div class="rounded-2xl bg-surface p-4 text-center">
            <p class="text-2xl font-bold">{{ $subscription ? 'Pro' : 'Free' }}</p>
            <p class="text-xs text-muted">Plan</p>
        </div>
    </div>

    {{-- Subscription banner --}}
    @if (! $subscription)
        <a href="{{ route('paywall') }}" wire:navigate class="mx-4 mt-4 flex items-center justify-between rounded-2xl bg-gradient-to-r from-accent to-accent-soft p-5 tap">
            <div class="text-[color:var(--c-on-accent)]">
                <p class="text-lg font-bold">Go Premium</p>
                <p class="text-sm opacity-80">Unlock every exercise and level</p>
            </div>
            <svg viewBox="0 0 24 24" class="h-6 w-6 text-[color:var(--c-on-accent)]" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
        </a>
    @else
        <div class="mx-4 mt-4 rounded-2xl bg-surface p-5">
            <p class="font-semibold text-success">Premium active</p>
            <p class="text-sm text-muted">{{ $subscription->plan?->name }} · renews {{ $subscription->ends_at?->translatedFormat('j M Y') ?? 'never' }}</p>
        </div>
    @endif

    {{-- Menu --}}
    <div class="mx-4 mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-surface">
        <a href="{{ route('levels') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
            <span>Difficulty</span><span class="text-muted">{{ $levelName }} ›</span>
        </a>
        <a href="{{ route('schedule') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
            <span>Schedule &amp; reminders</span><span class="text-muted">›</span>
        </a>
        <a href="{{ route('progress') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
            <span>Progress tracker</span><span class="text-muted">›</span>
        </a>
        <a href="{{ route('knowledge.index') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
            <span>Knowledge</span><span class="text-muted">›</span>
        </a>
        @if ($user->is_admin)
            <a href="{{ route('admin.dashboard') }}" class="flex items-center justify-between px-5 py-4 tap">
                <span class="text-accent-soft">Admin panel</span><span class="text-muted">›</span>
            </a>
        @endif
    </div>

    <x-bottom-nav active="profile" />
</div>
