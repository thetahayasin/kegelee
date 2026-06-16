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
                showHelp: false,
                init() {
                    if (!this.steps.length) { this.finish(); return; }
                    this.remaining = this.steps[0].seconds;
                    this.timer = setInterval(() => {
                        if (this.paused || !this.running) return;
                        this.remaining -= 0.1; this.elapsed += 0.1;
                        if (this.remaining <= 0.0001) this.advance();
                    }, 100);
                },
                advance() {
                    if (this.i >= this.steps.length - 1) { this.finish(); return; }
                    this.i++;
                    this.remaining = this.steps[this.i].seconds;
                    if (this.haptics && window.kegel) window.kegel.haptic(this.cur.phase === 'contract' ? 30 : 12);
                },
                finish() { this.running = false; clearInterval(this.timer); $wire.complete(Math.max(0, Math.round(this.elapsed))); },
                destroy() { clearInterval(this.timer); },
                get cur() { return this.steps[this.i] || {phase:'relax',label:'',seconds:1,exercise:''}; },
                get isContract() { return this.cur.phase === 'contract'; },
                get stepPct() { let s = this.cur.seconds || 1; return Math.min(1, Math.max(0, (s - this.remaining) / s)); },
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
                get totalRemaining() { let rem = this.remaining; for (let k = this.i + 1; k < this.steps.length; k++) rem += this.steps[k].seconds; return Math.ceil(rem); },
            }"
            x-init="init()"
            class="flex min-h-[100dvh] flex-col px-6 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
            {{-- Top row --}}
            <div class="flex items-center justify-between">
                <a href="{{ route('home') }}" wire:navigate class="grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Close">
                    <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </a>
                <p class="text-sm text-muted" x-text="totalRemaining + ' sec left'"></p>
                <span class="h-9 w-9"></span>
            </div>

            {{-- Ring --}}
            <div class="flex flex-1 items-center justify-center">
                <div class="relative grid place-items-center" style="width: {{ $circleSize + 120 }}px; height: {{ $circleSize + 120 }}px;">
                    {{-- Red contract glow (stacked in the same grid cell so it stays centered) --}}
                    @if ($glowEnabled)
                        <div class="contract-glow rounded-full [grid-area:1/1]"
                             style="width: {{ round($circleSize * 1.7) }}px; height: {{ round($circleSize * 1.7) }}px;"
                             x-bind:style="{ opacity: isContract ? 1 : 0, transform: isContract ? 'scale(1)' : 'scale(0.8)' }"></div>
                    @endif

                    <div class="relative grid place-items-center rounded-full bg-surface/80 ring-2 ring-white/15 [grid-area:1/1]"
                         style="width: {{ $circleSize }}px; height: {{ $circleSize }}px;">
                        <svg width="{{ $circleSize }}" height="{{ $circleSize }}" viewBox="0 0 {{ $circleSize }} {{ $circleSize }}" class="absolute -rotate-90">
                            {{-- Prominent solid track + bright progress arc --}}
                            <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="{{ $trackWidth }}"/>
                            <circle cx="{{ $circleSize / 2 }}" cy="{{ $circleSize / 2 }}" r="{{ $r }}" fill="none" stroke="#ffffff" stroke-width="{{ $trackWidth }}"
                                    stroke-linecap="round" stroke-dasharray="{{ $circ }}"
                                    x-bind:stroke-dashoffset="{{ $circ }} * (1 - stepPct)"
                                    style="transition: stroke-dashoffset 0.12s linear; filter: drop-shadow(0 0 3px rgba(255,255,255,0.5));"/>
                        </svg>
                        <div class="text-center">
                            <p class="text-5xl font-bold tabular-nums" x-text="blockRemaining"></p>
                            <p class="mt-1 font-semibold" x-text="cur.label"></p>
                        </div>
                    </div>
                </div>
            </div>

            {{-- Help --}}
            <div class="flex justify-center pb-4">
                <button @click="showHelp = !showHelp; paused = showHelp" class="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-muted tap" aria-label="Help">
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 113.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/></svg>
                </button>
            </div>
            <div x-show="showHelp" x-transition class="mb-3 rounded-2xl bg-surface px-4 py-3 text-sm text-muted">
                Squeeze your pelvic floor muscles when the circle says <span class="text-content font-medium">Contract &amp; hold</span> and the glow turns red. Let go fully on <span class="text-content font-medium">Relax</span>.
            </div>

            {{-- Current exercise --}}
            <p class="mb-3 text-center text-lg font-semibold" x-text="cur.phase === 'rest' ? 'Get ready' : cur.exercise"></p>

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
        </div>
    @else
        {{-- ================= COMPLETION ================= --}}
        @php($pos = $result['position'])
        <div class="flex min-h-[100dvh] flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {{-- Night hero --}}
            <div class="relative h-72 overflow-hidden rounded-b-3xl"
                 style="background: linear-gradient(180deg, #1b2a4a 0%, #16203a 45%, var(--c-bg) 100%);">
                <div class="absolute right-10 top-10 h-16 w-16 rounded-full bg-[radial-gradient(circle,#fff,rgba(255,255,255,0.35))] shadow-[0_0_40px_rgba(255,255,255,0.4)]"></div>
                <svg viewBox="0 0 440 180" class="absolute bottom-0 w-full" preserveAspectRatio="none">
                    <path d="M0 180 L90 70 L150 120 L220 40 L300 120 L360 80 L440 150 L440 180 Z" fill="#0e1626"/>
                    <circle cx="220" cy="40" r="4" fill="#cdd6e6"/>
                </svg>
                <div class="absolute inset-x-0 bottom-5 flex flex-col items-center">
                    <x-gauge :value="$result['progress']['done']" :max="$result['progress']['required']" :size="72">
                        <span class="text-sm font-bold">{{ $result['progress']['done'] }}/{{ $result['progress']['required'] }}</span>
                    </x-gauge>
                </div>
            </div>

            <div class="px-6 pt-5">
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
                                {{ $day['done'] ? 'bg-success text-black' : ($day['today'] ? 'border-2 border-white' : 'border border-white/15') }}">
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
                    <p class="font-semibold text-success">Unlocked: {{ implode(', ', $result['unlocked']) }} 🎉</p>
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
</div>
