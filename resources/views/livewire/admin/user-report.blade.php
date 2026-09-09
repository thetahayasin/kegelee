{{-- Everything known about one person.

     Read top to bottom it answers three questions in order: is this account
     all right (the strip), what have they been doing (activity, then the
     timeline), and what happened with their money and their progress. That
     order is the page's whole structure - it used to be nine identical cards
     in source order, which meant the answer to every question was "read all of
     it".

     Every subscription figure goes through the same scopes the dashboard and
     the reports use, so it cannot contradict them. Where a number rests on an
     assumption (list prices, whose midnight a day is cut at) the assumption is
     printed next to it rather than left to be discovered.

     Every timestamp goes through <x-admin.when>, which prints it on the
     account's clock and on the reader's. --}}
@php
    // Fully qualified rather than imported: a Blade `use` sits wherever the
    // compiler happens to place the block, which is not reliably a file's
    // outermost scope.
    $E = \App\Models\UserEvent::class;

    // Line art, 24x24, stroked with currentColor - the same shape language as
    // the sidebar. No emoji: they render as somebody else's artwork at a size
    // nobody chose, and they carry a skin tone and a gender the account did
    // not ask for.
    $areaIcons = [
        $E::AREA_TRAINING => '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        $E::AREA_MONEY => '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
        $E::AREA_LEARNING => '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        $E::AREA_ONBOARDING => '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
        $E::AREA_ACCOUNT => '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        $E::AREA_SETTINGS => '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    ];

    // Area is carried by the icon SHAPE and by the heading its filter chip
    // sits under - not by a colour. Six tints would have meant six things to
    // learn before the list could be read, and a palette this page does not
    // otherwise own. Colour here says one thing only: something went wrong,
    // and the row's own label says that in words too.

    $userToday = \Illuminate\Support\Carbon::today($zones['user']);
@endphp

