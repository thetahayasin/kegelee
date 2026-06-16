<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <h1 class="text-2xl font-bold">Set reminders</h1>
    </header>

    {{-- Reminder card --}}
    <section class="mx-4 rounded-2xl bg-surface p-5">
        <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-muted">
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0"/></svg>
            </span>
            <div>
                <p class="font-semibold">Workout reminder</p>
                <p class="text-sm text-muted">You don't have any schedule</p>
            </div>
        </div>
        <button onclick="alert('Reminders are scheduled on device via notifications.')"
                class="mx-auto mt-4 block rounded-full bg-surface-2 px-6 py-3 font-semibold tap">Set reminders</button>
    </section>

    {{-- Difficulty --}}
    <a href="{{ route('levels') }}" wire:navigate class="mx-4 mt-4 flex items-center justify-between rounded-2xl bg-surface px-5 py-4 tap">
        <span class="font-semibold">Difficulty</span>
        <span class="flex items-center gap-2 text-muted">{{ $levelName }}
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
        </span>
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
            @foreach ($days as $day)
                <div class="grid aspect-square place-items-center rounded-full text-sm font-semibold
                    {{ $day['done'] ? 'bg-accent text-white' : ($day['today'] ? 'bg-white text-black' : 'bg-surface-2 text-muted') }}">
                    {{ $day['n'] }}
                </div>
            @endforeach
        </div>
    </section>

    <x-bottom-nav active="schedule" />
</div>
