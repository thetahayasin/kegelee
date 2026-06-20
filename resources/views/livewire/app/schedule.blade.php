<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <h1 class="text-2xl font-bold">Schedule</h1>
    </header>

    {{-- Reminders entry --}}
    <a href="{{ route('reminders') }}" wire:navigate
       class="mx-4 flex items-center gap-4 rounded-2xl bg-surface px-5 py-4 tap">
        <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.7">
                <rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/><path d="M12 13v3l2 1"/>
            </svg>
        </span>
        <div class="min-w-0 flex-1">
            <p class="font-semibold">Reminders</p>
            <p class="text-sm text-muted">
                {{ $reminderCount > 0 ? $reminderCount.' '.\Illuminate\Support\Str::plural('day', $reminderCount).' set' : 'Set times for your week' }}
            </p>
        </div>
        <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
    </a>

    {{-- Month calendar --}}
    <section class="mx-4 mt-4 rounded-2xl bg-surface p-5">
        <div class="flex items-start justify-between">
            <div>
                <p class="text-lg font-semibold">Month {{ $position['month'] }}</p>
                <p class="text-sm text-muted">{{ $position['days_left'] }} days left</p>
            </div>
            <span class="flex items-center gap-2 font-semibold">
                <span class="h-3 w-3 rounded-full bg-white"></span> Active
            </span>
        </div>

        <div class="mt-5 grid grid-cols-6 gap-2.5">
            @foreach ($calendarDays as $day)
                <div class="grid aspect-square place-items-center rounded-full text-sm font-semibold
                    {{ $day['done'] ? 'bg-accent text-white' : ($day['today'] ? 'bg-white text-black' : 'bg-surface-2 text-muted') }}">
                    {{ $day['n'] }}
                </div>
            @endforeach
        </div>
    </section>

    <x-bottom-nav active="schedule" />
</div>
