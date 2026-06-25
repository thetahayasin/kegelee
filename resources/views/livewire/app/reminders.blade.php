<div class="min-h-[100dvh] pb-28 pt-[calc(0.5rem+env(safe-area-inset-top))]"
     x-data="{
        days: @js($days),
        savedMsg: false,
        dayNames: @js($dayNames),
        async init() {
            if (window.kegelSync) {
                try {
                    const list = await window.kegelSync.db.getAll('reminders');
                    if (list && list.length) {
                        const loaded = {};
                        for (let d = 0; d < 7; d++) {
                            loaded[d] = { enabled: false, times: ['08:00'] };
                        }
                        for (const r of list) {
                            loaded[r.weekday] = {
                                enabled: !!r.is_enabled,
                                times: r.times || ['08:00']
                            };
                        }
                        this.days = loaded;
                    }
                } catch(e) {}
            }
        },
        addTime(weekday) {
            this.days[weekday].times.push('08:00');
        },
        removeTime(weekday, index) {
            if (this.days[weekday].times.length > 1) {
                this.days[weekday].times.splice(index, 1);
            }
        },
        async saveReminders() {
            if (window.kegelSync) {
                const promises = [];
                for (let weekday in this.days) {
                    promises.push(window.kegelSync.queueReminder({
                        weekday: parseInt(weekday),
                        times: this.days[weekday].times,
                        is_enabled: this.days[weekday].enabled
                    }));
                }
                await Promise.all(promises);
                window.kegelSync.pushUserData().catch(() => {});
            }
            
            // Sync with Livewire server state
            try {
                await $wire.set('days', this.days);
                await $wire.save();
                this.savedMsg = true;
                setTimeout(() => this.savedMsg = false, 3000);
            } catch(e) {
                // Offline fallback
                this.savedMsg = true;
                setTimeout(() => this.savedMsg = false, 3000);
            }
        },
        async saveAndAddToCalendar() {
            await this.saveReminders();
            $wire.addToCalendar();
        }
     }">
    <header class="relative flex items-center justify-center px-5 py-4">
        <a href="{{ route('schedule') }}" wire:navigate
           class="absolute left-3 grid h-9 w-9 place-items-center rounded-full bg-surface text-content tap" aria-label="Back">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
        </a>
        <h1 class="text-xl font-bold">Reminders</h1>
    </header>

    <div x-show="savedMsg" x-cloak class="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
        <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
        Reminders saved.
    </div>

    <section class="mx-4 space-y-3">
        <template x-for="(name, i) in dayNames" :key="i">
            <div class="rounded-2xl bg-surface p-4">
                {{-- Day header with toggle --}}
                <div class="flex items-center justify-between">
                    <span class="font-semibold text-white" x-text="name"></span>
                    <label class="relative inline-flex cursor-pointer items-center">
                        <input type="checkbox" x-model="days[i].enabled" class="peer sr-only">
                        <span class="h-7 w-12 rounded-full bg-surface-2 transition-colors peer-checked:bg-accent"></span>
                        <span class="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
                    </label>
                </div>

                {{-- Time slots --}}
                <div x-show="days[i].enabled" class="mt-3 space-y-2" x-collapse>
                    <template x-for="(time, j) in days[i].times" :key="j">
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-muted w-16 shrink-0" x-text="'Session ' + (j + 1)"></span>
                            <input type="time" x-model="days[i].times[j]"
                                   class="flex-1 rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm font-medium text-content focus:border-accent focus:outline-none">
                            <button x-show="days[i].times.length > 1" @click="removeTime(i, j)"
                                    class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted tap">
                                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"/></svg>
                            </button>
                        </div>
                    </template>

                    <button @click="addTime(i)"
                            class="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-accent tap">
                        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                        Add time
                    </button>
                </div>
            </div>
        </template>
    </section>

    <div class="mx-4 mt-6 space-y-3">
        <button @click="saveReminders()"
                class="flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-2 px-6 py-4 font-bold text-white tap">
            Save Reminders
        </button>

        <button @click="saveAndAddToCalendar()"
                class="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-4 font-bold text-white shadow-lg shadow-accent/20 tap">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            <span>Add to my calendar</span>
        </button>
        <p class="mt-2 text-center text-xs text-muted">Your calendar app will open to confirm.</p>
    </div>

    <x-bottom-nav active="schedule" />
</div>
