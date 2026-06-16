<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('home') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold">Progress Tracker</h1>
    </header>

    {{-- Summary --}}
    <div class="flex items-start justify-between px-6 pt-3">
        <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-xl bg-surface text-yellow-400">
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M6 4h12v3a4 4 0 01-4 4h-4A4 4 0 016 7zM9 13h6v3H9zM8 19h8v2H8z"/></svg>
            </span>
            <div>
                <p class="text-xs text-muted">best result</p>
                <p class="font-bold">{{ $best ? round($best).' sec' : '-' }}</p>
            </div>
        </div>
        <div class="text-right">
            <p class="text-xs text-muted">last measurement</p>
            <p class="font-bold">{{ $last ? $last->measured_at->isToday() ? 'Today' : $last->measured_at->diffForHumans() : '-' }}</p>
        </div>
    </div>

    {{-- Chart --}}
    <section class="mx-4 mt-5 rounded-2xl border border-white/5 bg-surface/40 p-4">
        <p class="font-semibold">{{ $rangeLabel }}</p>
        <p class="text-sm text-muted">top result: {{ $best ? round($best).' sec' : '0 sec' }}</p>

        <div class="relative mt-5 h-44">
            {{-- gridlines --}}
            @for ($g = $maxScale; $g >= 0; $g -= max(2, $maxScale / 3))
                @php($top = (1 - $g / $maxScale) * 100)
                <div class="absolute inset-x-0 flex items-center" style="top: {{ $top }}%">
                    <div class="h-px flex-1 bg-white/5"></div>
                    <span class="ml-2 w-12 text-right text-[10px] text-muted">{{ (int) $g }} sec</span>
                </div>
            @endfor

            {{-- bars --}}
            <div class="absolute inset-0 flex items-end justify-between gap-2 pr-14">
                @foreach ($bars as $bar)
                    <div class="flex h-full flex-1 flex-col items-center justify-end">
                        <div class="w-7 rounded-md bg-accent transition-all"
                             style="height: {{ $bar['value'] > 0 ? max(4, $bar['value'] / $maxScale * 100) : 0 }}%"></div>
                    </div>
                @endforeach
            </div>
        </div>

        {{-- x labels --}}
        <div class="mt-2 flex justify-between gap-2 pr-14">
            @foreach ($bars as $bar)
                <span class="flex-1 text-center text-[10px] text-muted">{{ $bar['label'] }}</span>
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

    {{-- CTA --}}
    <div class="fixed inset-x-0 bottom-0 mx-auto max-w-[440px] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
        <button wire:click="startMeasure" class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">Take measurement</button>
    </div>

    {{-- Measurement overlay --}}
    @if ($measuring)
        <div class="fixed inset-0 z-50 mx-auto flex max-w-[440px] flex-col bg-bg px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
             x-data="{
                holding: false, start: 0, elapsed: 0, timer: null,
                begin(e) { if (this.holding) return; this.holding = true; this.start = Date.now();
                    this.timer = setInterval(() => this.elapsed = (Date.now() - this.start) / 1000, 80); },
                end() { if (!this.holding) return; this.holding = false; clearInterval(this.timer);
                    let s = (Date.now() - this.start) / 1000; $wire.record(s); },
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
                    <button
                        @pointerdown="begin($event)" @pointerup="end()" @pointerleave="end()"
                        @contextmenu.prevent
                        class="relative grid h-40 w-40 select-none place-items-center rounded-full bg-accent text-center text-lg font-bold text-white shadow-[0_10px_40px_rgba(232,32,42,0.45)] transition-transform"
                        x-bind:style="holding ? 'transform: scale(1.12)' : 'transform: scale(1)'">
                        <span x-show="!holding">Press<br>&amp; Hold</span>
                        <span x-show="holding" x-text="Math.round(elapsed) + 's'" class="text-3xl"></span>
                    </button>
                </div>
            </div>

            <div class="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3">
                <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent-soft">
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 4.3 2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z"/></svg>
                </span>
                <p class="text-sm text-muted">Hold the red button and contract the PF muscles for as long as possible.</p>
            </div>
        </div>
    @endif
</div>
