<div class="min-h-[100dvh] pb-[calc(11rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]"
     x-data="{
        best: @js($best ? (int) floor($best) : 0),
        lastSecs: @js($last ? (int) floor($last->seconds) : 0),
        lastLabel: @js($last ? ($last->measured_at->isToday() ? 'Today' : $last->measured_at->diffForHumans()) : '-'),
        bars: @js($bars),
        maxScale: @js($maxScale),
        mode: @entangle('mode'),
        localList: [],
        async init() {
            if (window.kegelSync) {
                try {
                    const list = await window.kegelSync.db.getAll('measurements');
                    if (list && list.length) {
                        this.localList = list;
                        this.recalculate();
                    }
                } catch(e) {}
            }
        },
        recalculate() {
            if (!this.localList || !this.localList.length) return;
            const secs = this.localList.map(m => m.seconds);
            this.best = Math.floor(Math.max(...secs));
            
            const sorted = [...this.localList].sort((a, b) => new Date(b.measured_at_iso || b.measured_at) - new Date(a.measured_at_iso || a.measured_at));
            this.lastSecs = Math.floor(sorted[0].seconds);
            this.lastLabel = 'Today';
            
            this.calculateOfflineBars(this.localList);
        },
        calculateOfflineBars(list) {
            let count = this.mode === 'days' ? 7 : 6;
            let unit = this.mode === 'days' ? 'day' : (this.mode === 'months' ? 'month' : 'week');
            
            let bars = [];
            let maxVal = 0;
            
            for (let i = count - 1; i >= 0; i--) {
                let start = new Date();
                if (unit === 'day') {
                    start.setDate(start.getDate() - i);
                    start.setHours(0,0,0,0);
                } else if (unit === 'month') {
                    start.setMonth(start.getMonth() - i);
                    start.setDate(1);
                    start.setHours(0,0,0,0);
                } else {
                    start.setDate(start.getDate() - i * 7);
                    let day = start.getDay();
                    let diff = start.getDate() - day + (day === 0 ? -6 : 1);
                    start.setDate(diff);
                    start.setHours(0,0,0,0);
                }
                
                let end = new Date(start);
                if (unit === 'day') {
                    end.setHours(23,59,59,999);
                } else if (unit === 'month') {
                    end.setMonth(end.getMonth() + 1);
                    end.setDate(0);
                    end.setHours(23,59,59,999);
                } else {
                    end.setDate(end.getDate() + 6);
                    end.setHours(23,59,59,999);
                }
                
                let val = 0;
                for (const m of list) {
                    let d = new Date(m.measured_at_iso || m.measured_at);
                    if (d >= start && d <= end) {
                        if (m.seconds > val) val = m.seconds;
                    }
                }
                
                // Match the server label format exactly (translatedFormat j M
                // gives e.g. 5 Nov; month M gives Nov). Building it manually keeps
                // the day-then-month order so the labels do not reflow when this
                // client recalculation replaces the server-rendered bars.
                let label = '';
                if (unit === 'month') {
                    label = start.toLocaleDateString(undefined, { month: 'short' });
                } else {
                    label = start.getDate() + ' ' + start.toLocaleDateString(undefined, { month: 'short' });
                }
                
                bars.push({ label, value: val });
                if (val > maxVal) maxVal = val;
            }
            
            this.bars = bars;
            this.maxScale = Math.max(6, Math.ceil(maxVal / 2) * 2);
        }
     }"
     x-effect="recalculate()"
     @progress-reset.window="best = 0; lastSecs = 0; lastLabel = '-'; bars = bars.map(b => ({...b, value: 0})); maxScale = 6; localList = [];">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('home') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold text-white">Progress Tracker</h1>
    </header>

    {{-- Summary --}}
    <div class="flex items-start justify-between px-6 pt-3">
        <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-xl bg-surface text-accent">
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M6 4h12v3a4 4 0 01-4 4h-4A4 4 0 016 7zM9 13h6v3H9zM8 19h8v2H8z"/></svg>
            </span>
            <div>
                <p class="text-xs text-muted">best result</p>
                <p class="font-bold text-white" x-text="best > 0 ? best + ' sec' : '-'"></p>
            </div>
        </div>
        <div class="text-right">
            <p class="text-xs text-muted">last measurement</p>
            <p class="font-bold text-white" x-text="lastSecs > 0 ? lastSecs + ' sec (' + lastLabel + ')' : '-'"></p>
        </div>
    </div>

    {{-- Re-seed Alpine from the freshly server-rendered bars whenever the range
         changes. The wire:key forces this element to re-init on each mode toggle,
         so the chart updates even when there is no offline (IndexedDB) data yet.
         When offline data IS present, x-effect/recalculate() overrides it. --}}
    <div wire:key="bars-{{ $mode }}" x-init="if (!localList || !localList.length) { bars = @js($bars); maxScale = @js($maxScale); }" hidden></div>

    {{-- Chart --}}
    <section class="mx-4 mt-5 rounded-2xl border border-white/5 bg-surface/40 p-4">
        <p class="font-semibold text-white">{{ $rangeLabel }}</p>
        <p class="text-sm text-muted">top result: <span x-text="best ? best + ' sec' : '0 sec'"></span></p>

        <div class="relative mt-5 h-44">
            {{-- gridlines --}}
            <template x-for="gVal in [maxScale, Math.round(maxScale * 2/3), Math.round(maxScale * 1/3), 0]" :key="gVal">
                <div class="absolute inset-x-0 flex items-center" :style="'top: ' + ((1 - gVal / maxScale) * 100) + '%'">
                    <div class="h-px flex-1 bg-white/5"></div>
                    <span class="ml-2 w-12 text-right text-[10px] text-muted" x-text="gVal + ' sec'"></span>
                </div>
            </template>

            {{-- bars: a CSS grid of N equal (minmax 0,1fr) columns so the
                 spacing is identical for every count and never depends on label
                 width or flex-distribution timing when the mode changes. --}}
            <div class="absolute inset-0 grid items-end gap-2 pr-14"
                 :style="'grid-template-columns: repeat(' + (bars ? bars.length : 1) + ', minmax(0, 1fr))'">
                <template x-for="(bar, index) in bars" :key="index">
                    <div class="flex h-full min-w-0 flex-col items-center justify-end">
                        <div class="w-7 max-w-full rounded-md bg-accent transition-[height] duration-300"
                             :style="'height: ' + (bar.value > 0 ? Math.min(100, Math.max(4, bar.value / maxScale * 100)) : 0) + '%'"></div>
                    </div>
                </template>
            </div>
        </div>

        {{-- x labels: same grid template as the bars so they stay aligned. --}}
        <div class="mt-2 grid gap-2 pr-14"
             :style="'grid-template-columns: repeat(' + (bars ? bars.length : 1) + ', minmax(0, 1fr))'">
            <template x-for="(bar, index) in bars" :key="index">
                <span class="min-w-0 truncate text-center text-[10px] text-muted" x-text="bar.label"></span>
            </template>
        </div>
    </section>

    {{-- Range toggle --}}
    <div class="mx-auto mt-5 flex w-max gap-1 rounded-full bg-surface p-1">
        @foreach (['days' => 'days', 'weeks' => 'weeks', 'months' => 'months'] as $key => $label)
            <button wire:click="$set('mode', '{{ $key }}')"
                    class="rounded-full px-5 py-2 text-sm font-medium tap {{ $mode === $key ? 'bg-surface-2 text-content' : 'text-muted' }}">{{ $label }}</button>
        @endforeach
    </div>

    {{-- CTA (sits just above the tab bar) --}}
    <div class="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-[440px] px-5">
        <button wire:click="startMeasure" class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">Take measurement</button>
    </div>

    <x-bottom-nav active="progress" />

    {{-- Measurement overlay --}}
    @if ($measuring)
        <div class="fixed inset-0 z-50 mx-auto flex max-w-[440px] flex-col bg-bg px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
             x-data="{
                holding: false, done: false, saving: false, start: 0, elapsed: 0, result: 0, timer: null,
                begin(e) { if (this.holding || this.done) return; this.holding = true; this.start = Date.now();
                    this.timer = setInterval(() => this.elapsed = (Date.now() - this.start) / 1000, 80); },
                end() { if (!this.holding) return; this.holding = false; clearInterval(this.timer);
                    this.result = (Date.now() - this.start) / 1000; this.done = true; },
                retake() { this.done = false; this.elapsed = 0; this.result = 0; },
             }">
            <div class="flex items-center">
                <button wire:click="$set('measuring', false)" class="grid h-9 w-9 place-items-center rounded-full text-muted tap">
                    <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
                </button>
                <h2 class="ml-2 text-xl font-bold">Progress Tracker</h2>
            </div>

            <div class="flex flex-1 items-center justify-center">
                <div class="relative grid place-items-center">
                    @foreach ([320, 250, 180] as $ring)
                        <div class="absolute rounded-full border border-white/5" style="width: {{ $ring }}px; height: {{ $ring }}px;"></div>
                    @endforeach

                    {{-- Press & hold — captures a result on release (no auto-save) --}}
                    <button x-show="!done"
                        @pointerdown="begin($event)" @pointerup="end()" @pointerleave="end()"
                        @contextmenu.prevent
                        class="relative grid h-40 w-40 select-none place-items-center rounded-full bg-accent text-center text-lg font-bold text-[color:var(--c-on-accent)] shadow-[0_10px_40px_color-mix(in_srgb,var(--c-accent)_45%,transparent)] transition-transform"
                        x-bind:style="holding ? 'transform: scale(1.12)' : 'transform: scale(1)'">
                        <span x-show="!holding">Press<br>&amp; Hold</span>
                        <span x-show="holding" x-text="Math.round(elapsed) + 's'" class="text-3xl"></span>
                    </button>

                    {{-- Result of the hold (shown after release) --}}
                    <div x-show="done" x-cloak class="grid h-40 w-40 place-items-center rounded-full bg-surface text-center">
                        <div>
                            <p class="text-5xl font-bold tabular-nums" x-text="Math.round(result) + 's'"></p>
                            <p class="mt-1 text-xs text-muted">your hold</p>
                        </div>
                    </div>
                </div>
            </div>

            {{-- Instructions while measuring; result actions once held --}}
            <div x-show="!done" class="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3">
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent-soft">
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 4.3 2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z"/></svg>
                </span>
                <p class="text-sm text-muted">Hold the button and contract the PF muscles for as long as possible.</p>
            </div>
            <div x-show="done" x-cloak class="space-y-3">
                <button x-bind:disabled="saving" @click="
                    if (saving) return;
                    saving = true;
                    if (window.kegelSync) {
                        window.kegelSync.queueMeasurement({ seconds: result }).then(() => {
                            window.kegelSync.pushUserData().catch(() => {});
                        });
                    }
                    $wire.record(result).catch(() => {
                        window.location.href = '{{ route('progress') }}';
                    });
                " class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-[color:var(--c-on-accent)] tap disabled:opacity-70">
                    <span x-show="!saving">Continue</span>
                    <span x-show="saving">Saving...</span>
                </button>
                <button @click="retake()" class="grid h-12 w-full place-items-center rounded-2xl bg-surface font-semibold tap">Try again</button>
            </div>
        </div>
    @endif
</div>
