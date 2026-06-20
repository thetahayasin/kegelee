@php($slides = $this->slides)
@php($slide = $slides[$index] ?? null)
@php($isLast = $slide && $index >= $slides->count() - 1)
<div class="min-h-[100dvh] flex flex-col px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
    {{-- Top bar: progress + skip --}}
    <div class="flex items-center gap-2 pt-2">
        @foreach ($slides as $i => $s)
            <div class="h-1.5 flex-1 rounded-full {{ $i <= $index ? 'bg-accent' : 'bg-white/10' }} transition-colors"></div>
        @endforeach
        <button wire:click="skip" class="ml-2 text-sm text-muted tap">Skip</button>
    </div>

    @if ($slide)
        <div wire:key="slide-{{ $index }}" class="flex flex-1 flex-col animate-slide-up">
            {{-- Large visual --}}
            <div class="grid flex-1 place-items-center">
                <div class="relative grid place-items-center animate-float">
                    <div class="absolute h-64 w-64 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--c-accent)_24%,transparent),transparent_70%)] animate-pulse-glow"></div>
                    @if ($slide->mediaUrl() && $slide->media_type === 'image')
                        <img src="{{ $slide->mediaUrl() }}" class="relative h-60 w-60 animate-pop-in object-contain" alt="">
                    @elseif ($slide->mediaUrl() && $slide->media_type === 'video')
                        <video src="{{ $slide->mediaUrl() }}" class="relative h-64 w-64 animate-pop-in rounded-[2.5rem] object-cover" autoplay muted loop playsinline></video>
                    @else
                        <div class="relative grid h-44 w-44 animate-pop-in place-items-center rounded-[2.5rem] bg-surface ring-1 ring-white/10">
                            <x-ui-icon :name="$slide->icon ?: 'sparkle'" class="h-20 w-20 text-accent" />
                        </div>
                    @endif
                </div>
            </div>

            {{-- Copy --}}
            <div class="space-y-3 pb-6 text-center">
                <h1 class="text-3xl font-bold leading-tight">{{ $slide->title }}</h1>
                <p class="leading-relaxed text-muted">{{ $slide->body }}</p>
            </div>
        </div>

        {{-- CTA --}}
        <div class="flex items-center gap-3">
            @if ($index > 0 && ! $isLast)
                <button wire:click="back" class="h-14 rounded-2xl bg-surface px-5 text-content tap">Back</button>
            @endif
            <button wire:click="next" class="h-14 flex-1 rounded-2xl bg-accent text-base font-semibold tap">
                {{ $slide->cta_label ?: ($isLast ? 'Get Started' : 'Next') }}
            </button>
        </div>
        @guest
            <p class="mt-4 text-center text-sm text-muted">Already have an account?
                <a href="{{ route('login') }}" wire:navigate class="font-semibold text-accent">Log in</a>
            </p>
        @endguest
    @else
        <div class="grid flex-1 place-items-center text-muted">No onboarding content.</div>
        <button wire:click="finish" class="h-14 w-full rounded-2xl bg-accent font-semibold tap">Get Started</button>
    @endif
</div>
