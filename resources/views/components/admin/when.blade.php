{{-- One stored instant, on both clocks that matter.

     The account's own wall clock on top, because that is the one the person
     was living on when they did the thing, and it is the only one that agrees
     with what the app showed them. The reader's own underneath, quieter,
     because that is the clock the support conversation is happening on.

     The second line is dropped whenever the two would read identically -
     a user in the reader's own zone, or one whose offset happens to match
     today. Printing the same figure twice does not disclose anything; it just
     teaches the reader to stop looking at the second line.

     The order is stated once, in the legend at the top of the page, rather
     than labelled on every row: a hundred timeline rows each carrying the
     words "their time" and "your time" is a page about timezones. The title
     spells it out in full for anyone who hovers, zone names included. --}}
@props([
    'at' => null,
    'zones' => [],
    'withTime' => true,
    'fallback' => '--',
])

@php
    $userZone = $zones['user'] ?? config('app.timezone');
    $adminZone = $zones['admin'] ?? config('app.timezone');

    // Accepts a cast Carbon, a raw DB string, or null. min()/max() aggregates
    // arrive here as strings and a nullable column as null, so both have to
    // land somewhere sensible without the caller thinking about it.
    $moment = $at instanceof \DateTimeInterface
        ? \Illuminate\Support\Carbon::instance($at)
        : (filled($at) ? \Illuminate\Support\Carbon::parse($at) : null);

    // 12-hour throughout the console. Storage and the API stay on 24-hour ISO
    // instants; this is only how a stored moment is read back to a person.
    $format = $withTime ? 'j M Y, g:i a' : 'j M Y';

    $theirs = $moment?->copy()->setTimezone($userZone);
    $yours = $moment?->copy()->setTimezone($adminZone);

    // Compared on the rendered string, not on the zone names: Europe/London
    // and UTC are different zones that print the same thing for half the year,
    // and a date-only figure hides a difference of a few hours entirely.
    $sameOnScreen = $theirs && $theirs->format($format) === $yours->format($format);
@endphp

@if (! $moment)
    <span {{ $attributes->merge(['class' => 'text-dim']) }}>{{ $fallback }}</span>
@else
    <span {{ $attributes->merge(['class' => 'inline-block leading-tight tabular-nums']) }}
          title="Their time: {{ $theirs->format('j M Y, g:i a') }} ({{ $userZone }}) &#10;Your time: {{ $yours->format('j M Y, g:i a') }} ({{ $adminZone }})">
        <span class="block">{{ $theirs->format($format) }}</span>
        @unless ($sameOnScreen)
            <span class="block text-[10px] text-dim">{{ $yours->format($format) }}</span>
        @endunless
    </span>
@endif
