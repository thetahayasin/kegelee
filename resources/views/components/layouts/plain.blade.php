@php($settings = app(\App\Services\SettingsService::class))
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark" style="
    background-color: #0a0b0f;
    --c-bg: #0a0b0f; --c-surface: #13151b; --c-surface-2: #1a1d25;
    --c-accent: #c1ff72; --c-accent-soft: #d6ffa1; --c-glow: #c1ff72;
    --c-success: #22c55e; --c-text: #fff; --c-text-muted: #8a8f98;
">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">

    {{-- Sign-in and password recovery are not pages we want indexed. --}}
    <meta name="robots" content="noindex, nofollow">

    <title>{{ $title ?? 'Sign in' }} · {{ $settings->get('app_name', 'Kegel Trainer') }}</title>

    @if ($settings->get('favicon_path'))
        <link rel="icon" href="{{ \Illuminate\Support\Facades\Storage::url($settings->get('favicon_path')) }}">
    @endif

    @fonts
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @livewireStyles

    {{-- Deliberately WITHOUT inject_head / inject_body / custom_css.
         Those settings are operator-supplied raw markup rendered on the public
         site; running them on the form that hands out control of the backend
         means a bad paste (or a settings write by anyone who ever had access)
         executes next to the admin's password field. --}}
</head>
<body class="antialiased bg-bg text-content selection:bg-accent/30" style="background-color:#0a0b0f">
    {{ $slot }}

    @livewireScripts
</body>
</html>
