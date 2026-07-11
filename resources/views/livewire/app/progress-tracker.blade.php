@php
    $bestInt = $best ? (int) floor($best) : 0;
    $lastSecs = $last ? (int) floor($last->seconds) : 0;
    $lastLabel = $last ? ($last->measured_at->isToday() ? 'Today' : $last->measured_at->diffForHumans()) : '-';
    $barCount = max(1, count($bars));
    $scale = max(1, $maxScale);
@endphp
{{-- Progress chart is rendered ENTIRELY server-side from the local database.
     On the device that DB is the synced source of truth, so there is no need
     for a parallel Alpine/IndexedDB recalculation — and removing it kills the
     bug where toggling the range made bars vanish (three competing writers to
     the same `bars` array racing on each mode toggle). Each range button is a
     Livewire $set that re-renders these bars deterministically. --}}
<div class="min-h-[100dvh] pb-[calc(11rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]"
     x-data="{}" @progress-reset.window="window.location.reload()">
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
                <p class="font-bold text-white">{{ $bestInt > 0 ? $bestInt.' sec' : '-' }}</p>
            </div>
        </div>
        <div class="text-right">
            <p class="text-xs text-muted">last measurement</p>
            <p class="font-bold text-white">{{ $lastSecs > 0 ? $lastSecs.' sec ('.$lastLabel.')' : '-' }}</p>
        </div>
    </div>

    {{-- Chart --}}
    <section class="mx-4 mt-5 rounded-2xl border border-white/5 bg-surface p-4" wire:key="chart-{{ $mode }}">
        <p class="font-semibold text-white">{{ $rangeLabel }}</p>
        <p class="text-sm text-muted">top result: {{ $bestInt.' sec' }}</p>

        <div class="relative mt-5 h-44">
            {{-- gridlines --}}
            @foreach ([$maxScale, (int) floor($maxScale * 2 / 3), (int) floor($maxScale / 3), 0] as $gVal)
                <div class="absolute inset-x-0 flex items-center" style="top: {{ (1 - $gVal / $scale) * 100 }}%">
                    <div class="h-px flex-1 bg-white/5"></div>
                    <span class="ml-2 w-12 text-right text-[10px] text-muted">{{ $gVal }} sec</span>
                </div>
            @endforeach

            {{-- bars: a CSS grid of N equal (minmax 0,1fr) columns so spacing is
                 identical for every count and never depends on label width. --}}
            <div class="absolute inset-0 grid items-end gap-2 pr-14"
                 style="grid-template-columns: repeat({{ $barCount }}, minmax(0, 1fr))">
                @foreach ($bars as $bar)
                    <div class="flex h-full min-w-0 flex-col items-center justify-end">
                        <div class="w-7 max-w-full rounded-md bg-accent transition-[height] duration-300"
                             style="height: {{ $bar['value'] > 0 ? min(100, max(4, $bar['value'] / $scale * 100)) : 0 }}%"></div>
                    </div>
                @endforeach
            </div>
        </div>

        {{-- x labels: same grid template as the bars so they stay aligned. --}}
        <div class="mt-2 grid gap-2 pr-14"
             style="grid-template-columns: repeat({{ $barCount }}, minmax(0, 1fr))">
            @foreach ($bars as $bar)
                <span class="min-w-0 truncate text-center text-[10px] text-muted">{{ $bar['label'] }}</span>
            @endforeach
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
                    @foreach ([380, 300, 230] as $ring)
                        <div class="absolute rounded-full border border-white/5" style="width: {{ $ring }}px; height: {{ $ring }}px;"></div>
                    @endforeach

                    {{-- Press & hold — captures a result on release (no auto-save) --}}
                    <button x-show="!done"
                        @pointerdown="begin($event)" @pointerup="end()" @pointerleave="end()"
                        @contextmenu.prevent
                        class="relative grid h-52 w-52 select-none place-items-center rounded-full bg-accent text-center text-xl font-bold text-[color:var(--c-on-accent)] shadow-[0_10px_40px_color-mix(in_srgb,var(--c-accent)_45%,transparent)] transition-transform"
                        x-bind:style="holding ? 'transform: scale(1.08)' : 'transform: scale(1)'">
                        <span x-show="!holding">Press<br>&amp; Hold</span>
                        <span x-show="holding" x-text="Math.floor(elapsed) + 's'" class="text-3xl"></span>
                    </button>

                    {{-- Result of the hold (shown after release) --}}
                    <div x-show="done" x-cloak class="grid h-52 w-52 place-items-center rounded-full bg-surface text-center">
                        <div>
                            <p class="text-5xl font-bold tabular-nums" x-text="Math.floor(result) + 's'"></p>
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
