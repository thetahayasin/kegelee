{{-- Everything known about one person.

     Every subscription figure on this page goes through the same scopes the
     dashboard and the reports use, so it cannot contradict them. Where a
     number rests on an assumption (list prices, UTC day boundaries) the
     assumption is printed next to it rather than left to be discovered. --}}
<div class="space-y-5">

    {{-- ─── Who ──────────────────────────────────────────────────────────── --}}
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
            <a href="{{ route('admin.users') }}"
               class="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-content transition-colors">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                All users
            </a>
            <h1 class="truncate text-2xl font-bold">{{ $user->name ?: 'No name' }}</h1>
            <p class="mt-0.5 truncate text-sm text-muted">{{ $user->email }}</p>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
            @if ($user->is_admin)
                <span class="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent">Admin</span>
            @endif
            @if ($user->email_verified_at)
                <span class="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">Verified</span>
            @else
                <span class="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-muted">Unverified</span>
            @endif
            @if ($user->google_id)
                <span class="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-muted">Google sign-in</span>
            @endif
        </div>
    </div>

    {{-- ─── Access right now ─────────────────────────────────────────────── --}}
    @php $sub = $entitlement['subscription']; @endphp
    <div class="rounded-2xl border {{ $entitlement['subscribed'] ? 'border-success/25 bg-success/5' : 'border-white/5 bg-surface-2/60' }} p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">Access right now</p>
                <p class="mt-1 text-lg font-bold {{ $entitlement['subscribed'] ? 'text-success' : 'text-muted' }}">
                    @if ($entitlement['viaAdmin'])
                        Full access, as an admin
                    @elseif ($entitlement['subscribed'])
                        Subscribed{{ $sub?->plan ? ' · '.$sub->plan->name : '' }}
                    @else
                        No subscription
                    @endif
                </p>
                @if ($entitlement['viaAdmin'])
                    <p class="mt-1 text-xs text-dim">An admin bypasses the paywall to preview the app. This is not a sale.</p>
                @endif
            </div>

            @if ($sub)
                <div class="text-right">
                    <p class="text-xs text-muted">
                        {{ $sub->willRenew() ? 'Renews' : 'Ends' }}
                    </p>
                    <p class="text-sm font-semibold tabular-nums">
                        {{ $sub->ends_at?->format('j M Y') ?? 'no end date' }}
                    </p>
                    @if (! $sub->willRenew())
                        <p class="mt-0.5 text-[11px] text-dim">Auto-renew is off, access runs to the date above</p>
                    @endif
                </div>
            @endif
        </div>
    </div>

    {{-- ─── The four numbers worth seeing first ──────────────────────────── --}}
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        @php
            $tiles = [
                ['Paid to date', '$'.number_format($money['total'], 2), $money['count'].' payment'.($money['count'] === 1 ? '' : 's')],
                ['Per month', '$'.number_format($money['perMonth'], 2), 'averaged over the life of the account'],
                ['Days trained', number_format($training['daysTrained']), $training['finished'].' workouts finished'],
                ['Current streak', $training['currentStreak'].' day'.($training['currentStreak'] === 1 ? '' : 's'), $training['level']?->name ?? 'no level set'],
            ];
        @endphp
        @foreach ($tiles as [$label, $value, $note])
            <div class="rounded-2xl border border-white/5 bg-surface-2/60 p-4">
                <p class="text-xs font-semibold uppercase tracking-wide text-muted">{{ $label }}</p>
                <p class="mt-1.5 text-2xl font-bold tabular-nums">{{ $value }}</p>
                <p class="mt-1 text-[11px] text-dim">{{ $note }}</p>
            </div>
        @endforeach
    </div>

    {{-- ─── Activity ─────────────────────────────────────────────────────── --}}
    @php $chartMax = max(1, $activity->max('value')); @endphp
    <div class="rounded-2xl border border-white/5 bg-surface-2/60 p-4">
        <div class="mb-3 flex items-baseline justify-between gap-3">
            <div>
                <h2 class="text-sm font-bold">Workouts finished</h2>
                <p class="text-[11px] text-dim">The last 90 days. Days are UTC, not this person's own timezone, so a late-night session can land on the day before.</p>
            </div>
            <span class="text-xs tabular-nums text-muted">{{ $activity->sum('value') }} in 90 days</span>
        </div>

        <div class="flex h-24 items-end gap-px">
            @foreach ($activity as $day)
                <div class="group relative flex-1" title="{{ $day['label'] }}: {{ $day['value'] }}">
                    <div class="w-full rounded-sm {{ $day['value'] > 0 ? 'bg-accent/70' : 'bg-white/5' }} transition-colors group-hover:bg-accent"
                         style="height: {{ $day['value'] > 0 ? max(6, (int) round($day['value'] / $chartMax * 96)) : 2 }}px"></div>
                </div>
            @endforeach
        </div>
        <div class="mt-1.5 flex justify-between text-[10px] text-dim">
            <span>{{ $activity->first()['label'] }}</span>
            <span>{{ $activity->last()['label'] }}</span>
        </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
        {{-- ─── Subscription history ─────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/5 bg-surface-2/60 p-4">
            <h2 class="mb-3 text-sm font-bold">Subscriptions</h2>

            @forelse ($subscriptions as $row)
                @php
                    $colour = match ($row->effective_status) {
                        'active' => 'text-success',
                        'trialing' => 'text-accent',
                        'past_due' => 'text-amber-400',
                        'canceled' => 'text-muted',
                        default => 'text-dim',
                    };
                @endphp
                <div class="border-l border-white/10 py-2 pl-3">
                    <div class="flex flex-wrap items-baseline justify-between gap-2">
                        <span class="text-xs font-semibold {{ $colour }}">
                            {{ ucfirst(str_replace('_', ' ', $row->effective_status)) }}
                        </span>
                        <span class="text-[11px] tabular-nums text-dim">
                            {{ $row->started_at?->format('j M Y') ?? '?' }} &rarr; {{ $row->ends_at?->format('j M Y') ?? 'open' }}
                        </span>
                    </div>
                    <p class="mt-0.5 text-[11px] text-muted">
                        {{ $row->plan?->name ?? 'no plan' }}
                        @if ($row->store) · {{ $row->store }} @endif
                        @if ($row->store_state) · store says {{ $row->store_state }} @endif
                    </p>
                    @if ($row->effective_status !== $row->status)
                        {{-- The column and the dates disagree, which means an
                             expiry event never arrived. Say so here rather
                             than quietly showing the corrected value. --}}
                        <p class="mt-0.5 text-[10px] text-amber-400/80">
                            Row still says "{{ $row->status }}"; its period ended, so no expiry event was received.
                        </p>
                    @endif
                </div>
            @empty
                <p class="text-xs text-dim">Never subscribed.</p>
            @endforelse
        </div>

        {{-- ─── Payments ─────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/5 bg-surface-2/60 p-4">
            <div class="mb-3">
                <h2 class="text-sm font-bold">Payments</h2>
                <p class="text-[11px] text-dim">
                    List prices, before Google's cut, before tax and before refunds. A trial start is not counted; the first renewal after one is.
                </p>
            </div>

            @if ($money['unpriced'] > 0)
                <p class="mb-2 text-[11px] text-amber-400/80">
                    {{ $money['unpriced'] }} payment{{ $money['unpriced'] === 1 ? '' : 's' }} named a plan that no longer exists and priced at zero, so the total above is an understatement.
                </p>
            @endif

            @forelse ($money['payments']->reverse()->take(12) as $payment)
                <div class="flex items-baseline justify-between gap-3 border-l border-white/10 py-1.5 pl-3">
                    <span class="text-[11px] tabular-nums text-dim">{{ $payment->occurred_at->format('j M Y') }}</span>
                    <span class="text-xs font-medium">{{ $payment->label }}</span>
                    <span class="ml-auto text-xs tabular-nums text-muted">{{ $payment->subject ?: 'unknown plan' }}</span>
                </div>
            @empty
                <p class="text-xs text-dim">Nothing has been charged.</p>
            @endforelse

            @if ($money['count'] > 12)
                <p class="mt-2 text-[11px] text-dim">Showing the most recent 12 of {{ $money['count'] }}.</p>
            @endif
        </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
        {{-- ─── Training ─────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/5 bg-surface-2/60 p-4">
            <h2 class="mb-3 text-sm font-bold">Training</h2>
            @php
                $rows = [
                    ['Workouts started', number_format($training['started'])],
                    ['Workouts finished', number_format($training['finished'])],
                    ['Run to the end', $training['completionRate'] === null ? 'nothing yet' : $training['completionRate'].'%'],
                    ['Average length', $training['averageSeconds'] > 0 ? gmdate('i:s', $training['averageSeconds']) : 'nothing yet'],
                    ['Total time', $training['totalSeconds'] > 0 ? round($training['totalSeconds'] / 3600, 1).' hours' : 'nothing yet'],
                    ['First session', $training['firstSession'] ? \Illuminate\Support\Carbon::parse($training['firstSession'])->format('j M Y') : 'never'],
                    ['Last finished', $training['lastSession'] ? \Illuminate\Support\Carbon::parse($training['lastSession'])->format('j M Y') : 'never'],
                ];
            @endphp
            @foreach ($rows as [$label, $value])
                <div class="flex items-baseline justify-between gap-3 py-1">
                    <span class="text-xs text-muted">{{ $label }}</span>
                    <span class="text-xs font-semibold tabular-nums">{{ $value }}</span>
                </div>
            @endforeach
        </div>

        {{-- ─── Measurements ─────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/5 bg-surface-2/60 p-4">
            <h2 class="mb-1 text-sm font-bold">Hold strength</h2>
            <p class="mb-3 text-[11px] text-dim">Every measurement they have taken, oldest first.</p>

            @if ($measurements['rows']->isEmpty())
                <p class="text-xs text-dim">Never measured.</p>
            @else
                @php $best = max(1, (float) $measurements['best']); @endphp
                <div class="flex h-16 items-end gap-1">
                    {{-- Capped width: somebody with three readings would
                         otherwise get three bars a third of the card wide,
                         which reads as a design accident rather than as three
                         measurements. --}}
                    @foreach ($measurements['rows']->take(-40) as $m)
                        <div class="min-w-[3px] max-w-[28px] flex-1 rounded-sm bg-accent/60"
                             title="{{ $m->measured_at?->format('j M Y') }}: {{ round($m->seconds, 1) }}s"
                             style="height: {{ max(4, (int) round($m->seconds / $best * 64)) }}px"></div>
                    @endforeach
                </div>

                <div class="mt-3 space-y-1">
                    <div class="flex items-baseline justify-between gap-3">
                        <span class="text-xs text-muted">First</span>
                        <span class="text-xs font-semibold tabular-nums">{{ round((float) $measurements['first']->seconds, 1) }}s</span>
                    </div>
                    <div class="flex items-baseline justify-between gap-3">
                        <span class="text-xs text-muted">Best</span>
                        <span class="text-xs font-semibold tabular-nums">{{ round((float) $measurements['best'], 1) }}s</span>
                    </div>
                    <div class="flex items-baseline justify-between gap-3">
                        <span class="text-xs text-muted">Change since first</span>
                        <span class="text-xs font-semibold tabular-nums {{ ($measurements['change'] ?? 0) > 0 ? 'text-success' : '' }}">
                            @if ($measurements['change'] === null)
                                only one reading
                            @else
                                {{ $measurements['change'] > 0 ? '+' : '' }}{{ round($measurements['change'], 1) }}s
                            @endif
                        </span>
                    </div>
                </div>
            @endif
        </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
        {{-- ─── Knowledge ────────────────────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/5 bg-surface-2/60 p-4">
            <h2 class="mb-3 text-sm font-bold">Lessons finished <span class="text-muted">({{ $lessons->count() }})</span></h2>
            @forelse ($lessons->take(10) as $lesson)
                <div class="flex items-baseline justify-between gap-3 py-1">
                    <span class="truncate text-xs">{{ $lesson->title }}</span>
                    <span class="shrink-0 text-[11px] tabular-nums text-dim">
                        {{ $lesson->pivot?->completed_at ? \Illuminate\Support\Carbon::parse($lesson->pivot->completed_at)->format('j M Y') : '' }}
                    </span>
                </div>
            @empty
                <p class="text-xs text-dim">None yet.</p>
            @endforelse
        </div>

        {{-- ─── Devices + account facts ──────────────────────────────────── --}}
        <div class="rounded-2xl border border-white/5 bg-surface-2/60 p-4">
            <h2 class="mb-3 text-sm font-bold">Account</h2>
            @php
                $facts = [
                    ['Joined', $user->created_at?->format('j M Y') ?? '?'],
                    ['Last seen', $user->last_seen_at?->diffForHumans() ?? 'never'],
                    ['Their timezone', $user->timezone ?: 'not set'],
                    ['Onboarding', $user->onboarding_completed_at ? 'finished' : ($user->onboarding_skipped ? 'skipped' : 'not finished')],
                    ['Quiz level', $user->onboarding_level ?: 'none recorded'],
                ];
            @endphp
            @foreach ($facts as [$label, $value])
                <div class="flex items-baseline justify-between gap-3 py-1">
                    <span class="text-xs text-muted">{{ $label }}</span>
                    <span class="text-xs font-semibold">{{ $value }}</span>
                </div>
            @endforeach

            @if ($devices->isNotEmpty())
                <p class="mt-3 mb-1 text-xs font-semibold text-muted">Devices</p>
                @foreach ($devices as $device)
                    <p class="text-[11px] text-dim">
                        {{ $device->summary ?: 'unknown device' }}
                        <span class="text-muted">· last seen {{ $device->last_seen_at?->diffForHumans() ?? 'never' }}</span>
                    </p>
                @endforeach
            @endif
        </div>
    </div>

    {{-- ─── Everything they did ──────────────────────────────────────────── --}}
    <div class="rounded-2xl border border-white/5 bg-surface-2/60 p-4">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-sm font-bold">Timeline <span class="text-muted">({{ number_format($timelineTotal) }})</span></h2>
            @if ($event !== '')
                <button type="button" wire:click="filterEvent('{{ $event }}')"
                        class="text-[11px] font-semibold text-accent hover:underline">Clear filter</button>
            @endif
        </div>

        {{-- Chips built from this account's own rows, so the filter can never
             offer something that returns nothing. --}}
        <div class="mb-3 flex flex-wrap gap-1.5">
            @foreach ($eventNames as $row)
                <button type="button" wire:click="filterEvent('{{ $row->name }}')"
                        class="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors
                               {{ $event === $row->name ? 'bg-accent/20 text-accent' : 'bg-white/5 text-muted hover:text-content' }}">
                    {{ \App\Models\UserEvent::LABELS[$row->name] ?? $row->name }}
                    <span class="tabular-nums opacity-60">{{ $row->total }}</span>
                </button>
            @endforeach
        </div>

        @forelse ($timeline as $ev)
            <div class="flex flex-wrap items-baseline gap-3 border-l border-white/10 py-1.5 pl-3"
                 title="{{ $ev->description }}">
                <span class="w-32 shrink-0 text-[11px] tabular-nums text-dim">{{ $ev->occurred_at->format('j M Y, H:i') }}</span>
                <span class="text-xs font-semibold">{{ $ev->label }}</span>
                @if ($ev->subject)
                    <span class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted">{{ $ev->subject }}</span>
                @endif
                @if ($ev->detail_label)
                    <span class="text-[11px] text-dim">{{ $ev->detail_label }}</span>
                @endif
            </div>
        @empty
            <p class="text-xs text-dim">Nothing recorded.</p>
        @endforelse

        @if ($timelineTotal > $timeline->count())
            <button type="button" wire:click="showMoreTimeline"
                    class="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-muted hover:text-content transition-colors">
                Show more ({{ number_format($timelineTotal - $timeline->count()) }} older)
            </button>
        @endif
    </div>
</div>
