@php($complete = $today['complete'])
<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]"
     x-data="{
        done: @js((int) ($today['done'] ?? 0)),
        required: @js((int) ($today['required'] ?? 2)),
        month: @js((int) ($position['month'] ?? 1)),
        day: @js((int) ($position['day'] ?? 1)),
        complete: @js($complete),
        init() {
            // This page renders server-side from the (synced) local DB, so these
            // values are authoritative and always fresh. We only kick a background
            // sync; runServerSync refreshes this component if the server changed.
            // (We no longer override from IndexedDB — that showed a stale 'null/2'
            // and a frozen session count when the cached copy lagged the server.)
            if (window.kegelSync) window.kegelSync.fullSync();
        }
     }">
    {{-- Header --}}
    <header class="flex items-center justify-center relative px-5 py-4">
        <h1 class="text-2xl font-bold">Training</h1>
        <a href="{{ route('knowledge.index') }}" wire:navigate class="absolute right-5 grid place-items-center h-9 w-9 rounded-full bg-surface text-muted tap" aria-label="Knowledge">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 11.5v4.5" stroke-linecap="round"/>
                <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>
            </svg>
        </a>
    </header>


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

        <div class="relative grid place-items-center mb-12" style="width: 68px; height: 68px;">
            <svg width="68" height="68" viewBox="0 0 68 68" style="transform: rotate(126deg);">
                <circle cx="34" cy="34" r="31.5" fill="none"
                        stroke="rgba(255,255,255,0.10)" stroke-width="5"
                        stroke-dasharray="158.336 197.920" stroke-linecap="round"/>
                <circle cx="34" cy="34" r="31.5" fill="none"
                        stroke="var(--c-accent)" stroke-width="5"
                        stroke-dasharray="158.336 197.920"
                        :stroke-dashoffset="158.336 * (1 - Math.min(1, Math.max(0, done / Math.max(1, required))))"
                        stroke-linecap="round" style="transition: stroke-dashoffset 0.6s ease;"/>
            </svg>
            <div class="absolute inset-0 grid place-items-center">
                <span class="text-sm font-bold text-white" x-text="(done ?? 0) + '/' + (required ?? 0)"></span>
            </div>
        </div>

        <span x-show="complete" class="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
            COMPLETED
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
        </span>
        <p class="mt-2 text-xl font-bold text-white">Month <span x-text="month"></span> <span class="text-muted/60">·</span> Day <span x-text="day"></span></p>

        {{-- Start strip --}}
        <div class="mt-5 rounded-2xl bg-surface-2 p-4">
            <div class="min-w-0">
                <p class="flex items-center gap-1.5 text-sm text-muted">
                    <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>
                    {{ $sessionLength }}
                </p>
                <p class="mt-1 text-sm font-medium leading-snug text-white">
                    <template x-if="complete">
                        <span>Day complete - extra sessions are optional</span>
                    </template>
                    <template x-if="!complete">
                        <span x-text="'Complete ' + required + ' training session' + (required > 1 ? 's' : '') + ' a day to finish a training day'"></span>
                    </template>
                </p>
            </div>
            <a href="{{ route('session') }}" wire:navigate class="mt-4 grid h-12 w-full place-items-center rounded-full bg-accent font-semibold tap text-white">Start workout</a>
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
        @if ($exercises->isNotEmpty())
            @foreach ($exercises as $row)
                @php($ex = $row['model'])
                @if ($row['unlocked'])
                    <a href="{{ route('exercises.show', $ex) }}" wire:navigate class="w-28 shrink-0 rounded-2xl bg-surface p-3 tap">
                @else
                    <div class="w-28 shrink-0 rounded-2xl bg-surface p-3 opacity-50">
                @endif
                    <x-equipment-icon :exercise="$ex" :size="84" class="mx-auto mb-2 w-full" />
                    <p class="text-sm font-semibold leading-tight truncate">{{ $ex->name }}</p>
                    <p class="text-xs {{ $row['unlocked'] ? 'text-muted' : 'text-accent-soft' }}">
                        {{ $row['unlocked'] ? 'Available' : $row['days_left'].' days' }}
                    </p>
                @if ($row['unlocked'])
                    </a>
                @else
                    </div>
                @endif
            @endforeach
        @endif
    </div>

    {{-- Progress tracker preview --}}
    <a href="{{ route('progress') }}" wire:navigate class="mx-4 mt-7 flex items-center justify-between rounded-2xl bg-surface px-5 py-4 tap">
        <div>
            <p class="text-lg font-semibold">Progress Tracker</p>
            <p class="text-sm text-muted">
                @if ($bestMeasurement) Best hold: {{ (int) floor($bestMeasurement) }} sec
                @else Take measurements daily to track progress @endif
            </p>
        </div>
        <svg viewBox="0 0 24 24" class="h-5 w-5 text-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
    </a>

    <x-bottom-nav active="home" />
</div>
