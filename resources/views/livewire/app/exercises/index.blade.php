<div class="min-h-[100dvh] pb-24 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('home') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold">Exercises</h1>
    </header>

    <div class="space-y-3 px-4">
        @foreach ($exercises as $row)
            @php($ex = $row['model'])
            @php($threshold = $ex->unlock_after_days)
            @php($pct = $threshold > 0 ? min(100, round($row['completed'] / $threshold * 100)) : 100)
            <a href="{{ route('exercises.show', $ex) }}" wire:navigate
               class="flex items-center gap-4 rounded-2xl bg-surface px-4 py-3.5 tap">
                <x-equipment-icon :exercise="$ex" :size="56" />
                <div class="min-w-0 flex-1">
                    <p class="text-lg font-bold leading-tight">{{ $ex->name }}</p>
                    @if ($row['unlocked'])
                        <p class="text-sm text-muted">Available</p>
                    @else
                        <p class="text-sm text-muted">complete {{ $row['days_left'] }} training days</p>
                        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div class="h-full rounded-full bg-accent" style="width: {{ $pct }}%"></div>
                        </div>
                    @endif
                </div>
                @if ($row['unlocked'])
                    <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
                @else
                    <span class="shrink-0 self-start text-sm font-semibold text-muted">{{ $row['completed'] }}/{{ $threshold }}</span>
                @endif
            </a>
        @endforeach
    </div>
</div>
