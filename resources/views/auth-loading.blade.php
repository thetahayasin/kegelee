@php($settings = app(\App\Services\SettingsService::class))
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark" style="background-color:#060810">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
    <meta name="theme-color" content="#060810">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Signing in…</title>
    @if ($settings->get('favicon_path'))
        <link rel="icon" href="{{ \Illuminate\Support\Facades\Storage::url($settings->get('favicon_path')) }}">
    @endif
    <style>
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;background:#060810;color:#c1ff72;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}
        .frame{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;gap:1.5rem;padding:2rem}
        .spinner{width:48px;height:48px;border-radius:50%;border:4px solid rgba(193,255,114,.15);border-top-color:#c1ff72;animation:spin .7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .label{font-size:1.1rem;font-weight:600;opacity:.85;text-align:center}
        .sub{font-size:.85rem;opacity:.45;text-align:center;margin-top:-.5rem}
    </style>
</head>
<body>
    <div class="frame">
        <div class="spinner"></div>
        <p class="label">Signing you in…</p>
        <p class="sub">This will only take a moment</p>
    </div>

    <script>
    // Redeem via a plain GET navigation (not a form POST). Inside the NativePHP
    // WebView a native form POST depends on a fragile capture-and-replay of the
    // request body; if the auto-submit wins the race against that interceptor the
    // token arrives empty and the sign-in silently bounces to onboarding. A GET
    // carries the one-time token in the URL and needs no body replay or CSRF, so
    // it lands reliably. Use replace() so the token URL never enters history.
    var redeemUrl = @js(route('auth.google.finish.redeem', ['token' => $token], false));
    setTimeout(function () {
        window.location.replace(redeemUrl);
    }, 250);
    </script>
</body>
</html>
