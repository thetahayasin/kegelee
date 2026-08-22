@props(['active' => 'home'])
@php
    $tabs = [
        ['key' => 'home', 'label' => 'Training', 'route' => 'home'],
        ['key' => 'progress', 'label' => 'Progress', 'route' => 'progress'],
        ['key' => 'schedule', 'label' => 'Schedule', 'route' => 'schedule'],
        ['key' => 'profile', 'label' => 'Profile', 'route' => 'profile'],
    ];
@endphp
<nav aria-label="Primary"
     class="fixed bottom-0 inset-x-0 z-40 mx-auto max-w-[440px] border-t border-line bg-bg/95 px-2 pt-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom))]">
    <ul class="grid grid-cols-4">
        @foreach ($tabs as $tab)
            @php($on = $active === $tab['key'])
            <li>
                <a href="{{ route($tab['route']) }}" wire:navigate
                   @if ($on) aria-current="page" @endif
                   class="nav-tab flex flex-col items-center justify-center gap-0.5 rounded-xl py-1 tap {{ $on ? 'text-accent' : 'text-dim' }}">
                    <span class="nav-tab-icon-wrap">
                        @switch($tab['key'])
                            @case('home')
                                {{-- dumbbell --}}
                                <svg viewBox="0 0 24 24" class="nav-tab-icon h-[1.375rem] w-[1.375rem]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                                    <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>
                                </svg>
                                @break
                            @case('progress')
                                <svg viewBox="0 0 24 24" class="nav-tab-icon h-[1.375rem] w-[1.375rem]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                                    <path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7"/>
                                </svg>
                                @break
                            @case('schedule')
                                <svg viewBox="0 0 24 24" class="nav-tab-icon h-[1.375rem] w-[1.375rem]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                                    <rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/>
                                </svg>
                                @break
                            @default
                                <svg viewBox="0 0 24 24" class="nav-tab-icon h-[1.375rem] w-[1.375rem]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                                    <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>
                                </svg>
                        @endswitch
                    </span>
                    <span class="text-[0.625rem] font-semibold tracking-[0.01em] {{ $on ? '' : 'font-medium' }}">{{ $tab['label'] }}</span>
                </a>
            </li>
        @endforeach
    </ul>
</nav>
