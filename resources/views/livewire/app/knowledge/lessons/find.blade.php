{{-- Lesson 2: Find your pelvic floor. Two explainer steps + a press-and-hold try-out. --}}
<div class="flex flex-1 flex-col"
     x-data="{
         step: 0, last: 2,
         held: 0, goal: 3, holding: false, doneHold: false, _t: null,
         go(n) { this.step = Math.max(0, Math.min(this.last, n)); },
         startHold() {
             if (this.doneHold || this.holding) return;
             this.holding = true;
             this._t = setInterval(() => {
                 this.held = Math.min(this.goal, this.held + 0.1);
                 if (this.held >= this.goal) {
                     this.stopHold();
                     this.doneHold = true;
                     this.$dispatch('lesson-finished');
                 }
             }, 100);
         },
         stopHold() { this.holding = false; if (this._t) { clearInterval(this._t); this._t = null; } },
         destroy() { this.stopHold(); },
     }">
    <style>
        @keyframes ls-drip {
            0%, 100% { transform: translateY(0); opacity: 1; }
            50% { transform: translateY(9px); opacity: 0.55; }
        }
        @keyframes ls-glow-breathe2 {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        @keyframes ls-rule-in {
            0% { opacity: 0; transform: translateY(14px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        .ls-rule { opacity: 0; animation: ls-rule-in 0.5s ease-out forwards; }
    </style>

    {{-- Step dots --}}
    <div class="mt-4 flex items-center justify-center gap-1.5">
        <template x-for="i in (last + 1)" :key="i">
            <div class="h-1.5 rounded-full transition-all duration-300" :class="(i - 1) <= step ? 'w-6 bg-accent' : 'w-1.5 bg-white/15'"></div>
        </template>
    </div>

    {{-- Step 1: the pee trick --}}
    <div x-show="step === 0" x-transition:enter="transition ease-out duration-300" x-transition:enter-start="opacity-0 translate-y-3" x-transition:enter-end="opacity-100 translate-y-0" class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="relative grid h-40 w-40 place-items-center rounded-full border-4 border-accent/50 bg-surface shadow-2xl animate-[ls-glow-breathe2_3.5s_ease-in-out_infinite]">
            <div class="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_14%,transparent),transparent_70%)]"></div>
            <svg viewBox="0 0 24 24" class="h-16 w-16 text-accent drop-shadow-[0_0_14px_color-mix(in_srgb,var(--c-accent)_55%,transparent)] animate-[ls-drip_2.2s_ease-in-out_infinite]" fill="currentColor">
                <path d="M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>
            </svg>
        </div>
        <h1 class="mt-8 text-2xl font-bold leading-tight">The easiest way to find them</h1>
        <p class="mt-3 max-w-xs leading-relaxed text-muted">Next time you pee, gently stop the flow midway. The muscles you just used are your pelvic floor. That squeeze is exactly the move you will train.</p>
    </div>

    {{-- Step 2: one time only + extra cues, as do/dont cards --}}
    <div x-show="step === 1" x-cloak class="flex flex-1 flex-col justify-center">
        <h1 class="text-center text-2xl font-bold leading-tight">Two quick rules</h1>
        <div class="mt-6 space-y-3">
            <div class="ls-rule flex items-start gap-4 rounded-2xl border border-white/10 bg-surface p-5" style="animation-delay: 0.1s">
                <div class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-500/15">
                    <svg viewBox="0 0 24 24" class="h-6 w-6 text-red-400" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </div>
                <div>
                    <p class="font-bold">Only do the pee test once</p>
                    <p class="mt-1 text-sm leading-relaxed text-muted">It is just a way to find the muscles, not an exercise. Stopping your pee often is not good for your bladder.</p>
                </div>
            </div>
            <div class="ls-rule flex items-start gap-4 rounded-2xl border border-white/10 bg-surface p-5" style="animation-delay: 0.35s">
                <div class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-success/15">
                    <svg viewBox="0 0 24 24" class="h-6 w-6 text-success" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                </div>
                <div>
                    <p class="font-bold">Squeeze only those muscles</p>
                    <p class="mt-1 text-sm leading-relaxed text-muted">Another cue: squeeze as if holding back gas. Your belly, legs and buttocks stay completely relaxed.</p>
                </div>
            </div>
        </div>
    </div>

    {{-- Step 3: try it - press and hold --}}
    <div x-show="step === 2" x-cloak class="flex flex-1 flex-col items-center justify-center text-center">
        <h1 class="text-2xl font-bold leading-tight" x-text="doneHold ? 'You found them!' : 'Try it now'"></h1>
        <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted" x-show="!doneHold">Press and hold the circle. While you hold it, squeeze those muscles. Let go together.</p>
        <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted" x-show="doneHold" x-cloak>That squeeze and release is all a Kegel is. You are ready for your first exercise.</p>

        <div class="relative mt-8 grid h-52 w-52 select-none place-items-center"
             @pointerdown.prevent="startHold()" @pointerup="stopHold()" @pointercancel="stopHold()" @pointerleave="stopHold()">
            {{-- Glow that swells while holding --}}
            <div class="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_30%,transparent),transparent_70%)] transition-all duration-300"
                 :style="'opacity:' + (holding || doneHold ? 1 : 0.25) + '; transform: scale(' + (holding || doneHold ? 1.15 : 0.9) + ')'"></div>

            <div class="relative grid h-44 w-44 place-items-center rounded-full bg-surface ring-2 ring-white/15 transition-transform duration-300"
                 :class="holding ? 'scale-95' : ''">
                <svg viewBox="0 0 120 120" class="absolute inset-0 h-full w-full -rotate-90">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="8"/>
                    <circle cx="60" cy="60" r="54" fill="none" stroke="var(--c-accent)" stroke-width="8" stroke-linecap="round"
                            stroke-dasharray="339.3"
                            :stroke-dashoffset="339.3 * (1 - held / goal)"
                            style="transition: stroke-dashoffset 0.1s linear; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--c-accent) 55%, transparent));"/>
                </svg>
                <div class="text-center" x-show="!doneHold">
                    <p class="text-lg font-bold" x-text="holding ? 'Squeeze!' : 'Press & hold'"></p>
                    <p class="mt-1 text-xs text-muted" x-text="holding ? 'Keep going...' : ''"></p>
                </div>
                <svg x-show="doneHold" x-cloak viewBox="0 0 24 24" class="h-16 w-16 text-accent" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
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
