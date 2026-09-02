<div>
    <a href="{{ route('legal.index') }}" wire:navigate class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-content tap">
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        All policies
    </a>

    <h1 class="text-2xl font-bold">{{ $page->title }}</h1>
    <p class="mt-1 text-xs text-muted">Last updated {{ $page->updated_at?->translatedFormat('j M Y') }}</p>

    {{-- The editor writes HTML, so this is echoed raw - but through SafeHtml,
         which drops <script>, inline handlers and javascript: URLs. --}}
    <article lang="{{ $locale }}" dir="{{ $isRtl ? 'rtl' : 'ltr' }}"
             class="prose-page mt-6 rounded-2xl bg-surface p-5 leading-relaxed text-muted">
        {!! \App\Support\SafeHtml::render($page->content) !!}
    </article>
</div>
