@php
    $r = ($circleSize - $trackWidth) / 2;
    $circ = 2 * M_PI * $r;
@endphp
<div class="min-h-[100dvh]">
    @if (! $done)
        {{-- ================= PLAYER ================= --}}
        <div
            x-data="{
                steps: @js($steps),
                i: 0, remaining: 0, elapsed: 0,
                paused: false, running: true, timer: null,
                glow: @js($glowEnabled), haptics: @js($haptics),
                trial: @js($trial), skipAfter: @js($skipAfter),
                timeScale: @js($timeScale), glowSpeed: @js($glowSpeed),
                showHelp: false, trackX: 0,
                init() {
                    console.log('Alpine init called, timeScale:', this.timeScale, 'glowSpeed:', this.glowSpeed);
                    if (!this.steps.length) { this.finish(); return; }
                    this.remaining = this.steps[0].seconds;
                    if (window.kegelPlayerTimer) {
                        console.log('Clearing existing duplicate interval:', window.kegelPlayerTimer);
                        clearInterval(window.kegelPlayerTimer);
                    }
                    this.timer = setInterval(() => {
                        if (this.paused || !this.running) return;
                        // 50ms tick (matches the admin preview) for a smooth,
                        // non-abrupt glow. Advance nominal time scaled by the
                        // playback tempo so count, beats and glow run together.
                        let dt = 0.05 * this.timeScale;
                        this.remaining -= dt; this.elapsed += dt;
                        if (this.remaining <= 0.0001) this.advance();
                    }, 50);
                    window.kegelPlayerTimer = this.timer;
                    console.log('Set new interval:', this.timer);
                },
                advance() {
                    if (this.i >= this.steps.length - 1) { this.finish(); return; }
                    this.i++;
                    this.remaining = this.steps[this.i].seconds;
                    if (this.haptics && window.kegel) window.kegel.haptic(this.cur.phase === 'contract' ? 30 : 12);
                },
                finish() {
                    console.log('Alpine finish called');
                    this.running = false;
                    clearInterval(this.timer);
                    if (window.kegelPlayerTimer) {
                        clearInterval(window.kegelPlayerTimer);
                        window.kegelPlayerTimer = null;
                    }
                    $wire.complete(Math.max(0, Math.round(this.elapsed)));
                },
                destroy() {
                    console.log('Alpine destroy called');
                    clearInterval(this.timer);
                    if (window.kegelPlayerTimer) {
                        clearInterval(window.kegelPlayerTimer);
                        window.kegelPlayerTimer = null;
                    }
                },
                get cur() { return this.steps[this.i] || {phase:'relax',label:'',seconds:1,exercise:''}; },
                get isContract() { return this.cur.phase === 'contract'; },
                // 0→1 progress through the current step, tied to real seconds.
                get phaseProgress() {
                    let total = this.cur.seconds;
                    return Math.max(0, Math.min(1, (total - this.remaining) / Math.max(0.001, total)));
                },
                ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); },
                get glowMode() { return this.cur.glow_mode || 'slowly'; },
                // Where the glow should rest this phase: out/full while contracting
                // (or holding), retracted to the inner circle during relax / rest.
                get glowTarget() { return (this.cur.phase !== 'rest' && (this.cur.full || this.isContract)) ? 1 : 0; },
                // slowly = travel over the phase seconds and complete by its end
                // (eased so the seam never kinks); otherwise jump to the target and
                // let the transition below carry it there seamlessly.
                get intensity() {
                    if (this.cur.phase === 'rest') return 0;
                    if (this.cur.full) return 1;
                    if (this.glowMode === 'slowly') return this.ease(this.isContract ? this.phaseProgress : 1 - this.phaseProgress);
                    return this.glowTarget;
                },
                get glowOpacity() { return this.cur.phase === 'rest' ? 0 : 0.08 + this.intensity * 0.92; },
                // 0.58 collapses the 1.7x glow disc until its rim meets the inner
                // circle; 1.0 expands it fully out on contraction.
                get glowScale()   { return 0.58 + this.intensity * 0.42; },
                get glowTransition() {
                    if (this.glowMode === 'slowly') return 'opacity 0.1s linear, transform 0.1s linear';
                    let d = this.glowMode === 'very_fast' ? Math.min(0.15, this.glowSpeed) : this.glowSpeed;
                    return 'opacity ' + d + 's ease-in-out, transform ' + d + 's ease-in-out';
                },
                get canSkip() { return this.trial && this.elapsed >= this.skipAfter; },
                // Center number: total time left in the current exercise (or the rest), not the per-beat count.
                get blockRemaining() {
                    if (this.cur.phase === 'rest') return Math.max(0, Math.ceil(this.remaining));
                    let rem = this.remaining;
                    for (let k = this.i + 1; k < this.steps.length; k++) {
                        const s = this.steps[k];
                        if (s.phase === 'rest' || s.exercise !== this.cur.exercise) break;
                        rem += s.seconds;
                    }
                    return Math.max(0, Math.ceil(rem));
                },
                // Raw (non-ceiled) remaining for the current exercise block — used for smooth circle progress.
                get blockRemainingRaw() {
                    if (this.cur.phase === 'rest') return Math.max(0, this.remaining);
                    let rem = this.remaining;
                    for (let k = this.i + 1; k < this.steps.length; k++) {
                        const s = this.steps[k];
                        if (s.phase === 'rest' || s.exercise !== this.cur.exercise) break;
                        rem += s.seconds;
                    }
                    return Math.max(0, rem);
                },
                // Total duration of the current exercise block (all contract+relax steps for this exercise).
                get blockTotal() {
                    if (this.cur.phase === 'rest') return Math.max(1, this.cur.seconds);
                    let start = this.i;
                    while (start > 0 && this.steps[start-1].phase !== 'rest' && this.steps[start-1].exercise === this.cur.exercise) start--;
                    let total = 0;
                    for (let k = start; k < this.steps.length; k++) {
                        const s = this.steps[k];
                        if (s.phase === 'rest' || s.exercise !== this.cur.exercise) break;
                        total += s.seconds;
                    }
                    return Math.max(1, total);
                },
                // Circle fills over the full exercise block duration, not per-beat.
                get blockPct() {
                    let total = this.blockTotal;
                    return Math.min(1, Math.max(0, (total - this.blockRemainingRaw) / total));
                },
                get totalRemaining() { let rem = this.remaining; for (let k = this.i + 1; k < this.steps.length; k++) rem += this.steps[k].seconds; return Math.ceil(rem); },
                get timeLabel() {
                    let s = this.totalRemaining;
                    if (s > 30) {
                        return Math.ceil(s / 60) + 'm left';
                    }
                    return s + 's left';
                },
                get prevItem() {
                    let curEx = this.cur.phase === 'rest' ? null : this.cur.exercise;
                    for (let k = this.i - 1; k >= 0; k--) {
                        const s = this.steps[k];
                        if (s.phase === 'rest') {
                            if (curEx === null) continue;
                            return 'Rest';
                        }
                        if (s.exercise === curEx) continue;
                        return s.exercise;
                    }
                    return null;
                },
                get nextItem() {
                    let curEx = this.cur.phase === 'rest' ? null : this.cur.exercise;
                    for (let k = this.i + 1; k < this.steps.length; k++) {
                        const s = this.steps[k];
                        if (s.phase === 'rest') {
                            if (curEx === null) continue;
                            return 'Rest';
                        }
                        if (s.exercise === curEx) continue;
                        return s.exercise;
                    }
                    return null;
                },
                // Carousel items follow the real session flow: each exercise block
                // plus each rest between them (rests are shown).
                get carouselItems() {
                    let items = []; let last = null;
                    for (const s of this.steps) {
                        if (s.phase === 'rest') {
                            if (last !== '__rest') { items.push({ label: 'Rest', rest: true }); last = '__rest'; }
                        } else if (s.exercise !== last) {
                            items.push({ label: s.exercise, rest: false }); last = s.exercise;
                        }
                    }
                    return items;
                },
                // Index (in carouselItems) of the item being worked on now.
                get curItemIndex() {
                    let idx = -1; let last = null;
                    let upto = Math.min(this.i, this.steps.length - 1);
                    for (let k = 0; k <= upto; k++) {
                        const s = this.steps[k];
                        if (s.phase === 'rest') {
                            if (last !== '__rest') { idx++; last = '__rest'; }
                        } else if (s.exercise !== last) {
                            idx++; last = s.exercise;
                        }
                    }
                    return Math.max(0, idx);
                },
                // Centre the active carousel item by measuring its position (items
                // are variable width, so the slide offset can't be a fixed stride).
                recenter() {
                    this.$nextTick(() => {
                        const t = this.$refs.track; if (!t) return;
                        const el = t.querySelectorAll('[data-c-item]')[this.curItemIndex];
                        if (el) this.trackX = -(el.offsetLeft + el.offsetWidth / 2);
                    });
                },
            }"
            x-init="init()"
            class="flex min-h-[100dvh] flex-col px-6 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
            {{-- Top row --}}
            <div class="flex items-center justify-between">
                @if ($trial && $exercise)
                    <a href="{{ route('exercises.show', $exercise) }}" wire:navigate class="grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
                        <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>
                    </a>
                @else
                    <a href="{{ route('home') }}" wire:navigate class="grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
                        <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7"/></svg>
                    </a>
                @endif
                <p class="text-sm text-muted" x-text="timeLabel"></p>
                <span class="h-9 w-9"></span>
            </div>

            {{-- Ring --}}
            <div class="flex flex-1 items-center justify-center">
                <div class="relative grid place-items-center" style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
                    {{-- Red contract glow (absolutely centred so it never affects the circle's position) --}}
                    @if ($glowEnabled)
                        <div class="contract-glow absolute left-1/2 top-1/2 rounded-full"
                             style="width: {{ round($circleSize * 1.7) }}px; height: {{ round($circleSize * 1.7) }}px;"
                             x-bind:style="{ opacity: glowOpacity, transform: 'translate(-50%, -50%) scale(' + glowScale + ')', transition: glowTransition }"></div>
                    @endif

                    <div class="relative grid place-items-center rounded-full bg-surface/80 ring-2 ring-white/15 [grid-area:1/1]"
                         style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
                        <svg width="{{ $circleSize }}" height="{{ $circleSize }}" viewBox="0 0 {{ $circleSize }} {{ $circleSize }}" class="absolute -rotate-90">
                            {{-- Prominent solid track + bright progress arc --}}
                            <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="{{ $trackWidth }}"/>
                            <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="#ffffff" stroke-width="{{ $trackWidth }}"
                                    stroke-linecap="round" stroke-dasharray="{{ $circ }}"
                                    x-bind:stroke-dashoffset="{{ $circ }} * (1 - blockPct)"
                                    style="transition: stroke-dashoffset {{ $animationSpeed }}s linear; filter: drop-shadow(0 0 3px rgba(255,255,255,0.5));"/>
                        </svg>
                        <div class="text-center">
                            <p class="text-5xl font-bold tabular-nums" x-text="blockRemaining"></p>
                            <p class="mt-1 font-semibold" x-text="cur.label"></p>
                        </div>
                    </div>
                </div>
            </div>

            {{-- Help (hidden during rest) --}}
            <div class="flex justify-center pb-4" x-show="cur.phase !== 'rest'" x-transition>
                <button @click="showHelp = !showHelp; paused = showHelp" class="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-muted tap" aria-label="Help">
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 113.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/></svg>
                </button>
            </div>
            <div x-show="showHelp && cur.phase !== 'rest'" x-transition class="mb-3 rounded-2xl bg-surface px-4 py-3 text-sm text-muted">
                Squeeze your pelvic floor muscles when the circle says <span class="text-content font-medium">Contract &amp; hold</span> and the glow turns red. Let go fully on <span class="text-content font-medium">Relax</span>.
            </div>

            {{-- Past · Current · Next --}}
            {{-- Exercise carousel — auto-centres on the active item; not user-scrollable; full text on one line --}}
            <div class="relative mb-3 h-9 overflow-hidden" x-on:resize.window="recenter()">
                <div class="absolute left-1/2 top-1/2 flex items-center transition-transform duration-500 ease-out"
                     x-ref="track" x-effect="curItemIndex; recenter()"
                     x-bind:style="'transform: translate(' + trackX + 'px, -50%)'">
                    <template x-for="(item, idx) in carouselItems" :key="idx">
                        <div data-c-item
                             class="shrink-0 whitespace-nowrap px-3 text-center"
                             :class="idx === curItemIndex ? (item.rest ? 'text-base font-medium text-muted' : 'text-lg font-bold text-content') : 'text-base text-white/35'"
                             x-text="item.label"></div>
                    </template>
                </div>
            </div>

            {{-- Pause / resume --}}
            <button @click="paused = !paused"
                    class="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 font-semibold tap">
                <template x-if="!paused">
                    <span class="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                        Pause
                    </span>
                </template>
                <template x-if="paused">
                    <span class="flex items-center gap-2 text-accent">
                        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>
                        Resume
                    </span>
                </template>
            </button>

            @if ($trial && $exercise)
                <div x-show="canSkip" x-cloak x-transition class="mt-3">
                    <a href="{{ route('exercises.show', $exercise) }}" wire:navigate
                       class="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-semibold tap">
                        Skip
                        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4l10 8-10 8zM19 5v14"/></svg>
                    </a>
                </div>
            @endif
        </div>
    @else
        {{-- ================= COMPLETION ================= --}}
        @if ($trial && $exercise)
            <div class="flex min-h-[100dvh] flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
                    <div class="mb-6 grid aspect-square w-24 place-items-center rounded-full bg-accent/10 text-accent">
                        <svg viewBox="0 0 24 24" class="h-12 w-12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                            <path d="M22 4L12 14.01l-3-3"/>
                        </svg>
                    </div>
                    <h1 class="text-2xl font-bold">Great job!</h1>
                </div>
                
                <div class="flex flex-col gap-3 px-6">
                    <a href="{{ route('workout', ['exercise' => $exercise, 'trial' => 1]) }}" wire:navigate class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">Try again</a>
                    <a href="{{ route('exercises.show', $exercise) }}" wire:navigate class="grid h-14 w-full place-items-center rounded-2xl bg-surface-2 font-semibold text-content tap">Back to exercise</a>
                </div>
            </div>
        @else
            @php
                $pos = $result['position'];
                $cprog = $result['progress'];
                $cpct = min(1, max(0, ($cprog['required'] ?? 0) > 0 ? $cprog['done'] / $cprog['required'] : 1));
                $csize = 208; $cstroke = 12; $cr = ($csize - $cstroke) / 2;
                $ccirc = round(2 * M_PI * $cr, 2);
                $coff = round($ccirc * (1 - $cpct), 2);
            @endphp
            <div class="flex min-h-[100dvh] flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                {{-- Big themed completion ring with an animated tick (no sky/mountains) --}}
                <div class="flex flex-col items-center px-6 pt-[calc(2rem+env(safe-area-inset-top))]">
                    <div class="animate-ring-pop relative grid place-items-center" style="width: {{ $csize }}px; height: {{ $csize }}px;">
                        <svg width="{{ $csize }}" height="{{ $csize }}" viewBox="0 0 {{ $csize }} {{ $csize }}" class="-rotate-90">
                            <circle cx="{{ $csize/2 }}" cy="{{ $csize/2 }}" r="{{ $cr }}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="{{ $cstroke }}"/>
                            <circle cx="{{ $csize/2 }}" cy="{{ $csize/2 }}" r="{{ $cr }}" fill="none" stroke="var(--c-accent)" stroke-width="{{ $cstroke }}"
                                    stroke-linecap="round" class="completion-ring"
                                    stroke-dasharray="{{ $ccirc }}" stroke-dashoffset="{{ $coff }}"
                                    style="--ring-start: {{ $ccirc }}; --ring-end: {{ $coff }}; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--c-accent) 45%, transparent));"/>
                        </svg>
                        <svg viewBox="0 0 24 24" class="absolute h-24 w-24 text-accent" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 13l4 4L19 7" pathLength="1" class="completion-tick"/>
                        </svg>
                    </div>
                    <p class="mt-4 text-sm font-semibold text-muted">{{ $cprog['done'] }}/{{ $cprog['required'] }} sessions today</p>
                </div>

                <div class="px-6 pt-5 text-center">
                    <h1 class="text-2xl font-bold">
                        @if ($result['day_completed']) Training Day Complete!
                        @elseif ($result['is_extra']) Extra Session Done!
                        @else Session Complete @endif
                    </h1>
                </div>

                {{-- Month calendar strip --}}
                <div class="mx-4 mt-4 rounded-2xl bg-surface p-4">
                    <div class="flex items-center justify-between">
                        <span class="font-semibold">Month {{ $pos['month'] }}</span>
                        <span class="text-muted">{{ $pos['completed'] }}/{{ $pos['plan_length'] }}</span>
                    </div>
                    <div class="mt-3 flex justify-between gap-1.5">
                        @foreach ($result['days'] as $day)
                            <div class="flex flex-1 flex-col items-center gap-1">
                                <div class="grid aspect-square w-full place-items-center rounded-lg
                                    {{ $day['done'] ? 'bg-accent text-[color:var(--c-on-accent)]' : ($day['today'] ? 'border-2 border-accent' : 'border border-white/15') }}">
                                    @if ($day['done'])
                                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
                                    @endif
                                </div>
                                <span class="text-[10px] {{ $day['today'] ? 'font-bold text-content' : 'text-muted' }}">{{ $day['n'] }}</span>
                            </div>
                        @endforeach
                    </div>
                </div>

                {{-- Unlock progress --}}
                @if ($result['unlocked'])
                    <div class="mx-4 mt-3 rounded-2xl bg-surface p-4">
                        <p class="font-semibold text-success">Unlocked: {{ implode(', ', $result['unlocked']) }}</p>
                    </div>
                @elseif ($result['next_unlock'])
                    @php($nu = $result['next_unlock'])
                    @php($pct = min(100, round($result['next_unlock_completed'] / max(1, $nu['unlock_after_days']) * 100)))
                    <div class="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-surface p-4">
                        <div class="relative">
                            <x-equipment-icon name="{{ $nu['name'] }}" :size="46" />
                            <span class="absolute -left-1 -top-1 rounded bg-accent px-1 text-[8px] font-bold text-white">NEW</span>
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="truncate font-semibold">Unlock '{{ $nu['name'] }}'</p>
                            <div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                                <div class="h-full rounded-full bg-accent" style="width: {{ $pct }}%"></div>
                            </div>
                        </div>
                        <span class="text-sm text-muted">{{ $result['next_unlock_completed'] }}/{{ $nu['unlock_after_days'] }}</span>
                    </div>
                @endif

                <div class="flex-1"></div>
                <div class="px-6">
                    <a href="{{ route('home') }}" wire:navigate class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">Continue</a>
                </div>
            </div>
        @endif
    @endif
</div>
