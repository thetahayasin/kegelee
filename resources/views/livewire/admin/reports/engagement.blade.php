<div class="space-y-6">

    @include('livewire.admin.reports._header', [
        'title' => 'Engagement',
        'question' => 'What do people do inside the app, and what are they running it on?',
        'exportReport' => 'events',
    ])

    @unless ($hasData)
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p class="text-sm font-semibold">No events in this window yet</p>
            <p class="mt-1 text-sm text-muted">
                Behaviour is recorded on the phone and arrives with the next sync, so the first
                figures appear once somebody on a build that sends them opens the app.
                {{ number_format($totalAccounts) }} accounts exist today.
            </p>
        </div>
    @endunless

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        @foreach ($cards as $card)
            <x-admin.stat :label="$card['label']" :value="$card['value']" :detail="$card['detail']"
                          :delta="$card['delta']" :means="$card['means']" :ifLow="$card['ifLow']" />
        @endforeach
    </div>

    <p class="text-sm text-muted">{{ $reminderSentence }}</p>

    <div class="grid gap-6 lg:grid-cols-2">

        {{-- ─── Tours ─────────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Tours</h2>
            <p class="mt-1 text-xs text-muted">How often each one is read to the end rather than dismissed.</p>

            <div class="mt-4 space-y-3">
                @forelse ($perTour as $tour)
                    <div>
                        <div class="flex items-baseline justify-between gap-3">
                            <span class="text-sm font-semibold capitalize">{{ $tour['label'] }}</span>
                            <span class="text-sm tabular-nums">
                                {{ $tour['rate'] !== null ? $tour['rate'] . '%' : '-' }}
                                <span class="text-xs text-muted">of {{ $tour['seen'] }}</span>
                            </span>
                        </div>
                        <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div class="h-full rounded-full bg-accent" style="width: {{ $tour['rate'] ?? 0 }}%"></div>
                        </div>
                    </div>
                @empty
                    <p class="text-sm text-muted">No tours shown in this window.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── Locks ─────────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Locked features tapped</h2>
            <p class="mt-1 text-xs text-muted">
                Which padlock a free account reaches for. The clearest signal here of what people
                would actually pay for.
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($locks as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span class="font-semibold capitalize">{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['total']) }}
                            <span class="text-xs text-muted">/ {{ number_format($row['people']) }} people</span>
                        </span>
                    </div>
                @empty
                    <p class="text-sm text-muted">No locked features tapped in this window.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── Basics ────────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Basics finished</h2>
            <p class="mt-1 text-xs text-muted">
                People who completed each lesson. The drop between rows is where the first run
                actually loses them.
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($lessons as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span class="font-semibold capitalize">{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['people']) }}</span>
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
                Only counts people who changed it away from the default, so it understates "system"
                by design.
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($appearance as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span class="font-semibold capitalize">{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['people']) }}</span>
                    </div>
                @empty
                    <p class="text-sm text-muted">Nobody has changed it in this window.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── App version ───────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">App version</h2>
            <p class="mt-1 text-xs text-muted">
                @if ($versions['newest'])
                    {{ $versions['onNewestPct'] }}% of installs seen in this window are on {{ $versions['newest'] }}.
                @else
                    No installs have reported a version yet.
                @endif
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($versions['rows'] as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span class="font-mono">{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['installs']) }} installs</span>
                    </div>
                @empty
                    <p class="text-sm text-muted">Nothing reported yet.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── Language ──────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Language</h2>
            <p class="mt-1 text-xs text-muted">What the phone is set to, not what anyone chose here.</p>

            <div class="mt-4 space-y-2">
                @forelse ($languages as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span class="font-mono">{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['people']) }} people</span>
                    </div>
                @empty
                    <p class="text-sm text-muted">No devices have reported a language yet.</p>
                @endforelse
            </div>
        </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">

        {{-- ─── Timezones ─────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Time zones</h2>
            <p class="mt-1 text-xs text-muted">
                Time zone, not country. It is stored so a training day ends at midnight where the
                person is - we do not record where anyone is.
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($timezones as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span>{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['people']) }}</span>
                    </div>
                @empty
                    <p class="text-sm text-muted">No time zones recorded yet.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── Leaving ───────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Accounts deleted</h2>
            <p class="mt-1 text-xs text-muted">
                Nothing here identifies anybody: deleting an account removes everything about it, so
                all that is kept is a tally mark.
            </p>

            <div class="mt-4 space-y-2 text-sm">
                <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <span>Deleted in this window</span>
                    <span class="tabular-nums">{{ number_format($deletions['count']) }}</span>
                </div>
                <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <span>Average time they stayed</span>
                    <span class="tabular-nums">
                        {{ $deletions['averageDays'] !== null ? round($deletions['averageDays']) . ' days' : '-' }}
                    </span>
                </div>
                <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                    <span>Were paying when they left</span>
                    <span class="tabular-nums">{{ number_format($deletions['werePaying']) }}</span>
                </div>
            </div>
        </div>
    </div>

    @if (! empty($errors))
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Screens that crashed</h2>
            <p class="mt-1 text-xs text-muted">Any of these is worth looking at. They should be empty.</p>

            <div class="mt-4 space-y-2">
                @foreach ($errors as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span>{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['total']) }}
                            <span class="text-xs text-muted">/ {{ number_format($row['people']) }} people</span>
                        </span>
                    </div>
                @endforeach
            </div>
        </div>
    @endif

    <div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted">
        <span class="font-semibold text-content">What this cannot tell you:</span>
        whether a reminder was ever shown. Android gives no callback when a notification is
        delivered, so the only thing countable is a reminder somebody tapped.
    </div>

    @include('livewire.admin.reports._glossary')
</div>
