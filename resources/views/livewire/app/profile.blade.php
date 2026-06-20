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

    {{-- Menu --}}
    <div class="mx-4 mt-5 divide-y divide-white/5 overflow-hidden rounded-2xl bg-surface">
        <a href="{{ route('levels') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
            <span>Difficulty</span><span class="text-muted">{{ $levelName }} ›</span>
        </a>
        <a href="{{ route('schedule') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
            <span>Schedule &amp; reminders</span><span class="text-muted">›</span>
        </a>
    </div>

    <x-bottom-nav active="profile" />
</div>
