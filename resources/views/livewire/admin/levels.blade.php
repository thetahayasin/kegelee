<div>
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Levels</h1>
        <div class="flex items-center gap-3">
            @if ($savedMessage)<span class="text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
            <button wire:click="addLevel" class="rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold tap">Add level</button>
        </div>
    </div>

    <p class="mb-4 text-sm text-muted">Per level set the total session time and the rest between exercises. The session packs the available exercises (randomised) to fill the total time. The total must fit every exercise's own duration.</p>

    <form wire:submit="save" class="space-y-3">
        <div class="hidden grid-cols-12 gap-2 px-2 text-xs text-muted md:grid">
            <span class="col-span-1">#</span>
            <span class="col-span-3">Name</span>
            <span class="col-span-2">Session time (s)</span>
            <span class="col-span-2">Rest (s)</span>
            <span class="col-span-1">Days</span>
            <span class="col-span-1">Sess/day</span>
            <span class="col-span-2">Active</span>
        </div>
        @foreach ($rows as $i => $row)
            <div wire:key="lvl-{{ $row['id'] }}" class="grid grid-cols-2 gap-2 rounded-xl bg-surface p-3 md:grid-cols-12 md:items-center">
                <input type="number" wire:model="rows.{{ $i }}.number" class="col-span-1 h-10 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                <input wire:model="rows.{{ $i }}.name" class="col-span-3 h-10 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                <div class="col-span-2">
                    <input type="number" step="1" wire:model="rows.{{ $i }}.total_session_seconds" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                    <p class="mt-0.5 text-[10px] text-muted">≈ {{ rtrim(rtrim(number_format(((float) ($row['total_session_seconds'] ?? 0)) / 60, 1), '0'), '.') }} min</p>
                    @error("rows.{$i}.total_session_seconds") <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                </div>
                <input type="number" step="0.5" wire:model="rows.{{ $i }}.rest_seconds" class="col-span-2 h-10 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                <input type="number" wire:model="rows.{{ $i }}.days_to_complete" class="col-span-1 h-10 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                <input type="number" placeholder="def" wire:model="rows.{{ $i }}.sessions_per_day" class="col-span-1 h-10 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                <label class="col-span-1 flex items-center gap-2"><input type="checkbox" wire:model="rows.{{ $i }}.is_active" class="h-5 w-5 accent-[var(--c-accent)]"></label>
                <button type="button" wire:click="delete({{ $row['id'] }})" wire:confirm="Delete level?" class="col-span-1 text-right text-sm text-muted hover:text-accent-soft">Del</button>
            </div>
        @endforeach
        <button type="submit" class="mt-2 rounded-xl bg-accent px-6 py-3 font-semibold text-white tap">Save levels</button>
    </form>
</div>
