<div>
    <div class="mb-6 flex items-center justify-between">
        <div>
            <a href="{{ route('admin.exercises') }}" class="text-sm text-muted">← Exercises</a>
            <h1 class="text-2xl font-bold">{{ $exercise ? 'Edit '.$exercise->name : 'New exercise' }}</h1>
        </div>
        @if ($savedMessage)
            <span class="rounded-lg bg-success/15 px-3 py-1.5 text-sm font-semibold text-success">{{ $savedMessage }}</span>
        @endif
    </div>

    <form wire:submit="save" class="space-y-6">
        {{-- Basics --}}
        <div class="grid gap-4 rounded-2xl bg-surface p-5 md:grid-cols-2">
            <div class="md:col-span-2">
                <label class="mb-1 block text-sm text-muted">Name</label>
                <input wire:model="name" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('name') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div class="md:col-span-2">
                <label class="mb-1 block text-sm text-muted">Description</label>
                <textarea wire:model="description" rows="2" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 focus:border-accent focus:outline-none"></textarea>
            </div>
            <div class="md:col-span-2">
                <label class="mb-1 block text-sm text-muted">Instructions</label>
                <textarea wire:model="instructions" rows="2" class="w-full rounded-xl border border-white/10 bg-surface-2 px-3 py-2 focus:border-accent focus:outline-none"></textarea>
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Contract seconds (circle hold)</label>
                <input type="number" step="0.5" min="0.5" wire:model="contract_seconds" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('contract_seconds') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Relax seconds (circle release)</label>
                <input type="number" step="0.5" min="0" wire:model="relax_seconds" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('relax_seconds') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Unlock after (training days)</label>
                <input type="number" wire:model="unlock_after_days" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                @error('unlock_after_days') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Sort order</label>
                <input type="number" wire:model="sort_order" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
            </div>
            <label class="flex items-center gap-3"><input type="checkbox" wire:model="is_premium" class="h-5 w-5 rounded accent-[var(--c-accent)]"> <span>Premium (requires subscription)</span></label>
            <label class="flex items-center gap-3"><input type="checkbox" wire:model="is_active" class="h-5 w-5 rounded accent-[var(--c-accent)]"> <span>Active (visible in app)</span></label>
        </div>

        {{-- Media --}}
        <div class="grid gap-4 rounded-2xl bg-surface p-5 md:grid-cols-2">
            <div>
                <label class="mb-1 block text-sm text-muted">Icon image</label>
                @if ($exercise?->iconUrl())
                    <img src="{{ $exercise->iconUrl() }}" class="mb-2 h-16 w-16 rounded-xl object-contain bg-surface-2">
                @endif
                <input type="file" wire:model="iconUpload" accept="image/*" class="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content">
                <div wire:loading wire:target="iconUpload" class="mt-1 text-xs text-muted">Uploading…</div>
                @error('iconUpload') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-sm text-muted">Training video (mp4)</label>
                @if ($exercise?->videoUrl())
                    <p class="mb-2 text-xs text-success">Video uploaded ✓</p>
                @endif
                <input type="file" wire:model="videoUpload" accept="video/*" class="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-content">
                <div wire:loading wire:target="videoUpload" class="mt-1 text-xs text-muted">Uploading…</div>
                @error('videoUpload') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
            </div>
        </div>

        {{-- Per-level duration --}}
        @php($cycle = (float) $contract_seconds + (float) $relax_seconds)
        <div class="rounded-2xl bg-surface p-5">
            <h2 class="mb-1 font-semibold">Duration per level</h2>
            <p class="mb-4 text-sm text-muted">How long this exercise runs each appearance, per difficulty. One cycle = {{ rtrim(rtrim(number_format($cycle, 1), '0'), '.') }}s; it must fit the duration, and the duration must fit the level's session time.</p>
            <div class="space-y-2">
                <div class="hidden grid-cols-5 gap-2 px-1 text-xs text-muted md:grid">
                    <span>Level</span><span>Duration (s)</span><span>Reps</span><span>Session time</span><span>Fits?</span>
                </div>
                @foreach ($durations as $levelId => $row)
                    @php($dur = (float) $row['duration'])
                    @php($fits = $cycle > 0 && $cycle <= $dur + 1e-6 && $dur <= $row['total'] + 1e-6)
                    @php($reps = $cycle > 0 ? (int) floor($dur / $cycle) : 0)
                    <div wire:key="dur-{{ $levelId }}" class="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 md:grid-cols-5 md:items-center md:bg-transparent md:p-1">
                        <span class="text-sm font-medium">{{ $row['level'] }}</span>
                        <div>
                            <input type="number" step="1" min="1" wire:model="durations.{{ $levelId }}.duration" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                            @error("durations.{$levelId}.duration") <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                        </div>
                        <span class="text-sm">{{ $reps }} reps</span>
                        <span class="text-sm text-muted">{{ (int) $row['total'] }}s</span>
                        <span class="text-sm font-semibold {{ $fits ? 'text-success' : 'text-accent-soft' }}">{{ $fits ? 'OK' : 'Check' }}</span>
                    </div>
                @endforeach
            </div>
        </div>

        <div class="flex gap-3">
            <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold text-white tap">Save exercise</button>
            <a href="{{ route('admin.exercises') }}" class="rounded-xl bg-surface px-6 py-3 font-semibold tap">Cancel</a>
        </div>
    </form>
</div>
