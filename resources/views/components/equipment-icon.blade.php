@props([
    'exercise' => null,
    'name' => null,
    'size' => 56,
])
@php
    $iconUrl = $exercise?->iconUrl();
    $slug = \Illuminate\Support\Str::slug($name ?? $exercise?->name ?? 'exercise');

    // A distinct glyph per exercise so each reads uniquely. Admins can override
    // any of these by uploading a real icon image (icon_path).
    $glyphKeys = ['dumbbell','kettlebell','clamp','gripper','barbell','plates','ring','disc','coil','pulse','press','stairs-up','stairs-down','elevator','collar','tower'];

    $map = [
        'trembling' => 'dumbbell',
        'holding' => 'kettlebell',
        'front-clamp' => 'clamp',
        'reverse-clamp' => 'clamp-flip',
        'flash' => 'gripper',
        'steady-trembling' => 'barbell',
        'clamp' => 'plates',
        'starter' => 'ring',
        'short-holding' => 'disc',
        'waves' => 'coil',
        'pulsation' => 'pulse',
        'push' => 'press',
        'upstairs' => 'stairs-up',
        'steady-clamp' => 'collar',
        'downstairs' => 'stairs-down',
        'long-steady-clamp' => 'tower',
        'elevator' => 'elevator',
    ];

    // Mapped exercise → its glyph; a bare glyph name (e.g. "dumbbell") → itself;
    // anything else → a deterministic distinct glyph from the slug.
    $glyph = $map[$slug]
        ?? (in_array($slug, $glyphKeys, true) ? $slug : $glyphKeys[crc32($slug) % count($glyphKeys)]);
    $flip = str_ends_with($glyph, '-flip');
    $glyph = $flip ? substr($glyph, 0, -5) : $glyph;
@endphp

