<div class="min-h-[100dvh] pb-24 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center px-5 py-4">
        <a href="{{ route('schedule') }}" wire:navigate class="grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
    </header>

    <div class="px-6">
        <h1 class="text-2xl font-bold leading-tight">Set the difficulty of Kegel Training program</h1>
        <p class="mt-2 text-muted">The higher the level, the harder the training</p>
    </div>

    <div class="mt-6 space-y-3 px-4">
        @foreach ($levels as $level)
            @php($selected = $level->id === $currentId)
            <button wire:click="select({{ $level->id }})"
                    class="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left tap {{ $selected ? 'bg-accent' : 'bg-surface' }}">
                {{-- Laurel badge --}}
                <span class="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-black/30">
                    <svg viewBox="0 0 48 48" class="h-10 w-10">
                        <path d="M14 12c-5 4-5 18 2 24" fill="none" stroke="#c2c7cf" stroke-width="2" stroke-linecap="round"/>
                        <path d="M34 12c5 4 5 18-2 24" fill="none" stroke="#c2c7cf" stroke-width="2" stroke-linecap="round"/>
                        <text x="24" y="30" text-anchor="middle" font-size="18" font-weight="700" fill="#e9ebee">{{ $level->number }}</text>
                    </svg>
                </span>
                <span class="flex-1">
                    <span class="block font-semibold {{ $selected ? 'text-white' : 'text-content' }}">{{ $level->name }}</span>
                    @if ($selected)
                        <span class="block text-sm text-white/80">Current difficulty</span>
                    @endif
                </span>
                {{-- Radio --}}
                <span class="grid h-7 w-7 place-items-center rounded-full border-2 {{ $selected ? 'border-white' : 'border-white/25' }}">
                    @if ($selected)<span class="h-3.5 w-3.5 rounded-full bg-white"></span>@endif
                </span>
            </button>
        @endforeach
    </div>
</div>
