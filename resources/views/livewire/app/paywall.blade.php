<div class="min-h-[100dvh] pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('home') }}" wire:navigate class="absolute left-4 grid h-9 w-9 place-items-center rounded-full text-muted tap" aria-label="Close">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </a>
        <h1 class="text-xl font-bold">Go Premium</h1>
    </header>

    <div class="px-6 pt-2 text-center">
        <h2 class="text-2xl font-bold leading-tight">Unlock the full programme</h2>
        <p class="mt-2 text-muted">Every exercise, every level, detailed analytics.</p>
    </div>

    <div class="mt-6 space-y-3 px-4">
        @foreach ($plans as $plan)
            @php($selected = $selectedPlan === $plan->id)
            @php($isFree = $plan->price <= 0)
            @php($final = $plan->priceWithDiscount($discount))
            @php($intervalLabel = match(true) {
                $plan->interval === 'lifetime' => '',
                $plan->interval === 'year' => '/year',
                $plan->interval === 'month' && $plan->interval_count === 3 => '/3 months',
                $plan->interval === 'month' => '/month',
                $plan->interval === 'week' => '/week',
                default => '/'.$plan->interval,
            })
            <button wire:click="$set('selectedPlan', {{ $plan->id }})"
                    class="relative w-full rounded-2xl border-2 p-4 text-left tap {{ $selected ? 'border-accent bg-accent/10' : 'border-white/10 bg-surface' }}">
                @if ($plan->is_featured)
                    <span class="absolute -top-2.5 right-4 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">Best value</span>
                @endif
                <div class="flex items-center justify-between">
                    <div>
                        <p class="font-bold">{{ $plan->name }}</p>
                        <p class="text-sm text-muted">{{ $plan->description }}</p>
                    </div>
                    <div class="text-right">
                        @if ($isFree)
                            <p class="text-lg font-bold">Free</p>
                        @else
                            @if ($discount && $final < $plan->price)
                                <p class="text-sm text-muted line-through">${{ number_format($plan->price, 2) }}</p>
                            @endif
                            <p class="text-lg font-bold">${{ number_format($final, 2) }}</p>
                            <p class="text-xs text-muted">{{ $intervalLabel }}</p>
                        @endif
                    </div>
                </div>
                @if ($plan->features)
                    <ul class="mt-3 space-y-1">
                        @foreach ($plan->features as $feature)
                            <li class="flex items-center gap-2 text-sm text-muted">
                                <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-success" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>
                                {{ $feature }}
                            </li>
                        @endforeach
                    </ul>
                @endif
                @if ($plan->trial_days && ! $isFree)
                    <p class="mt-2 text-xs font-semibold text-success">{{ $plan->trial_days }}-day free trial</p>
                @endif
            </button>
        @endforeach
    </div>

    {{-- Discount code --}}
    <div class="mx-4 mt-4">
        <div class="flex gap-2">
            <input type="text" wire:model="code" placeholder="Discount code"
                   class="h-12 flex-1 rounded-xl border border-white/10 bg-surface px-4 text-content placeholder:text-muted focus:border-accent focus:outline-none">
            <button wire:click="applyCode" class="h-12 rounded-xl bg-surface-2 px-5 font-semibold tap">Apply</button>
        </div>
        @if ($message)
            <p class="mt-2 text-sm {{ $discount ? 'text-success' : 'text-accent-soft' }}">{{ $message }}</p>
        @endif
    </div>

    <div class="fixed inset-x-0 bottom-0 mx-auto max-w-[440px] border-t border-white/5 bg-bg/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        @php($selectedIsFree = $selectedPlan && Plan::find($selectedPlan)?->price <= 0)
        <button wire:click="subscribe({{ $selectedPlan }})" @disabled(! $selectedPlan || $purchasing)
                class="relative grid h-14 w-full place-items-center rounded-2xl bg-accent font-semibold text-white tap disabled:opacity-50">
            @if ($purchasing)
                <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
            @else
                {{ $selectedIsFree ? 'Continue with Free' : 'Start now' }}
            @endif
        </button>
        @if (! $selectedIsFree && ! $purchasing)
            <p class="mt-2 text-center text-xs text-muted">
                Billed via Google Play &bull; Cancel anytime
            </p>
        @endif
    </div>
</div>
