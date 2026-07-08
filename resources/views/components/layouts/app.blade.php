@php($settings = app(\App\Services\SettingsService::class))
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark" style="background-color:#060810">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
    <meta name="theme-color" content="#060810">
    <meta name="csrf-token" content="{{ csrf_token() }}">

    {{-- Recovery loader. Only shown when the page comes up with the content
         frame EMPTY (the occasional Livewire wire:navigate morph glitch that
         left just the watermark). It is NOT shown on normal loads. The spinner
         covers the empty frame while healBlankPage() reloads for a clean render.
         --}}
    <style>
        #app-boot-loader{position:fixed;inset:0;z-index:9999;display:none;place-items:center;background:#060810;transition:opacity .3s ease}
        html.app-loading #app-boot-loader{display:grid}
        #app-boot-loader .ring{width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,255,255,.15);border-top-color:#c1ff72;animation:app-boot-spin .7s linear infinite}
        @keyframes app-boot-spin{to{transform:rotate(360deg)}}
    </style>
    {{-- Show the spinner immediately on a heal reload only (flag set by
         healBlankPage before it reloads), so a normal load never flashes it. --}}
    <script>try{if(sessionStorage.getItem('kegelBlankHeal'))document.documentElement.classList.add('app-loading');}catch(e){}</script>
    <?php
        $syncBase = config('app.content_sync_url');
        if (empty($syncBase)) {
            $syncBase = url('/api');
        } else {
            if (str_ends_with($syncBase, '/v1/content')) {
                $syncBase = substr($syncBase, 0, -11);
            }
            $syncBase = rtrim($syncBase, '/');
            if (!str_ends_with($syncBase, '/api')) {
                $syncBase .= '/api';
            }
        }
    ?>
    <meta name="sync-api-base" content="{{ $syncBase }}">
    <meta name="sync-enabled" content="{{ \App\Support\AppConfig::SYNC_ENABLED ? '1' : '0' }}">
    <meta name="sync-interval" content="{{ \App\Support\AppConfig::SYNC_INTERVAL_MINUTES }}">
    <meta name="sync-debug" content="{{ $settings->get('sync_debug', false) ? '1' : '0' }}">
    @auth
        <meta name="user-email" content="{{ auth()->user()->email }}">
        <meta name="user-token" content="{{ auth()->user()->api_token }}">
        {{-- Drives the hardware back hierarchy (the paywall is the app's root
             while unsubscribed). --}}
        <meta name="app-subscribed" content="{{ auth()->user()->isSubscribed() ? '1' : '0' }}">
    @endauth

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
<body class="antialiased bg-bg text-content selection:bg-accent/30" style="background-color:#060810">
    {{-- Shown (via html.app-loading, set in <head>) until the page has painted. --}}
    <div id="app-boot-loader" aria-hidden="true"><div class="ring"></div></div>
    <script>
    (function () {
        if (window.__bootLoaderInit) return;
        window.__bootLoaderInit = true;
        var html = document.documentElement;

        // The page's real content lives in `.app-frame > .relative`. Standalone
        // pages (auth-loading, etc.) have no frame, so there is nothing to guard.
        function contentPresent() {
            var root = document.querySelector('.app-frame > .relative');
            if (!root) return true;
            return root.children.length > 0 && root.innerHTML.trim() !== '';
        }
        function hideLoader() {
            var el = document.getElementById('app-boot-loader');
            if (el) el.style.opacity = '0';
            setTimeout(function () {
                if (contentPresent()) html.classList.remove('app-loading');
                if (el) el.style.opacity = '';
            }, 300);
        }
        // Content present  -> drop the spinner.
        // Content missing  -> RAISE the spinner, so the empty "just the watermark"
        //                     frame is never shown. app.js's healBlankPage() then
        //                     reloads for a clean server render.
        function settle() {
            if (window.__loggingOut) { html.classList.remove('app-loading'); return; }
            if (contentPresent()) hideLoader();
            else html.classList.add('app-loading');
        }
        function whenReady() { requestAnimationFrame(function () { requestAnimationFrame(settle); }); }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenReady);
        else whenReady();
        window.addEventListener('load', settle);
        document.addEventListener('livewire:navigated', settle);
        window.addEventListener('pageshow', settle);
        window.addEventListener('popstate', function () { setTimeout(settle, 60); });
        // Hard safety: never let the overlay trap the user on a stuck page.
        setTimeout(function () { html.classList.remove('app-loading'); }, 6000);
    })();
    </script>
    {!! $settings->get('inject_body_start') !!}

    <div class="app-frame no-scrollbar">
        {{-- Giant rotated brand watermark behind the glass UI - built into the
             app, never loaded from the backend. --}}
        <div class="app-watermark" aria-hidden="true"><span>Kegelee</span></div>

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

    {{-- Keep the user's timezone in sync with THIS device. Posts whenever the
         device tz differs from what's stored (first login/registration, or when
         the same account opens on a device in another zone). The route persists
         it and, on a native client, pushes it up to the backend. day boundaries
         in ProgressionService follow it. --}}
    @auth
        <script>
        (function () {
            try {
                var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (!tz) return;
                var stored = @json(auth()->user()->timezone);
                if (tz === stored) return;
                fetch('{{ route('timezone.set') }}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' },
                    body: JSON.stringify({ timezone: tz }),
                    keepalive: true
                }).catch(function () {});
            } catch (e) {}
        })();
        </script>
    @endauth

    {!! $settings->get('inject_body_end') !!}
</body>
</html>
