@php($settings = app(\App\Services\SettingsService::class))
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
    <meta name="theme-color" content="#060810">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="sync-api-key" content="{{ config('app.sync_api_key') }}">
    <meta name="sync-api-base" content="{{ url('/api') }}">
    <meta name="sync-enabled" content="{{ $settings->get('sync_enabled', true) ? '1' : '0' }}">
    <meta name="sync-interval" content="{{ (int) $settings->get('sync_interval_minutes', 15) }}">

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

    @livewireScripts
    <script>
    document.body.style.overscrollBehavior = 'none';
    // Pulsating circle loader for wire:navigate.
    // On back/forward, Livewire restores a cached snapshot of the previous page.
    // If the loader was in the DOM when that snapshot was taken, the restored
    // page shows a stuck loader with no event to clear it. So we always remove
    // EVERY #nav-loader (via query, not a stale JS handle) once navigation
    // settles, and again on bfcache restore (pageshow).
    (function() {
        let timer = null;
        function removeAll() {
            if (timer) { clearTimeout(timer); timer = null; }
            document.querySelectorAll('#nav-loader').forEach(function (el) { el.remove(); });
        }
        function show() {
            removeAll();
            var overlay = document.createElement('div');
            overlay.id = 'nav-loader';
            overlay.innerHTML = '<div class="nav-pulse"></div>';
            document.body.appendChild(overlay);
            // Safety net if navigated/pageshow never fire (e.g. hard redirect).
            timer = setTimeout(removeAll, 8000);
        }
        document.addEventListener('livewire:navigate', show);
        document.addEventListener('livewire:navigated', removeAll);
        window.addEventListener('pageshow', removeAll);
    })();
    </script>

    {{-- Capture the user's timezone once, on first authenticated load, so day
         boundaries match their local day. today() in ProgressionService uses it. --}}
    @auth
        @unless (auth()->user()->timezone)
        <script>
        (function () {
            try {
                var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (!tz) return;
                fetch('{{ route('timezone.set') }}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' },
                    body: JSON.stringify({ timezone: tz }),
                    keepalive: true
                }).catch(function () {});
            } catch (e) {}
        })();
        </script>
        @endunless
    @endauth

    {!! $settings->get('inject_body_end') !!}
</body>
</html>
