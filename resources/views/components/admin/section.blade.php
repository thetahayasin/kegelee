{{-- A band across the page saying what the cards under it are about.

     The user report was nine cards in the same box at the same weight, which
     meant the page had no answer to "where do I look first" - every heading
     was an h2 of the same size and every border was the same hairline. This is
     the level above a card: quiet, but the only thing at its size, so the eye
     lands on it and the cards beneath read as a group rather than as nine
     separate things that happen to be stacked. --}}
@props([
    'title',
    'note' => null,
])

<div {{ $attributes->merge(['class' => 'flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2']) }}>
    <h2 class="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{{ $title }}</h2>
    @if ($note)
        <p class="text-[11px] text-dim">{{ $note }}</p>
    @endif
    <span class="h-px min-w-8 flex-1 bg-white/5" aria-hidden="true"></span>
</div>
