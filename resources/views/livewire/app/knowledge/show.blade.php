<div class="fixed inset-0 bg-black overflow-hidden z-50 flex flex-col justify-between"
     x-data="{ finished: @js($done), paused: false }">
    
    {{-- Close Button --}}
    <a href="{{ route('knowledge.index') }}" 
       wire:navigate 
       class="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors tap" 
       aria-label="Close">
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </a>

    {{-- TikTok style full-screen Video --}}
    <div class="absolute inset-0 w-full h-full z-0 flex items-center justify-center"
         x-data="{ maxTime: 0, videoError: false }"
         @app-offline.window="videoError = true"
         @app-online.window="if (videoError) { videoError = false; $nextTick(() => $refs.player && $refs.player.load()) }">
        @if ($lesson->hasVideo())
            <video src="{{ $lesson->videoSrc() }}"
                   class="w-full h-full object-cover cursor-pointer"
                   x-show="!videoError"
                   autoplay
                   playsinline
                   x-ref="player"
                   @play="paused = false"
                   @pause="paused = true"
                   @click="$refs.player.paused ? $refs.player.play() : $refs.player.pause()"
                   x-on:error="videoError = true"
                   x-on:ended="finished = true; $wire.markDone()"
                   @if (!auth()->check())
                   x-on:timeupdate="if (!finished && $el.currentTime > maxTime + 1.5) { $el.currentTime = maxTime; } else { maxTime = Math.max(maxTime, $el.currentTime); }"
                   @endif></video>

            {{-- Videos are online-only — show a friendly prompt if it can't load. --}}
            <div x-show="videoError" x-cloak class="absolute inset-0 z-10 grid place-items-center gap-3 px-8 text-center">
                <div class="grid gap-2 justify-items-center">
                    <svg viewBox="0 0 24 24" class="h-14 w-14 text-muted" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
                    <p class="text-lg font-bold">Connect to the internet</p>
                    <p class="max-w-xs text-sm text-muted">Lessons stream online. Reconnect to watch this video.</p>
                    <button @click="videoError = false; $nextTick(() => $refs.player.load())"
                            class="mt-2 rounded-xl bg-accent px-5 py-2 text-sm font-bold text-[var(--c-on-accent)] tap">Retry</button>
                </div>
            </div>

            <div x-show="paused && !videoError"
                 x-transition.opacity
                 @click="$refs.player.play()"
                 class="absolute inset-0 z-10 grid place-items-center bg-black/20 pointer-events-auto cursor-pointer">
                <div class="grid h-20 w-20 place-items-center rounded-full bg-black/50 text-white scale-110 active:scale-95 transition-all duration-200">
                    <svg viewBox="0 0 24 24" class="h-10 w-10 fill-current ml-1"><path d="M8 5v14l11-7z"/></svg>
                </div>
            </div>
        @else
            <div class="relative z-10 grid place-items-center gap-2 text-center text-muted">
                <svg viewBox="0 0 24 24" class="h-16 w-16 text-accent" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M10 8l6 4-6 4V8z"/>
                </svg>
                <p class="text-lg font-bold">Video coming soon</p>
            </div>
        @endif
    </div>

    {{-- Floating CTA Button at the bottom --}}
    <div class="absolute bottom-[calc(2rem+env(safe-area-inset-bottom))] inset-x-5 z-20">
        <button wire:click="complete"
                x-show="finished" 
                x-transition 
                x-cloak
                class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-bold text-base shadow-lg shadow-accent/20 hover:brightness-110 active:scale-[0.98] transition-all tap">
            {{ $hasNext ? 'Next' : 'Done' }}
        </button>
    </div>
</div>
