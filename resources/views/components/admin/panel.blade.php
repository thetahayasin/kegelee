{{-- One card, with its heading handled in one place.

     Every card on the report used to open with its own hand-written heading
     block, so the gap under a title, whether it had a count, and where a
     caveat line went were decided nine separate times and agreed about four.
     The heading is a fixed shape here: name, then how many, then the one line
     saying what the card is counting.

     `count` is separate from the title rather than interpolated into it so it
     can be styled down - "Payments 12" reads as a heading with a number, while
     "Payments (12)" reads as part of the name. --}}
@props([
    'title' => null,
    'subtitle' => null,
    'count' => null,
])

<section {{ $attributes->merge(['class' => 'rounded-2xl border border-white/5 bg-surface-2/60 p-4']) }}>
    @if ($title)
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div class="min-w-0">
                <h3 class="text-sm font-bold">
                    {{ $title }}
                    @if ($count !== null)
                        <span class="ml-1 font-semibold tabular-nums text-muted">{{ $count }}</span>
                    @endif
                </h3>
                @if ($subtitle)
                    <p class="mt-0.5 text-[11px] leading-relaxed text-dim">{{ $subtitle }}</p>
                @endif
            </div>

            {{-- Anything that acts on the card: a clear-filter button, a link
                 out. Sits on the heading's baseline rather than in the body,
                 so the body is only ever the thing the card is about. --}}
            @isset($actions)
                <div class="shrink-0">{{ $actions }}</div>
            @endisset
        </div>
    @endif

    {{ $slot }}
</section>
