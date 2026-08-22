@if ($isDevice)
    {{-- Native app: app chrome, live content, professional offline state. --}}
    <div class="min-h-[100dvh] pb-16 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <header class="relative flex items-center justify-center px-5 py-4">
            <button type="button"
                    onclick="history.length > 1 ? history.back() : (window.location.href = '{{ auth()->check() ? route('app.settings') : route('onboarding') }}')"
                    class="absolute left-3 grid h-11 w-11 place-items-center rounded-full text-muted tap" aria-label="Back">
                <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
            </button>
            <h1 class="truncate px-12 text-xl font-bold">{{ $page->title }}</h1>
        </header>

        @if ($offline)
            <div class="flex flex-col items-center px-8 pt-20 text-center">
                <div class="grid h-20 w-20 place-items-center rounded-full bg-surface">
                    <svg viewBox="0 0 24 24" class="h-9 w-9 text-muted" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>
                    </svg>
                </div>
                <h2 class="mt-6 text-lg font-bold">No internet connection</h2>
                <p class="mt-2 text-sm leading-relaxed text-muted">This page needs an internet connection so you always see the latest version. Connect and try again.</p>
                <button wire:click="fetch" wire:loading.attr="disabled"
                        class="mt-8 grid h-12 w-full max-w-[220px] place-items-center rounded-2xl bg-accent font-semibold text-white tap disabled:opacity-60">
                    <span wire:loading.remove wire:target="fetch">Try again</span>
                    <span wire:loading wire:target="fetch">
                        <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    </span>
                </button>
            </div>
        @else
            <div class="px-5">
                @if ($remoteUpdatedAt)
                    <p class="text-xs text-muted">Last updated {{ \Carbon\Carbon::parse($remoteUpdatedAt)->translatedFormat('j M Y') }}</p>
                @endif
                <article class="prose-page mt-4 rounded-2xl bg-surface p-5 leading-relaxed text-muted">
                    {!! $remoteContent !!}
                </article>
            </div>
        @endif
    </div>
@else
    {{-- Backend website: public page layout. --}}
    <div>
        <a href="{{ route('legal.index') }}" wire:navigate class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-content tap">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
            All policies
        </a>

        <h1 class="text-2xl font-bold">{{ $page->title }}</h1>
        <p class="mt-1 text-xs text-muted">Last updated {{ $page->updated_at?->translatedFormat('j M Y') }}</p>

        <article class="prose-page mt-6 rounded-2xl bg-surface p-5 leading-relaxed text-muted">
            {!! $page->content !!}
        </article>
    </div>
@endif
