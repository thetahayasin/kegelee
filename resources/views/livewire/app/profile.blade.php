<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <h1 class="text-2xl font-bold">Profile</h1>
        <a href="{{ route('app.settings') }}" wire:navigate class="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-surface text-muted tap" aria-label="Settings">
            <x-ui-icon name="settings" class="h-5 w-5" />
        </a>
    </header>

    {{-- Identity --}}
    <div class="flex flex-col items-center px-6 pt-2">
        <div class="grid h-20 w-20 place-items-center rounded-full bg-surface text-2xl font-bold text-accent ring-1 ring-accent/25"
             aria-hidden="true">
            {{ strtoupper(substr($user->name, 0, 1)) }}
        </div>
        <p class="mt-3 text-lg font-bold tracking-tight">{{ $user->name }}</p>
        <p class="text-sm text-muted break-all">{{ $user->email }}</p>
    </div>

    {{-- Menu --}}
    <nav class="mx-4 mt-5 divide-y divide-white/10 overflow-hidden rounded-2xl bg-surface" aria-label="Account">
        <a href="{{ route('levels') }}" wire:navigate class="flex min-h-[3.25rem] items-center justify-between gap-3 px-5 py-4 tap">
            <span class="font-medium">Difficulty</span>
            <span class="flex items-center gap-1.5 text-muted">
                {{ $levelName }}
                <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            </span>
        </a>
        <a href="{{ route('schedule') }}" wire:navigate class="flex min-h-[3.25rem] items-center justify-between gap-3 px-5 py-4 tap">
            <span class="font-medium">Schedule &amp; reminders</span>
            <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </a>
    </nav>

    <x-bottom-nav active="profile" />
</div>
