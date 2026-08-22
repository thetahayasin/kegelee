<div class="min-h-[100dvh] pb-24 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('home') }}" wire:navigate class="absolute left-2 grid h-11 w-11 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold">Exercises</h1>
    </header>

    <div class="space-y-3 px-4">
        @foreach ($exercises as $row)
            @php($ex = $row['model'])
            @php($threshold = $ex->unlock_after_days)
            @php($pct = $threshold > 0 ? min(100, round($row['completed'] / $threshold * 100)) : 100)
            @if ($row['unlocked'])
                <a href="{{ route('exercises.show', $ex) }}" wire:navigate class="flex items-center gap-4 rounded-2xl bg-surface px-4 py-3.5 tap">
            @else
                <div class="is-locked flex items-center gap-4 rounded-2xl bg-surface px-4 py-3.5 opacity-70">
            @endif
                <x-equipment-icon :exercise="$ex" :size="56" />
                <div class="min-w-0 flex-1">
                    <p class="text-lg font-bold leading-tight tracking-tight">{{ $ex->name }}</p>
                    @if ($row['unlocked'])
                        <p class="text-sm text-muted">Available</p>
                    @else
                        <p class="flex items-center gap-1.5 text-sm text-muted">
                            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                                <rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>
                            </svg>
                            Complete <span class="stat">{{ $row['days_left'] }}</span> more training days
                        </p>
                        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                             role="progressbar"
                             aria-valuenow="{{ $row['completed'] }}"
                             aria-valuemin="0"
                             aria-valuemax="{{ $threshold }}"
                             aria-label="{{ $ex->name }} unlock progress">
                            <div class="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style="width: {{ $pct }}%"></div>
                        </div>
                    @endif
                </div>
                @if ($row['unlocked'])
                    <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                    </a>
                @else
                    <span class="stat shrink-0 self-start text-sm font-semibold text-muted">{{ $row['completed'] }}/{{ $threshold }}</span>
                </div>
            @endif
        @endforeach
    </div>
</div>
