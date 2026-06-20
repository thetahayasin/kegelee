<div class="min-h-[100dvh] pb-16 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('profile') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-2xl font-bold">Settings</h1>
    </header>

    {{-- Account --}}
    <p class="px-6 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Account</p>
    <div class="mx-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-surface">
        <div class="flex items-center justify-between px-5 py-4">
            <span>Subscription</span>
            @if ($subscription)
                <span class="text-sm text-success font-medium">Active{{ $subscription->ends_at ? ' till '.$subscription->ends_at->format('j M Y') : '' }}</span>
            @else
                <span class="text-sm text-muted">Inactive</span>
            @endif
        </div>
        <a href="{{ route('app.change-password') }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
            <span>Change password</span><span class="text-muted">›</span>
        </a>
    </div>

    {{-- Legal / content pages --}}
    @if ($pages->isNotEmpty())
        <p class="px-6 pb-2 pt-6 text-xs font-semibold uppercase tracking-wide text-muted">Terms</p>
        <div class="mx-4 divide-y divide-white/5 overflow-hidden rounded-2xl bg-surface">
            @foreach ($pages as $p)
                <a href="{{ route('page.show', $p) }}" wire:navigate class="flex items-center justify-between px-5 py-4 tap">
                    <span>{{ $p->title }}</span><span class="text-muted">›</span>
                </a>
            @endforeach
        </div>
    @endif

    {{-- Standalone actions --}}
    <div class="mt-10 space-y-3 px-4" x-data="{ showReset: false }">
        <button @click="showReset = true"
                class="h-14 w-full rounded-2xl bg-surface font-semibold tap">Reset progress</button>
        <button wire:click="logout" class="h-14 w-full rounded-2xl bg-accent font-semibold tap">Log out</button>

        {{-- Reset progress confirmation modal --}}
        <template x-teleport="body">
            <div x-show="showReset" x-cloak
                 class="fixed inset-0 z-50 flex items-center justify-center px-6"
                 @keydown.escape.window="showReset = false">

                {{-- Backdrop --}}
                <div x-show="showReset"
                     x-transition:enter="transition ease-out duration-200"
                     x-transition:enter-start="opacity-0"
                     x-transition:enter-end="opacity-100"
                     x-transition:leave="transition ease-in duration-150"
                     x-transition:leave-start="opacity-100"
                     x-transition:leave-end="opacity-0"
                     @click="showReset = false"
                     class="absolute inset-0 bg-black/70"></div>

                {{-- Panel --}}
                <div x-show="showReset"
                     x-transition:enter="transition ease-out duration-200"
                     x-transition:enter-start="opacity-0 scale-95"
                     x-transition:enter-end="opacity-100 scale-100"
                     x-transition:leave="transition ease-in duration-150"
                     x-transition:leave-start="opacity-100 scale-100"
                     x-transition:leave-end="opacity-0 scale-95"
                     class="relative w-full max-w-sm rounded-3xl bg-surface border border-white/10 p-6 text-center shadow-2xl">

                    <h2 class="text-lg font-bold text-content">Reset progress?</h2>
                    <p class="mt-2 text-sm text-muted leading-relaxed">This will clear your training days, sessions, measurements and knowledge progress. This action cannot be undone.</p>

                    <div class="mt-6 flex gap-3">
                        <button @click="showReset = false"
                                class="h-12 flex-1 rounded-xl bg-white/5 font-semibold text-content tap">Cancel</button>
                        <button wire:click="resetProgress" @click="showReset = false"
                                class="h-12 flex-1 rounded-xl bg-accent font-semibold text-white tap">Reset</button>
                    </div>
                </div>
            </div>
        </template>
    </div>
</div>
