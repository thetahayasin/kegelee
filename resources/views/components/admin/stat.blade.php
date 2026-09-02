@props([
    'label',
    'value',
    'detail' => null,
    // The array from App\Support\Reports\Delta::of(), or null where a
    // comparison would be meaningless (a snapshot of right now).
    'delta' => null,
    // One sentence saying what the number means. Every card has one.
    'means' => null,
    // What to do when it is bad, shown only when it IS bad. A card that always
    // carries advice is a card nobody reads the advice on.
    'ifLow' => null,
])

<div class="stat-card">
    <div class="flex items-start justify-between gap-2">
        <p class="text-sm font-semibold">{{ $label }}</p>

        @if ($delta && $delta['dir'] !== 'flat')
            <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums
                         {{ $delta['dir'] === 'up' ? 'bg-success/15 text-success' : 'bg-white/10 text-muted' }}"
                  title="{{ $delta['text'] }}">
                {{ $delta['dir'] === 'up' ? '▲' : '▼' }}
                {{ $delta['pct'] !== null ? abs($delta['pct']) . '%' : 'new' }}
            </span>
        @elseif ($delta)
            <span class="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-dim"
                  title="{{ $delta['text'] }}">—</span>
        @endif
    </div>

    <p class="mt-2 text-3xl font-black tabular-nums">{{ $value }}</p>

    @if ($detail)
        <p class="mt-0.5 text-xs text-muted">{{ $detail }}</p>
    @endif

    @if ($means)
        <p class="mt-2 text-xs leading-relaxed text-dim">{{ $means }}</p>
    @endif

    @if ($ifLow)
        <p class="mt-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs leading-relaxed text-muted">
            <span class="font-semibold">What to do:</span> {{ $ifLow }}
        </p>
    @endif
</div>
