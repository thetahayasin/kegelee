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
                showHelp: false, showQuit: false, trackX: 0,
                _wakeLock: null, _saveKey: 'kegel_workout_state',
                _backOff: null,
                done: false,
                useOfflineResult: false,
                offlineResult: null,
                levelId: @js(auth()->user()->level_id),
                init() {
                    if (!this.steps.length) { this.finish(); return; }
                    if (!this.trial) {
                        let saved = sessionStorage.getItem(this._saveKey);
                        if (saved) {
                            try {
                                let s = JSON.parse(saved);
                                // Only resume a playlist built for the CURRENT level -
                                // after a difficulty change the old saved session must
                                // not replace the freshly built one.
                                if (s.levelId === this.levelId) {
                                    if (s.steps) this.steps = s.steps;
                                    this.i = s.i; this.remaining = s.remaining; this.elapsed = s.elapsed;
                                } else {
                                    sessionStorage.removeItem(this._saveKey);
                                }
                            } catch(e) {}
                        }
                    }
                    if (!this.i) this.remaining = this.steps[0].seconds;
                    if (window.kegelPlayerTimer) clearInterval(window.kegelPlayerTimer);
                    this.timer = setInterval(() => {
                        if (this.paused || !this.running) return;
                        let dt = 0.05 * this.timeScale;
                        this.remaining -= dt; this.elapsed += dt;
                        if (this.remaining <= 0.0001) this.advance();
                    }, 50);
                    window.kegelPlayerTimer = this.timer;
                    // Keep screen on during workout
                    this._acquireWakeLock();
                    // Auto-pause when app backgrounds, resume when foregrounded
                    this._onVisibility = () => {
                        if (document.hidden) { this._wasPaused = this.paused; this.paused = true; }
                        else if (!this._wasPaused) { this.paused = false; }
                    };
                    document.addEventListener('visibilitychange', this._onVisibility);
                    // Save state before page unloads (webview kill / navigation)
                    this._onUnload = () => this._saveState();
                    window.addEventListener('pagehide', this._onUnload);
                    // Hardware back during a real session shows the quit dialog
                    // (the same one the ✕ opens) instead of abandoning silently.
                    if (!this.trial && window.appBack) {
                        this._backOff = window.appBack.register(() => {
                            if (this.done) return;
                            if (this.showHelp) { this.showHelp = false; this.paused = false; return; }
                            if (this.showQuit) { this.showQuit = false; this.paused = false; return; }
                            this.paused = true; this.showQuit = true;
                        });
                    }
                },
                _saveState() {
                    // Never persist a try-it-now preview: it must NOT resume as
                    // the daily session (that bug made the next session contain
                    // only the single tried exercise).
                    if (this.trial || !this.running) return;
                    sessionStorage.setItem(this._saveKey, JSON.stringify({
                        steps: this.steps, i: this.i,
                        remaining: this.remaining, elapsed: this.elapsed,
                        levelId: this.levelId,
                    }));
                },
                async _acquireWakeLock() {
                    try { if (navigator.wakeLock) this._wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {}
                },
                _releaseWakeLock() {
                    if (this._wakeLock) { this._wakeLock.release(); this._wakeLock = null; }
                },
                advance() {
                    if (this.i >= this.steps.length - 1) { this.finish(); return; }
                    this.i++;
                    this.remaining = this.steps[this.i].seconds;
                    if (this.haptics && window.kegel) window.kegel.haptic(this.cur.phase === 'contract' ? 30 : 12);
                },
                finish() {
                    this.running = false;
                    clearInterval(this.timer);
                    if (window.kegelPlayerTimer) { clearInterval(window.kegelPlayerTimer); window.kegelPlayerTimer = null; }
                    sessionStorage.removeItem(this._saveKey);
                    this._releaseWakeLock();
                    document.removeEventListener('visibilitychange', this._onVisibility);
                    window.removeEventListener('pagehide', this._onUnload);
                    if (this._backOff) { this._backOff(); this._backOff = null; }
                    let secs = Math.max(0, Math.round(this.elapsed));

                    if (!this.trial && window.kegelSync) {
                        window.kegelSync.queueSession({
                            exercise_slug: @js($exercise?->slug) || null,
                            duration_seconds: secs,
                            completed_at_iso: new Date().toISOString(),
                            is_extra: false
                        }).then(() => {
                            window.kegelSync.pushUserData().catch(() => {});
                        });
                    }

                    this.done = true;

                    $wire.complete(secs).catch(err => {
                        this.loadOfflineResults(secs);
                    });
                },
                loadOfflineResults(secs) {
                    if (window.kegelSync) {
                        Promise.all([
                            window.kegelSync.db.get('sync_meta', 'today_progress'),
                            window.kegelSync.db.get('sync_meta', 'user_position'),
                        ]).then(([todayProgress, userPosition]) => {
                            let doneVal = (todayProgress && todayProgress.value ? todayProgress.value.done : 0) + 1;
                            let reqVal = todayProgress && todayProgress.value ? todayProgress.value.required : 3;
                            let monthVal = userPosition && userPosition.value ? userPosition.value.month : 1;
                            let dayVal = userPosition && userPosition.value ? userPosition.value.day : 1;
                            let completedVal = userPosition && userPosition.value ? userPosition.value.completed : 0;
                            let planLengthVal = userPosition && userPosition.value ? userPosition.value.plan_length : 30;

                            window.kegelSync.db.put('sync_meta', {
                                key: 'today_progress',
                                value: { done: doneVal, required: reqVal }
                            });

                            let dayCompleted = doneVal >= reqVal;
                            if (dayCompleted) {
                                completedVal++;
                                window.kegelSync.db.put('sync_meta', {
                                    key: 'user_position',
                                    value: { month: monthVal, day: dayVal + 1, completed: completedVal, plan_length: planLengthVal }
                                });
                            }

                            this.offlineResult = {
                                day_completed: dayCompleted,
                                is_extra: doneVal > reqVal,
                                progress: { done: doneVal, required: reqVal },
                                position: { month: monthVal, day: dayVal, completed: completedVal, plan_length: planLengthVal },
                                days: this.generateOfflineCalendar(dayVal, completedVal, planLengthVal),
                                unlocked: [],
                                next_unlock: null
                            };
                            this.useOfflineResult = true;
                        });
                    } else {
                        this.offlineResult = {
                            day_completed: false,
                            is_extra: false,
                            progress: { done: 1, required: 3 },
                            position: { month: 1, day: 1, completed: 1, plan_length: 30 },
                            days: this.generateOfflineCalendar(1, 1, 30),
                            unlocked: [],
                            next_unlock: null
                        };
                        this.useOfflineResult = true;
                    }
                },
                generateOfflineCalendar(currentDay, completedDays, planLength) {
                    let days = [];
                    let start = Math.max(1, currentDay - 4);
                    for (let d = start; d <= Math.min(planLength, start + 6); d++) {
                        days.push({ n: d, done: d <= completedDays, today: d === currentDay });
                    }
                    return days;
                },
                quit() {
                    this.running = false;
                    clearInterval(this.timer);
                    if (window.kegelPlayerTimer) { clearInterval(window.kegelPlayerTimer); window.kegelPlayerTimer = null; }
                    sessionStorage.removeItem(this._saveKey);
                    this._releaseWakeLock();
                    document.removeEventListener('visibilitychange', this._onVisibility);
                    window.removeEventListener('pagehide', this._onUnload);
                    if (this._backOff) { this._backOff(); this._backOff = null; }
                },
                destroy() {
                    clearInterval(this.timer);
                    if (window.kegelPlayerTimer) { clearInterval(window.kegelPlayerTimer); window.kegelPlayerTimer = null; }
                    this._releaseWakeLock();
                    document.removeEventListener('visibilitychange', this._onVisibility);
                    window.removeEventListener('pagehide', this._onUnload);
                    if (this._backOff) { this._backOff(); this._backOff = null; }
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
                // Keyframed steps carry from/to intensity: the glow travels
                // between those keyframes over the step (eased so the seam never
                // kinks). Legacy steps fall back to the two-phase behaviour:
                // slowly = travel over the phase seconds, otherwise jump to the
                // target and let the transition below carry it there.
                get intensity() {
                    if (this.cur.phase === 'rest') return 0;
                    if (this.cur.from !== undefined && this.cur.to !== undefined) {
                        return this.cur.from + (this.cur.to - this.cur.from) * this.ease(this.phaseProgress);
                    }
                    if (this.cur.full) return 1;
                    if (this.glowMode === 'slowly') return this.ease(this.isContract ? this.phaseProgress : 1 - this.phaseProgress);
                    return this.glowTarget;
                },
                get glowOpacity() { return this.cur.phase === 'rest' ? 0 : 0.08 + this.intensity * 0.92; },
                // 0.58 collapses the 1.7x glow disc until its rim meets the inner
                // circle; 1.0 expands it fully out on contraction.
                get glowScale()   { return 0.58 + this.intensity * 0.42; },
                get glowTransition() {
                    if (this.cur.from !== undefined) {
                        // Keyframed steps: ramps (from != to) are driven frame by
                        // frame, so they only need a tiny linear smoother. Flat
                        // at-once beats glide to their value with an eased
                        // transition (capped to the beat length) so a quick
                        // contract or relax feels smooth, never like a hard cut.
                        if (this.cur.from !== this.cur.to) return 'opacity 0.1s linear, transform 0.1s linear';
                        let g = Math.min(this.glowSpeed, Math.max(0.15, this.cur.seconds * 0.8));
                        return 'opacity ' + g + 's ease-in-out, transform ' + g + 's ease-in-out';
                    }
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
                <template x-if="trial">
                    <a href="{{ $trial && $exercise ? route('exercises.show', $exercise) : route('home') }}"
                       wire:navigate
                       @click="quit()"
                       class="grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Close">
                        <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </a>
                </template>
                <template x-if="!trial">
                    <button @click="paused = true; showQuit = true" class="grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Close">
                        <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </template>
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

                    <div class="relative grid place-items-center rounded-full bg-surface ring-2 ring-white/15 [grid-area:1/1]"
                         style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
                        <svg width="{{ $circleSize }}" height="{{ $circleSize }}" viewBox="0 0 {{ $circleSize }} {{ $circleSize }}" class="absolute -rotate-90">
                            {{-- Prominent solid track + bright progress arc --}}
                            <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="{{ $trackWidth }}"/>
                            <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="#ffffff" stroke-width="{{ $trackWidth }}"
                                    stroke-linecap="round" stroke-dasharray="{{ $circ }}"
                                    x-bind:stroke-dashoffset="{{ $circ }} * (1 - blockPct)"
                                    style="transition: stroke-dashoffset {{ $animationSpeed }}s linear;"/>
                        </svg>
                        <div class="text-center">
                            <p class="text-5xl font-bold tabular-nums" x-text="blockRemaining"></p>
                            <p class="mt-1 font-semibold" x-text="cur.label"></p>
                        </div>
                    </div>
                </div>
            </div>

            {{-- Help (kept in layout during rest so the ring above never shifts) --}}
            <div class="flex justify-center pb-4">
                <button @click="paused = true; showHelp = true"
                        x-bind:class="(trial || cur.phase === 'rest') ? 'invisible' : ''"
                        class="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-muted tap" aria-label="Help">
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 113.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/></svg>
                </button>
            </div>

            {{-- Help bottom sheet --}}
            <template x-teleport="body">
                <div x-show="showHelp" x-cloak class="fixed inset-0 z-50 flex items-end justify-center"
                     @keydown.escape.window="showHelp = false; paused = false">
                    <div x-show="showHelp"
                         x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100"
                         x-transition:leave="transition ease-in duration-150" x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0"
                         @click="showHelp = false; paused = false"
                         class="absolute inset-0 bg-black/70"></div>
                    <div x-show="showHelp"
                         x-transition:enter="transition ease-out duration-300" x-transition:enter-start="translate-y-full" x-transition:enter-end="translate-y-0"
                         x-transition:leave="transition ease-in duration-200" x-transition:leave-start="translate-y-0" x-transition:leave-end="translate-y-full"
                         class="modal-panel relative w-full max-w-[440px] rounded-t-3xl bg-surface border-t border-white/10 px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                        <div class="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20"></div>
                        <div class="mt-2 space-y-3">
                            <button @click="showHelp = false; paused = false"
                                    class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">OK</button>
                            <a x-bind:href="'/exercises/' + cur.slug + '?from=session'"
                               @click="_saveState()"
                               wire:navigate
                               class="grid h-14 w-full place-items-center rounded-2xl bg-surface-2 font-semibold tap">Tutorial</a>
                        </div>
                    </div>
                </div>
            </template>

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
                    {{-- Go BACK (pop the preview off history) so a later native back
                         doesn't return to this try-it-now screen. --}}
                    <button type="button"
                            onclick="history.length > 1 ? history.back() : (window.location.href = '{{ $fromSession ? route('session') : route('exercises.show', $exercise) }}')"
                            class="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-semibold tap">
                        Skip
                        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4l10 8-10 8zM19 5v14"/></svg>
                    </button>
                </div>
            @endif

            {{-- Quit confirmation bottom sheet --}}
            <template x-teleport="body">
                <div x-show="showQuit" x-cloak class="fixed inset-0 z-50 flex items-end justify-center"
                     @keydown.escape.window="showQuit = false; paused = false">
                    <div x-show="showQuit"
                         x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100"
                         x-transition:leave="transition ease-in duration-150" x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0"
                         @click="showQuit = false; paused = false"
                         class="absolute inset-0 bg-black/70"></div>
                    <div x-show="showQuit"
                         x-transition:enter="transition ease-out duration-300" x-transition:enter-start="translate-y-full" x-transition:enter-end="translate-y-0"
                         x-transition:leave="transition ease-in duration-200" x-transition:leave-start="translate-y-0" x-transition:leave-end="translate-y-full"
                         class="modal-panel relative w-full max-w-[440px] rounded-t-3xl bg-surface border-t border-white/10 px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                        <div class="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20"></div>
                        <p class="text-center text-lg font-bold">Leave training?</p>
                        <p class="mt-2 text-center text-sm text-muted">If you leave, this session will not be counted towards your daily progress.</p>
                        <div class="mt-6 space-y-3">
                            <a href="{{ $trial && $exercise ? route('exercises.show', $exercise) : route('home') }}" wire:navigate
                               @click="quit()"
                               class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">
                                Yes, quit training
                            </a>
                            <button @click="showQuit = false; paused = false"
                                    class="grid h-14 w-full place-items-center rounded-2xl bg-surface-2 font-semibold tap">
                                No, go back
                            </button>
                        </div>
                    </div>
                </div>
            </template>
        </div>

        {{-- ================= OFFLINE COMPLETION OVERLAY ================= --}}
        <div x-show="done && useOfflineResult" x-cloak class="flex min-h-[100dvh] flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))] w-full">
            <div class="flex flex-col items-center px-6 pt-[calc(2rem+env(safe-area-inset-top))]">
                <div class="animate-ring-pop relative grid place-items-center" style="width: 208px; height: 208px;">
                    <svg width="208" height="208" viewBox="0 0 208 208" class="-rotate-90">
                        <circle cx="104" cy="104" r="98" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="12"/>
                        <circle cx="104" cy="104" r="98" fill="none" stroke="var(--c-accent)" stroke-width="12"
                                stroke-linecap="round" class="completion-ring"
                                stroke-dasharray="615.75" :stroke-dashoffset="615.75 * (1 - (offlineResult ? Math.min(1, offlineResult.progress.done / offlineResult.progress.required) : 1))"/>
                    </svg>
                    <svg viewBox="0 0 24 24" class="absolute h-24 w-24 text-accent" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 13l4 4L19 7" pathLength="1" class="completion-tick"/>
                    </svg>
                </div>
                <p class="mt-4 text-sm font-semibold text-muted" x-text="(offlineResult ? offlineResult.progress.done : 0) + '/' + (offlineResult ? offlineResult.progress.required : 3) + ' sessions today'"></p>
            </div>

            <div class="px-6 pt-5 text-center">
                <h1 class="text-2xl font-bold text-white" x-text="offlineResult && offlineResult.day_completed ? 'Training Day Complete!' : (offlineResult && offlineResult.is_extra ? 'Extra Session Done!' : 'Session Complete')"></h1>
            </div>

            {{-- Month calendar strip --}}
            <div class="mx-4 mt-4 rounded-2xl bg-surface p-4" x-show="offlineResult">
                <div class="flex items-center justify-between">
                    <span class="font-semibold text-white" x-text="'Month ' + (offlineResult ? offlineResult.position.month : 1)"></span>
                    <span class="text-muted" x-text="(offlineResult ? offlineResult.position.completed : 0) + '/' + (offlineResult ? offlineResult.position.plan_length : 30)"></span>
                </div>
                <div class="mt-3 flex justify-between gap-1.5">
                    <template x-for="day in (offlineResult ? offlineResult.days : [])" :key="day.n">
                        <div class="flex flex-1 flex-col items-center gap-1">
                            <template x-if="day.today && day.done">
                                <div class="day-cell-pop grid aspect-square w-full place-items-center rounded-lg border-2 border-accent">
                                    <svg viewBox="0 0 24 24" class="h-4 w-4 text-[color:var(--c-on-accent)]" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M5 13l4 4L19 7" pathLength="1" class="day-tick"/>
                                    </svg>
                                </div>
                            </template>
                            <template x-if="day.done && !day.today">
                                <div class="grid aspect-square w-full place-items-center rounded-lg bg-accent text-[color:var(--c-on-accent)]">
                                    <svg viewBox="0 0 24 24" class="h-4 w-4 text-white" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
                                </div>
                            </template>
                            <template x-if="day.today && !day.done">
                                <div class="grid aspect-square w-full place-items-center rounded-lg border-2 border-accent"></div>
                            </template>
                            <template x-if="!day.today && !day.done">
                                <div class="grid aspect-square w-full place-items-center rounded-lg border border-white/15"></div>
                            </template>
                            <span class="text-[10px]" :class="day.today ? 'font-bold text-content' : 'text-muted'" x-text="day.n"></span>
                        </div>
                    </template>
                </div>
            </div>

            <div class="flex-1"></div>
            <div class="px-6">
                <a href="{{ route('home') }}" wire:navigate class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">Continue</a>
            </div>
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
                    @if ($fromSession)
                        <button type="button" onclick="history.length > 1 ? history.back() : (window.location.href = '{{ route('session') }}')" class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">Back to workout</button>
                    @else
                        <a href="{{ route('workout', ['exercise' => $exercise, 'trial' => 1]) }}" wire:navigate class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">Try again</a>
                        <button type="button" onclick="history.length > 1 ? history.back() : (window.location.href = '{{ route('exercises.show', $exercise) }}')" class="grid h-14 w-full place-items-center rounded-2xl bg-surface-2 font-semibold text-content tap">Back to exercise</button>
                    @endif
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
                                    style="--ring-start: {{ $ccirc }}; --ring-end: {{ $coff }};"/>
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

                {{-- Difficulty feedback --}}
                @if ($askFeedback)
                    <div class="mx-4 mt-4 rounded-2xl bg-surface p-4 text-center">
                        <p class="font-semibold">How was that?</p>
                        <div class="mt-3 flex gap-2" wire:loading.class="opacity-60 pointer-events-none" wire:target="submitFeedback">
                            <button wire:click="submitFeedback('easy')" wire:loading.attr="disabled" wire:target="submitFeedback" class="flex-1 rounded-xl bg-surface-2 py-3 text-sm font-semibold tap">Too easy</button>
                            <button wire:click="submitFeedback('fine')" wire:loading.attr="disabled" wire:target="submitFeedback" class="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold tap">Just right</button>
                            <button wire:click="submitFeedback('hard')" wire:loading.attr="disabled" wire:target="submitFeedback" class="flex-1 rounded-xl bg-surface-2 py-3 text-sm font-semibold tap">Too hard</button>
                        </div>
                    </div>
                @endif

                @if ($feedbackMessage)
                    <div class="mx-4 mt-4 rounded-2xl bg-accent/10 px-4 py-3 text-center text-sm font-medium text-accent-soft">
                        {{ $feedbackMessage }}
                    </div>
                @endif

                {{-- Month calendar strip --}}
                <div class="mx-4 mt-4 rounded-2xl bg-surface p-4">
                    <div class="flex items-center justify-between">
                        <span class="font-semibold">Month {{ $pos['month'] }}</span>
                        <span class="text-muted">{{ $pos['completed'] }}/{{ $pos['plan_length'] }}</span>
                    </div>
                    <div class="mt-3 flex justify-between gap-1.5">
                        @foreach ($result['days'] as $day)
                            <div class="flex flex-1 flex-col items-center gap-1">
                                @if ($day['today'] && $day['done'])
                                    <div class="day-cell-pop grid aspect-square w-full place-items-center rounded-lg border-2 border-accent">
                                        <svg viewBox="0 0 24 24" class="h-4 w-4 text-[color:var(--c-on-accent)]" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M5 13l4 4L19 7" pathLength="1" class="day-tick"/>
                                        </svg>
                                    </div>
                                @elseif ($day['done'])
                                    <div class="grid aspect-square w-full place-items-center rounded-lg bg-accent text-[color:var(--c-on-accent)]">
                                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
                                    </div>
                                @elseif ($day['today'])
                                    <div class="grid aspect-square w-full place-items-center rounded-lg border-2 border-accent"></div>
                                @else
                                    <div class="grid aspect-square w-full place-items-center rounded-lg border border-white/15"></div>
                                @endif
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