<div {{ $attributes->merge(['class' => 'relative shrink-0 grid place-items-center rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.01] ring-1 ring-white/5 overflow-hidden']) }}
     style="width: {{ $size }}px; height: {{ $size }}px;">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.08),transparent_60%)]"></div>

    @if ($iconUrl)
        <img src="{{ $iconUrl }}" alt="{{ $name ?? $exercise?->name }}" class="relative w-3/4 h-3/4 object-contain">
    @else
        <svg viewBox="0 0 64 64" class="relative" style="width: {{ round($size * 0.66) }}px; height: {{ round($size * 0.66) }}px; {{ $flip ? 'transform: scaleX(-1);' : '' }}" fill="none">
            <defs>
                {{-- Follow the app theme: a top-lit accent gradient instead of grey silver. --}}
                <linearGradient id="silver-{{ $glyph }}{{ $flip ? '-f' : '' }}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style="stop-color: var(--c-accent-soft, #FF4D57)"/>
                    <stop offset="1" style="stop-color: var(--c-accent, #E8202A)"/>
                </linearGradient>
            </defs>
            @php($g = 'url(#silver-'.$glyph.($flip ? '-f' : '').')')
            @switch($glyph)
                @case('kettlebell')
                    <path d="M26 14c0-4 12-4 12 0 0 2-1 3-1 5 6 3 9 9 9 17 0 7-5 12-14 12s-14-5-14-12c0-8 3-14 9-17-1-2-1-3-1-5z" fill="{{ $g }}" stroke="#5b606b" stroke-width="1.2"/>
                    <circle cx="32" cy="36" r="7" fill="#5b606b" opacity="0.35"/>
                    @break
                @case('clamp')
                    <rect x="6" y="26" width="10" height="12" rx="2" fill="{{ $g }}"/>
                    <rect x="48" y="26" width="10" height="12" rx="2" fill="{{ $g }}"/>
                    <rect x="16" y="29" width="32" height="6" rx="3" fill="{{ $g }}"/>
                    <circle cx="24" cy="32" r="9" fill="{{ $g }}" stroke="#5b606b" stroke-width="1.2"/>
                    @break
                @case('gripper')
                    <path d="M24 12c8 6 8 28 0 40M40 12c-8 6-8 28 0 40" stroke="{{ $g }}" stroke-width="5" stroke-linecap="round"/>
                    <rect x="20" y="30" width="24" height="5" rx="2.5" fill="{{ $g }}"/>
                    @break
                @case('disc')
                    <circle cx="32" cy="32" r="20" fill="{{ $g }}" stroke="#5b606b" stroke-width="1.2"/>
                    <circle cx="32" cy="32" r="7" fill="#2a2d34"/>
                    @break
                @case('plates')
                    <rect x="14" y="14" width="8" height="36" rx="3" fill="{{ $g }}"/>
                    <rect x="26" y="10" width="8" height="44" rx="3" fill="{{ $g }}"/>
                    <rect x="38" y="18" width="8" height="28" rx="3" fill="{{ $g }}"/>
                    @break
                @case('barbell')
                    <rect x="4" y="27" width="8" height="10" rx="2" fill="{{ $g }}"/>
                    <rect x="12" y="23" width="6" height="18" rx="2" fill="{{ $g }}"/>
                    <rect x="46" y="23" width="6" height="18" rx="2" fill="{{ $g }}"/>
                    <rect x="52" y="27" width="8" height="10" rx="2" fill="{{ $g }}"/>
                    <rect x="18" y="30" width="28" height="4" rx="2" fill="{{ $g }}"/>
                    @break
                @case('ring')
                    <circle cx="32" cy="32" r="18" fill="none" stroke="{{ $g }}" stroke-width="7"/>
                    @break
                @case('coil')
                    <path d="M10 32 Q18 14 26 32 T42 32 T58 32" fill="none" stroke="{{ $g }}" stroke-width="6" stroke-linecap="round"/>
                    @break
                @case('pulse')
                    <circle cx="32" cy="32" r="20" fill="none" stroke="{{ $g }}" stroke-width="3" opacity="0.5"/>
                    <circle cx="32" cy="32" r="12" fill="none" stroke="{{ $g }}" stroke-width="4"/>
                    <circle cx="32" cy="32" r="4" fill="{{ $g }}"/>
                    @break
                @case('press')
                    <rect x="28" y="8" width="8" height="34" rx="3" fill="{{ $g }}"/>
                    <rect x="16" y="42" width="32" height="6" rx="3" fill="{{ $g }}"/>
                    <path d="M22 20l10-10 10 10" fill="none" stroke="{{ $g }}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                    @break
                @case('stairs-up')
                    <path d="M10 50h12V38h12V26h12V14" fill="none" stroke="{{ $g }}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                    @break
                @case('stairs-down')
                    <path d="M10 14h12v12h12v12h12v12" fill="none" stroke="{{ $g }}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                    @break
                @case('elevator')
                    <rect x="18" y="10" width="28" height="44" rx="4" fill="none" stroke="{{ $g }}" stroke-width="4"/>
                    <path d="M32 40V20M26 26l6-6 6 6" fill="none" stroke="{{ $g }}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                    @break
                @case('collar')
                    <rect x="8" y="28" width="48" height="8" rx="4" fill="{{ $g }}"/>
                    <circle cx="22" cy="32" r="11" fill="none" stroke="{{ $g }}" stroke-width="5"/>
                    <circle cx="42" cy="32" r="11" fill="none" stroke="{{ $g }}" stroke-width="5"/>
                    @break
                @case('tower')
                    <rect x="10" y="24" width="8" height="20" rx="2" fill="{{ $g }}"/>
                    <rect x="46" y="24" width="8" height="20" rx="2" fill="{{ $g }}"/>
                    <rect x="20" y="16" width="6" height="32" rx="2" fill="{{ $g }}"/>
                    <rect x="38" y="16" width="6" height="32" rx="2" fill="{{ $g }}"/>
                    <rect x="26" y="30" width="12" height="6" rx="3" fill="{{ $g }}"/>
                    @break
                @default
                    {{-- dumbbell --}}
                    <rect x="6" y="26" width="9" height="12" rx="2" fill="{{ $g }}"/>
                    <rect x="15" y="22" width="7" height="20" rx="2" fill="{{ $g }}"/>
                    <rect x="42" y="22" width="7" height="20" rx="2" fill="{{ $g }}"/>
                    <rect x="49" y="26" width="9" height="12" rx="2" fill="{{ $g }}"/>
                    <rect x="22" y="30" width="20" height="6" rx="3" fill="{{ $g }}"/>
            @endswitch
        </svg>
    @endif
</div>
