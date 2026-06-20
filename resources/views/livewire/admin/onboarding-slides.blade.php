<div>
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Onboarding story</h1>
        <div class="flex items-center gap-3">
            @if ($savedMessage)<span class="text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
            <button wire:click="addSlide" class="rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold tap">Add slide</button>
        </div>
    </div>

    <form wire:submit="save" class="space-y-4">
        @foreach ($rows as $i => $row)
            <div wire:key="slide-{{ $row['id'] }}" class="grid gap-3 rounded-2xl bg-surface p-5 md:grid-cols-3">
                <div class="md:col-span-2 space-y-3">
                    <div class="flex gap-2">
                        <input type="number" wire:model="rows.{{ $i }}.sort_order" class="h-10 w-14 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none" title="Order">
                        <select wire:model="rows.{{ $i }}.icon" class="h-10 w-32 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none" title="Icon">
                            @foreach (['anatomy','heart','refresh','clock','chart','search','compass','shield','check','book','target','muscle','bolt','location','calendar','play','info','sparkle'] as $ic)
                                <option value="{{ $ic }}">{{ ucfirst($ic) }}</option>
                            @endforeach
                        </select>
                        <input wire:model="rows.{{ $i }}.title" placeholder="Title" class="h-10 flex-1 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                    </div>
                    <textarea wire:model="rows.{{ $i }}.body" rows="3" placeholder="Body" class="w-full rounded-lg border border-white/10 bg-surface-2 px-2 py-2 focus:border-accent focus:outline-none"></textarea>
                    <div class="flex gap-2">
                        <input wire:model="rows.{{ $i }}.cta_label" placeholder="Button label" class="h-10 flex-1 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                        <select wire:model="rows.{{ $i }}.media_type" class="h-10 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                            <option value="image">Image</option><option value="video">Video</option>
                        </select>
                    </div>
                </div>
                <div class="space-y-2">
                    @if ($row['media_url'])
                        <img src="{{ $row['media_url'] }}" class="h-24 w-full rounded-lg bg-surface-2 object-contain">
                    @else
                        <div class="grid h-24 w-full place-items-center rounded-lg bg-surface-2 text-xs text-muted">No media</div>
                    @endif
                    <input type="file" wire:model="uploads.{{ $i }}" class="block w-full text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-content">
                    <label class="flex items-center gap-2"><input type="checkbox" wire:model="rows.{{ $i }}.is_active" class="h-5 w-5 accent-[var(--c-accent)]"> <span class="text-sm">Active</span></label>
                    <button type="button" wire:click="delete({{ $row['id'] }})" wire:confirm="Delete slide?" class="text-sm text-muted hover:text-accent-soft">Delete</button>
                </div>
            </div>
        @endforeach
        <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold text-white tap">Save onboarding</button>
    </form>
</div>
