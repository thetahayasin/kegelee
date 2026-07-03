<div class="min-h-[100dvh] pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        @if (auth()->check())
            <a href="{{ route('home') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
                <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
            </a>
        @endif
        <h1 class="text-2xl font-bold">Learn the basics</h1>
    </header>

    <div class="mt-3 space-y-4 px-4">
        @livewire('app.subscribe-sheet')
        @if ($promptSubscribe)
            <div wire:ignore x-data x-init="setTimeout(() => Livewire.dispatch('open-subscribe-sheet'), 350)"></div>
        @endif

        @forelse ($rows as $i => $row)
            @php($lesson = $row['lesson'])
            @php($locked = ! $row['unlocked'])
            @php($icons = [
                '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
                '<path d="M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
                '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 14.5v-9l7 4.5-7 4.5z"/>',
            ])
            @if (! $locked)
                <a href="{{ route('knowledge.show', $lesson) }}" wire:navigate
                   class="relative block overflow-hidden rounded-3xl border {{ $row['done'] ? 'border-accent/35' : 'border-white/10' }} bg-surface p-5 shadow-lg tap">
            @else
                <div class="relative block overflow-hidden rounded-3xl border border-white/5 bg-surface/60 p-5 opacity-55">
            @endif
                {{-- Soft corner glow --}}
                <div class="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_14%,transparent),transparent_70%)]"></div>

                <div class="flex items-center gap-4">
                    {{-- Icon tile --}}
                    <div class="grid h-16 w-16 shrink-0 place-items-center rounded-2xl {{ $row['done'] ? 'bg-accent text-[var(--c-on-accent)]' : 'bg-accent/12 text-accent' }}">
                        @if ($row['done'])
                            <svg viewBox="0 0 24 24" class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                        @elseif ($locked)
                            <x-ui-icon name="lock" class="h-7 w-7 text-muted" />
                        @else
                            <svg viewBox="0 0 24 24" class="h-8 w-8" fill="currentColor">{!! $icons[$i % 3] !!}</svg>
                        @endif
                    </div>

                    <div class="min-w-0 flex-1">
                        <p class="text-[11px] font-bold uppercase tracking-wider {{ $row['done'] ? 'text-accent' : 'text-muted' }}">
                            Lesson {{ $i + 1 }}
                        </p>
                        <p class="mt-1 text-lg font-bold leading-snug">{{ $lesson->title }}</p>
                        <p class="mt-0.5 text-sm {{ $row['done'] ? 'text-accent-soft' : 'text-muted' }}">
                            {{ $row['done'] ? 'Completed' : ($locked ? 'Finish the lesson above first' : 'Tap to start') }}
                        </p>
                    </div>

                    @unless ($locked)
                        <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                    @endunless
                </div>
            @if (! $locked)
                </a>
            @else
                </div>
            @endif
        @empty
            <p class="px-2 py-10 text-center text-muted">No lessons yet.</p>
        @endforelse
    </div>
</div>
