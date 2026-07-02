@php
    $settings = app(\App\Services\SettingsService::class);
    $appName = $settings->get('app_name', 'Kegel Trainer');
@endphp
<!DOCTYPE html>
<html lang="en" class="dark" style="
    --c-bg: #0a0b0f; --c-surface: #13151b; --c-surface-2: #1a1d25;
    --c-accent: #6ef2f0; --c-accent-soft: #9bf7f5; --c-glow: #6ef2f0;
    --c-success: #22c55e; --c-text: #fff; --c-text-muted: #8a8f98;
">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>{{ $title ?? 'Admin' }} · {{ $appName }}</title>
    @fonts
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
    <style>
        /* ─── Admin-only polish ────────────────────────────────────────── */
        .admin-nav-item {
            display: flex; align-items: center; gap: 0.625rem;
            padding: 0.5rem 0.75rem;
            border-radius: 0.625rem;
            font-size: 0.8125rem;
            font-weight: 500;
            color: var(--c-text-muted);
            transition: background 0.12s, color 0.12s;
        }
        .admin-nav-item:hover { background: rgba(255,255,255,.05); color: #fff; }
        .admin-nav-item.active {
            background: rgba(110,242,240,.1);
            color: var(--c-accent);
            font-weight: 600;
            box-shadow: inset 3px 0 0 var(--c-accent);
        }
        .admin-nav-item svg { flex-shrink: 0; opacity: .7; }
        .admin-nav-item.active svg { opacity: 1; }

        .admin-section-label {
            padding: 1rem 0.75rem 0.25rem;
            font-size: 0.65rem;
            font-weight: 700;
            letter-spacing: .1em;
            text-transform: uppercase;
            color: rgba(138,143,152,.5);
        }

        .stat-card {
            position: relative; overflow: hidden;
            border-radius: 1rem;
            padding: 1.25rem;
            background: var(--c-surface);
            border: 1px solid rgba(255,255,255,.05);
        }
        .stat-card::before {
            content: '';
            position: absolute; inset: 0;
            background: linear-gradient(135deg, rgba(255,255,255,.03) 0%, transparent 60%);
            pointer-events: none;
        }

        .chart-bar { transition: height .4s cubic-bezier(.22,1,.36,1); }

        /* Subtle row hover in tables */
        .admin-table tbody tr { transition: background .1s; }
        .admin-table tbody tr:hover { background: rgba(255,255,255,.025); }
    </style>
</head>
<body class="min-h-screen bg-bg text-content antialiased">
    @auth
        @if (auth()->user()->is_admin)
        @php
        $nav = [
            'content' => [
                ['admin.knowledge', 'Knowledge', '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'],
                ['admin.pages', 'Pages', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>'],
            ],
            'billing' => [
                ['admin.subscriptions', 'Subscriptions', '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'],
            ],
            'people' => [
                ['admin.users', 'Users', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'],
            ],
        ];
        $sectionLabels = ['content' => 'Content', 'billing' => 'Billing', 'people' => 'People'];
        @endphp

        <div class="flex min-h-screen" x-data="{ mobileNav: false }">

            {{-- ═══════════════════════════════════════════════════════════
                 SIDEBAR
            ═══════════════════════════════════════════════════════════════ --}}
            <aside class="hidden w-56 shrink-0 flex-col border-r border-white/5 md:flex"
                   style="background:linear-gradient(180deg,#111318 0%,#0d0f14 100%)">

                {{-- Brand --}}
                <a href="{{ route('admin.dashboard') }}"
                   class="flex items-center gap-3 px-4 py-5 border-b border-white/5">
                    <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl font-black text-sm"
                          style="background:linear-gradient(135deg,var(--c-accent),color-mix(in srgb,var(--c-accent) 60%,#fff));color:#042024;">
                        {{ strtoupper(substr($appName, 0, 1)) }}
                    </span>
                    <div class="min-w-0">
                        <p class="truncate text-sm font-bold leading-tight">{{ $appName }}</p>
                        <p class="text-[10px] font-medium text-muted" style="color:rgba(110,242,240,.5)">Admin Panel</p>
                    </div>
                </a>

                {{-- Dashboard (top-level) --}}
                <div class="px-2 pt-3">
                    <a href="{{ route('admin.dashboard') }}"
                       class="admin-nav-item {{ request()->routeIs('admin.dashboard') ? 'active' : '' }}">
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
                            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                        </svg>
                        Dashboard
                    </a>
                </div>

                {{-- Grouped nav --}}
                @foreach ($nav as $section => $items)
                    <p class="admin-section-label">{{ $sectionLabels[$section] }}</p>
                    <div class="px-2 space-y-0.5">
                        @foreach ($items as [$route, $label, $svgPaths])
                            <a href="{{ route($route) }}"
                               class="admin-nav-item {{ request()->routeIs($route.'*') ? 'active' : '' }}">
                                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
                                    {!! $svgPaths !!}
                                </svg>
                                {{ $label }}
                            </a>
                        @endforeach
                    </div>
                @endforeach

                <div class="mt-auto border-t border-white/5 px-2 py-3 space-y-0.5">
                    <a href="{{ route('admin.settings') }}"
                       class="admin-nav-item {{ request()->routeIs('admin.settings') ? 'active' : '' }}">
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.74 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                        Settings
                    </a>

                    {{-- Admin identity + logout --}}
                    <div class="flex items-center gap-2 px-3 py-2 mt-1">
                        <div class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                            {{ strtoupper(substr(auth()->user()->name, 0, 1)) }}
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-xs font-semibold">{{ auth()->user()->name }}</p>
                            <a href="{{ route('admin.logout') }}" class="text-[10px] text-muted hover:text-accent-soft transition-colors">Sign out</a>
                        </div>
                    </div>
                </div>
            </aside>

            {{-- ═══════════════════════════════════════════════════════════
                 MAIN CONTENT AREA
            ═══════════════════════════════════════════════════════════════ --}}
            <div class="flex flex-1 flex-col min-w-0">

                {{-- Top bar --}}
                <header class="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 px-4 py-3"
                        style="background:rgba(10,11,15,.92);backdrop-filter:blur(12px)">

                    {{-- Mobile hamburger --}}
                    <button @click="mobileNav = !mobileNav"
                            class="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-muted md:hidden" aria-label="Menu">
                        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 12h18M3 6h18M3 18h18"/>
                        </svg>
                    </button>

                    {{-- Mobile brand (hidden on desktop) --}}
                    <a href="{{ route('admin.dashboard') }}" class="flex items-center gap-2 md:hidden">
                        <span class="grid h-8 w-8 place-items-center rounded-lg font-black text-xs"
                              style="background:var(--c-accent);color:#042024">
                            {{ strtoupper(substr($appName, 0, 1)) }}
                        </span>
                    </a>

                    <div class="flex-1"></div>

                    {{-- View App link --}}
                    <a href="{{ route('landing') }}" target="_blank"
                       class="hidden sm:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-content hover:bg-white/5 transition-colors">
                        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        View App
                    </a>

                    {{-- Settings gear dropdown --}}
                    <div x-data="{ open: false }" class="relative">
                        <button @click="open = !open"
                                class="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-muted hover:text-content tap" aria-label="Quick settings">
                            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.74 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                            </svg>
                        </button>
                        <div x-show="open" x-cloak @click.outside="open = false" x-transition
                             class="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-white/10 bg-surface-2 shadow-2xl">
                            <a href="{{ route('admin.settings') }}" class="flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-white/5 transition-colors">
                                <svg viewBox="0 0 24 24" class="h-4 w-4 text-muted" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.74 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                Settings
                            </a>
                            <a href="{{ route('admin.pages') }}" class="flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-white/5 transition-colors">
                                <svg viewBox="0 0 24 24" class="h-4 w-4 text-muted" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                Pages
                            </a>
                            <div class="border-t border-white/5">
                                <form method="POST" action="{{ route('admin.reset-progress') }}"
                                      onsubmit="return confirm('Reset ALL app-user progress? This wipes every app user\'s training days, sessions, measurements and knowledge completions.');">
                                    @csrf
                                    <button type="submit" class="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-accent-soft hover:bg-white/5 transition-colors">
                                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                        Reset progress
                                    </button>
                                </form>
                            </div>
                            <div class="border-t border-white/5">
                                <a href="{{ route('admin.logout') }}" class="flex items-center gap-2.5 px-4 py-3 text-sm text-muted hover:bg-white/5 transition-colors">
                                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                                    Sign out
                                </a>
                            </div>
                        </div>
                    </div>
                </header>

                {{-- Flash status --}}
                @if (session('status'))
                    <div class="px-5 pt-4 md:px-8">
                        <div class="flex items-center gap-3 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm font-medium text-success">
                            <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>
                            {{ session('status') }}
                        </div>
                    </div>
                @endif

                {{-- Page content --}}
                <main class="flex-1 overflow-x-hidden">
                    <div class="mx-auto max-w-5xl p-5 md:p-8">
                        {{ $slot }}
                    </div>
                </main>
            </div>

            {{-- ═══════════════════════════════════════════════════════════
                 MOBILE NAV DRAWER
            ═══════════════════════════════════════════════════════════════ --}}
            <div x-show="mobileNav" x-cloak x-transition.opacity
                 class="fixed inset-0 z-40 bg-black/60 md:hidden" @click="mobileNav = false"></div>
            <nav x-show="mobileNav" x-cloak
                 x-transition:enter="transition ease-out duration-200"
                 x-transition:enter-start="-translate-x-full" x-transition:enter-end="translate-x-0"
                 x-transition:leave="transition ease-in duration-150"
                 x-transition:leave-start="translate-x-0" x-transition:leave-end="-translate-x-full"
                 class="fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto p-4 md:hidden"
                 style="background:#111318">

                <div class="mb-4 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="grid h-8 w-8 place-items-center rounded-xl font-black text-xs"
                              style="background:var(--c-accent);color:#042024">
                            {{ strtoupper(substr($appName, 0, 1)) }}
                        </span>
                        <span class="font-bold text-sm">{{ $appName }}</span>
                    </div>
                    <button @click="mobileNav = false" class="grid h-8 w-8 place-items-center rounded-lg text-muted">
                        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>

                <a href="{{ route('admin.dashboard') }}" @click="mobileNav = false"
                   class="admin-nav-item mb-1 {{ request()->routeIs('admin.dashboard') ? 'active' : '' }}">
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
                        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                        <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                    </svg>
                    Dashboard
                </a>

                @foreach ($nav as $section => $items)
                    <p class="admin-section-label">{{ $sectionLabels[$section] }}</p>
                    <div class="space-y-0.5">
                        @foreach ($items as [$route, $label, $svgPaths])
                            <a href="{{ route($route) }}" @click="mobileNav = false"
                               class="admin-nav-item {{ request()->routeIs($route.'*') ? 'active' : '' }}">
                                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
                                    {!! $svgPaths !!}
                                </svg>
                                {{ $label }}
                            </a>
                        @endforeach
                    </div>
                @endforeach

                <p class="admin-section-label">Account</p>
                <a href="{{ route('admin.settings') }}" @click="mobileNav = false"
                   class="admin-nav-item {{ request()->routeIs('admin.settings') ? 'active' : '' }}">
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.74 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Settings
                </a>
                <a href="{{ route('admin.logout') }}" class="admin-nav-item mt-1">
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Sign out
                </a>
            </nav>
        </div>
        @else
            {{ $slot }}
        @endif
    @else
        {{ $slot }}
    @endauth

    @livewireScripts
</body>
</html>
