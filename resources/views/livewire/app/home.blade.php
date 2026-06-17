@php($complete = $today['complete'])
<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    {{-- Header --}}
    <header class="flex items-center justify-center relative px-5 py-4">
        <h1 class="text-2xl font-bold">Training</h1>
        <a href="{{ route('profile') }}" wire:navigate class="absolute right-5 grid place-items-center h-9 w-9 rounded-full bg-surface text-muted tap" aria-label="Info">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 11.5v4.5" stroke-linecap="round"/>
                <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>
            </svg>
        </a>
    </header>

    {{-- New exercise banner --}}
    @if ($nextUnlock)
        <div class="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-surface px-3 py-3">
            <x-equipment-icon :exercise="$nextUnlock" :size="44" class="ring-1 ring-accent/60" />
            <div class="min-w-0 flex-1">
                <p class="font-semibold leading-tight truncate">{{ $nextUnlock->name }}</p>
                <p class="text-xs text-muted">next in your training plan</p>
            </div>
            <span class="text-right text-xs text-muted leading-tight">{{ $position['completed'] }}/{{ $nextUnlock->unlock_after_days }} days</span>
        </div>
    @endif

    <h2 class="px-5 pt-2 pb-3 text-lg font-semibold">Training for Today</h2>

    {{-- Today card --}}
    <section class="mx-4 rounded-3xl bg-surface p-5 relative overflow-hidden">
        <div class="absolute -right-6 -top-6 h-44 w-44 rounded-full bg-white/[0.03]"></div>
        <div class="absolute right-2 top-3 opacity-90">
            @if ($heroImage)
                <img src="{{ $heroImage }}" alt="" class="h-24 w-24 object-contain">
            @else
                <x-equipment-icon name="dumbbell" :size="96" class="!bg-transparent !ring-0" />
            @endif
        </div>

        <x-gauge :value="$today['done']" :max="$today['required']" :size="68" color="var(--c-accent)" class="mb-12">
            <span class="text-sm font-bold">{{ $today['done'] }}/{{ $today['required'] }}</span>
        </x-gauge>

        @if ($complete)
            <span class="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                COMPLETED
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
            </span>
        @endif
        <p class="mt-2 text-xl font-bold">Month {{ $position['month'] }} <span class="text-muted/60">·</span> Day {{ $position['day'] }}</p>

        {{-- Start strip --}}
        <div class="mt-5 rounded-2xl bg-surface-2 p-4">
            <div class="min-w-0">
                <p class="flex items-center gap-1.5 text-sm text-muted">
                    <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>
                    {{ $sessionMinutes }} min
                </p>
                <p class="mt-1 text-sm font-medium leading-snug">
                    @if ($complete)
                        Day complete - extra sessions are optional
                    @else
                        Complete {{ $today['required'] }} training {{ \Illuminate\Support\Str::plural('session', $today['required']) }} a day to finish a training day
                    @endif
                </p>
            </div>
            <a href="{{ route('session') }}" wire:navigate class="mt-4 grid h-12 w-full place-items-center rounded-full bg-accent font-semibold tap">Start workout</a>
        </div>
    </section>

    {{-- Exercises rail --}}
    <div class="flex items-center justify-between px-5 pt-7 pb-3">
        <h2 class="text-lg font-semibold">Exercises</h2>
        <a href="{{ route('exercises.index') }}" wire:navigate class="flex items-center gap-1 text-sm text-muted tap">See All
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
        </a>
    </div>
    <div class="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1">
        @foreach ($exercises as $row)
            @php($ex = $row['model'])
            <a href="{{ route('exercises.show', $ex) }}" wire:navigate class="w-28 shrink-0 rounded-2xl bg-surface p-3 tap">
                <x-equipment-icon :exercise="$ex" :size="84" class="mx-auto mb-2 w-full" />
                <p class="text-sm font-semibold leading-tight truncate">{{ $ex->name }}</p>
                <p class="text-xs {{ $row['unlocked'] ? 'text-muted' : 'text-accent-soft' }}">
                    {{ $row['unlocked'] ? 'Available' : $row['days_left'].' days' }}
                </p>
            </a>
        @endforeach
    </div>

    {{-- Progress tracker preview --}}
    <a href="{{ route('progress') }}" wire:navigate class="mx-4 mt-7 flex items-center justify-between rounded-2xl bg-surface px-5 py-4 tap">
        <div>
            <p class="text-lg font-semibold">Progress Tracker</p>
            <p class="text-sm text-muted">
                @if ($bestMeasurement) Best hold: {{ (int) ceil($bestMeasurement) }} sec
                @else Take measurements daily to track progress @endif
            </p>
        </div>
        <svg viewBox="0 0 24 24" class="h-5 w-5 text-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
    </a>

    <x-bottom-nav active="home" />
</div>
