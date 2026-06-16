@props([
    'value' => 0,
    'max' => 1,
    'size' => 64,
    'stroke' => 5,
    'color' => 'var(--c-success)',
    'track' => 'rgba(255,255,255,0.10)',
])
@php
    $max = max(1, (float) $max);
    $pct = min(1, max(0, (float) $value / $max));
    $r = ($size - $stroke) / 2;
    $circ = 2 * M_PI * $r;
    // Leave a gap at the bottom (gauge style): use 80% of the circle as the arc.
    $arc = 0.8;
    $dash = $circ * $arc;
    $offset = $dash * (1 - $pct);
    $rotation = 90 + (1 - $arc) * 180; // center the gap at the bottom
@endphp
<div {{ $attributes->merge(['class' => 'relative grid place-items-center']) }} style="width: {{ $size }}px; height: {{ $size }}px;">
    <svg width="{{ $size }}" height="{{ $size }}" viewBox="0 0 {{ $size }} {{ $size }}" style="transform: rotate({{ $rotation }}deg);">
        <circle cx="{{ $size / 2 }}" cy="{{ $size / 2 }}" r="{{ $r }}" fill="none"
                stroke="{{ $track }}" stroke-width="{{ $stroke }}"
                stroke-dasharray="{{ $dash }} {{ $circ }}" stroke-linecap="round"/>
        <circle cx="{{ $size / 2 }}" cy="{{ $size / 2 }}" r="{{ $r }}" fill="none"
                stroke="{{ $color }}" stroke-width="{{ $stroke }}"
                stroke-dasharray="{{ $dash }} {{ $circ }}" stroke-dashoffset="{{ $offset }}"
                stroke-linecap="round" style="transition: stroke-dashoffset 0.6s ease;"/>
    </svg>
    <div class="absolute inset-0 grid place-items-center">
        {{ $slot }}
    </div>
</div>
