<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('schedule') }}" wire:navigate
           class="absolute left-2 grid h-11 w-11 place-items-center rounded-full bg-surface text-content tap" aria-label="Back">
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

    {{-- Repeat on: shared day selection --}}
    <section class="mx-4 rounded-2xl bg-surface p-4">
        <p class="mb-3 text-sm font-semibold">Repeat on</p>
        <div class="flex justify-between gap-1.5">
            @foreach ($dayLabels as $i => $label)
                <button wire:click="toggleDay({{ $i }})" type="button"
                        @class([
                            'grid h-11 flex-1 place-items-center rounded-xl text-xs font-bold tap transition-colors',
                            'bg-accent text-white' => in_array($i, $selectedDays, true),
                            'bg-surface-2 text-muted' => ! in_array($i, $selectedDays, true),
                        ])>{{ $label }}</button>
            @endforeach
        </div>
        @error('selectedDays') <p class="mt-2 text-sm text-red-400">{{ $message }}</p> @enderror
    </section>

    {{-- Times: every session time fires on every selected day --}}
    <section class="mx-4 mt-3 rounded-2xl bg-surface p-4">
        <p class="mb-3 text-sm font-semibold">Session times</p>
        <div class="space-y-2">
            @foreach ($times as $j => $time)
                <div class="flex items-center gap-2" wire:key="time-{{ $j }}">
                    <span class="w-16 shrink-0 text-xs text-muted">Session {{ $j + 1 }}</span>
                    <input type="time" wire:model="times.{{ $j }}"
                           class="flex-1 rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm font-medium text-content focus:border-accent focus:outline-none">
                    @if (count($times) > 1)
                        <button wire:click="removeTime({{ $j }})" type="button"
                                class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-muted tap">
                            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>
                        </button>
                    @endif
                </div>
            @endforeach

            @error('times.*') <p class="px-1 text-sm text-red-400">{{ $message }}</p> @enderror

            <button wire:click="addTime" type="button"
                    class="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-accent tap">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                Add time
            </button>
        </div>
    </section>

    {{-- Single primary action: saves AND adds to the phone's Clock app (calendar fallback off-device). --}}
    <div class="mx-4 mt-6 space-y-3">
        <button wire:click="scheduleAlarms" wire:loading.attr="disabled" wire:target="scheduleAlarms"
                class="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-4 font-bold text-white shadow-lg shadow-accent/20 tap disabled:opacity-60">
            <svg wire:loading.remove wire:target="scheduleAlarms" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6m20 0-3-3"/></svg>
            <svg wire:loading wire:target="scheduleAlarms" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" class="opacity-25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
            <span wire:loading.remove wire:target="scheduleAlarms">Add Reminders</span>
            <span wire:loading wire:target="scheduleAlarms">Saving...</span>
        </button>

        @if ($alarmMessage)
            <div class="rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">{{ $alarmMessage }}</div>
        @endif

        {{-- After a reschedule the old alarms remain in the Clock app (API can't delete them). --}}
        @if ($isReschedule)
            <div class="rounded-2xl border border-white/10 bg-surface p-4">
                <p class="text-sm font-semibold">Remove your old alarms</p>
                <p class="mt-1 text-xs text-muted">
                    We added your updated alarms, but your previous ones are still in the Clock app
                    and can't be removed automatically. Open your Clock app and delete the old
                    "{{ $appName }}" alarms.
                </p>
                <button wire:click="openClockAlarms"
                        class="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm font-semibold text-content tap">
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                    Open Clock alarms
                </button>
            </div>
        @endif
    </div>

    {{-- One-time consent before touching the Clock app. --}}
    @if ($showConsent)
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" wire:key="alarm-consent">
            <div class="w-full max-w-md rounded-3xl bg-surface p-6 pb-8">
                <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
                    <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6m20 0-3-3"/></svg>
                </div>
                <h2 class="text-center text-lg font-bold">Add alarms to your Clock app?</h2>
                <p class="mt-2 text-center text-sm text-muted">
                    {{ $appName }} will add your session times as recurring alarms in your
                    phone's Clock app. Your Clock app rings them and you can edit or delete them there
                    at any time. We don't run any alarms in the background ourselves.
                </p>
                <div class="mt-6 space-y-2">
                    <button wire:click="grantConsent"
                            class="w-full rounded-2xl bg-accent px-6 py-4 font-bold text-white tap">
                        Allow &amp; add alarms
                    </button>
                    <button wire:click="declineConsent"
                            class="w-full rounded-2xl bg-surface-2 px-6 py-3 font-semibold text-content tap">
                        Not now
                    </button>
                </div>
            </div>
        </div>
    @endif

    <x-bottom-nav active="schedule" />
</div>
