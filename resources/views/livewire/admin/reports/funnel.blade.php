<div class="space-y-6">

    @include('livewire.admin.reports._header', [
        'title' => 'Funnel',
        'question' => 'Of the people who joined in ' . $windowLabel . ', where do they stop?',
        'exportReport' => 'users',
    ])

    <div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted">
        A funnel follows one group of people through the app in order. The window picks the
        group - everyone who created an account in {{ $windowLabel }} - and each step below then
        counts whatever they have done since, however long ago that was.
        <span class="text-dim">Only people who created an account are counted: someone who
        looked round the app and left never had a name to follow.</span>
    </div>

    @if ($cohort === 0)
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p class="text-sm font-semibold">Nobody joined in this window</p>
            <p class="mt-1 text-sm text-muted">
                There is no group to follow, so there is nothing to show. Try a longer window.
            </p>
        </div>
    @else
        <div class="rounded-2xl border border-white/5 bg-surface p-5">
            @foreach ($rows as $row)
                @if ($row['sentence'])
                    {{-- The drop happens BETWEEN two rows, so the sentence
                         explaining it belongs between them too. --}}
                    <p class="py-2 pl-1 text-xs text-dim">{{ $row['sentence'] }}</p>
                @endif

                <div class="{{ $loop->first ? '' : 'mt-1' }}">
                    <div class="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span class="font-semibold">{{ $row['label'] }}</span>
                        <span class="tabular-nums">
                            {{ number_format($row['value']) }}
                            <span class="ml-1 text-xs text-muted">{{ $row['pct'] }}% of the group</span>
                            @if (! $loop->first && $row['delta']['dir'] !== 'flat')
                                <span class="ml-1 text-[10px] font-semibold {{ $row['delta']['dir'] === 'up' ? 'text-success' : 'text-muted' }}"
                                      title="{{ $row['delta']['text'] }}">
                                    {{ $row['delta']['dir'] === 'up' ? '▲' : '▼' }}{{ $row['delta']['pct'] !== null ? abs($row['delta']['pct']) . '%' : '' }}
                                </span>
                            @endif
                        </span>
                    </div>
                    <div class="h-2.5 overflow-hidden rounded-full bg-white/5">
                        <div class="h-full rounded-full bg-accent" style="width: {{ max(1, $row['pct']) }}%"></div>
                    </div>
                </div>
            @endforeach
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p class="text-sm font-semibold">What this cannot tell you</p>
            <ul class="mt-2 space-y-1 text-sm text-muted">
                <li>Anyone who used the app without signing up is invisible here. Nothing links what they did to a name.</li>
                <li>Accounts from before the app started reporting behaviour are counted from what the database already held: finished first-run, lessons ticked off, workouts recorded, a subscription that was never a trial.</li>
                <li>Steps are not exclusive. Somebody who paid also trained, and both rows count them.</li>
            </ul>
        </div>
    @endif

    @include('livewire.admin.reports._glossary')
</div>
