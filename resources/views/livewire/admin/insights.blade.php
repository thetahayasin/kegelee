<div class="space-y-6">

    {{-- ─── Page header ──────────────────────────────────────────────────── --}}
    <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
            <h1 class="text-2xl font-bold">Insights</h1>
            <p class="text-sm text-muted">What people do in the app, over the last {{ $days }} days</p>
        </div>

        {{-- Three fixed windows rather than a date picker. Every question this
             page answers is "is this getting better or worse", which needs a
             consistent window far more than an arbitrary one. --}}
        <div class="flex items-center gap-1 rounded-xl bg-white/5 p-1">
            @foreach ([7, 30, 90] as $d)
                <button type="button" wire:click="setDays({{ $d }})"
                        class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                               {{ $days === $d ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-content' }}">
                    {{ $d }}d
                </button>
            @endforeach
        </div>
    </div>

    @unless ($hasData)
        {{-- Said plainly rather than shown as a wall of zeroes. A page of 0%
             looks like a broken report; "nothing has arrived yet" is a fact. --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p class="text-sm font-semibold">No events in this window yet</p>
            <p class="mt-1 text-sm text-muted">
                Behaviour is recorded on the device and arrives with the next sync, so
                the first figures appear once someone on a build that includes it has
                opened the app. {{ number_format($totalAccounts) }} accounts exist today.
            </p>
        </div>
    @endunless

    {{-- ─── Headline ratios ───────────────────────────────────────────────── --}}
    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        @foreach ($cards as $card)
            <div class="stat-card">
                <p class="text-3xl font-black tabular-nums">{{ $card['value'] }}</p>
                <p class="mt-1 text-sm font-semibold">{{ $card['label'] }}</p>
                <p class="mt-0.5 text-xs text-muted">{{ $card['detail'] }}</p>
            </div>
        @endforeach
    </div>

    <div class="grid gap-6 lg:grid-cols-2">

        {{-- ─── Tours, one row each ───────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Tours</h2>
            <p class="mt-1 text-xs text-muted">
                How often each one is read to the end rather than dismissed.
            </p>

            <div class="mt-4 space-y-3">
                @forelse ($perTour as $tour => $row)
                    <div>
                        <div class="flex items-baseline justify-between gap-3">
                            <span class="text-sm font-semibold capitalize">{{ $tour ?: 'unknown' }}</span>
                            <span class="text-sm tabular-nums">
                                {{ $row['rate'] !== null ? $row['rate'] . '%' : '-' }}
                                <span class="text-xs text-muted">of {{ $row['seen'] }}</span>
                            </span>
                        </div>
                        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div class="h-full rounded-full bg-accent"
                                 style="width: {{ $row['rate'] ?? 0 }}%"></div>
                        </div>
                    </div>
                @empty
                    <p class="text-sm text-muted">No tours shown in this window.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── Locks: the demand signal ──────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Locked features tapped</h2>
            <p class="mt-1 text-xs text-muted">
                Which padlock a free account reaches for. The clearest signal here of
                what people would actually pay for.
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($locks as $lock)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                        <span class="text-sm font-semibold capitalize">{{ $lock->subject ?: 'unknown' }}</span>
                        <span class="text-sm tabular-nums">
                            {{ number_format($lock->total) }}
                            <span class="text-xs text-muted">/ {{ number_format($lock->people) }} people</span>
                        </span>
                    </div>
                @empty
                    <p class="text-sm text-muted">No locked features tapped in this window.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── Where the basics stop ─────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Basics finished</h2>
            <p class="mt-1 text-xs text-muted">
                People who completed each lesson. The drop between rows is where the
                onboarding actually loses them.
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($lessons as $lesson)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                        <span class="text-sm font-semibold capitalize">{{ $lesson->subject ?: 'unknown' }}</span>
                        <span class="text-sm tabular-nums">{{ number_format($lesson->people) }}</span>
                    </div>
                @empty
                    <p class="text-sm text-muted">No lessons finished in this window.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── Appearance ────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Appearance chosen</h2>
            <p class="mt-1 text-xs text-muted">
                Only counts people who changed it away from the default, so it
                understates "system" by design.
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($appearance as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                        <span class="text-sm font-semibold capitalize">{{ $row->subject ?: 'unknown' }}</span>
                        <span class="text-sm tabular-nums">{{ number_format($row->people) }}</span>
                    </div>
                @empty
                    <p class="text-sm text-muted">Nobody has changed it in this window.</p>
                @endforelse
            </div>
        </div>

    </div>
</div>
