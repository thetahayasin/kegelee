<div class="space-y-6">

    @include('livewire.admin.reports._header', [
        'title' => 'Overview',
        'question' => 'Is the app growing, and is anyone paying?',
        'exportReport' => 'users',
    ])

    @unless ($hasEvents)
        {{-- Said plainly rather than shown as a wall of zeroes. A page of 0%
             looks like a broken report; "nothing has arrived yet" is a fact. --}}
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p class="text-sm font-semibold">No data yet for this window</p>
            <p class="mt-1 text-sm text-muted">
                Behaviour is recorded on the phone and arrives with the next sync, so the
                first figures appear once somebody on a build that sends them opens the app.
                {{ number_format($totalAccounts) }} accounts exist today. The counts below that come
                from the database rather than the app - accounts, workouts, subscriptions - are
                already real.
            </p>
        </div>
    @endunless

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        @foreach ($cards as $card)
            <x-admin.stat :label="$card['label']" :value="$card['value']" :detail="$card['detail']"
                          :delta="$card['delta']" :means="$card['means']" :ifLow="$card['ifLow']" />
        @endforeach
    </div>

    {{-- ─── Money ─────────────────────────────────────────────────────────── --}}
    <div class="rounded-2xl border border-white/5 bg-surface p-5">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
            <div>
                <p class="font-semibold">Money coming in each month</p>
                <p class="text-xs text-muted">List prices, before Google's cut</p>
            </div>
            <p class="text-3xl font-black tabular-nums">
                {{ $money['amount'] > 0 ? number_format($money['amount'], 2) : '-' }}
            </p>
        </div>
        <p class="mt-3 text-xs leading-relaxed text-dim">
            Every paying subscription, with its price spread over the months it covers.
            {{ $money['subscribers'] }} paying {{ \Illuminate\Support\Str::plural('subscription', $money['subscribers']) }} counted.
            Free trials are not in this figure - nobody has paid for one yet - and neither is
            anything Google, tax or a refund takes back out.
        </p>
    </div>

    {{-- ─── The two sentences worth remembering ───────────────────────────── --}}
    <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p class="text-sm font-semibold">Coming back</p>
            <p class="mt-1 text-sm text-muted">{{ $activeSentence }}</p>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p class="text-sm font-semibold">Paying</p>
            <p class="mt-1 text-sm text-muted">{{ $trialSentence }}</p>
        </div>
    </div>

    @include('livewire.admin.reports._glossary')
</div>
