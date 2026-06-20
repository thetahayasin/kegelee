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
         x-data="{ maxTime: 0 }">
        @if ($lesson->hasVideo())
            <video src="{{ $lesson->videoSrc() }}" 
                   class="w-full h-full object-cover cursor-pointer" 
                   autoplay
                   playsinline
                   x-ref="player"
                   @play="paused = false"
                   @pause="paused = true"
                   @click="$refs.player.paused ? $refs.player.play() : $refs.player.pause()"
                   x-on:ended="finished = true; $wire.markDone()"
                   @if (!auth()->check())
                   x-on:timeupdate="if (!finished && $el.currentTime > maxTime + 1.5) { $el.currentTime = maxTime; } else { maxTime = Math.max(maxTime, $el.currentTime); }"
                   @endif></video>

            <div x-show="paused" 
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
