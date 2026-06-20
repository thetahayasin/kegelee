<div class="min-h-[100dvh] pb-24 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('home') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold">Knowledge</h1>
    </header>

    <p class="px-6 text-sm text-muted">Learn the essentials, one step at a time. Finish a lesson to unlock the next.</p>

    @if ($total)
        <div class="mx-6 mt-4 mb-4 flex items-center gap-3">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div class="h-full rounded-full bg-accent transition-all" style="width: {{ $total ? round($completedCount / $total * 100) : 0 }}%"></div>
            </div>
            <span class="text-xs text-muted">{{ $completedCount }}/{{ $total }}</span>
        </div>
    @endif

    {{-- Timeline --}}
    <div class="px-5">
        @forelse ($rows as $i => $row)
            @php($lesson = $row['lesson'])
            @php($locked = ! $row['unlocked'])
            @php($last = $i === $rows->count() - 1)
            <div class="relative flex gap-4">
                {{-- Rail node --}}
                <div class="flex flex-col items-center">
                    <div class="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2
                        {{ $row['done'] ? 'border-accent bg-accent text-[var(--c-on-accent)]' : ($locked ? 'border-white/15 bg-surface text-muted' : 'border-accent bg-surface text-accent') }}">
                        @if ($row['done'])
                            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
                        @elseif ($locked)
                            <x-ui-icon name="lock" class="h-5 w-5" />
                        @else
                            <x-ui-icon :name="$lesson->icon ?: 'book'" class="h-6 w-6" />
                        @endif
                    </div>
                    @unless ($last)
                        <div class="my-1 w-0.5 flex-1 {{ $row['done'] ? 'bg-accent' : 'bg-white/10' }}"></div>
                    @endunless
                </div>

                {{-- Card --}}
                <a @if (! $locked) href="{{ route('knowledge.show', $lesson) }}" wire:navigate @endif
                   class="mb-4 flex flex-1 items-center gap-3 rounded-2xl bg-surface p-4 {{ $locked ? 'opacity-50' : 'tap' }}">
                    <div class="min-w-0 flex-1">
                        <p class="font-bold leading-tight">{{ $lesson->title }}</p>
                        @if ($lesson->description)
                            <p class="mt-0.5 line-clamp-2 text-sm text-muted">{{ $lesson->description }}</p>
                        @endif
                    </div>
                    @unless ($locked)
                        <span class="shrink-0 text-muted">
                            @if ($row['done'])
                                <span class="text-xs font-semibold text-accent">Watch again</span>
                            @else
                                <x-ui-icon name="play" class="h-7 w-7 text-accent" />
                            @endif
                        </span>
                    @endunless
                </a>
            </div>
        @empty
            <p class="px-2 py-10 text-center text-muted">No lessons yet.</p>
        @endforelse
    </div>
</div>
