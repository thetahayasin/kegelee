@php($settings = app(\App\Services\SettingsService::class))
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
    <meta name="theme-color" content="{{ $settings->get('color_bg') }}">

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

    {{-- Runtime theme: every colour is admin-controlled. --}}
    <style>
        :root {
            --c-bg: {{ $settings->get('color_bg') }};
            --c-surface: {{ $settings->get('color_surface') }};
            --c-surface-2: {{ $settings->get('color_surface_2') }};
            --c-accent: {{ $settings->get('color_accent') }};
            --c-accent-soft: {{ $settings->get('color_accent_soft') }};
            --c-success: {{ $settings->get('color_success') }};
            --c-text: {{ $settings->get('color_text') }};
            --c-text-muted: {{ $settings->get('color_text_muted') }};
        }
        {!! $settings->get('custom_css') !!}
    </style>

    {{-- Arbitrary head injection (analytics, pixels, fonts, ...). --}}
    {!! $settings->get('inject_head') !!}

    @fonts
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles
</head>
<body class="antialiased bg-bg text-content selection:bg-accent/30">
    {!! $settings->get('inject_body_start') !!}

    <div class="app-frame no-scrollbar">
        {{ $slot }}
    </div>

    @livewireScripts
    {!! $settings->get('inject_body_end') !!}
</body>
</html>
