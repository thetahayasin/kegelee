@php($fromSession = request()->query('from') === 'session')
<div class="min-h-[100dvh] pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        @if ($fromSession)
            <a href="{{ route('session') }}" wire:navigate class="absolute left-3 grid h-11 w-11 place-items-center rounded-full text-muted tap" aria-label="Back">
                <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
            </a>
        @else
            <a href="{{ route('exercises.index') }}" wire:navigate class="absolute left-3 grid h-11 w-11 place-items-center rounded-full text-muted tap" aria-label="Back">
                <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
            </a>
        @endif
        <h1 class="truncate px-12 text-xl font-bold">{{ $exercise->name }}</h1>
    </header>

    {{-- Media / hero --}}
    <div class="mx-4 grid aspect-video place-items-center overflow-hidden rounded-3xl bg-surface">
        @if ($exercise->videoUrl())
            <video src="{{ $exercise->videoUrl() }}" class="h-full w-full object-cover" controls playsinline
                   @if ($exercise->iconUrl()) poster="{{ $exercise->iconUrl() }}" @endif></video>
        @else
            <div class="relative grid h-full w-full place-items-center">
                <div class="absolute h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.06),transparent_70%)]"></div>
                <x-equipment-icon :exercise="$exercise" :size="120" class="!bg-transparent !ring-0" />
            </div>
        @endif
    </div>

    <div class="px-5 pt-5">
        @unless ($unlocked)
            <div class="mb-4 flex items-center gap-2 rounded-2xl bg-accent/10 px-4 py-3 text-sm text-accent-soft">
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
                Complete {{ $daysLeft }} more training days to unlock.
            </div>
        @endunless

        <p class="leading-relaxed text-muted">{{ $description }}</p>

        @if ($howTo)
            <p class="mt-4 leading-relaxed text-muted">{{ $howTo }}</p>
        @endif
    </div>

    {{-- Sticky CTA --}}
    <div class="fixed inset-x-0 bottom-0 mx-auto max-w-[440px] border-t border-white/5 bg-bg/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        @if ($unlocked)
            <a href="{{ route('workout', ['exercise' => $exercise, 'trial' => 1, 'from' => $fromSession ? 'session' : null]) }}" wire:navigate class="grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap">Try it now</a>
        @else
            <div class="grid h-14 w-full place-items-center rounded-2xl bg-surface-2 font-semibold text-muted">
                <span class="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
                    Locked - {{ $daysLeft }} days left
                </span>
            </div>
        @endif
    </div>
</div>
