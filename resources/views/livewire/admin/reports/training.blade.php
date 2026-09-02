<div class="space-y-6">

    @include('livewire.admin.reports._header', [
        'title' => 'Training',
        'question' => 'Is anybody actually training, and where do they stop?',
        'exportReport' => 'sessions',
    ])

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        @foreach ($cards as $card)
            <x-admin.stat :label="$card['label']" :value="$card['value']" :detail="$card['detail']"
                          :delta="$card['delta']" :means="$card['means']" :ifLow="$card['ifLow']" />
        @endforeach
    </div>

    @unless ($hasSessions)
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p class="text-sm font-semibold">No workouts finished in this window</p>
            <p class="mt-1 text-sm text-muted">
                Workouts are counted on the day they were finished, not the day they reached us, so
                a phone that has been offline still lands on the right day once it syncs.
            </p>
        </div>
    @endunless

    {{-- ─── Workouts per day ──────────────────────────────────────────────── --}}
    <div class="rounded-2xl border border-white/5 bg-surface p-5">
        <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
                <p class="font-semibold">Workouts per day</p>
                <p class="text-xs text-muted">Counted on the day they were finished</p>
            </div>
            <span class="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent tabular-nums">
                {{ number_format(collect($chart)->sum('value')) }} in total
            </span>
        </div>

        @php($chartMax = max(1, collect($chart)->max('value')))
        <div class="flex h-40 items-end gap-px">
            @foreach ($chart as $bar)
                <div class="group relative flex h-full flex-1 flex-col justify-end" title="{{ $bar['label'] }}: {{ $bar['value'] }}">
                    <div class="chart-bar w-full rounded-t"
                         style="height:{{ max(2, round($bar['value'] / $chartMax * 100)) }}%;background:linear-gradient(180deg,rgba(193,255,114,.9) 0%,rgba(193,255,114,.35) 100%)"></div>
                </div>
            @endforeach
        </div>
        <div class="mt-1 flex justify-between text-[10px] text-dim">
            <span>{{ $chart[0]['label'] ?? '' }}</span>
            <span>today</span>
        </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">

        {{-- ─── Where people quit ─────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Where people quit</h2>
            <p class="mt-1 text-xs text-muted">{{ $quitSentence }}</p>

            <div class="mt-4 space-y-3">
                @foreach ($quitPoints as $row)
                    <div>
                        <div class="flex items-baseline justify-between gap-3 text-sm">
                            <span>{{ $row['label'] }}</span>
                            <span class="tabular-nums">{{ number_format($row['value']) }}
                                <span class="text-xs text-muted">{{ $row['pct'] }}%</span>
                            </span>
                        </div>
                        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div class="h-full rounded-full bg-accent" style="width: {{ $row['pct'] }}%"></div>
                        </div>
                    </div>
                @endforeach
            </div>
            <p class="mt-4 text-xs text-dim">
                A lot of quitting before the first quarter means the workout starts too hard.
                Quitting in the last quarter usually means it is simply too long.
            </p>
        </div>

        {{-- ─── Difficulty spread ─────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Difficulty people are on</h2>
            <p class="mt-1 text-xs text-muted">Every account, at this moment.</p>

            <div class="mt-4 space-y-2">
                @forelse ($levels as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span>{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['value']) }}</span>
                    </div>
                @empty
                    <p class="text-sm text-muted">No accounts have a difficulty set yet.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── How far through the plan ──────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Days completed</h2>
            <p class="mt-1 text-xs text-muted">
                A day is completed when both of that day's workouts are done. This is what moves
                people through the plan.
            </p>

            <div class="mt-4 space-y-3">
                @foreach ($dayBuckets as $row)
                    <div>
                        <div class="flex items-baseline justify-between gap-3 text-sm">
                            <span>{{ $row['label'] }}</span>
                            <span class="tabular-nums">{{ number_format($row['value']) }}
                                <span class="text-xs text-muted">{{ $row['pct'] }}%</span>
                            </span>
                        </div>
                        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div class="h-full rounded-full bg-accent" style="width: {{ $row['pct'] }}%"></div>
                        </div>
                    </div>
                @endforeach
            </div>
        </div>

        {{-- ─── Streaks ───────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Longest run of days in a row</h2>
            <p class="mt-1 text-xs text-muted">
                Best streak each account has managed in the last six months. Only people who have
                completed at least one day appear.
            </p>

            <div class="mt-4 space-y-2">
                @foreach ($streaks as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span>{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['value']) }}
                            <span class="text-xs text-muted">{{ $row['pct'] }}%</span>
                        </span>
                    </div>
                @endforeach
            </div>
        </div>
    </div>

    {{-- ─── Last exercise ─────────────────────────────────────────────────── --}}
    <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 class="text-sm font-bold uppercase tracking-wider text-muted">The exercise a workout ended on</h2>
        <p class="mt-1 text-xs text-muted">
            Not a popularity chart. A workout row keeps one exercise and it is the LAST one played,
            so this says what was on the screen when the workout finished - useful, but it cannot
            tell you which exercises people do most.
        </p>

        <div class="mt-4 space-y-2">
            @forelse ($lastExercises as $row)
                <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                    <span>{{ $row['label'] }}</span>
                    <span class="tabular-nums">{{ number_format($row['value']) }}</span>
                </div>
            @empty
                <p class="text-sm text-muted">No workouts in this window.</p>
            @endforelse
        </div>
    </div>

    @include('livewire.admin.reports._glossary')
</div>
