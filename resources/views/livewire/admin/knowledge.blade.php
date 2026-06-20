<div>
    <div class="mb-6 flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold">Knowledge</h1>
            <p class="text-sm text-muted">Sequential video lessons - users unlock each by finishing the one before.</p>
        </div>
        <div class="flex items-center gap-3">
            @if ($savedMessage)<span class="text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
            <button wire:click="addLesson" class="rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold tap">Add lesson</button>
        </div>
    </div>

    <form wire:submit="save" class="space-y-4">
        @foreach ($rows as $i => $row)
            <div wire:key="lesson-{{ $row['id'] }}" class="grid gap-3 rounded-2xl bg-surface p-5 md:grid-cols-3">
                <div class="md:col-span-2 space-y-3">
                    <div class="flex gap-2">
                        <input type="number" wire:model="rows.{{ $i }}.sort_order" class="h-10 w-16 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none" title="Order">
                        <select wire:model="rows.{{ $i }}.icon" class="h-10 w-32 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none" title="Icon">
                            @foreach (['location','search','heart','check','book','anatomy','refresh','clock','chart','compass','shield','target','muscle','bolt','info','sparkle'] as $ic)
                                <option value="{{ $ic }}">{{ ucfirst($ic) }}</option>
                            @endforeach
                        </select>
                        <input wire:model="rows.{{ $i }}.title" placeholder="Heading" class="h-10 flex-1 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                    </div>
                    @error("rows.{$i}.title") <p class="text-xs text-accent-soft">{{ $message }}</p> @enderror
                    <textarea wire:model="rows.{{ $i }}.description" rows="2" placeholder="Description" class="w-full rounded-lg border border-white/10 bg-surface-2 px-2 py-2 focus:border-accent focus:outline-none"></textarea>
                    <input wire:model="rows.{{ $i }}.video_url" placeholder="Video URL (or upload below)" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                    @error("rows.{$i}.video_url") <p class="text-xs text-accent-soft">{{ $message }}</p> @enderror
                </div>
                <div class="space-y-2">
                    @if ($row['thumb_url'])
                        <img src="{{ $row['thumb_url'] }}" class="h-20 w-full rounded-lg bg-surface-2 object-cover">
                    @endif
                    <label class="block text-xs text-muted">Thumbnail
                        <input type="file" wire:model="thumbUploads.{{ $i }}" accept="image/*" class="mt-1 block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-content"></label>
                    <label class="block text-xs text-muted">Video {{ $row['video_src'] ? '✓' : '' }}
                        <input type="file" wire:model="videoUploads.{{ $i }}" accept="video/*" class="mt-1 block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-content"></label>
                    <div wire:loading wire:target="videoUploads.{{ $i }}" class="text-xs text-muted">Uploading video…</div>
                    <label class="flex items-center gap-2"><input type="checkbox" wire:model="rows.{{ $i }}.is_active" class="h-5 w-5 accent-[var(--c-accent)]"> <span class="text-sm">Active</span></label>
                    <button type="button" wire:click="delete({{ $row['id'] }})" wire:confirm="Delete lesson?" class="text-sm text-muted hover:text-accent-soft">Delete</button>
                </div>
            </div>
        @endforeach
        <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold tap">Save knowledge</button>
    </form>
</div>
