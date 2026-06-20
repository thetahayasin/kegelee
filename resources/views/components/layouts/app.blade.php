@php($settings = app(\App\Services\SettingsService::class))
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
    <meta name="theme-color" content="#060810">

    <title>{{ $title ?? $settings->get('seo_title') }}</title>
    <meta name="description" content="{{ $settings->get('seo_description') }}">
    <meta name="keywords" content="{{ $settings->get('seo_keywords') }}">

    <meta property="og:title" content="{{ $title ?? $settings->get('seo_title') }}">
    <meta property="og:description" content="{{ $settings->get('seo_description') }}">
    <meta property="og:type" content="website">
    @if ($settings->get('seo_og_image'))
        <meta property="og:image" content="{{ \Illuminate\Support\Facades\Storage::url($settings->get('seo_og_image')) }}">
    @endif
    @if ($settings->get('favicon_path'))
        <link rel="icon" href="{{ \Illuminate\Support\Facades\Storage::url($settings->get('favicon_path')) }}">
    @endif

    {{-- Arbitrary head injection (analytics, pixels, fonts, ...). --}}
    {!! $settings->get('inject_head') !!}

    @fonts
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles

    {{-- Admin custom CSS loads last so it can override anything. --}}
    @if ($settings->get('custom_css'))
        <style>{!! $settings->get('custom_css') !!}</style>
    @endif
</head>
<body class="antialiased bg-bg text-content selection:bg-accent/30">
    {!! $settings->get('inject_body_start') !!}

    <div class="app-frame no-scrollbar">
        {{-- Giant rotated app-name watermark behind the glass UI. --}}
        <div class="app-watermark" aria-hidden="true"><span>{{ $settings->get('app_name') }}</span></div>

        <div class="relative z-10">
            {{ $slot }}
        </div>
    </div>

    <script>window.livewireScriptConfig = { progressBar: 'data-no-progress-bar' };</script>
    @livewireScripts
    <script>
    document.body.style.overscrollBehavior = 'none';
    // Pulsating circle loader for wire:navigate
    (function() {
        let overlay = null;
        function show() {
            if (overlay) return;
            overlay = document.createElement('div');
            overlay.id = 'nav-loader';
            overlay.innerHTML = '<div class="nav-pulse"></div>';
            document.body.appendChild(overlay);
        }
        function hide() {
            if (!overlay) return;
            overlay.remove();
            overlay = null;
        }
        document.addEventListener('livewire:navigate', show);
        document.addEventListener('livewire:navigated', hide);
    })();
    </script>
    {!! $settings->get('inject_body_end') !!}
</body>
</html>
