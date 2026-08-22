{{--
    Interactive basics tutorial shell. The lesson content is a hardcoded
    partial (see App\Support\BasicsLessons); it dispatches a window-level
    'lesson-finished' event when its last step is reached, which records
    completion and reveals the continue button.
--}}
<div class="flex min-h-[100dvh] flex-col px-6 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
     x-data="{ finished: @js($done) }"
     @lesson-finished.window="if (!finished) { finished = true; $wire.markDone(); }">

    {{-- Top bar --}}
    <div class="flex items-center justify-between">
        <a href="{{ route('knowledge.index') }}" wire:navigate
           class="grid h-11 w-11 place-items-center rounded-full text-muted tap" aria-label="Close">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </a>
        <p class="truncate px-2 text-sm font-semibold text-muted">{{ $lesson->title }}</p>
        <span class="h-11 w-11"></span>
    </div>

    @if ($lessonView)
        @include($lessonView)
    @else
        <div class="grid flex-1 place-items-center text-muted">Lesson unavailable.</div>
    @endif
</div>
