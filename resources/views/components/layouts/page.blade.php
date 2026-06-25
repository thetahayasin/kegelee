@php($settings = app(\App\Services\SettingsService::class))
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#060810">
    <meta name="robots" content="index, follow">

    <title>{{ ($title ?? null) ? $title.' · ' : '' }}{{ $settings->get('app_name', 'Kegel Trainer') }}</title>
    <meta name="description" content="{{ $settings->get('seo_description') }}">

    @if ($settings->get('favicon_path'))
        <link rel="icon" href="{{ \Illuminate\Support\Facades\Storage::url($settings->get('favicon_path')) }}">
    @endif

    {{-- Arbitrary head injection (analytics, fonts, ...). --}}
    {!! $settings->get('inject_head') !!}

    @fonts
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles

    @if ($settings->get('custom_css'))
        <style>{!! $settings->get('custom_css') !!}</style>
    @endif
</head>
<body class="antialiased bg-bg text-content selection:bg-accent/30 min-h-[100dvh] flex flex-col">
    {!! $settings->get('inject_body_start') !!}

    {{-- Public header — always reachable, no app/auth dependency. --}}
    <header class="sticky top-0 z-40 border-b border-white/5 bg-bg/85 backdrop-blur-xl">
        <div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3.5">
            <a href="{{ route('landing') }}" class="flex items-center gap-2.5 font-bold tap" aria-label="{{ $settings->get('app_name') }} home">
                @if ($settings->get('logo_path'))
                    <img src="{{ \Illuminate\Support\Facades\Storage::url($settings->get('logo_path')) }}" alt="{{ $settings->get('app_name') }}" class="h-7 w-auto">
                @else
                    <span class="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-white">{{ strtoupper(substr($settings->get('app_name', 'K'), 0, 1)) }}</span>
                @endif
                <span class="text-sm">{{ $settings->get('app_name') }}</span>
            </a>
            <a href="{{ route('legal.index') }}" class="text-sm text-muted hover:text-content transition-colors tap">Legal</a>
        </div>
    </header>

    <main class="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {{ $slot }}
    </main>

    {{-- Footer lists every published legal page, always accessible. --}}
    <footer class="border-t border-white/5 px-5 py-8">
        <div class="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <nav class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted" aria-label="Legal links">
                @foreach (\App\Models\Page::where('is_published', true)->orderBy('sort_order')->get() as $p)
                    <a href="{{ route('page.show', $p) }}" class="hover:text-content transition-colors">{{ $p->title }}</a>
                @endforeach
            </nav>
            <p class="text-xs text-muted/60">&copy; {{ date('Y') }} {{ $settings->get('app_name') }}. All rights reserved.</p>
        </div>
    </footer>

    {!! $settings->get('inject_body_end') !!}
    @livewireScripts
</body>
</html>
