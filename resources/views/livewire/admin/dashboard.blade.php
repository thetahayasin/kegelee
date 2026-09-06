<div class="space-y-6">

    {{-- ─── Page header ──────────────────────────────────────────────────── --}}
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold">Dashboard</h1>
            <p class="text-sm text-muted">{{ now()->format('l, j F Y') }}</p>
        </div>
        <div class="flex items-center gap-2">
            <a href="{{ route('admin.subscriptions') }}"
               class="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold tap"
               style="color:#0c1a00">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                Grant sub
            </a>
        </div>
    </div>

    {{-- ─── Primary stats ─────────────────────────────────────────────────── --}}
    @php
        $statDefs = [
            ['users',    'bg-blue-500/10',    'text-blue-400',    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'],
            ['activity', 'bg-accent/10',      'text-accent',      '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'],
            ['trending', 'bg-purple-500/10',  'text-purple-400',  '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'],
            ['star',     'bg-success/10',     'text-success',     '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'],
        ];
    @endphp

    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        @foreach ($stats as $i => $stat)
            @php [$key, $bgCls, $textCls, $svg] = $statDefs[$i]; @endphp
            <div class="stat-card">
                <div class="mb-3 flex items-center justify-between">
                    <div class="grid h-9 w-9 place-items-center rounded-xl {{ $bgCls }}">
                        <svg viewBox="0 0 24 24" class="h-4 w-4 {{ $textCls }}" fill="none" stroke="currentColor" stroke-width="2">
                            {!! $svg !!}
                        </svg>
                    </div>
                </div>
                <p class="text-3xl font-black tabular-nums">{{ number_format($stat['value']) }}</p>
                <p class="mt-1 text-xs font-medium text-muted">{{ $stat['label'] }}</p>
            </div>
        @endforeach
    </div>

    {{-- ─── Secondary counts (content inventory) ─────────────────────────── --}}
    <div class="grid grid-cols-4 gap-3">
        @foreach ($secondary as $tile)
            <a href="{{ route($tile['route']) }}"
               class="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/5 bg-surface-2/60 py-4 text-center hover:border-accent/30 hover:bg-accent/5 transition-colors">
                <span class="text-xl font-bold tabular-nums">{{ $tile['value'] }}</span>
                <span class="text-xs font-medium text-muted">{{ $tile['label'] }}</span>
            </a>
        @endforeach
    </div>

    {{-- ─── Free funnel ────────────────────────────────────────────────────── --}}
    {{-- Signed up through to subscribed. Every step but the two ends used to
         happen only on the device, so this whole card was unreadable before. --}}
    <div class="rounded-2xl border border-white/5 bg-surface p-5">
        <div class="mb-5 flex items-center justify-between">
            <div>
                <p class="font-semibold">Free funnel</p>
                <p class="text-xs text-muted">Where accounts stop, cumulative</p>
                {{-- This card is every account ever. The report follows one
                     group of joiners through the same steps, which is the
                     version that can be compared with last month. --}}
                <a href="{{ route('admin.reports.funnel') }}"
                   class="text-xs font-medium text-accent hover:underline">See it by the week people joined →</a>
            </div>
            @if ($avgBaseline)
                <span class="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                    {{ $avgBaseline }}s average opening hold
                </span>
            @endif
        </div>

        <div class="space-y-3">
            @foreach ($funnel as $step)
                @php
                    $pct = $funnelMax > 0 ? round($step['value'] / $funnelMax * 100) : 0;
                    // Share of the step above, which is the number that says
                    // where people actually drop rather than how big the top is.
                    $prev = $loop->first ? null : $funnel[$loop->index - 1]['value'];
                    $conv = $prev > 0 ? round($step['value'] / $prev * 100) : null;
                @endphp
                <div>
                    <div class="mb-1 flex items-baseline justify-between text-xs">
                        <span class="text-muted">{{ $step['label'] }}</span>
                        <span class="tabular-nums">
                            {{ number_format($step['value']) }}
                            @if ($conv !== null)
                                <span class="ml-1 text-muted">{{ $conv }}%</span>
                            @endif
                        </span>
                    </div>
                    <div class="h-2 overflow-hidden rounded-full bg-white/5">
                        <div class="h-2 rounded-full bg-accent" style="width: {{ max(1, $pct) }}%"></div>
                    </div>
                </div>
            @endforeach
        </div>
    </div>

    {{-- ─── Chart ──────────────────────────────────────────────────────────── --}}
    <div class="rounded-2xl border border-white/5 bg-surface p-5">
        <div class="mb-5 flex items-center justify-between">
            <div>
                <p class="font-semibold">Workout sessions</p>
                <p class="text-xs text-muted">Last 14 days, on the day they were finished</p>
            </div>
            <span class="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                {{ number_format($chart->sum('value')) }} total
            </span>
        </div>

        {{-- Chart with grid lines --}}
        <div class="relative">
            {{-- Horizontal grid lines --}}
            <div class="absolute inset-x-0 inset-y-0 flex flex-col justify-between pointer-events-none" style="padding-bottom:1.75rem">
                @foreach ([1, 0.66, 0.33, 0] as $frac)
                    <div class="flex items-center gap-2">
                        <span class="w-7 shrink-0 text-right text-[11px] text-muted tabular-nums">
                            {{ $frac > 0 ? number_format(round($chartMax * $frac)) : '0' }}
                        </span>
                        <div class="flex-1 border-t border-white/5"></div>
                    </div>
                @endforeach
            </div>

            {{-- Bars --}}
            <div class="relative ml-8 flex h-44 items-end gap-1">
                @foreach ($chart as $bar)
                    @php($pct = max(2, round($bar['value'] / $chartMax * 100)))
                    <div class="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                        <div class="relative w-full group">
                            {{-- Tooltip --}}
                            @if ($bar['value'])
                                <div class="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    <div class="rounded-md bg-surface-2 border border-white/10 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">
                                        {{ $bar['value'] }}
                                    </div>
                                </div>
                            @endif
                            <div class="chart-bar w-full rounded-t"
                                 style="height:{{ $pct }}%;background:linear-gradient(180deg,rgba(193,255,114,.9) 0%,rgba(193,255,114,.4) 100%)">
                            </div>
                        </div>
                        <span class="text-[11px] text-muted tabular-nums">{{ $bar['label'] }}</span>
                    </div>
                @endforeach
            </div>
        </div>
    </div>

    {{-- ─── Bottom two columns ─────────────────────────────────────────────── --}}
    <div class="grid gap-6 lg:grid-cols-5">

        {{-- Recent users (3/5) --}}
        <div class="lg:col-span-3 rounded-2xl border border-white/5 bg-surface p-5">
            <div class="mb-4 flex items-center justify-between">
                <p class="font-semibold">Recent users</p>
                <a href="{{ route('admin.users') }}"
                   class="text-xs font-medium text-accent hover:underline">View all →</a>
            </div>
            <div class="space-y-1">
                @forelse ($recentUsers as $user)
                    <div class="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/4 transition-colors">
                        <div class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                            {{ strtoupper(substr($user->name, 0, 1)) }}
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{{ $user->name }}</p>
                            <p class="truncate text-xs text-muted">{{ $user->email }}</p>
                        </div>
                        <span class="shrink-0 text-[11px] text-muted">{{ $user->created_at->diffForHumans(short: true) }}</span>
                    </div>
                @empty
                    <p class="py-6 text-center text-sm text-muted">No users yet.</p>
                @endforelse
            </div>
        </div>

        {{-- Quick actions (2/5) --}}
        <div class="lg:col-span-2 rounded-2xl border border-white/5 bg-surface p-5">
            <p class="mb-4 font-semibold">Quick actions</p>
            <div class="space-y-2">
                @php($actions = [
                    ['admin.subscriptions', 'Subscriptions', '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'],
                    ['admin.pages', 'Legal pages', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'],
                    ['admin.users', 'All users', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'],
                    ['admin.settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.74 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'],
                ])
                @foreach ($actions as [$route, $label, $svg])
                    <a href="{{ route($route) }}"
                       class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-white/5 transition-colors group">
                        <div class="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-muted group-hover:text-accent transition-colors" fill="none" stroke="currentColor" stroke-width="1.8">
                                {!! $svg !!}
                            </svg>
                        </div>
                        <span class="font-medium">{{ $label }}</span>
                        <svg viewBox="0 0 24 24" class="ml-auto h-3.5 w-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </a>
                @endforeach
            </div>
        </div>
    </div>
</div>
