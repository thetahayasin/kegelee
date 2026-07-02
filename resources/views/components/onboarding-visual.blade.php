@props(['index'])

{{--
    Onboarding slide visuals. Each scene is a bold solid icon with one
    signature animation:
      0  Heart that steadily fills with strength (natural, lasting gains)
      1  Solid stopwatch with a sweeping hand (only minutes a day)
      2  Stair-step bars growing into a star (visible progress)
      3  Solid bell ringing with sound waves (build the habit)
--}}
<div class="onboarding-visual-container relative flex h-64 w-64 select-none items-center justify-center">
    <style>
        @keyframes ob-badge-breathe {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 color-mix(in srgb, var(--c-accent) 25%, transparent); }
            50% { transform: scale(1.03); box-shadow: 0 0 45px 0 color-mix(in srgb, var(--c-accent) 30%, transparent); }
        }
        @keyframes ob-ring-out {
            0% { transform: scale(0.7); opacity: 0.6; }
            100% { transform: scale(1.35); opacity: 0; }
        }
        /* Scene 0: the heart fills from the bottom and holds - gains that stay. */
        @keyframes ob-heart-fill {
            0% { clip-path: inset(92% 0 0 0); }
            55% { clip-path: inset(12% 0 0 0); }
            88% { clip-path: inset(12% 0 0 0); }
            100% { clip-path: inset(92% 0 0 0); }
        }
        @keyframes ob-heart-beat {
            0%, 40%, 100% { transform: scale(1); }
            48% { transform: scale(1.09); }
            56% { transform: scale(1); }
            64% { transform: scale(1.06); }
        }
        @keyframes ob-twinkle {
            0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
            50% { opacity: 1; transform: scale(1) rotate(90deg); }
        }
        /* Scene 1: one smooth sweep of the stopwatch hand per lap. */
        @keyframes ob-hand-sweep {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes ob-dial-sweep {
            0% { stroke-dashoffset: 264; }
            100% { stroke-dashoffset: 0; }
        }
        @keyframes ob-colon-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.25; }
        }
        /* Scene 2: bars climb one after another, then the star pops. */
        @keyframes ob-bar-grow {
            0%, 8% { transform: scaleY(0.12); }
            30% { transform: scaleY(1.06); }
            36% { transform: scaleY(1); }
            86% { transform: scaleY(1); }
            100% { transform: scaleY(0.12); }
        }
        @keyframes ob-star-pop {
            0%, 38% { transform: scale(0) rotate(-30deg); opacity: 0; }
            48% { transform: scale(1.25) rotate(8deg); opacity: 1; }
            54% { transform: scale(1) rotate(0deg); }
            86% { transform: scale(1) rotate(0deg); opacity: 1; }
            100% { transform: scale(0) rotate(20deg); opacity: 0; }
        }
        /* Scene 3: pendulum bell swing with waves rolling outward. */
        @keyframes ob-bell-swing {
            0%, 100% { transform: rotate(0deg); }
            12% { transform: rotate(16deg); }
            28% { transform: rotate(-14deg); }
            44% { transform: rotate(9deg); }
            60% { transform: rotate(-5deg); }
            74% { transform: rotate(2deg); }
        }
        @keyframes ob-wave-left {
            0%, 20% { opacity: 0; transform: translateX(6px) scale(0.8); }
            40% { opacity: 0.9; }
            70%, 100% { opacity: 0; transform: translateX(-6px) scale(1.15); }
        }
        @keyframes ob-wave-right {
            0%, 20% { opacity: 0; transform: translateX(-6px) scale(0.8); }
            40% { opacity: 0.9; }
            70%, 100% { opacity: 0; transform: translateX(6px) scale(1.15); }
        }
        @keyframes ob-chip-pulse {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 1; }
        }
    </style>

    @if ($index == 0)
        <!-- Scene 0: Naturally stronger - a heart that fills up and stays full -->
        <div class="relative flex h-56 w-56 items-center justify-center">
            <div class="absolute h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_16%,transparent),transparent_70%)]"></div>
            <div class="absolute h-44 w-44 rounded-full border-2 border-accent/15 animate-[ob-ring-out_3.2s_ease-out_infinite]"></div>
            <div class="absolute h-44 w-44 rounded-full border-2 border-accent/10 animate-[ob-ring-out_3.2s_ease-out_infinite_1.6s]"></div>

            <div class="relative grid h-40 w-40 place-items-center rounded-full border-4 border-accent/60 bg-surface shadow-2xl animate-[ob-badge-breathe_4s_ease-in-out_infinite]">
                <div class="relative h-20 w-20 animate-[ob-heart-beat_2.6s_ease-in-out_infinite]">
                    {{-- Empty heart outline underneath --}}
                    <svg viewBox="0 0 24 24" class="absolute inset-0 h-full w-full text-accent/20" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                    {{-- Solid heart that fills from the bottom and holds --}}
                    <div class="absolute inset-0 animate-[ob-heart-fill_5.5s_ease-in-out_infinite]">
                        <svg viewBox="0 0 24 24" class="h-full w-full text-accent drop-shadow-[0_0_14px_color-mix(in_srgb,var(--c-accent)_60%,transparent)]" fill="currentColor">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </div>
                </div>

                {{-- Sparkles --}}
                <svg viewBox="0 0 24 24" class="absolute right-5 top-6 h-4 w-4 text-accent animate-[ob-twinkle_2.8s_ease-in-out_infinite]" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>
                <svg viewBox="0 0 24 24" class="absolute bottom-8 left-6 h-3 w-3 text-accent animate-[ob-twinkle_2.8s_ease-in-out_infinite_1.4s]" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>
            </div>

            <div class="absolute -bottom-1 flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-2/95 px-3 py-1.5 shadow-lg">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-success" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
                <span class="text-[10px] font-bold uppercase tracking-wider text-white">100% natural</span>
            </div>
        </div>

    @elseif ($index == 1)
        <!-- Scene 1: Only minutes a day - a solid stopwatch with one sweeping hand -->
        <div class="relative flex h-56 w-56 items-center justify-center">
            <div class="absolute h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_16%,transparent),transparent_70%)]"></div>

            {{-- Crown + shoulders --}}
            <div class="absolute top-3 h-3.5 w-8 rounded-t-md bg-accent"></div>
            <div class="absolute top-6 h-2 w-12 rounded-full bg-accent/70"></div>

            <div class="relative mt-4 grid h-40 w-40 place-items-center rounded-full border-4 border-accent/60 bg-surface shadow-2xl animate-[ob-badge-breathe_4s_ease-in-out_infinite]">
                {{-- Tick marks --}}
                <svg viewBox="0 0 100 100" class="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] text-white/20">
                    @for ($t = 0; $t < 12; $t++)
                        <line x1="50" y1="6" x2="50" y2="{{ $t % 3 === 0 ? 13 : 10 }}" stroke="currentColor" stroke-width="{{ $t % 3 === 0 ? 3 : 2 }}" stroke-linecap="round" transform="rotate({{ $t * 30 }} 50 50)"/>
                    @endfor
                </svg>

                {{-- Sweeping progress dial --}}
                <svg viewBox="0 0 100 100" class="absolute inset-0 h-full w-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7"/>
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--c-accent)" stroke-width="7" stroke-linecap="round"
                            stroke-dasharray="264" stroke-dashoffset="264"
                            style="filter: drop-shadow(0 0 6px color-mix(in srgb, var(--c-accent) 60%, transparent));"
                            class="animate-[ob-dial-sweep_3.2s_linear_infinite]"/>
                </svg>

                {{-- Hand --}}
                <div class="absolute inset-0 grid place-items-center">
                    <div class="relative h-3 w-3 rounded-full bg-accent shadow-[0_0_8px_color-mix(in_srgb,var(--c-accent)_70%,transparent)]">
                        <div class="absolute bottom-1/2 left-1/2 h-12 w-1 origin-bottom -translate-x-1/2 rounded-full bg-accent animate-[ob-hand-sweep_3.2s_linear_infinite]"></div>
                    </div>
                </div>

                {{-- Time readout --}}
                <div class="z-10 mt-16 flex flex-col items-center rounded-full border border-white/10 bg-black/50 px-3.5 py-1">
                    <span class="font-mono text-sm font-bold tracking-widest text-accent">1<span class="animate-[ob-colon-blink_1s_step-end_infinite]">:</span>00</span>
                </div>
            </div>

            <div class="absolute -bottom-1 rounded-full border border-white/10 bg-surface-2/95 px-3 py-1.5 shadow-lg">
                <span class="text-[10px] font-bold uppercase tracking-wider text-white">A minute a day</span>
            </div>
        </div>

    @elseif ($index == 2)
        <!-- Scene 2: Watch yourself improve - stair-step bars growing into a star -->
        <div class="relative flex h-56 w-56 items-center justify-center">
            <div class="absolute h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_14%,transparent),transparent_70%)]"></div>

            <div class="relative flex h-44 w-52 flex-col justify-end overflow-hidden rounded-3xl border border-white/10 bg-surface p-5 shadow-2xl">
                {{-- Star that pops once the climb completes --}}
                <div class="absolute right-5 top-4 h-10 w-10 animate-[ob-star-pop_5s_ease-in-out_infinite]">
                    <svg viewBox="0 0 24 24" class="h-full w-full text-accent drop-shadow-[0_0_12px_color-mix(in_srgb,var(--c-accent)_70%,transparent)]" fill="currentColor">
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                    </svg>
                </div>

                {{-- Solid stair-step bars, growing one after another --}}
                <div class="flex h-28 items-end justify-between gap-2.5 px-1">
                    <div class="h-10 flex-1 origin-bottom rounded-lg bg-gradient-to-t from-accent/35 to-accent animate-[ob-bar-grow_5s_ease-in-out_infinite]"></div>
                    <div class="h-16 flex-1 origin-bottom rounded-lg bg-gradient-to-t from-accent/35 to-accent animate-[ob-bar-grow_5s_ease-in-out_infinite_0.35s]"></div>
                    <div class="h-[5.5rem] flex-1 origin-bottom rounded-lg bg-gradient-to-t from-accent/35 to-accent animate-[ob-bar-grow_5s_ease-in-out_infinite_0.7s]"></div>
                    <div class="h-28 flex-1 origin-bottom rounded-lg bg-gradient-to-t from-accent/35 to-accent animate-[ob-bar-grow_5s_ease-in-out_infinite_1.05s]"></div>
                </div>

                <div class="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-muted">Week 1</span>
                    <svg viewBox="0 0 24 24" class="h-4 w-4 text-accent" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                    <span class="text-[10px] font-bold uppercase tracking-wider text-accent">Week 4</span>
                </div>
            </div>
        </div>

    @elseif ($index == 3)
        <!-- Scene 3: Build the habit - a solid bell ringing with sound waves -->
        <div class="relative flex h-56 w-56 items-center justify-center">
            <div class="absolute h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_16%,transparent),transparent_70%)]"></div>
            <div class="absolute h-44 w-44 rounded-full border-2 border-accent/15 animate-[ob-ring-out_2.4s_ease-out_infinite]"></div>

            <div class="relative grid h-40 w-40 place-items-center rounded-full border-4 border-accent/60 bg-surface shadow-2xl">
                {{-- Sound waves --}}
                <svg viewBox="0 0 24 24" class="absolute left-4 top-1/2 h-8 w-8 -translate-y-1/2 text-accent animate-[ob-wave-left_2.4s_ease-out_infinite]" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M8 6a12 12 0 0 0 0 12M12.5 8.5a8 8 0 0 0 0 7"/>
                </svg>
                <svg viewBox="0 0 24 24" class="absolute right-4 top-1/2 h-8 w-8 -translate-y-1/2 scale-x-[-1] text-accent animate-[ob-wave-right_2.4s_ease-out_infinite]" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M8 6a12 12 0 0 0 0 12M12.5 8.5a8 8 0 0 0 0 7"/>
                </svg>

                {{-- Solid bell, pendulum swing from the top --}}
                <div class="origin-top animate-[ob-bell-swing_2.4s_ease-in-out_infinite]">
                    <svg viewBox="0 0 24 24" class="h-20 w-20 text-accent drop-shadow-[0_0_14px_color-mix(in_srgb,var(--c-accent)_50%,transparent)]" fill="currentColor">
                        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                    </svg>
                </div>
            </div>

            <div class="absolute -bottom-1 flex items-center gap-1.5 rounded-full border border-white/10 bg-surface-2/95 px-3 py-1.5 shadow-lg">
                <span class="h-2 w-2 rounded-full bg-accent animate-[ob-chip-pulse_1.6s_ease-in-out_infinite]"></span>
                <span class="text-[10px] font-bold uppercase tracking-wider text-white">Same time daily</span>
            </div>
        </div>
    @else
        <div class="relative grid h-44 w-44 place-items-center rounded-[2.5rem] bg-surface ring-1 ring-white/10 animate-pulse">
            <svg viewBox="0 0 24 24" class="h-20 w-20 text-accent" fill="none" stroke="currentColor" stroke-width="1.7">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
            </svg>
        </div>
    @endif
</div>
