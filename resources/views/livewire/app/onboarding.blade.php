@php($slides = $this->slides)
@php($slide = $slides[$index] ?? null)
<div class="min-h-[100dvh] flex flex-col px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
    {{-- Top bar: progress + skip --}}
    <div class="flex items-center gap-2 pt-2">
        @foreach ($slides as $i => $s)
            <div class="h-1 flex-1 rounded-full {{ $i <= $index ? 'bg-accent' : 'bg-white/10' }} transition-colors"></div>
        @endforeach
        <button wire:click="skip" class="ml-2 text-sm text-muted tap">Skip</button>
    </div>

    @if ($slide)
        <div wire:key="slide-{{ $index }}" class="flex-1 flex flex-col animate-slide-up">
            {{-- Visual --}}
            <div class="flex-1 grid place-items-center">
                <div class="relative grid place-items-center">
                    <div class="absolute h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(232,32,42,0.22),transparent_70%)]"></div>
                    @if ($slide->mediaUrl() && $slide->media_type === 'image')
                        <img src="{{ $slide->mediaUrl() }}" class="relative h-56 w-56 object-contain" alt="">
                    @elseif ($slide->mediaUrl() && $slide->media_type === 'video')
                        <video src="{{ $slide->mediaUrl() }}" class="relative h-64 w-64 rounded-3xl object-cover" autoplay muted loop playsinline></video>
                    @else
                        {{-- Friendly anatomical "hammock" illustration placeholder --}}
                        <svg viewBox="0 0 200 200" class="relative h-52 w-52">
                            <defs>
                                <linearGradient id="ob" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0" stop-color="var(--c-accent-soft)"/>
                                    <stop offset="1" stop-color="var(--c-accent)"/>
                                </linearGradient>
                            </defs>
                            <circle cx="100" cy="100" r="70" fill="none" stroke="url(#ob)" stroke-width="3" opacity="0.5"/>
                            <path d="M45 95 Q100 150 155 95" fill="none" stroke="url(#ob)" stroke-width="8" stroke-linecap="round"/>
                            <path d="M45 80 Q100 130 155 80" fill="none" stroke="url(#ob)" stroke-width="5" stroke-linecap="round" opacity="0.5"/>
                            <circle cx="100" cy="70" r="10" fill="url(#ob)"/>
                        </svg>
                    @endif
                </div>
            </div>

            {{-- Copy --}}
            <div class="space-y-3 pb-6">
                <h1 class="text-3xl font-bold leading-tight">{{ $slide->title }}</h1>
                <p class="text-muted leading-relaxed">{{ $slide->body }}</p>
            </div>
        </div>

        {{-- CTA --}}
        <div class="flex items-center gap-3">
            @if ($index > 0)
                <button wire:click="back" class="h-14 px-5 rounded-2xl bg-surface text-content tap">Back</button>
            @endif
            <button wire:click="next" class="h-14 flex-1 rounded-2xl bg-accent font-semibold text-white tap">
                {{ $slide->cta_label ?: 'Next' }}
            </button>
        </div>
    @else
        <div class="flex-1 grid place-items-center text-muted">No onboarding content.</div>
        <button wire:click="finish" class="h-14 w-full rounded-2xl bg-accent font-semibold text-white tap">Get started</button>
    @endif
</div>
