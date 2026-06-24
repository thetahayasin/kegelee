<div class="min-h-[100dvh] pb-16 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('app.settings') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="truncate px-12 text-lg font-bold">{{ $page->title }}</h1>
    </header>

    <article class="prose-page mx-4 rounded-2xl bg-surface p-5 leading-relaxed text-muted">
        {!! $page->content !!}
    </article>

    <p class="mt-4 px-6 text-center text-xs text-muted/60">Last updated {{ $page->updated_at?->translatedFormat('j M Y') }}</p>
</div>
