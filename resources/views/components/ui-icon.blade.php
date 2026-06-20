@props(['name' => 'sparkle'])
{{-- Consistent line icons (no emojis). Inherit color via currentColor. --}}
<svg {{ $attributes->merge(['class' => 'h-6 w-6', 'viewBox' => '0 0 24 24']) }}
     fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    @switch($name)
        @case('anatomy')
            <path d="M4 8c0 7 3.6 11 8 11s8-4 8-11"/><path d="M4 8h16"/><circle cx="12" cy="12.5" r="1.5"/>
            @break
        @case('heart')
            <path d="M12 20s-7-4.3-9.2-8.2C1.1 8.6 2.6 5 6 5c2 0 3.3 1.2 4 2.3C10.8 6.2 12 5 14 5c3.4 0 4.9 3.6 3.2 6.8C19 15.7 12 20 12 20z"/>
            @break
        @case('refresh')
            <path d="M4 9a8 8 0 0 1 13-3l3 3"/><path d="M20 4v5h-5"/><path d="M20 15a8 8 0 0 1-13 3l-3-3"/><path d="M4 20v-5h5"/>
            @break
        @case('clock')
            <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>
            @break
        @case('chart')
            <polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>
            @break
        @case('search')
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            @break
        @case('compass')
            <circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>
            @break
        @case('shield')
            <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>
            @break
        @case('check')
            <circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>
            @break
        @case('book')
            <path d="M12 6c-2-1.4-5-1.4-7-1v12c2-.4 5-.4 7 1 2-1.4 5-1.4 7-1V5c-2-.4-5-.4-7 1z"/><path d="M12 6v13"/>
            @break
        @case('target')
            <circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>
            @break
        @case('muscle')
            <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>
            @break
        @case('bolt')
            <path d="M13 3L5 13h6l-1 8 8-11h-6z"/>
            @break
        @case('location')
            <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>
            @break
        @case('calendar')
            <rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>
            @break
        @case('play')
            <circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none"/>
            @break
        @case('lock')
            <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            @break
        @case('info')
            <circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".7" fill="currentColor" stroke="none"/>
            @break
        @case('settings')
            <circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 13H4a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 6 6.1L5.9 6a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4.6V4a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11H21a2 2 0 0 1 0 4z"/>
            @break
        @case('logout')
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>
            @break
        @case('reset')
            <path d="M3 12a9 9 0 1 0 2.7-6.4L3 8"/><path d="M3 3v5h5"/>
            @break
        @default
            <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>
    @endswitch
</svg>
