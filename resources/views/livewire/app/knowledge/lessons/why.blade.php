{{-- Lesson 1: Why Kegel training works. Three tap-through steps. --}}
<div class="flex flex-1 flex-col"
     x-data="{ step: 0, last: 2, go(n) { this.step = Math.max(0, Math.min(this.last, n)); if (this.step === this.last) $dispatch('lesson-finished'); } }">
    <style>
        @keyframes ls-pop-in {
            0% { opacity: 0; transform: translateY(14px) scale(0.96); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ls-glow-breathe {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        .ls-card { opacity: 0; animation: ls-pop-in 0.5s ease-out forwards; }
    </style>

    {{-- Step dots --}}
    <div class="mt-4 flex items-center justify-center gap-1.5">
        <template x-for="i in (last + 1)" :key="i">
            <div class="h-1.5 rounded-full transition-all duration-300" :class="(i - 1) <= step ? 'w-6 bg-accent' : 'w-1.5 bg-white/15'"></div>
        </template>
    </div>

    {{-- Step 1: a muscle like any other --}}
    <div x-show="step === 0" x-transition:enter="transition ease-out duration-300" x-transition:enter-start="opacity-0 translate-y-3" x-transition:enter-end="opacity-100 translate-y-0" class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="relative grid h-40 w-40 place-items-center rounded-full border-4 border-accent/50 bg-surface shadow-2xl animate-[ls-glow-breathe_3.5s_ease-in-out_infinite]">
            <div class="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_14%,transparent),transparent_70%)]"></div>
            <svg viewBox="0 0 24 24" class="h-16 w-16 text-accent drop-shadow-[0_0_14px_color-mix(in_srgb,var(--c-accent)_55%,transparent)]" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
        </div>
        <h1 class="mt-8 text-2xl font-bold leading-tight">A muscle you can train</h1>
        <p class="mt-3 max-w-xs leading-relaxed text-muted">Your pelvic floor is a real muscle. Train it a few minutes a day and it gets stronger, just like any workout. No pills, no side effects, and the results last.</p>
    </div>

    {{-- Step 2: the benefits --}}
    <div x-show="step === 1" x-cloak class="flex flex-1 flex-col justify-center">
        <h1 class="text-center text-2xl font-bold leading-tight">What you gain</h1>
        <div class="mt-6 space-y-3" x-show="step === 1">
            <div class="ls-card flex items-center gap-4 rounded-2xl bg-surface p-4" style="animation-delay: 0.1s">
                <div class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/15">
                    <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="currentColor"><path d="M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>
                </div>
                <div><p class="font-bold">Better bladder control</p><p class="text-sm text-muted">Fewer leaks and urgent moments.</p></div>
            </div>
            <div class="ls-card flex items-center gap-4 rounded-2xl bg-surface p-4" style="animation-delay: 0.3s">
                <div class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/15">
                    <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                </div>
                <div><p class="font-bold">Stronger performance</p><p class="text-sm text-muted">More control and stamina in intimacy.</p></div>
            </div>
            <div class="ls-card flex items-center gap-4 rounded-2xl bg-surface p-4" style="animation-delay: 0.5s">
                <div class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/15">
                    <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="currentColor"><path d="M12 2l8 3v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V5l8-3z"/></svg>
                </div>
                <div><p class="font-bold">A supported core</p><p class="text-sm text-muted">Helps posture and lower back.</p></div>
            </div>
            <div class="ls-card flex items-center gap-4 rounded-2xl bg-surface p-4" style="animation-delay: 0.7s">
                <div class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/15">
                    <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                </div>
                <div><p class="font-bold">Lasting confidence</p><p class="text-sm text-muted">Gains that build week after week.</p></div>
            </div>
        </div>
    </div>

    {{-- Step 3: doing it right is everything --}}
    <div x-show="step === 2" x-cloak class="flex flex-1 flex-col justify-center">
        <h1 class="text-center text-2xl font-bold leading-tight">Doing it right is everything</h1>
        <p class="mt-3 text-center text-base leading-relaxed text-muted">Squeeze the wrong muscles and you get nothing back.</p>

        <div class="ls-card mt-6 overflow-hidden rounded-3xl border border-accent/30 bg-surface" style="animation-delay: 0.15s">
            <div class="flex items-center gap-3 border-b border-white/10 bg-accent/10 px-5 py-3.5">
                <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-accent" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                <p class="font-bold text-accent-soft">Worth two minutes of your time</p>
            </div>
            <div class="space-y-3 px-5 py-4">
                <div class="flex items-center gap-3">
                    <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">2</span>
                    <p class="text-sm leading-relaxed text-muted">The next lesson shows you exactly where your muscles are.</p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">3</span>
                    <p class="text-sm leading-relaxed text-muted">Then you do your first real exercise, guided by the circle.</p>
                </div>
                <p class="pt-1 text-sm font-semibold leading-relaxed">Learn it once, and every minute you train actually counts.</p>
            </div>
        </div>
    </div>

    {{-- Step navigation: the continue button takes the forward arrow's place --}}
    <div class="flex items-center gap-3 pt-4">
        <button x-show="step > 0" x-cloak @click="go(step - 1)"
                class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-surface text-content tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <div class="flex-1"></div>
        <button x-show="step < last" @click="go(step + 1)"
                class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/25 tap" aria-label="Next">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>
        <button x-show="step >= last && finished" x-cloak wire:click="complete" wire:loading.attr="disabled"
                class="h-14 flex-1 rounded-2xl bg-accent text-base font-bold text-white shadow-lg shadow-accent/25 tap disabled:opacity-60">
            {{ $hasNext ? 'Next lesson' : 'Done' }}
        </button>
    </div>
</div>
