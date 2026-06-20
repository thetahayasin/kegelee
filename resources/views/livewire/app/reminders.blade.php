<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('schedule') }}" wire:navigate
           class="absolute left-3 grid h-9 w-9 place-items-center rounded-full bg-surface text-content tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-xl font-bold">Reminders</h1>
    </header>

    @if ($saved)
        <div class="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
            <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
            Reminders saved.
        </div>
    @endif

    <section class="mx-4 space-y-3">
        @foreach ($dayNames as $i => $name)
            <div class="rounded-2xl bg-surface p-4">
                {{-- Day header with toggle --}}
                <div class="flex items-center justify-between">
                    <span class="font-semibold">{{ $name }}</span>
                    <label class="relative inline-flex cursor-pointer items-center">
                        <input type="checkbox" wire:model.live="days.{{ $i }}.enabled" class="peer sr-only">
                        <span class="h-7 w-12 rounded-full bg-surface-2 transition-colors peer-checked:bg-accent"></span>
                        <span class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
                    </label>
                </div>

                {{-- Time slots --}}
                @if ($days[$i]['enabled'])
                    <div class="mt-3 space-y-2">
                        @foreach ($days[$i]['times'] as $j => $time)
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-muted w-16 shrink-0">Session {{ $j + 1 }}</span>
                                <input type="time" wire:model="days.{{ $i }}.times.{{ $j }}"
                                       class="flex-1 rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm font-medium text-content focus:border-accent focus:outline-none">
                                @if (count($days[$i]['times']) > 1)
                                    <button wire:click="removeTime({{ $i }}, {{ $j }})"
                                            class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted tap">
                                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>
                                    </button>
                                @endif
                            </div>
                        @endforeach

                        <button wire:click="addTime({{ $i }})"
                                class="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-accent tap">
                            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                            Add time
                        </button>
                    </div>
                @endif
            </div>
        @endforeach

        @error('days') <p class="px-2 text-sm text-accent-soft">{{ $message }}</p> @enderror
    </section>

    <div class="mx-4 mt-6">
        <button wire:click="addToCalendar" wire:loading.attr="disabled" wire:target="addToCalendar"
                class="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-4 font-bold text-white shadow-lg shadow-accent/20 tap disabled:opacity-60">
            <svg wire:loading.remove wire:target="addToCalendar" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            <span wire:loading.remove wire:target="addToCalendar">Add to my calendar</span>
            <span wire:loading wire:target="addToCalendar">Preparing...</span>
        </button>
        <p class="mt-2 text-center text-xs text-muted">Your calendar app will open to confirm.</p>
    </div>

    <x-bottom-nav active="schedule" />
</div>
