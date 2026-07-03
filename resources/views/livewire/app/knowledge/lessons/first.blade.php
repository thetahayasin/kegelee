{{-- Lesson 3: Your first exercise. The demo and the try-out run the REAL
     Trembling steps on the exact workout player circle. --}}
@php
    $r = ($circleSize - $trackWidth) / 2;
    $circ = 2 * M_PI * $r;
@endphp
<div class="flex flex-1 flex-col"
     x-data="{
         step: 0, last: 2,
         steps: @js($tremblingSteps),
         total: @js($tremblingTotal),
         timeScale: @js($timeScale), glowSpeed: @js($glowSpeed),
         i: 0, remaining: 0, playing: false, looping: false, tried: false, _t: null,
         go(n) {
             this.step = Math.max(0, Math.min(this.last, n));
             if (this.step === 1) this.play(true); else this.stopPlay();
         },
         play(loop) {
             this.stopPlay();
             this.looping = loop; this.i = 0; this.remaining = this.steps[0].seconds; this.playing = true;
             this._t = setInterval(() => {
                 if (!this.playing) return;
                 this.remaining -= 0.05 * this.timeScale;
                 if (this.remaining <= 0.0001) this.advance();
             }, 50);
         },
         stopPlay() { if (this._t) { clearInterval(this._t); this._t = null; } this.playing = false; },
         advance() {
             if (this.i >= this.steps.length - 1) {
                 if (this.looping) { this.i = 0; this.remaining = this.steps[0].seconds; return; }
                 this.stopPlay(); this.tried = true; this.$dispatch('lesson-finished'); return;
             }
             this.i++; this.remaining = this.steps[this.i].seconds;
         },
         startTry() { if (this.tried || this.playing) return; this.play(false); },
         destroy() { this.stopPlay(); },
         get cur() { return this.steps[this.i] || { label: 'Relax', seconds: 1, from: 0, to: 0 }; },
         ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); },
         get phaseProgress() {
             let total = this.cur.seconds;
             return Math.max(0, Math.min(1, (total - this.remaining) / Math.max(0.001, total)));
         },
         get intensity() {
             if (!this.playing) return 0;
             return this.cur.from + (this.cur.to - this.cur.from) * this.ease(this.phaseProgress);
         },
         get glowOpacity() { return 0.08 + this.intensity * 0.92; },
         get glowScale() { return 0.58 + this.intensity * 0.42; },
         get glowTransition() {
             if (this.cur.from !== this.cur.to) return 'opacity 0.1s linear, transform 0.1s linear';
             let g = Math.min(this.glowSpeed, Math.max(0.15, this.cur.seconds * 0.8));
             return 'opacity ' + g + 's ease-in-out, transform ' + g + 's ease-in-out';
         },
         get rawRemaining() {
             let rem = this.remaining;
             for (let k = this.i + 1; k < this.steps.length; k++) rem += this.steps[k].seconds;
             return Math.max(0, rem);
         },
         get count() { return Math.max(0, Math.ceil(this.rawRemaining)); },
         get pct() { return this.total > 0 ? Math.min(1, Math.max(0, (this.total - this.rawRemaining) / this.total)) : 0; },
     }">
    {{-- Step dots --}}
    <div class="mt-4 flex items-center justify-center gap-1.5">
        <template x-for="n in (last + 1)" :key="n">
            <div class="h-1.5 rounded-full transition-all duration-300" :class="(n - 1) <= step ? 'w-6 bg-accent' : 'w-1.5 bg-white/15'"></div>
        </template>
    </div>

    {{-- Step 1: how the circle works --}}
    <div x-show="step === 0" x-transition:enter="transition ease-out duration-300" x-transition:enter-start="opacity-0 translate-y-3" x-transition:enter-end="opacity-100 translate-y-0" class="flex flex-1 flex-col items-center justify-center text-center">
        <div class="relative grid place-items-center" style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
            <div class="relative grid place-items-center rounded-full bg-surface/80 ring-2 ring-white/15 [grid-area:1/1]"
                 style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
                <svg width="{{ $circleSize }}" height="{{ $circleSize }}" viewBox="0 0 {{ $circleSize }} {{ $circleSize }}" class="absolute -rotate-90">
                    <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="{{ $trackWidth }}"/>
                    <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="#ffffff" stroke-width="{{ $trackWidth }}"
                            stroke-linecap="round" stroke-dasharray="{{ $circ }}" stroke-dashoffset="{{ $circ * 0.35 }}"
                            style="filter: drop-shadow(0 0 3px rgba(255,255,255,0.5));"/>
                </svg>
                <div class="text-center">
                    <p class="text-5xl font-bold tabular-nums">12</p>
                    <p class="mt-1 font-semibold">Contract</p>
                </div>
            </div>
        </div>
        <h1 class="mt-6 text-2xl font-bold leading-tight">The circle is your guide</h1>
        <p class="mt-3 max-w-xs leading-relaxed text-muted">Every exercise follows this circle. When it glows and swells, squeeze. When the glow fades, relax. The word inside always tells you what to do.</p>
    </div>

    {{-- Step 2: watch Trembling run on the real player circle --}}
    <div x-show="step === 1" x-cloak class="flex flex-1 flex-col items-center justify-center text-center">
        <h1 class="text-2xl font-bold leading-tight">This is Trembling</h1>
        <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted">Your first exercise: quick flicks. Squeeze on Contract, let go on Relax.</p>

        <div class="relative mt-6 grid place-items-center" style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
            @if ($glowEnabled)
                <div class="contract-glow absolute left-1/2 top-1/2 rounded-full"
                     style="width: {{ round($circleSize * 1.7) }}px; height: {{ round($circleSize * 1.7) }}px;"
                     x-bind:style="{ opacity: glowOpacity, transform: 'translate(-50%, -50%) scale(' + glowScale + ')', transition: glowTransition }"></div>
            @endif
            <div class="relative grid place-items-center rounded-full bg-surface/80 ring-2 ring-white/15 [grid-area:1/1]"
                 style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
                <svg width="{{ $circleSize }}" height="{{ $circleSize }}" viewBox="0 0 {{ $circleSize }} {{ $circleSize }}" class="absolute -rotate-90">
                    <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="{{ $trackWidth }}"/>
                    <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="#ffffff" stroke-width="{{ $trackWidth }}"
                            stroke-linecap="round" stroke-dasharray="{{ $circ }}"
                            x-bind:stroke-dashoffset="{{ $circ }} * (1 - pct)"
                            style="transition: stroke-dashoffset 0.12s linear; filter: drop-shadow(0 0 3px rgba(255,255,255,0.5));"/>
                </svg>
                <div class="text-center">
                    <p class="text-5xl font-bold tabular-nums" x-text="count"></p>
                    <p class="mt-1 font-semibold" x-text="cur.label"></p>
                </div>
            </div>
        </div>
    </div>

    {{-- Step 3: guided try on the same circle --}}
    <div x-show="step === 2" x-cloak class="flex flex-1 flex-col items-center justify-center text-center">
        <h1 class="text-2xl font-bold leading-tight" x-text="tried ? 'Nice work!' : 'Now you try'"></h1>
        <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted" x-show="!tried && !playing">Ten seconds of Trembling. Squeeze on every Contract, let go on Relax. Ready?</p>
        <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted" x-show="playing" x-cloak>Follow the circle. Squeeze... and relax.</p>
        <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted" x-show="tried" x-cloak>That was a real exercise. Every session works exactly like this, one circle at a time.</p>

        <div class="relative mt-6 grid place-items-center" style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
            @if ($glowEnabled)
                <div class="contract-glow absolute left-1/2 top-1/2 rounded-full"
                     style="width: {{ round($circleSize * 1.7) }}px; height: {{ round($circleSize * 1.7) }}px;"
                     x-bind:style="{ opacity: glowOpacity, transform: 'translate(-50%, -50%) scale(' + glowScale + ')', transition: glowTransition }"></div>
            @endif
            <div class="relative grid place-items-center rounded-full bg-surface/80 ring-2 ring-white/15 [grid-area:1/1]"
                 style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
                <svg width="{{ $circleSize }}" height="{{ $circleSize }}" viewBox="0 0 {{ $circleSize }} {{ $circleSize }}" class="absolute -rotate-90">
                    <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="{{ $trackWidth }}"/>
                    <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="#ffffff" stroke-width="{{ $trackWidth }}"
                            stroke-linecap="round" stroke-dasharray="{{ $circ }}"
                            x-bind:stroke-dashoffset="{{ $circ }} * (1 - pct)"
                            style="transition: stroke-dashoffset 0.12s linear; filter: drop-shadow(0 0 3px rgba(255,255,255,0.5));"/>
                </svg>
                <button x-show="!playing && !tried" @click="startTry()"
                        class="grid h-24 w-24 place-items-center rounded-full bg-accent text-lg font-bold text-white shadow-lg shadow-accent/30 tap">Start</button>
                <div x-show="playing" x-cloak class="text-center">
                    <p class="text-5xl font-bold tabular-nums" x-text="count"></p>
                    <p class="mt-1 font-semibold" x-text="cur.label"></p>
                </div>
                <svg x-show="tried" x-cloak viewBox="0 0 24 24" class="h-20 w-20 text-accent" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
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
