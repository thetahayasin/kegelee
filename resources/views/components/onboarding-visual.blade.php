@props(['index'])

{{--
    Onboarding slide visuals. Big, solid, and simple: each scene fills the
    slide area with one bold icon and a single signature animation:
      0  Heart that steadily fills with strength (natural, lasting gains)
      1  Solid stopwatch with a sweeping hand (only minutes a day)
      2  Stair-step bars growing into a star (visible progress)
      3  Solid bell ringing with sound waves (build the habit)
--}}
<div class="onboarding-visual-container relative aspect-square w-[min(80vw,21rem)] select-none">
    <style>
        @keyframes ob-ring-out {
            0% { transform: scale(0.78); opacity: 0.55; }
            100% { transform: scale(1.12); opacity: 0; }
        }
        /* Scene 0: liquid rises inside the heart and holds - gains that stay. */
        @keyframes ob-liquid-rise {
            0% { transform: translateY(20px); }
            55% { transform: translateY(2px); }
            88% { transform: translateY(2px); }
            100% { transform: translateY(20px); }
        }
        @keyframes ob-liquid-wave {
            0% { transform: translateX(0); }
            100% { transform: translateX(-6px); }
        }
        @keyframes ob-heart-beat {
            0%, 40%, 100% { transform: scale(1); }
            48% { transform: scale(1.07); }
            56% { transform: scale(1); }
            64% { transform: scale(1.05); }
        }
        @keyframes ob-twinkle {
            0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
            50% { opacity: 1; transform: scale(1) rotate(90deg); }
        }
        /* Scene 1: one smooth sweep of the stopwatch dial per lap. */
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
            12% { transform: rotate(14deg); }
            28% { transform: rotate(-12deg); }
            44% { transform: rotate(8deg); }
            60% { transform: rotate(-4deg); }
            74% { transform: rotate(2deg); }
        }
        @keyframes ob-wave-side {
            0%, 20% { opacity: 0; transform: scale(0.75); }
            45% { opacity: 1; }
            80%, 100% { opacity: 0; transform: scale(1.2); }
        }
        @keyframes ob-chip-pulse {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 1; }
        }
    </style>

    @if ($index == 0)
        <!-- Scene 0: Naturally stronger - a heart that fills up and stays full -->
        <div class="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_18%,transparent),transparent_72%)]"></div>
        <div class="absolute inset-2 rounded-full border-2 border-accent/20 animate-[ob-ring-out_3.2s_ease-out_infinite]"></div>
        <div class="absolute inset-2 rounded-full border-2 border-accent/12 animate-[ob-ring-out_3.2s_ease-out_infinite_1.6s]"></div>

        <div class="absolute inset-6 grid place-items-center rounded-full border-[5px] border-accent/60 bg-surface shadow-2xl">
            <div class="relative h-[54%] w-[54%] animate-[ob-heart-beat_2.6s_ease-in-out_infinite] drop-shadow-[0_0_18px_color-mix(in_srgb,var(--c-accent)_55%,transparent)]">
                {{-- Liquid strength rising inside the heart, with a live wave surface --}}
                <svg viewBox="0 0 24 24" class="h-full w-full">
                    <defs>
                        <clipPath id="ob-heart-clip">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </clipPath>
                    </defs>
                    <path fill="currentColor" class="text-accent/20"
                          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    <g clip-path="url(#ob-heart-clip)">
                        <g style="animation: ob-liquid-rise 5.5s ease-in-out infinite;">
                            <path fill="currentColor" class="text-accent" style="animation: ob-liquid-wave 1.6s linear infinite;"
                                  d="M-14 3 q3 -1.6 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 V30 H-14 Z"/>
                        </g>
                    </g>
                </svg>
            </div>

            <svg viewBox="0 0 24 24" class="absolute right-[16%] top-[18%] h-[9%] w-[9%] text-accent animate-[ob-twinkle_2.8s_ease-in-out_infinite]" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>
            <svg viewBox="0 0 24 24" class="absolute bottom-[22%] left-[17%] h-[7%] w-[7%] text-accent animate-[ob-twinkle_2.8s_ease-in-out_infinite_1.4s]" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>
        </div>

        <div class="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-surface-2 px-4 py-2 shadow-xl">
            <svg viewBox="0 0 24 24" class="h-4 w-4 text-success" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
            <span class="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-white">100% natural</span>
        </div>

    @elseif ($index == 1)
        <!-- Scene 1: Only minutes a day - a solid stopwatch with one sweeping hand -->
        <div class="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_18%,transparent),transparent_72%)]"></div>

        {{-- Crown --}}
        <div class="absolute left-1/2 top-0 h-[5%] w-[13%] -translate-x-1/2 rounded-t-lg bg-accent"></div>
        <div class="absolute left-1/2 top-[4.5%] h-[3%] w-[20%] -translate-x-1/2 rounded-full bg-accent/70"></div>

        <div class="absolute inset-x-6 bottom-2 top-8 grid place-items-center rounded-full border-[5px] border-accent/60 bg-surface shadow-2xl">
            {{-- Tick marks --}}
            <svg viewBox="0 0 100 100" class="absolute inset-1.5 h-[calc(100%-12px)] w-[calc(100%-12px)] text-white/20">
                @for ($t = 0; $t < 12; $t++)
                    <line x1="50" y1="5" x2="50" y2="{{ $t % 3 === 0 ? 13 : 9 }}" stroke="currentColor" stroke-width="{{ $t % 3 === 0 ? 3.5 : 2 }}" stroke-linecap="round" transform="rotate({{ $t * 30 }} 50 50)"/>
                @endfor
            </svg>

            {{-- Sweeping dial --}}
            <svg viewBox="0 0 100 100" class="absolute inset-0 h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--c-accent)" stroke-width="8" stroke-linecap="round"
                        stroke-dasharray="264" stroke-dashoffset="264"
                        style="filter: drop-shadow(0 0 7px color-mix(in srgb, var(--c-accent) 60%, transparent));"
                        class="animate-[ob-dial-sweep_3.2s_linear_infinite]"/>
            </svg>

            {{-- Big, unobstructed time readout in the centre --}}
            <div class="z-10 text-center">
                <p class="font-mono text-5xl font-bold tracking-wider text-accent drop-shadow-[0_0_14px_color-mix(in_srgb,var(--c-accent)_45%,transparent)]">1<span class="animate-[ob-colon-blink_1s_step-end_infinite]">:</span>00</p>
                <p class="mt-1.5 text-[11px] font-bold uppercase tracking-[0.25em] text-muted">per day</p>
            </div>
        </div>

        <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-surface-2 px-4 py-2 shadow-xl">
            <span class="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-white">A minute a day</span>
        </div>

    @elseif ($index == 2)
        <!-- Scene 2: Watch yourself improve - stair-step bars growing into a star -->
        <div class="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_15%,transparent),transparent_72%)]"></div>

        <div class="absolute inset-x-1 inset-y-4 flex flex-col justify-end overflow-hidden rounded-[2rem] border border-white/10 bg-surface p-6 shadow-2xl">
            {{-- Star pops when the climb completes --}}
            <div class="absolute right-6 top-5 h-[22%] w-[22%] animate-[ob-star-pop_5s_ease-in-out_infinite]">
                <svg viewBox="0 0 24 24" class="h-full w-full text-accent drop-shadow-[0_0_16px_color-mix(in_srgb,var(--c-accent)_70%,transparent)]" fill="currentColor">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                </svg>
            </div>

            {{-- Solid stair-step bars --}}
            <div class="flex h-[62%] items-end justify-between gap-3 px-1">
                <div class="h-[36%] flex-1 origin-bottom rounded-xl bg-gradient-to-t from-accent/35 to-accent animate-[ob-bar-grow_5s_ease-in-out_infinite]"></div>
                <div class="h-[58%] flex-1 origin-bottom rounded-xl bg-gradient-to-t from-accent/35 to-accent animate-[ob-bar-grow_5s_ease-in-out_infinite_0.35s]"></div>
                <div class="h-[79%] flex-1 origin-bottom rounded-xl bg-gradient-to-t from-accent/35 to-accent animate-[ob-bar-grow_5s_ease-in-out_infinite_0.7s]"></div>
                <div class="h-full flex-1 origin-bottom rounded-xl bg-gradient-to-t from-accent/35 to-accent animate-[ob-bar-grow_5s_ease-in-out_infinite_1.05s]"></div>
            </div>

            <div class="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                <span class="text-xs font-bold uppercase tracking-wider text-muted">Week 1</span>
                <svg viewBox="0 0 24 24" class="h-5 w-5 text-accent" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                <span class="text-xs font-bold uppercase tracking-wider text-accent">Week 4</span>
            </div>
        </div>

    @elseif ($index == 3)
        <!-- Scene 3: Build the habit - a solid bell ringing with sound waves -->
        <div class="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_18%,transparent),transparent_72%)]"></div>
        <div class="absolute inset-2 rounded-full border-2 border-accent/18 animate-[ob-ring-out_2.4s_ease-out_infinite]"></div>

        <div class="absolute inset-6 grid place-items-center rounded-full border-[5px] border-accent/60 bg-surface shadow-2xl">
            {{-- Sound waves --}}
            <svg viewBox="0 0 24 24" class="absolute left-[8%] top-1/2 h-[22%] w-[22%] -translate-y-1/2 text-accent animate-[ob-wave-side_2.4s_ease-out_infinite]" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M8 6a12 12 0 0 0 0 12M12.5 8.5a8 8 0 0 0 0 7"/>
            </svg>
            <svg viewBox="0 0 24 24" class="absolute right-[8%] top-1/2 h-[22%] w-[22%] -translate-y-1/2 scale-x-[-1] text-accent animate-[ob-wave-side_2.4s_ease-out_infinite]" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M8 6a12 12 0 0 0 0 12M12.5 8.5a8 8 0 0 0 0 7"/>
            </svg>

            {{-- Solid bell --}}
            <div class="h-[46%] w-[46%] origin-top animate-[ob-bell-swing_2.4s_ease-in-out_infinite]">
                <svg viewBox="0 0 24 24" class="h-full w-full text-accent drop-shadow-[0_0_18px_color-mix(in_srgb,var(--c-accent)_55%,transparent)]" fill="currentColor">
                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                </svg>
            </div>
        </div>

        <div class="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-surface-2 px-4 py-2 shadow-xl">
            <span class="h-2.5 w-2.5 rounded-full bg-accent animate-[ob-chip-pulse_1.6s_ease-in-out_infinite]"></span>
            <span class="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-white">Same time daily</span>
        </div>
    @endif
</div>
