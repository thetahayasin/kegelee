@php($complete = $today['complete'])
<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]"
     x-data="{
        done: @js((int) ($today['done'] ?? 0)),
        required: @js((int) ($today['required'] ?? 2)),
        month: @js((int) ($position['month'] ?? 1)),
        day: @js((int) ($position['day'] ?? 1)),
        complete: @js($complete),
        // 288deg arc (0.8 of the circle), matching the gauge elsewhere in the app.
        get arc() { return 2 * Math.PI * 58 * 0.8; },
        get pct() { return Math.min(1, Math.max(0, this.done / Math.max(1, this.required))); },
        init() {
            // This page renders server-side from the (synced) local DB, so these
            // values are authoritative and always fresh. We only kick a background
            // sync; runServerSync refreshes this component if the server changed.
            if (window.kegelSync) window.kegelSync.fullSync();
        }
     }">
    {{-- Header --}}
    <header class="flex items-center justify-between px-4 py-3">
        <div class="pl-1">
            <p class="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-dim">Kegelee</p>
            <h1 class="text-[1.75rem] font-extrabold leading-none tracking-[-0.03em]">Training</h1>
        </div>
        <a href="{{ route('knowledge.index') }}" wire:navigate
           class="grid h-11 w-11 place-items-center rounded-full bg-surface text-muted tap"
           aria-label="Knowledge">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 11.5v4.5" stroke-linecap="round"/>
                <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>
            </svg>
        </a>
    </header>

    {{-- ── Hero ────────────────────────────────────────────────────────────
         The ring is the screen's single focal point: it is the one thing a
         returning user opens the app to check. Everything else in the card
         is arranged beneath it in descending importance. --}}
    <section class="mx-4 mt-2 overflow-hidden rounded-[1.75rem] bg-surface">
        <div class="relative px-5 pb-5 pt-7">
            @if ($heroImage)
                {{-- Texture only — sits behind the ring, never competes with it. --}}
                <img src="{{ $heroImage }}" alt="" aria-hidden="true"
                     class="pointer-events-none absolute -right-8 -top-6 h-40 w-40 object-contain opacity-[0.07]">
            @endif

            <div class="relative mx-auto grid h-[132px] w-[132px] place-items-center"
                 role="img"
                 :aria-label="complete
                    ? 'Today complete — ' + done + ' of ' + required + ' sessions done'
                    : done + ' of ' + required + ' sessions done today'">
                <svg viewBox="0 0 132 132" class="h-[132px] w-[132px] -rotate-[126deg]" aria-hidden="true">
                    <circle cx="66" cy="66" r="58" fill="none"
                            stroke="rgba(255,255,255,0.07)" stroke-width="9"
                            :stroke-dasharray="arc + ' 999'" stroke-linecap="round"/>
                    <circle cx="66" cy="66" r="58" fill="none"
                            stroke="var(--c-accent)" stroke-width="9"
                            :stroke-dasharray="arc + ' 999'"
                            :stroke-dashoffset="arc * (1 - pct)"
                            stroke-linecap="round"
                            style="transition: stroke-dashoffset .7s cubic-bezier(.22,1,.36,1);"/>
                </svg>
                <div class="absolute inset-0 grid place-items-center">
                    <p class="stat text-[2.25rem] font-extrabold leading-none tracking-[-0.04em]">
                        <span x-text="done ?? 0"></span><span class="text-dim">/</span><span class="text-muted" x-text="required ?? 0"></span>
                    </p>
                    <p class="mt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-dim">Sessions</p>
                </div>
            </div>

            <div class="mt-5 text-center">
                <p class="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-dim">
                    Month <span class="stat" x-text="month"></span>
                    <span class="px-1 text-white/20" aria-hidden="true">/</span>
                    Day <span class="stat" x-text="day"></span>
                </p>
                <p class="mt-1.5 text-xl font-bold tracking-[-0.025em]"
                   x-text="complete ? 'Today is done' : 'Ready when you are'"></p>
            </div>
        </div>

        {{-- Action strip: visually seated on the card, one step forward. --}}
        <div class="border-t border-line bg-surface-2 px-5 py-4">
            <div class="mb-3 flex items-center justify-between gap-3">
                <p class="flex items-center gap-1.5 text-sm text-muted">
                    <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>
                    {{ $sessionLength }}
                </p>
                <span x-show="complete" x-cloak
                      class="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-accent">
                    <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3.5" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
                    Complete
                </span>
            </div>
            <a href="{{ route('session') }}" wire:navigate
               class="grid h-[3.25rem] w-full place-items-center rounded-2xl bg-accent text-[0.9375rem] font-bold tracking-[-0.01em] tap">
                <span x-text="complete ? 'Train again' : 'Start workout'"></span>
            </a>
            <p class="mt-2.5 text-center text-xs text-dim">
                <template x-if="complete"><span>Extra sessions are optional</span></template>
                <template x-if="!complete">
                    <span x-text="required + ' session' + (required > 1 ? 's' : '') + ' completes today'"></span>
                </template>
            </p>
        </div>
    </section>

    {{-- ── Exercises ───────────────────────────────────────────────────────
         Was a horizontal rail, which hid most of the set off-screen and gave
         no sense of how much there is to unlock. A grid shows the whole
         progression at a glance. --}}
    <div class="flex items-end justify-between px-5 pb-3 pt-8">
        <h2 class="section-head">Exercises</h2>
        <a href="{{ route('exercises.index') }}" wire:navigate class="-mr-1 flex items-center gap-0.5 rounded-lg px-1 py-1 text-sm font-medium text-muted tap">
            See all
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </a>
    </div>

    @if ($exercises->isNotEmpty())
        <div class="grid grid-cols-2 gap-3 px-4">
            @foreach ($exercises as $row)
                @php($ex = $row['model'])
                @if ($row['unlocked'])
                    <a href="{{ route('exercises.show', $ex) }}" wire:navigate
                       class="group relative flex flex-col rounded-2xl bg-surface p-3.5 tap">
                @else
                    <div class="is-locked relative flex flex-col rounded-2xl bg-surface p-3.5"
                         aria-label="{{ $ex->name }} — unlocks in {{ $row['days_left'] }} days">
                @endif
                    <x-equipment-icon :exercise="$ex" :size="72"
                        class="mx-auto mb-3 w-full {{ $row['unlocked'] ? '' : 'opacity-45 grayscale' }}" />
                    <p class="truncate text-[0.9375rem] font-bold leading-tight tracking-[-0.015em] {{ $row['unlocked'] ? '' : 'text-muted' }}">{{ $ex->name }}</p>
                    @if ($row['unlocked'])
                        <p class="mt-0.5 text-xs font-medium text-accent">Available</p>
                    @else
                        <p class="mt-0.5 flex items-center gap-1 text-xs font-medium text-dim">
                            <svg viewBox="0 0 24 24" class="h-3 w-3 shrink-0" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
                                <rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>
                            </svg>
                            <span class="stat">{{ $row['days_left'] }}</span> days
                        </p>
                    @endif
                @if ($row['unlocked'])
                    </a>
                @else
                    </div>
                @endif
            @endforeach
        </div>
    @endif

    {{-- ── Progress ────────────────────────────────────────────────────── --}}
    <a href="{{ route('progress') }}" wire:navigate
       class="mx-4 mt-3 flex items-center gap-4 rounded-2xl bg-surface px-4 py-4 tap">
        <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7"/></svg>
        </span>
        <div class="min-w-0 flex-1">
            <p class="text-[0.9375rem] font-bold tracking-[-0.015em]">Progress Tracker</p>
            <p class="text-sm text-muted">
                @if ($bestMeasurement)
                    Best hold <span class="stat font-semibold text-content">{{ (int) floor($bestMeasurement) }}s</span>
                @else
                    Measure daily to track progress
                @endif
            </p>
        </div>
        <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-dim" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    </a>

    <x-bottom-nav active="home" />
</div>
