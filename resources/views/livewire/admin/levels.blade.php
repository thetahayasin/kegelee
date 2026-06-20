<div>
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Levels</h1>
        <div class="flex items-center gap-3">
            @if ($savedMessage)<span class="text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
            <button wire:click="addLevel" class="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold tap">Add level</button>
        </div>
    </div>

    <p class="mb-5 text-sm text-muted">Configure each level's session time, rest, exercise mix, and progression days. The session packs randomised exercises to fill the total time.</p>

    <form wire:submit="save" class="space-y-4">
        @foreach ($rows as $i => $row)
            <div wire:key="lvl-{{ $row['id'] }}" class="rounded-2xl border border-white/5 bg-surface p-5">
                {{-- Level header row --}}
                <div class="mb-4 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-sm font-bold text-accent">
                            {{ $row['number'] }}
                        </div>
                        <div>
                            <input wire:model="rows.{{ $i }}.name"
                                   class="h-8 w-48 rounded-lg border border-white/10 bg-surface-2 px-3 text-sm font-semibold focus:border-accent focus:outline-none"
                                   placeholder="Level name">
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <label class="flex items-center gap-2 text-sm text-muted">
                            <input type="checkbox" wire:model="rows.{{ $i }}.is_active" class="h-4 w-4 accent-[var(--c-accent)]">
                            Active
                        </label>
                        <button type="button" wire:click="delete({{ $row['id'] }})" wire:confirm="Delete this level?"
                                class="rounded-lg px-2 py-1 text-sm text-muted hover:bg-white/5 hover:text-accent-soft">
                            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
                        </button>
                    </div>
                </div>

                {{-- Fields grid --}}
                <div class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
                    {{-- Session time --}}
                    <div>
                        <label class="mb-1 block text-xs font-medium text-muted">Session time (seconds)</label>
                        <input type="number" step="1" wire:model="rows.{{ $i }}.total_session_seconds"
                               class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none">
                        <p class="mt-1 text-[11px] text-muted">≈ {{ rtrim(rtrim(number_format(((float) ($row['total_session_seconds'] ?? 0)) / 60, 1), '0'), '.') }} min</p>
                        @error("rows.{$i}.total_session_seconds") <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                    </div>

                    {{-- Rest between exercises --}}
                    <div>
                        <label class="mb-1 block text-xs font-medium text-muted">Rest between exercises (s)</label>
                        <input type="number" step="0.5" wire:model="rows.{{ $i }}.rest_seconds"
                               class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none">
                    </div>

                    {{-- Days to complete --}}
                    <div>
                        <label class="mb-1 block text-xs font-medium text-muted">Days to complete</label>
                        <input type="number" wire:model="rows.{{ $i }}.days_to_complete"
                               class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none">
                    </div>

                    {{-- Sessions per day --}}
                    <div>
                        <label class="mb-1 block text-xs font-medium text-muted">Sessions / day</label>
                        <input type="number" placeholder="default" wire:model="rows.{{ $i }}.sessions_per_day"
                               class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none">
                    </div>

                    {{-- Minimum exercises --}}
                    <div>
                        <label class="mb-1 block text-xs font-medium text-muted">Min exercises</label>
                        <input type="number" min="1" wire:model="rows.{{ $i }}.min_exercises"
                               class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none">
                        @error("rows.{$i}.min_exercises") <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                    </div>
                </div>

                {{-- Hidden number field for ordering --}}
                <input type="hidden" wire:model="rows.{{ $i }}.number">
            </div>
        @endforeach

        <button type="submit" class="mt-2 w-full rounded-xl bg-accent py-3 font-semibold text-white tap sm:w-auto sm:px-8">Save levels</button>
    </form>
</div>
