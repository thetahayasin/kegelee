@props(['index'])

<div class="onboarding-visual-container relative flex items-center justify-center h-64 w-64 select-none">
    <style scoped>
        @keyframes heart-pulse {
            0%, 100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(110, 242, 240, 0.35)); }
            30% { transform: scale(1.15); filter: drop-shadow(0 0 25px rgba(110, 242, 240, 0.7)); }
            45% { transform: scale(1.08); filter: drop-shadow(0 0 15px rgba(110, 242, 240, 0.5)); }
            60% { transform: scale(1.2); filter: drop-shadow(0 0 30px rgba(110, 242, 240, 0.85)); }
        }
        @keyframes pulse-ring {
            0% { transform: scale(0.65); opacity: 0; }
            50% { opacity: 0.5; }
            100% { transform: scale(1.25); opacity: 0; }
        }
        @keyframes ecg-flow {
            0% { stroke-dashoffset: 400; }
            100% { stroke-dashoffset: 0; }
        }
        @keyframes timer-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes time-dots {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
        }
        @keyframes progress-fill {
            0% { stroke-dashoffset: 283; }
            50% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -283; }
        }
        @keyframes draw-chart-path {
            0% { stroke-dashoffset: 350; }
            100% { stroke-dashoffset: 0; }
        }
        @keyframes scale-bar {
            0%, 100% { transform: scaleY(0.3); }
            50% { transform: scaleY(1); }
        }
        @keyframes float-node {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
        }
        @keyframes bell-swing {
            0%, 100% { transform: rotate(0deg); }
            15% { transform: rotate(18deg); }
            30% { transform: rotate(-18deg); }
            45% { transform: rotate(12deg); }
            60% { transform: rotate(-12deg); }
            75% { transform: rotate(6deg); }
            90% { transform: rotate(-6deg); }
        }
        @keyframes signal-wave {
            0% { transform: scale(0.8); opacity: 0; }
            50% { opacity: 0.6; }
            100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes pop-calendar-day {
            0%, 100% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(110, 242, 240, 0.2)); }
            50% { transform: scale(1.15); filter: drop-shadow(0 0 10px rgba(110, 242, 240, 0.7)); }
        }
    </style>

    @if ($index == 0)
        <!-- Slide 1: Health & Performance -->
        <div class="relative flex h-56 w-56 items-center justify-center">
            <!-- Radial background glow -->
            <div class="absolute h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_15%,transparent),transparent_70%)]"></div>

            <!-- Concentric pulsing rings -->
            <div class="absolute h-48 w-48 rounded-full border border-accent/15 animate-[pulse-ring_3s_infinite_linear]"></div>
            <div class="absolute h-48 w-48 rounded-full border border-accent/10 animate-[pulse-ring_3s_infinite_linear_1.5s]"></div>
            <div class="absolute h-36 w-36 rounded-full border border-accent/20 animate-pulse"></div>
            
            <!-- Heart & Glow -->
            <div class="relative flex h-28 w-28 items-center justify-center rounded-full bg-surface/50 border border-white/10 shadow-lg backdrop-blur-sm animate-[heart-pulse_2.2s_infinite_ease-in-out]">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-14 w-14 text-accent" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
            </div>
            
            <!-- ECG pulse line -->
            <div class="absolute bottom-2 left-0 right-0 h-10 overflow-hidden opacity-75 pointer-events-none">
                <svg class="w-full h-full" viewBox="0 0 200 40" fill="none">
                    <path d="M0,20 L60,20 L70,8 L80,32 L90,12 L100,28 L110,20 L200,20" 
                          stroke="url(#ecg-gradient)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                          stroke-dasharray="400" stroke-dashoffset="400"
                          class="animate-[ecg-flow_3s_infinite_linear]" />
                    <defs>
                        <linearGradient id="ecg-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stop-color="rgba(110, 242, 240, 0.1)" />
                            <stop offset="50%" stop-color="var(--c-accent)" />
                            <stop offset="100%" stop-color="rgba(110, 242, 240, 0.1)" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
        </div>

    @elseif ($index == 1)
        <!-- Slide 2: It takes only minutes -->
        <div class="relative flex h-56 w-56 items-center justify-center">
            <!-- Radial background glow -->
            <div class="absolute h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_15%,transparent),transparent_70%)]"></div>
            
            <!-- Outer stopwatch ring -->
            <div class="relative flex h-40 w-40 items-center justify-center rounded-full bg-surface/40 border border-white/10 shadow-xl backdrop-blur-sm">
                <!-- SVG stopwatch ring -->
                <svg class="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" stroke="rgba(255,255,255,0.05)" stroke-width="3" fill="none" />
                    <circle cx="50" cy="50" r="45" stroke="var(--c-accent)" stroke-width="3.5" fill="none"
                            stroke-dasharray="283" stroke-dashoffset="283" stroke-linecap="round"
                            class="animate-[progress-fill_6s_infinite_linear]" />
                </svg>
                
                <!-- Timer hand and center -->
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <!-- Center dot and rotating hand -->
                    <div class="relative h-2.5 w-2.5 rounded-full bg-accent">
                        <div class="absolute bottom-1/2 left-1/2 h-14 w-0.5 origin-bottom -translate-x-1/2 bg-accent rounded-full animate-[timer-spin_6s_infinite_linear]"></div>
                    </div>
                </div>

                <!-- Digital time readout in glass card -->
                <div class="z-10 flex flex-col items-center mt-12 bg-black/40 px-3.5 py-1.5 rounded-full border border-white/5 backdrop-blur-[2px]">
                    <span class="text-xs font-mono font-bold tracking-widest text-accent">03<span class="animate-[time-dots_1s_infinite]">:</span>00</span>
                    <span class="text-[8px] font-semibold uppercase tracking-wider text-muted mt-0.5">Daily</span>
                </div>
            </div>
        </div>

    @elseif ($index == 2)
        <!-- Slide 3: Track your progress -->
        <div class="relative flex h-56 w-56 items-center justify-center">
            <!-- Grid pattern background inside glass box -->
            <div class="relative flex h-40 w-48 flex-col justify-end gap-3 rounded-2xl bg-surface/30 border border-white/10 p-4 shadow-xl backdrop-blur-sm overflow-hidden">
                <!-- Background Grid Lines -->
                <div class="absolute inset-0 grid grid-cols-5 grid-rows-4 opacity-5 pointer-events-none">
                    @for ($i = 0; $i < 20; $i++)
                        <div class="border-b border-r border-white"></div>
                    @endfor
                </div>

                <!-- Bar charts and trend line container -->
                <div class="relative h-24 w-full flex items-end justify-between px-2">
                    <!-- Vertical Bars with staggered animations -->
                    <div class="w-4 bg-accent/20 border-t-2 border-accent rounded-t-sm h-12 origin-bottom animate-[scale-bar_3s_infinite_ease-in-out]"></div>
                    <div class="w-4 bg-accent/20 border-t-2 border-accent rounded-t-sm h-16 origin-bottom animate-[scale-bar_3s_infinite_ease-in-out_0.5s]"></div>
                    <div class="w-4 bg-accent/20 border-t-2 border-accent rounded-t-sm h-20 origin-bottom animate-[scale-bar_3s_infinite_ease-in-out_1s]"></div>
                    <div class="w-4 bg-accent/20 border-t-2 border-accent rounded-t-sm h-24 origin-bottom animate-[scale-bar_3s_infinite_ease-in-out_1.5s]"></div>

                    <!-- Trend Line Drawing across bars -->
                    <svg class="absolute inset-0 h-full w-full" viewBox="0 0 100 60" fill="none">
                        <path d="M10,50 L35,42 L60,25 L88,10" 
                              stroke="var(--c-accent)" stroke-width="2.5" stroke-linecap="round"
                              stroke-dasharray="350" stroke-dashoffset="350"
                              class="animate-[draw-chart-path_4s_infinite_ease-in-out]" />
                        
                        <!-- Glowing Node Dot on the peak -->
                        <circle cx="88" cy="10" r="3.5" fill="var(--c-accent)" class="animate-[float-node_2s_infinite_ease-in-out]">
                            <!-- Pulsing outer circle of node -->
                            <animate attributeName="r" values="3.5;6;3.5" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
                        </circle>
                    </svg>
                </div>

                <!-- Metric Label -->
                <div class="flex items-center justify-between text-[10px] font-semibold tracking-wider text-accent border-t border-white/5 pt-2">
                    <span>STREAK: 14 DAYS</span>
                    <span class="text-bg bg-accent px-1.5 py-0.5 rounded-sm font-bold">+25%</span>
                </div>
            </div>
        </div>

    @elseif ($index == 3)
        <!-- Slide 4: Schedule your training -->
        <div class="relative flex h-56 w-56 items-center justify-center">
            <!-- Calendar Grid with glowing notification bell -->
            <div class="relative flex h-40 w-44 flex-col rounded-2xl bg-surface/30 border border-white/10 p-4 shadow-xl backdrop-blur-sm">
                <!-- Calendar Header -->
                <div class="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
                    <span class="text-[10px] font-bold tracking-widest text-accent uppercase">Reminders</span>
                    <!-- Bell icon swinging -->
                    <div class="origin-top animate-[bell-swing_2.2s_infinite_ease-in-out]">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                    </div>
                </div>

                <!-- 4x3 Grid of Days -->
                <div class="grid grid-cols-4 gap-2 flex-1 justify-items-center">
                    @for ($d = 1; $d <= 12; $d++)
                        @php($glowing = in_array($d, [3, 7, 10]))
                        <div class="relative flex items-center justify-center rounded-lg text-[9px] font-bold font-mono 
                             {{ $glowing ? 'bg-accent text-bg font-extrabold animate-[pop-calendar-day_3s_infinite_ease-in-out]' : 'bg-white/5 text-muted' }} 
                             h-7 w-7 transition-all duration-300">
                            {{ $d }}
                            @if ($glowing)
                                <!-- Notification glow ring -->
                                <div class="absolute -inset-1 rounded-lg border border-accent/30 animate-[signal-wave_2s_infinite_ease-in-out]"></div>
                            @endif
                        </div>
                    @endfor
                </div>

                <!-- Reminders caption block -->
                <div class="absolute -bottom-2 -right-4 bg-surface-2/95 border border-white/14 rounded-xl px-2.5 py-1.5 shadow-lg backdrop-blur-sm flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full bg-accent animate-pulse"></span>
                    <span class="text-[9px] font-bold text-white tracking-wide uppercase">8:00 AM Daily</span>
                </div>
            </div>
        </div>
    @else
        <!-- Fallback if a 5th slide is added -->
        <div class="relative grid h-44 w-44 place-items-center rounded-[2.5rem] bg-surface ring-1 ring-white/10 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
        </div>
    @endif
</div>