<div class="space-y-5">

    {{-- ═══ Who ═══════════════════════════════════════════════════════════ --}}
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
            <a href="{{ route('admin.users') }}"
               class="mb-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-content">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                All users
            </a>
            <h1 class="truncate text-2xl font-bold">{{ $user->name ?: 'No name' }}</h1>
            <p class="mt-0.5 truncate text-sm text-muted">{{ $user->email }}</p>

            {{-- Said once, here, so that a hundred timeline rows below do not
                 each have to carry the words "their time" and "your time".
                 Every timestamp on the page prints theirs on top and yours
                 underneath, in that order, and drops the second line when the
                 two would read the same. --}}
            <p class="mt-1.5 text-[11px] leading-relaxed text-dim">
                @if ($zones['user'] === $zones['admin'])
                    Times below are {{ $zones['user'] }} &mdash; their clock and yours are the same.
                @else
                    Times below: <span class="font-semibold text-muted">{{ $zones['user'] }}</span> (theirs, on top),
                    then <span class="font-semibold text-muted">{{ $zones['admin'] }}</span> (yours, underneath).
                @endif
                @unless ($user->timezone)
                    This account has never told us where it is, so theirs falls back to {{ config('app.timezone') }}.
                @endunless
            </p>
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

    {{-- ═══ Is this account all right ═════════════════════════════════════
         Five figures, above everything else, so the common case - somebody
         opens this page to check one thing - is answered without scrolling
         past a screenful of cards to find it. --}}
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <x-admin.kpi
            label="Access"
            :value="$entitlement['viaAdmin'] ? 'Admin' : ($entitlement['subscribed'] ? 'Subscribed' : 'Free')"
            :tone="$entitlement['subscribed'] ? 'good' : null"
            :detail="$entitlement['viaAdmin']
                ? 'Bypasses the paywall, not a sale'
                : ($entitlement['subscription']?->plan?->name ?? 'No subscription right now')" />

        <x-admin.kpi
            label="Streak"
            :value="$training['currentStreak']"
            :tone="$training['currentStreak'] > 0 ? 'good' : null"
            :detail="$training['currentStreak'] === 1 ? 'day in a row' : 'days in a row'" />

        <x-admin.kpi
            label="Days trained"
            :value="number_format($training['daysTrained'])"
            detail="Days closed out in full" />

        <x-admin.kpi
            label="Workouts"
            :value="number_format($training['finished'])"
            :detail="$training['completionRate'] === null
                ? 'Nothing started yet'
                : $training['completionRate'].'% of those started'" />

        <x-admin.kpi
            label="Paid"
            :value="'$'.number_format($money['total'], 2)"
            :detail="$money['count'].' payment'.($money['count'] === 1 ? '' : 's').', at list price'" />
    </div>

    {{-- ═══ Activity ══════════════════════════════════════════════════════
         Numbers and words. A picture of this would look like more, and every
         question actually asked of a training history - how much, how often,
         when did it stop - is a figure somebody has to read down the phone to
         a customer anyway. --}}
    <x-admin.section title="Activity"
                     :note="'Days are cut at midnight in '.$activity['zone'].', the same boundary the app used'" />

    <div class="grid gap-4 lg:grid-cols-2">
        <x-admin.panel title="How much they train"
                       :subtitle="'The last '.$activity['windowDays'].' days, '.$activity['from'].' to '.$activity['to'].'.'">
            @php
                // "Days with a workout", not "days trained": the strip above
                // already says "days trained" and means something else - days
                // CLOSED OUT in full, over the life of the account. Two
                // figures under one name on one page is how somebody quotes
                // the wrong one down the phone.
                $howMuch = [
                    ['Days with a workout', $activity['daysTrained'].' of '.$activity['windowDays']],
                    ['Workouts finished', number_format($activity['total'])],
                    ['This week', $activity['thisWeek'].' workout'.($activity['thisWeek'] === 1 ? '' : 's')],
                    ['Last week', $activity['lastWeek'].' workout'.($activity['lastWeek'] === 1 ? '' : 's')],
                    ['Usual day', $activity['busiestWeekday'] ?? 'no pattern yet'],
                ];
            @endphp
            @foreach ($howMuch as [$label, $value])
                <div class="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5 last:border-0">
                    <span class="text-xs text-muted">{{ $label }}</span>
                    <span class="text-xs font-semibold tabular-nums">{{ $value }}</span>
                </div>
            @endforeach
        </x-admin.panel>

        <x-admin.panel title="How they train"
                       subtitle="Counted over the whole life of the account, not just the window.">
            @php
                $howThey = [
                    ['Workouts started', number_format($training['started'])],
                    ['Run to the end', $training['completionRate'] === null ? 'nothing yet' : $training['completionRate'].'%'],
                    ['Average length', $training['averageSeconds'] > 0 ? gmdate('i:s', $training['averageSeconds']) : 'nothing yet'],
                    ['Total time', $training['totalSeconds'] > 0 ? round($training['totalSeconds'] / 3600, 1).' hours' : 'nothing yet'],
                    ['Difficulty', $training['level']?->name ?? 'none set'],
                ];
            @endphp
            @foreach ($howThey as [$label, $value])
                <div class="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5">
                    <span class="text-xs text-muted">{{ $label }}</span>
                    <span class="text-xs font-semibold tabular-nums">{{ $value }}</span>
                </div>
            @endforeach

            <div class="space-y-1.5 pt-1.5">
                <div class="flex items-baseline justify-between gap-3">
                    <span class="text-xs text-muted">First session</span>
                    <x-admin.when :at="$training['firstSession']" :zones="$zones" fallback="never"
                                  class="text-xs font-semibold" />
                </div>
                <div class="flex items-baseline justify-between gap-3">
                    <span class="text-xs text-muted">Last finished</span>
                    <x-admin.when :at="$training['lastSession']" :zones="$zones" fallback="never"
                                  class="text-xs font-semibold" />
                </div>
            </div>
        </x-admin.panel>
    </div>

    {{-- ═══ Everything they did ═══════════════════════════════════════════ --}}
    <x-admin.section title="Timeline"
                     :note="'Newest first, gathered into days'" />

    <x-admin.panel :title="$event !== '' ? ($E::LABELS[$event] ?? $event) : 'Everything they did'"
                   :count="number_format($timelineTotal)"
                   :subtitle="$event !== '' ? 'Filtered to one kind of event.' : null">
        <x-slot:actions>
            @if ($event !== '')
                <button type="button" wire:click="filterEvent('{{ $event }}')"
                        class="cursor-pointer rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-white/10">
                    Clear filter
                </button>
            @endif
        </x-slot:actions>

        {{-- Chips built from this account's own rows, so the filter can never
             offer something that returns nothing, and grouped by area so a
             heavy account's forty chips are findable rather than a wall. --}}
        @if ($eventNames->isNotEmpty())
            <div class="mb-4 space-y-2 rounded-xl bg-black/15 p-3">
                @foreach ($eventNames as $group)
                    <div class="flex flex-wrap items-baseline gap-1.5">
                        <span class="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-dim">{{ $group['label'] }}</span>
                        @foreach ($group['rows'] as $row)
                            <button type="button" wire:click="filterEvent('{{ $row->name }}')"
                                    aria-pressed="{{ $event === $row->name ? 'true' : 'false' }}"
                                    class="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors
                                           {{ $event === $row->name
                                                ? 'bg-accent/20 text-accent'
                                                : 'bg-white/5 text-muted hover:bg-white/10 hover:text-content' }}">
                                {{ $E::LABELS[$row->name] ?? $row->name }}
                                <span class="tabular-nums opacity-60">{{ $row->total }}</span>
                            </button>
                        @endforeach
                    </div>
                @endforeach
            </div>
        @endif

        @forelse ($timeline as $day => $events)
            @php
                $dayDate = \Illuminate\Support\Carbon::parse($day);
                // Cast: Carbon 3 returns a float here, and 0.0 is not === 0.
                $dayOffset = (int) $dayDate->diffInDays($userToday, absolute: false);
                $relative = match (true) {
                    $dayOffset === 0 => 'today',
                    $dayOffset === 1 => 'yesterday',
                    default => null,
                };
            @endphp

            {{-- The day is a heading, not a column. Repeating the same date
                 down the left of twelve consecutive rows spends the widest
                 thing on the row saying what the row above already said. --}}
            <div class="mb-1 mt-4 flex items-baseline gap-2 border-t border-white/5 pt-2 first:mt-0 first:border-0 first:pt-0">
                <h4 class="text-xs font-bold">{{ $dayDate->format('D j M Y') }}</h4>
                @if ($relative)
                    <span class="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{{ $relative }}</span>
                @endif
                <span class="h-px flex-1 bg-white/5" aria-hidden="true"></span>
                <span class="shrink-0 text-[10px] tabular-nums text-dim">{{ $events->count() }}</span>
            </div>

            @foreach ($events as $ev)
                <div class="flex items-start gap-2.5 py-1 pl-1" title="{{ $ev->description }}">
                    <span class="mt-0.5 shrink-0 {{ $ev->tone === $E::TONE_BAD ? 'text-amber-400' : 'text-dim' }}">
                        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor"
                             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            {!! $areaIcons[$ev->area] ?? $areaIcons[$E::AREA_SETTINGS] !!}
                        </svg>
                    </span>

                    <span class="w-24 shrink-0 text-[11px] tabular-nums text-dim">
                        {{ $ev->occurred_at->copy()->setTimezone($zones['user'])->format('g:i a') }}
                    </span>

                    <span class="min-w-0 flex-1">
                        <span class="text-xs font-semibold">{{ $ev->label }}</span>
                        @if ($ev->subject)
                            <span class="ml-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted">{{ $ev->subject }}</span>
                        @endif
                        @if ($ev->detail_label)
                            <span class="ml-1.5 text-[11px] text-dim">{{ $ev->detail_label }}</span>
                        @endif
                    </span>

                    {{-- Their clock is the row; yours is here, and only when
                         the two differ. --}}
                    @if ($zones['user'] !== $zones['admin'])
                        <span class="shrink-0 text-[10px] tabular-nums text-dim/70">
                            {{ $ev->occurred_at->copy()->setTimezone($zones['admin'])->format('g:i a') }}
                        </span>
                    @endif
                </div>
            @endforeach
        @empty
            <p class="text-xs text-dim">Nothing recorded.</p>
        @endforelse

        @if ($timelineTotal > $timelineShown)
            <button type="button" wire:click="showMoreTimeline"
                    class="mt-4 cursor-pointer rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-muted transition-colors hover:bg-white/10 hover:text-content">
                Show more ({{ number_format($timelineTotal - $timelineShown) }} older)
            </button>
        @endif
    </x-admin.panel>

    {{-- ═══ Access and money ══════════════════════════════════════════════ --}}
    <x-admin.section title="Access and money"
                     note="List prices, before Google's cut, before tax and before refunds" />

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
                    <p class="text-xs text-muted">{{ $sub->willRenew() ? 'Renews' : 'Ends' }}</p>
                    <p class="text-sm font-semibold">
                        <x-admin.when :at="$sub->ends_at" :zones="$zones" fallback="no end date" />
                    </p>
                    @if (! $sub->willRenew())
                        <p class="mt-0.5 text-[11px] text-dim">Auto-renew is off, access runs to the date above</p>
                    @endif
                </div>
            @endif
        </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
        <x-admin.panel title="Subscription history" :count="$subscriptions->count()">
            <div class="space-y-2">
                @forelse ($subscriptions as $row)
                    @php
                        $colour = match ($row->effective_status) {
                            'active' => 'text-success',
                            'in_trial' => 'text-accent',
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
                            <span class="flex items-start gap-1.5 text-[11px] text-dim">
                                <x-admin.when :at="$row->started_at" :zones="$zones" :with-time="false" fallback="?" />
                                <span class="leading-tight">&rarr;</span>
                                <x-admin.when :at="$row->ends_at" :zones="$zones" :with-time="false" fallback="open" />
                            </span>
                        </div>
                        <p class="mt-0.5 text-[11px] text-muted">
                            {{ $row->plan?->name ?? 'no plan' }}
                            @if ($row->store) · {{ $row->store }} @endif
                            @if ($row->store_state) · store says {{ $row->store_state }} @endif
                        </p>
                        @if ($row->effective_status !== $row->status)
                            {{-- The column and the dates disagree, which means
                                 an expiry event never arrived. Say so here
                                 rather than quietly showing the corrected
                                 value. --}}
                            <p class="mt-0.5 text-[10px] text-amber-400/80">
                                Row still says "{{ $row->status }}"; its period ended, so no expiry event was received.
                            </p>
                        @endif
                    </div>
                @empty
                    <p class="text-xs text-dim">Never subscribed.</p>
                @endforelse
            </div>
        </x-admin.panel>

        <x-admin.panel title="Payments" :count="$money['count']"
                       subtitle="A trial start is not counted; the first renewal after one is.">
            <div class="mb-3 grid grid-cols-2 gap-2">
                <div class="rounded-xl bg-black/15 px-3 py-2">
                    <p class="text-[10px] font-semibold uppercase tracking-wide text-dim">Paid to date</p>
                    <p class="mt-0.5 text-lg font-black tabular-nums">${{ number_format($money['total'], 2) }}</p>
                </div>
                <div class="rounded-xl bg-black/15 px-3 py-2">
                    <p class="text-[10px] font-semibold uppercase tracking-wide text-dim">Per month</p>
                    <p class="mt-0.5 text-lg font-black tabular-nums">${{ number_format($money['perMonth'], 2) }}</p>
                </div>
            </div>

            @if ($money['unpriced'] > 0)
                <p class="mb-2 text-[11px] text-amber-400/80">
                    {{ $money['unpriced'] }} payment{{ $money['unpriced'] === 1 ? '' : 's' }} named a plan that no longer exists and priced at zero, so the total above is an understatement.
                </p>
            @endif

            @forelse ($money['payments']->reverse()->take(12) as $payment)
                <div class="flex items-start justify-between gap-3 border-l border-white/10 py-1.5 pl-3">
                    <x-admin.when :at="$payment->occurred_at" :zones="$zones" :with-time="false" class="text-[11px] text-dim" />
                    <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ $payment->label }}</span>
                    <span class="shrink-0 text-xs text-muted">{{ $payment->subject ?: 'unknown plan' }}</span>
                </div>
            @empty
                <p class="text-xs text-dim">Nothing has been charged.</p>
            @endforelse

            @if ($money['count'] > 12)
                <p class="mt-2 text-[11px] text-dim">Showing the most recent 12 of {{ $money['count'] }}.</p>
            @endif
        </x-admin.panel>
    </div>

    {{-- ═══ Progress ══════════════════════════════════════════════════════ --}}
    <x-admin.section title="Progress" />

    <div class="grid gap-4 lg:grid-cols-2">
        <x-admin.panel title="Hold strength" :count="$measurements['rows']->count()"
                       subtitle="How long they can hold, every time they have measured it.">
            @if ($measurements['rows']->isEmpty())
                <p class="text-xs text-dim">Never measured.</p>
            @else
                @foreach ([
                    ['First', round((float) $measurements['first']->seconds, 1).'s'],
                    ['Latest', round((float) $measurements['latest']->seconds, 1).'s'],
                    ['Best', round((float) $measurements['best'], 1).'s'],
                ] as [$label, $value])
                    <div class="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5">
                        <span class="text-xs text-muted">{{ $label }}</span>
                        <span class="text-xs font-semibold tabular-nums">{{ $value }}</span>
                    </div>
                @endforeach

                <div class="flex items-baseline justify-between gap-3 py-1.5">
                    <span class="text-xs text-muted">Change since first</span>
                    <span class="text-xs font-semibold tabular-nums {{ ($measurements['change'] ?? 0) > 0 ? 'text-success' : '' }}">
                        @if ($measurements['change'] === null)
                            only one reading
                        @else
                            {{ $measurements['change'] > 0 ? '+' : '' }}{{ round($measurements['change'], 1) }}s
                        @endif
                    </span>
                </div>

                {{-- The readings themselves, newest first. Five is enough to
                     see whether the latest figure is a trend or a bad day,
                     which is the only reason to look past the summary. --}}
                <p class="mb-1 mt-3 text-[11px] font-semibold text-muted">Most recent readings</p>
                @foreach ($measurements['rows']->reverse()->take(5) as $m)
                    <div class="flex items-start justify-between gap-3 border-l border-white/10 py-1 pl-3">
                        <x-admin.when :at="$m->measured_at" :zones="$zones" :with-time="false" class="text-[11px] text-dim" />
                        <span class="shrink-0 text-xs font-semibold tabular-nums">{{ round((float) $m->seconds, 1) }}s</span>
                    </div>
                @endforeach
            @endif
        </x-admin.panel>

        <x-admin.panel title="Lessons finished" :count="$lessons->count()">
            @forelse ($lessons->take(10) as $lesson)
                <div class="flex items-start justify-between gap-3 py-1">
                    <span class="min-w-0 flex-1 truncate text-xs">{{ $lesson->title }}</span>
                    <x-admin.when :at="$lesson->pivot?->completed_at" :zones="$zones" :with-time="false"
                                  fallback="" class="shrink-0 text-[11px] text-dim" />
                </div>
            @empty
                <p class="text-xs text-dim">None yet.</p>
            @endforelse

            @if ($lessons->count() > 10)
                <p class="mt-2 text-[11px] text-dim">Showing the most recent 10 of {{ $lessons->count() }}.</p>
            @endif
        </x-admin.panel>
    </div>

    {{-- ═══ Account ═══════════════════════════════════════════════════════ --}}
    <x-admin.section title="Account" />

    <div class="grid gap-4 lg:grid-cols-2">
        <x-admin.panel title="Facts">
            <div class="space-y-1.5">
                <div class="flex items-baseline justify-between gap-3">
                    <span class="text-xs text-muted">Joined</span>
                    <x-admin.when :at="$user->created_at" :zones="$zones" fallback="?" class="text-xs font-semibold" />
                </div>
                <div class="flex items-baseline justify-between gap-3">
                    <span class="text-xs text-muted">Last seen</span>
                    <x-admin.when :at="$user->last_seen_at" :zones="$zones" fallback="never" class="text-xs font-semibold" />
                </div>
                @foreach ([
                    ['Their timezone', $user->timezone ?: 'never reported'],
                    ['Onboarding', $user->onboarding_completed_at ? 'finished' : ($user->onboarding_skipped ? 'skipped' : 'not finished')],
                    ['Quiz level', $user->onboarding_level ?: 'none recorded'],
                ] as [$label, $value])
                    <div class="flex items-baseline justify-between gap-3">
                        <span class="text-xs text-muted">{{ $label }}</span>
                        <span class="text-xs font-semibold">{{ $value }}</span>
                    </div>
                @endforeach
            </div>
        </x-admin.panel>

        <x-admin.panel title="Devices" :count="$devices->count()">
            @forelse ($devices as $device)
                <div class="flex items-start justify-between gap-3 border-b border-white/5 py-1.5 last:border-0">
                    <span class="min-w-0 flex-1 truncate text-xs">{{ $device->summary ?: 'unknown device' }}</span>
                    <x-admin.when :at="$device->last_seen_at" :zones="$zones" fallback="never"
                                  class="shrink-0 text-[11px] text-dim" />
                </div>
            @empty
                <p class="text-xs text-dim">No device has ever synced.</p>
            @endforelse
        </x-admin.panel>
    </div>
</div>
