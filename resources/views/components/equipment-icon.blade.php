@props([
    'exercise' => null,
    'name' => null,
    'size' => 56,
])
@php
    $label = strtolower($name ?? $exercise?->name ?? '');
    $iconUrl = $exercise?->iconUrl();

    // Pick a glyph from the exercise name so each one reads distinctly,
    // mirroring the silver equipment art in the reference app.
    $glyph = match (true) {
        str_contains($label, 'kettle') || str_contains($label, 'holding') => 'kettlebell',
        str_contains($label, 'clamp') => 'clamp',
        str_contains($label, 'flash') => 'gripper',
        str_contains($label, 'starter') || str_contains($label, 'wave') || str_contains($label, 'pulsation') => 'plate',
        str_contains($label, 'elevator') || str_contains($label, 'stairs') || str_contains($label, 'steady') => 'stack',
        default => 'dumbbell',
    };
@endphp

<div {{ $attributes->merge(['class' => 'relative shrink-0 grid place-items-center rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.01] ring-1 ring-white/5 overflow-hidden']) }}
     style="width: {{ $size }}px; height: {{ $size }}px;">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.08),transparent_60%)]"></div>

    @if ($iconUrl)
        <img src="{{ $iconUrl }}" alt="{{ $name ?? $exercise?->name }}" class="relative w-3/4 h-3/4 object-contain">
    @else
        <svg viewBox="0 0 64 64" class="relative" style="width: {{ round($size * 0.66) }}px; height: {{ round($size * 0.66) }}px;" fill="none">
            <defs>
                <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#f4f6f8"/>
                    <stop offset="0.5" stop-color="#c2c7cf"/>
                    <stop offset="1" stop-color="#7d8390"/>
                </linearGradient>
            </defs>

            @switch($glyph)
                @case('kettlebell')
                    <path d="M26 14c0-4 12-4 12 0 0 2-1 3-1 5 6 3 9 9 9 17 0 7-5 12-14 12s-14-5-14-12c0-8 3-14 9-17-1-2-1-3-1-5z" fill="url(#silver)" stroke="#5b606b" stroke-width="1.2"/>
                    <circle cx="32" cy="36" r="8" fill="#5b606b" opacity="0.35"/>
                    @break
                @case('clamp')
                    <rect x="6" y="26" width="10" height="12" rx="2" fill="url(#silver)"/>
                    <rect x="48" y="26" width="10" height="12" rx="2" fill="url(#silver)"/>
                    <rect x="16" y="29" width="32" height="6" rx="3" fill="url(#silver)"/>
                    <circle cx="32" cy="32" r="9" fill="url(#silver)" stroke="#5b606b" stroke-width="1.2"/>
                    @break
                @case('gripper')
                    <path d="M24 12c8 6 8 28 0 40M40 12c-8 6-8 28 0 40" stroke="url(#silver)" stroke-width="5" stroke-linecap="round"/>
                    <rect x="20" y="30" width="24" height="5" rx="2.5" fill="url(#silver)"/>
                    @break
                @case('plate')
                    <circle cx="32" cy="32" r="20" fill="url(#silver)" stroke="#5b606b" stroke-width="1.2"/>
                    <circle cx="32" cy="32" r="7" fill="#2a2d34"/>
                    @break
                @case('stack')
                    <rect x="10" y="24" width="8" height="16" rx="2" fill="url(#silver)"/>
                    <rect x="46" y="24" width="8" height="16" rx="2" fill="url(#silver)"/>
                    <rect x="20" y="20" width="6" height="24" rx="2" fill="url(#silver)"/>
                    <rect x="38" y="20" width="6" height="24" rx="2" fill="url(#silver)"/>
                    <rect x="26" y="29" width="12" height="6" rx="3" fill="url(#silver)"/>
                    @break
                @default
                    <rect x="6" y="26" width="9" height="12" rx="2" fill="url(#silver)"/>
                    <rect x="15" y="22" width="7" height="20" rx="2" fill="url(#silver)"/>
                    <rect x="42" y="22" width="7" height="20" rx="2" fill="url(#silver)"/>
                    <rect x="49" y="26" width="9" height="12" rx="2" fill="url(#silver)"/>
                    <rect x="22" y="29" width="20" height="6" rx="3" fill="url(#silver)"/>
            @endswitch
        </svg>
    @endif
</div>
