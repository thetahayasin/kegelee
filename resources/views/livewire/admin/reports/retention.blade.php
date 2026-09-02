<div class="space-y-6">

    @include('livewire.admin.reports._header', [
        'title' => 'Coming back',
        'question' => 'Do people come back after they join?',
        'exportReport' => 'users',
    ])

    @unless ($hasAnybody)
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p class="text-sm font-semibold">Nobody has joined recently</p>
            <p class="mt-1 text-sm text-muted">
                This page follows people from the week they joined, so it needs some joiners first.
            </p>
        </div>
    @endunless

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        @foreach ($cards as $card)
            <x-admin.stat :label="$card['label']" :value="$card['value']" :detail="$card['detail']"
                          :delta="$card['delta']" :means="$card['means']" :ifLow="$card['ifLow']" />
        @endforeach
    </div>

    {{-- ─── Week by week ──────────────────────────────────────────────────── --}}
    <div class="rounded-2xl border border-white/5 bg-surface p-5">
        <div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <p class="font-semibold">Week by week</p>
            <p class="text-xs text-muted">The group who joined that week, and how many came back</p>
        </div>
        <p class="mb-4 text-xs leading-relaxed text-dim">
            "About a week later" means any day from five to nine days after joining, and "about a
            month" any day from 25 to 35. Exact days are too sharp at this size - somebody who came
            back on the Saturday rather than the Friday is the same good news. A dash means that
            week has not had the time yet, which is not the same as nobody coming back.
        </p>

        <div class="overflow-x-auto">
            <table class="admin-table w-full min-w-[34rem] text-sm">
                <thead class="text-left text-muted">
                    <tr class="border-b border-white/5">
                        <th class="p-3 font-medium">Joined week of</th>
                        <th class="p-3 font-medium text-right">People</th>
                        <th class="p-3 font-medium text-right">Next day</th>
                        <th class="p-3 font-medium text-right">About a week</th>
                        <th class="p-3 font-medium text-right">About a month</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($weeks as $week)
                        <tr class="border-b border-white/5 last:border-0">
                            <td class="p-3">{{ $week['week'] }}</td>
                            <td class="p-3 text-right tabular-nums">{{ $week['people'] }}</td>
                            @foreach (['day1', 'day7', 'day30'] as $key)
                                @php($cell = $week['checks'][$key])
                                {{-- Shading rather than a chart: the whole point
                                     of this table is spotting a row that is
                                     darker or paler than the ones around it. --}}
                                <td class="p-3 text-right tabular-nums"
                                    @if ($cell['pct'] !== null)
                                        style="background: rgba(193,255,114,{{ min(0.28, $cell['pct'] / 320) }})"
                                    @endif>
                                    @if ($cell['pct'] === null)
                                        <span class="text-dim">-</span>
                                    @else
                                        {{ $cell['pct'] }}%
                                        <span class="text-[10px] text-muted">{{ $cell['count'] }}/{{ $cell['ready'] }}</span>
                                    @endif
                                </td>
                            @endforeach
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>

        <p class="mt-4 text-xs leading-relaxed text-muted">
            A week where fewer than 2 in 10 come back after seven days usually means the reminders
            never got set. Check Engagement, under Reminders.
        </p>
    </div>

    @include('livewire.admin.reports._glossary')
</div>
