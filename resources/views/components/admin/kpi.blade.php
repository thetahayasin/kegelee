{{-- The five figures that answer "is this account all right" without scrolling.

     Deliberately smaller than the report pages' stat-card, which carries a
     delta, a definition and advice. This is a strip of five across the top of
     a page that already has nine cards under it: if it were the same size it
     would BE the page, and the reader would have to scroll past a screenful of
     explanation to reach the account.

     Tone colours the figure, but never carries the meaning on its own - the
     detail line underneath says the same thing in words, so the card still
     reads for anyone who cannot separate the lime from the amber. --}}
@props([
    'label',
    'value',
    'detail' => null,
    // 'good' | 'bad' | null. Only where the figure genuinely has a verdict:
    // a streak of 0 is bad, a count of workouts is just a count.
    'tone' => null,
])

@php
    $toneClass = match ($tone) {
        'good' => 'text-success',
        'bad' => 'text-amber-400',
        default => '',
    };
@endphp

<div {{ $attributes->merge(['class' => 'rounded-xl border border-white/5 bg-surface-2/60 px-3 py-2.5']) }}>
    <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-dim">{{ $label }}</p>
    <p class="mt-1 text-xl font-black leading-none tabular-nums {{ $toneClass }}">{{ $value }}</p>
    @if ($detail)
        <p class="mt-1.5 text-[11px] leading-tight text-muted">{{ $detail }}</p>
    @endif
</div>
