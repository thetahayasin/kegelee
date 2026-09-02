<div class="space-y-6">

    @include('livewire.admin.reports._header', [
        'title' => 'Money',
        'question' => 'Who pays, where were they standing when they decided, and who stops?',
        'exportReport' => 'subscriptions',
    ])

    @unless ($hasMoneyEvents)
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p class="text-sm font-semibold">Nothing about buying has been reported in this window</p>
            <p class="mt-1 text-sm text-muted">
                The paywall and checkout figures come from the app, so they appear once somebody on
                a build that sends them reaches the paywall. The subscriptions listed at the bottom
                come from the store and are already real.
            </p>
        </div>
    @endunless

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        @foreach ($cards as $card)
            <x-admin.stat :label="$card['label']" :value="$card['value']" :detail="$card['detail']"
                          :delta="$card['delta']" :means="$card['means']" :ifLow="$card['ifLow']" />
        @endforeach
    </div>

    {{-- ─── Where the paywall was opened from ─────────────────────────────── --}}
    <div class="rounded-2xl border border-white/5 bg-surface p-5">
        <div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <p class="font-semibold">Which screen sent them to the paywall</p>
            <p class="text-xs text-muted">And how many of them went on to pay</p>
        </div>
        @if ($sourceSentence)
            <p class="mb-3 text-xs text-dim">{{ $sourceSentence }}</p>
        @endif

        <div class="mt-4 space-y-3">
            @forelse ($bySource as $row)
                <div>
                    <div class="flex items-baseline justify-between gap-3 text-sm">
                        <span class="font-semibold capitalize">{{ $row['label'] }}</span>
                        <span class="tabular-nums">
                            {{ $row['pct'] }}%
                            <span class="text-xs text-muted">{{ $row['bought'] }} of {{ $row['people'] }} people</span>
                        </span>
                    </div>
                    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div class="h-full rounded-full bg-accent" style="width: {{ $row['pct'] }}%"></div>
                    </div>
                </div>
            @empty
                <p class="text-sm text-muted">Nobody has opened the paywall in this window.</p>
            @endforelse
        </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">

        {{-- ─── Plans ─────────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Plans</h2>
            <p class="mt-1 text-xs text-muted">Bought in this window, and live right now.</p>

            <div class="mt-4 space-y-2">
                @forelse ($plans as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span class="font-semibold">{{ $row['label'] }}</span>
                        <span class="tabular-nums">
                            {{ number_format($row['live']) }} live
                            <span class="text-xs text-muted">/ {{ number_format($row['bought']) }} bought</span>
                        </span>
                    </div>
                @empty
                    <p class="text-sm text-muted">No subscriptions on any plan yet.</p>
                @endforelse
            </div>

            @if (! empty($switches))
                <p class="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted">Switching plans</p>
                <div class="mt-2 space-y-2">
                    @foreach ($switches as $row)
                        <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                            <span>{{ $row['label'] }}</span>
                            <span class="tabular-nums">{{ number_format($row['value']) }}</span>
                        </div>
                    @endforeach
                </div>
            @endif
        </div>

        {{-- ─── Failures ──────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Checkouts that did not finish</h2>
            <p class="mt-1 text-xs text-muted">
                Ordinary first. Somebody closing the store sheet is not a fault to fix.
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($failures as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span>{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['value']) }}</span>
                    </div>
                @empty
                    <p class="text-sm text-muted">No failed checkouts in this window.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── Restores ──────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Restoring a purchase</h2>
            <p class="mt-1 text-xs text-muted">
                Tapped {{ \App\Support\Reports\PlainWords::times($restores['attempted']) }} in this window,
                usually after reinstalling or changing phone.
            </p>

            <div class="mt-4 space-y-2">
                @forelse ($restores['outcomes'] as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span>{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['value']) }}</span>
                    </div>
                @empty
                    <p class="text-sm text-muted">Nobody has tried to restore a purchase.</p>
                @endforelse
            </div>
        </div>

        {{-- ─── Endings ───────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 class="text-sm font-bold uppercase tracking-wider text-muted">People who stopped paying</h2>
            <p class="mt-1 text-xs text-muted">
                From what the store told us. {{ number_format($lapsed) }} subscriptions also simply
                ran past their end date in this window.
            </p>

            <div class="mt-4 space-y-2">
                @foreach ($endings as $row)
                    <div class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span>{{ $row['label'] }}</span>
                        <span class="tabular-nums">{{ number_format($row['value']) }}</span>
                    </div>
                @endforeach
            </div>
        </div>
    </div>

    {{-- ─── Recent purchases ──────────────────────────────────────────────── --}}
    <div class="rounded-2xl border border-white/5 bg-surface p-5">
        <p class="font-semibold">The last 25 subscriptions</p>
        <p class="mt-1 text-xs text-muted">
            Real rows, so a number above can be checked against a name.
        </p>

        <div class="mt-4 overflow-x-auto">
            <table class="admin-table w-full min-w-[36rem] text-sm">
                <thead class="text-left text-muted">
                    <tr class="border-b border-white/5">
                        <th class="p-3 font-medium">Person</th>
                        <th class="p-3 font-medium">Plan</th>
                        <th class="p-3 font-medium">State</th>
                        <th class="p-3 font-medium">Started</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($recent as $row)
                        <tr class="border-b border-white/5 last:border-0">
                            <td class="p-3">
                                <a href="{{ route('admin.users', ['search' => $row['email']]) }}"
                                   class="font-medium hover:text-accent-soft transition-colors">{{ $row['name'] }}</a>
                                <p class="text-xs text-muted">{{ $row['email'] }}</p>
                            </td>
                            <td class="p-3">{{ $row['plan'] }}</td>
                            <td class="p-3">
                                {{ ucfirst($row['status']) }}
                                @if ($row['trial'])
                                    <span class="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted">trial</span>
                                @endif
                            </td>
                            <td class="p-3 text-muted">{{ $row['started'] }}</td>
                        </tr>
                    @empty
                        <tr><td colspan="4" class="p-4 text-sm text-muted">No subscriptions recorded yet.</td></tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>

    @include('livewire.admin.reports._glossary')
</div>
