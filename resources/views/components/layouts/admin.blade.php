@php($settings = app(\App\Services\SettingsService::class))
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>{{ $title ?? 'Admin' }} · {{ $settings->get('app_name') }}</title>
    <style>
        :root {
            --c-bg: #0c0d11; --c-surface: #16181f; --c-surface-2: #1e2128;
            --c-accent: {{ $settings->get('color_accent') }}; --c-accent-soft: {{ $settings->get('color_accent_soft') }};
            --c-success: #22c55e; --c-text: #fff; --c-text-muted: #8a8f98;
        }
    </style>
    @fonts
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body class="min-h-screen bg-bg text-content antialiased">
    @auth
        @if (auth()->user()->is_admin)
            <div class="flex min-h-screen">
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
