<div class="min-h-[100dvh] pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]"
     x-data="{ finished: @js($done) }">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('knowledge.index') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="truncate px-12 text-lg font-bold">Knowledge</h1>
    </header>

    {{-- Video (shown straight away) --}}
    <div class="mx-4 grid aspect-video place-items-center overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
        @if ($lesson->hasVideo())
            <video src="{{ $lesson->videoSrc() }}" class="h-full w-full object-contain" controls autoplay playsinline
                   @if ($lesson->thumbnailUrl()) poster="{{ $lesson->thumbnailUrl() }}" @endif
                   x-on:ended="finished = true; $wire.markDone()"></video>
        @else
            <div class="grid place-items-center gap-2 text-center text-muted">
                <x-ui-icon :name="$lesson->icon ?: 'book'" class="h-12 w-12 text-accent" />
                <p class="text-sm">Video coming soon</p>
            </div>
        @endif
    </div>

    <div class="px-5 pt-5">
        <h2 class="text-2xl font-bold leading-tight">{{ $lesson->title }}</h2>
        @if ($lesson->description)
            <p class="mt-3 leading-relaxed text-muted">{{ $lesson->description }}</p>
        @endif
        @if ($lesson->hasVideo())
            <p x-show="!finished" class="mt-4 text-sm text-muted">Watch the video to continue.</p>
        @endif
    </div>

    {{-- Sticky CTA: Continue/Next appears once the video has finished (or no video). --}}
    <div class="fixed inset-x-0 bottom-0 mx-auto max-w-[440px] border-t border-white/5 bg-bg/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        @php($needsWatch = $lesson->hasVideo())
        <button wire:click="complete"
                @if ($needsWatch) x-show="finished" x-transition x-cloak @endif
                class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold tap">
            {{ $hasNext ? 'Continue' : 'Done' }}
        </button>
        @if ($needsWatch)
            <button x-show="!finished" @click="finished = true; $wire.markDone()"
                    class="grid h-14 w-full place-items-center rounded-2xl bg-surface-2 font-semibold text-muted tap">
                Skip video
            </button>
        @endif
    </div>
</div>
