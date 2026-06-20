@php($settings = app(\App\Services\SettingsService::class))
<!DOCTYPE html>
{{-- Admin keeps solid dark surfaces for dashboard legibility, but the accent
     and glow match the app's fixed cyan so the circle preview is identical. --}}
<html lang="en" class="dark" style="
    --c-bg: #0c0d11; --c-surface: #16181f; --c-surface-2: #1e2128;
    --c-accent: #6ef2f0; --c-accent-soft: #9bf7f5; --c-glow: #6ef2f0;
    --c-success: #22c55e; --c-text: #fff; --c-text-muted: #8a8f98;
">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>{{ $title ?? 'Admin' }} · {{ $settings->get('app_name') }}</title>
    @fonts
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body class="min-h-screen bg-bg text-content antialiased">
    @auth
        @if (auth()->user()->is_admin)
            <div class="flex min-h-screen" x-data="{ mobileNav: false }">
                {{-- Sidebar --}}
                <aside class="hidden w-60 shrink-0 flex-col border-r border-white/5 bg-surface p-4 md:flex">
                    <a href="{{ route('admin.dashboard') }}" class="mb-6 flex items-center gap-2 px-2 py-2">
                        <span class="grid h-9 w-9 place-items-center rounded-xl bg-accent font-bold text-white">{{ strtoupper(substr($settings->get('app_name'), 0, 1)) }}</span>
                        <span class="font-bold leading-tight">{{ $settings->get('app_name') }}</span>
                    </a>
                    @php($nav = [
                        ['admin.dashboard', 'Dashboard'],
                        ['admin.exercises', 'Exercises'],
                        ['admin.levels', 'Levels'],
                        ['admin.onboarding', 'Onboarding'],
                        ['admin.knowledge', 'Knowledge'],
                        ['admin.plans', 'Plans'],
                        ['admin.discounts', 'Discounts'],
                        ['admin.subscriptions', 'Subscriptions'],
                        ['admin.users', 'Users'],
                        ['admin.settings', 'Settings'],
                    ])
                    <nav class="flex-1 space-y-1">
                        @foreach ($nav as [$route, $label])
                            <a href="{{ route($route) }}"
                               class="block rounded-lg px-3 py-2 text-sm {{ request()->routeIs($route.'*') ? 'bg-accent/15 font-semibold text-content' : 'text-muted hover:bg-white/5' }}">
                                {{ $label }}
                            </a>
                        @endforeach
                    </nav>
                    <a href="{{ route('admin.logout') }}" class="rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5">Log out</a>
                </aside>

                {{-- Main --}}
                <main class="flex-1 overflow-x-hidden">
                    {{-- Top bar with the settings gear menu (all sizes). --}}
                    <div class="flex items-center justify-between border-b border-white/5 bg-surface px-4 py-3">
                        <div class="flex items-center gap-2">
                            <button @click="mobileNav = !mobileNav" class="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-muted md:hidden" aria-label="Menu">
                                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
                            </button>
                            <a href="{{ route('admin.dashboard') }}" class="flex items-center gap-2 md:invisible">
                                <span class="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold">{{ strtoupper(substr($settings->get('app_name'), 0, 1)) }}</span>
                                <span class="font-semibold">{{ $settings->get('app_name') }}</span>
                            </a>
                        </div>

                        <div x-data="{ open: false }" class="relative">
                            <button @click="open = !open" class="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-muted tap" aria-label="Settings menu">
                                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.2.61.79 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            </button>
                            <div x-show="open" x-cloak @click.outside="open = false" x-transition
                                 class="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-xl border border-white/10 bg-surface-2 shadow-2xl">
                                <a href="{{ route('admin.pages') }}" class="block px-4 py-3 text-sm hover:bg-white/5">Pages (Privacy, Refund…)</a>
                                <a href="{{ route('admin.settings') }}" class="block px-4 py-3 text-sm hover:bg-white/5">Settings</a>
                                <form method="POST" action="{{ route('admin.reset-progress') }}"
                                      onsubmit="return confirm('Reset ALL app-user progress? This wipes every app user\'s training days, sessions, measurements and knowledge completions.');">
                                    @csrf
                                    <button type="submit" class="block w-full px-4 py-3 text-left text-sm text-accent-soft hover:bg-white/5">Reset progress</button>
                                </form>
                                <a href="{{ route('admin.logout') }}" class="block border-t border-white/10 px-4 py-3 text-sm hover:bg-white/5">Log out</a>
                            </div>
                        </div>
                    </div>

                    {{-- Mobile nav drawer --}}
                    <div x-show="mobileNav" x-cloak x-transition.opacity class="fixed inset-0 z-40 bg-black/60 md:hidden" @click="mobileNav = false"></div>
                    <nav x-show="mobileNav" x-cloak
                         x-transition:enter="transition ease-out duration-200" x-transition:enter-start="-translate-x-full" x-transition:enter-end="translate-x-0"
                         x-transition:leave="transition ease-in duration-150" x-transition:leave-start="translate-x-0" x-transition:leave-end="-translate-x-full"
                         class="fixed inset-y-0 left-0 z-50 w-64 bg-surface p-4 md:hidden">
                        <div class="mb-4 flex items-center justify-between">
                            <span class="font-bold">{{ $settings->get('app_name') }}</span>
                            <button @click="mobileNav = false" class="grid h-8 w-8 place-items-center rounded-lg text-muted"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                        </div>
                        @foreach ($nav as [$route, $label])
                            <a href="{{ route($route) }}" @click="mobileNav = false"
                               class="block rounded-lg px-3 py-2.5 text-sm {{ request()->routeIs($route.'*') ? 'bg-accent/15 font-semibold text-content' : 'text-muted hover:bg-white/5' }}">
                                {{ $label }}
                            </a>
                        @endforeach
                        <a href="{{ route('admin.logout') }}" class="mt-4 block rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-white/5">Log out</a>
                    </nav>

                    @if (session('status'))
                        <div class="mx-auto max-w-5xl px-5 pt-4 md:px-8">
                            <div class="rounded-xl bg-success/15 px-4 py-3 text-sm font-semibold text-success">{{ session('status') }}</div>
                        </div>
                    @endif

                    <div class="mx-auto max-w-5xl p-5 md:p-8">
                        {{ $slot }}
                    </div>
                </main>
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
