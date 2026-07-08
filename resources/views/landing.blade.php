@php
    $s = app(\App\Services\SettingsService::class);

    $appName     = $s->get('app_name',           'Kegel Trainer');
    $headline    = $s->get('home_headline',      'A Stronger Pelvic Floor Starts Here');
    $sub         = $s->get('home_subheadline',   '');
    $badge       = $s->get('home_badge_text',    '');
    $ctaPrimary  = $s->get('home_cta_primary',   'Download on Google Play');
    $ctaSecond   = $s->get('home_cta_secondary', 'See how it works');
    $stats       = $s->get('home_stats',         []);
    $features    = $s->get('home_features',      []);
    $steps       = $s->get('home_steps',         []);
    $footerTag   = $s->get('home_footer_tagline','');
    $playUrl     = $s->get('play_store_url') ?: ('https://play.google.com/store/apps/details?id=' . $s->get('google_play_package_name', 'com.kegeltrainer.app'));

    $seoTitle    = $s->get('seo_title',          $appName.' - Pelvic Floor Training');
    $seoDesc     = $s->get('seo_description',    $sub);
    $seoKeywords = $s->get('seo_keywords',       'kegel, pelvic floor, exercise');
    $ogImage     = $s->get('seo_og_image');
    $favicon     = $s->get('favicon_path');
    $logo        = $s->get('logo_path');
@endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="index, follow">

    {{-- Primary SEO --}}
    <title>{{ $seoTitle }}</title>
    <meta name="description" content="{{ $seoDesc }}">
    <meta name="keywords" content="{{ $seoKeywords }}">
    <link rel="canonical" href="{{ url('/') }}">

    {{-- Open Graph --}}
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="{{ $appName }}">
    <meta property="og:title" content="{{ $seoTitle }}">
    <meta property="og:description" content="{{ $seoDesc }}">
    <meta property="og:url" content="{{ url('/') }}">
    @if ($ogImage)
        <meta property="og:image" content="{{ \Illuminate\Support\Facades\Storage::url($ogImage) }}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
    @endif

    {{-- Twitter Card --}}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{{ $seoTitle }}">
    <meta name="twitter:description" content="{{ $seoDesc }}">
    @if ($ogImage)
        <meta name="twitter:image" content="{{ \Illuminate\Support\Facades\Storage::url($ogImage) }}">
    @endif

    {{-- Favicon --}}
    @if ($favicon)
        <link rel="icon" href="{{ \Illuminate\Support\Facades\Storage::url($favicon) }}">
    @endif

    {{-- JSON-LD structured data --}}
    <script type="application/ld+json">
    {
        "@@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "{{ addslashes($appName) }}",
        "description": "{{ addslashes($seoDesc) }}",
        "applicationCategory": "HealthApplication",
        "operatingSystem": "Android",
        "url": "{{ url('/') }}",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
        }
        @if ($ogImage)
        ,"image": "{{ \Illuminate\Support\Facades\Storage::url($ogImage) }}"
        @endif
    }
    </script>

    {{-- Custom inject --}}
    {!! $s->get('inject_head') !!}

    @fonts
    @vite(['resources/css/app.css', 'resources/js/app.js'])

    @if ($s->get('custom_css'))
        <style>{!! $s->get('custom_css') !!}</style>
    @endif

    <style>
        /* Neomorphism helpers */
        .neo-card {
            background: var(--c-surface);
            box-shadow:
                6px 6px 16px rgba(0,0,0,.55),
                -4px -4px 10px rgba(255,255,255,.03),
                inset 0 1px 0 rgba(255,255,255,.05);
            border-radius: 1.25rem;
        }
        .neo-btn {
            box-shadow:
                4px 4px 10px rgba(0,0,0,.5),
                -2px -2px 6px rgba(255,255,255,.06),
                inset 0 1px 0 rgba(255,255,255,.12);
        }
        .neo-inset {
            box-shadow:
                inset 3px 3px 8px rgba(0,0,0,.6),
                inset -2px -2px 6px rgba(255,255,255,.04);
            background: var(--c-bg);
        }
        .neo-glow {
            box-shadow:
                0 0 24px color-mix(in srgb, var(--c-accent) 35%, transparent),
                6px 6px 16px rgba(0,0,0,.55),
                -4px -4px 10px rgba(255,255,255,.03);
        }

        .text-muted-c { color: var(--c-text-muted); }

        /* Gradient text */
        .grad-text {
            background: linear-gradient(135deg, var(--c-text) 0%, var(--c-accent) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        /* Pulsating circle decoration */
        @keyframes pulse-ring {
            0%, 100% { opacity: .15; transform: scale(1); }
            50%       { opacity: .3;  transform: scale(1.08); }
        }
        .pulse-ring {
            animation: pulse-ring 3s ease-in-out infinite;
        }

        /* Smooth scroll */
        html { scroll-behavior: smooth; }

        /* Accent divider */
        .accent-line {
            display: inline-block;
            width: 3rem;
            height: 3px;
            border-radius: 9999px;
            background: var(--c-accent);
        }
    </style>
</head>
<body>

{!! $s->get('inject_body_start') !!}

@if (session('app_disabled'))
<div class="w-full bg-accent/10 border-b border-accent/20 px-5 py-3 text-center text-sm font-medium text-accent-soft">
    The web app is currently available on Android only. Download the app below to continue.
</div>
@endif

{{-- ============================================================
     NAV
============================================================ --}}
<nav class="sticky top-0 z-50 border-b border-white/5"
     style="background: color-mix(in srgb, var(--c-bg) 96%, #fff 2%)">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <a href="/" class="flex items-center gap-2.5 font-bold text-lg" aria-label="{{ $appName }} home">
            @if ($logo)
                <img src="{{ \Illuminate\Support\Facades\Storage::url($logo) }}" alt="{{ $appName }}" class="h-8 w-auto">
            @else
                <span class="grid h-9 w-9 place-items-center rounded-xl bg-accent font-bold text-white text-sm neo-btn">
                    {{ strtoupper(substr($appName, 0, 1)) }}
                </span>
                <span>{{ $appName }}</span>
            @endif
        </a>
        @auth
            <a href="{{ route('home') }}"
               class="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white neo-btn hover:opacity-90 transition-opacity">
                Open App
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
        @else
            <a href="{{ $playUrl }}" target="_blank" rel="noopener"
               class="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white neo-btn hover:opacity-90 transition-opacity">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor"><path d="M3.18 23.76c.36.2.8.2 1.17-.02l11.65-6.72-2.6-2.6-10.22 9.34zm-1.61-20.3C1.22 3.9 1 4.4 1 5v14c0 .6.22 1.1.57 1.54l.08.08 7.84-7.84v-.18L1.57 3.46zm17.49 7.9-2.49-1.44-2.9 2.9 2.9 2.9 2.5-1.44c.72-.41.72-1.5-.01-1.92zM4.35.26C3.98.04 3.54.05 3.18.26l10.2 10.2 2.6-2.6L4.35.26z"/></svg>
                Download
            </a>
        @endauth
    </div>
</nav>

{{-- ============================================================
     HERO
============================================================ --}}
<section class="relative overflow-hidden px-5 pb-24 pt-24 text-center" itemscope itemtype="https://schema.org/SoftwareApplication">
    <meta itemprop="name" content="{{ $appName }}">
    <meta itemprop="description" content="{{ $seoDesc }}">
    <meta itemprop="applicationCategory" content="HealthApplication">
    <meta itemprop="operatingSystem" content="Android">

    {{-- Decorative blobs --}}
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div class="pulse-ring absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent opacity-15"></div>
        <div class="pulse-ring absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent opacity-10" style="animation-delay:.8s"></div>
        <div class="absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-10 blur-3xl" style="background:var(--c-accent)"></div>
        <div class="absolute -left-32 bottom-0 h-96 w-96 rounded-full opacity-10 blur-3xl" style="background:var(--c-accent)"></div>
    </div>

    <div class="relative mx-auto max-w-3xl">
        @if ($badge)
            <div class="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 px-4 py-1.5 text-sm font-semibold text-accent"
                 style="background: color-mix(in srgb, var(--c-accent) 10%, transparent)">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                {{ $badge }}
            </div>
        @endif

        <h1 class="grad-text mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl" itemprop="headline">
            {!! nl2br(e($headline)) !!}
        </h1>

        @if ($sub)
            <p class="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-c">{{ $sub }}</p>
        @endif

        <div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="{{ $playUrl }}" target="_blank" rel="noopener"
               class="neo-glow inline-flex h-14 items-center gap-3 rounded-2xl bg-accent px-8 text-base font-bold text-white transition-opacity hover:opacity-90"
               aria-label="{{ $ctaPrimary }}">
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M3.18 23.76c.36.2.8.2 1.17-.02l11.65-6.72-2.6-2.6-10.22 9.34zm-1.61-20.3C1.22 3.9 1 4.4 1 5v14c0 .6.22 1.1.57 1.54l.08.08 7.84-7.84v-.18L1.57 3.46zm17.49 7.9-2.49-1.44-2.9 2.9 2.9 2.9 2.5-1.44c.72-.41.72-1.5-.01-1.92zM4.35.26C3.98.04 3.54.05 3.18.26l10.2 10.2 2.6-2.6L4.35.26z"/></svg>
                {{ $ctaPrimary }}
            </a>
            @if ($ctaSecond)
                <a href="#how-it-works"
                   class="inline-flex h-14 items-center rounded-2xl border border-white/10 px-8 text-base font-semibold text-muted-c transition-colors hover:border-white/25 hover:text-white">
                    {{ $ctaSecond }}
                </a>
            @endif
        </div>
    </div>

    {{-- Hero visual: animated workout circle --}}
    <div class="relative mx-auto mt-20 h-56 w-56" aria-hidden="true">
        <div class="neo-inset absolute inset-0 rounded-full"></div>
        <svg viewBox="0 0 220 220" class="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="110" cy="110" r="96" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="10"/>
            <circle cx="110" cy="110" r="96" fill="none" stroke="var(--c-accent)" stroke-width="10"
                    stroke-dasharray="603" stroke-dashoffset="150" stroke-linecap="round"
                    style="filter:drop-shadow(0 0 8px var(--c-accent))"/>
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span class="text-3xl font-bold">5</span>
            <span class="text-xs font-semibold uppercase tracking-widest text-muted-c">Contract</span>
        </div>
    </div>
</section>

{{-- ============================================================
     STATS
============================================================ --}}
@if (!empty($stats))
<section class="border-y border-white/5 py-14" aria-label="Key statistics">
    <div class="mx-auto max-w-5xl px-5">
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
            @foreach ($stats as $stat)
                <div class="neo-card p-6 text-center">
                    <p class="text-3xl font-bold text-accent">{{ $stat['value'] ?? '' }}</p>
                    <p class="mt-1 text-sm text-muted-c">{{ $stat['label'] ?? '' }}</p>
                </div>
            @endforeach
        </div>
    </div>
</section>
@endif

{{-- ============================================================
     FEATURES
============================================================ --}}
@if (!empty($features))
<section class="py-24 px-5" id="features" aria-labelledby="features-heading">
    <div class="mx-auto max-w-5xl">
        <div class="mb-14 text-center">
            <span class="accent-line mb-4 block mx-auto"></span>
            <h2 id="features-heading" class="text-3xl font-bold sm:text-4xl">Everything you need</h2>
            <p class="mt-3 text-muted-c">Built around the features that actually make a difference.</p>
        </div>
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            @foreach ($features as $f)
                <article class="neo-card p-6">
                    <div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl neo-inset">
                        @php($icon = $f['icon'] ?? 'star')
                        @if ($icon === 'target')
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                        @elseif ($icon === 'activity')
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        @elseif ($icon === 'trending-up')
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                        @elseif ($icon === 'bell')
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        @elseif ($icon === 'book-open')
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                        @elseif ($icon === 'shield')
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        @elseif ($icon === 'heart')
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                        @elseif ($icon === 'zap')
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        @elseif ($icon === 'lock')
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        @else
                            <svg viewBox="0 0 24 24" class="h-6 w-6 text-accent" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        @endif
                    </div>
                    <h3 class="mb-2 font-bold">{{ $f['title'] ?? '' }}</h3>
                    <p class="text-sm leading-relaxed text-muted-c">{{ $f['desc'] ?? '' }}</p>
                </article>
            @endforeach
        </div>
    </div>
</section>
@endif

{{-- ============================================================
     HOW IT WORKS
============================================================ --}}
@if (!empty($steps))
<section class="py-24 px-5" id="how-it-works" aria-labelledby="steps-heading">
    <div class="mx-auto max-w-4xl">
        <div class="mb-14 text-center">
            <span class="accent-line mb-4 block mx-auto"></span>
            <h2 id="steps-heading" class="text-3xl font-bold sm:text-4xl">How it works</h2>
            <p class="mt-3 text-muted-c">Up and training in three simple steps.</p>
        </div>
        <div class="relative space-y-6 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-6">
            @foreach ($steps as $i => $step)
                <div class="neo-card p-6" itemscope itemtype="https://schema.org/HowToStep">
                    <div class="mb-4 text-4xl font-black text-accent/20">{{ $step['number'] ?? sprintf('%02d', $i + 1) }}</div>
                    <h3 class="mb-2 font-bold" itemprop="name">{{ $step['title'] ?? '' }}</h3>
                    <p class="text-sm leading-relaxed text-muted-c" itemprop="text">{{ $step['desc'] ?? '' }}</p>
                </div>
                @if (!$loop->last)
                    <div class="hidden sm:flex items-center justify-center absolute top-1/2 -translate-y-1/2" style="left: calc({{ ($loop->index + 1) * 33.33 }}% - 16px);" aria-hidden="true"></div>
                @endif
            @endforeach
        </div>
    </div>
</section>
@endif

{{-- ============================================================
     CTA BANNER
============================================================ --}}
<section class="py-20 px-5" aria-label="Call to action">
    <div class="mx-auto max-w-2xl text-center">
        <div class="neo-card px-8 py-14">
            <div class="pointer-events-none absolute inset-0 rounded-[1.25rem] overflow-hidden" aria-hidden="true">
                <div class="absolute -right-16 -top-16 h-64 w-64 rounded-full blur-3xl opacity-20" style="background:var(--c-accent)"></div>
            </div>
            <h2 class="grad-text mb-4 text-3xl font-bold sm:text-4xl">Ready to feel the difference?</h2>
            <p class="mb-8 text-muted-c">Join thousands already training smarter. No equipment, no gym, no excuses.</p>
            <a href="{{ $playUrl }}" target="_blank" rel="noopener"
               class="neo-glow inline-flex h-14 items-center gap-3 rounded-2xl bg-accent px-10 text-base font-bold text-white hover:opacity-90 transition-opacity">
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M3.18 23.76c.36.2.8.2 1.17-.02l11.65-6.72-2.6-2.6-10.22 9.34zm-1.61-20.3C1.22 3.9 1 4.4 1 5v14c0 .6.22 1.1.57 1.54l.08.08 7.84-7.84v-.18L1.57 3.46zm17.49 7.9-2.49-1.44-2.9 2.9 2.9 2.9 2.5-1.44c.72-.41.72-1.5-.01-1.92zM4.35.26C3.98.04 3.54.05 3.18.26l10.2 10.2 2.6-2.6L4.35.26z"/></svg>
                {{ $ctaPrimary }}
            </a>
            <p class="mt-4 text-sm text-muted-c">Free to download &bull; No account required</p>
        </div>
    </div>
</section>

{{-- ============================================================
     FOOTER
============================================================ --}}
<footer class="border-t border-white/5 py-10 px-5" role="contentinfo">
    <div class="mx-auto max-w-5xl">
        <div class="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div class="flex items-center gap-2.5">
                @if ($logo)
                    <img src="{{ \Illuminate\Support\Facades\Storage::url($logo) }}" alt="{{ $appName }}" class="h-7 w-auto opacity-70">
                @else
                    <span class="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-white">
                        {{ strtoupper(substr($appName, 0, 1)) }}
                    </span>
                @endif
                <span class="font-semibold text-sm text-muted-c">{{ $appName }}</span>
            </div>
            @if ($footerTag)
                <p class="text-sm text-muted-c">{{ $footerTag }}</p>
            @endif
            <nav class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-c" aria-label="Footer links">
                <a href="{{ $playUrl }}" target="_blank" rel="noopener" class="hover:text-white transition-colors">Google Play</a>
                @foreach (\App\Models\Page::where('is_published', true)->orderBy('sort_order')->get() as $page)
                    <a href="{{ route('page.show', $page) }}" class="hover:text-white transition-colors">{{ $page->title }}</a>
                @endforeach
            </nav>
        </div>
        <p class="mt-6 text-center text-xs text-muted-c">
            &copy; {{ date('Y') }} {{ $appName }}. All rights reserved.
        </p>
    </div>
</footer>

{!! $s->get('inject_body_end') !!}
</body>
</html>
