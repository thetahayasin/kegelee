<div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
            <h1 class="text-2xl font-bold">Exercises</h1>
            <p class="text-sm text-muted">Library of training movements and their unlock progression.</p>
        </div>
        <a href="{{ route('admin.exercises.create') }}"
           class="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold tap" style="color:#042024">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New exercise
        </a>
    </div>

    {{-- Bulk actions bar --}}
    @if (count($selected))
        <div class="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3">
            <span class="mr-1 text-sm font-semibold text-muted">{{ count($selected) }} selected</span>
            <button wire:click="bulkSetActive"   class="rounded-full bg-success/15 px-3 py-1.5 text-xs font-semibold text-success">Mark Active</button>
            <button wire:click="bulkSetHidden"   class="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-muted">Mark Hidden</button>
        </div>
    @endif

    <div class="overflow-hidden rounded-2xl border border-white/5 bg-surface">
        <table class="admin-table w-full text-sm">
            <thead class="text-left text-muted">
                <tr class="border-b border-white/5">
                    <th class="p-4 font-medium">
                        <button wire:click="selectAll" class="grid h-5 w-5 place-items-center rounded border border-white/20 text-xs {{ count($selected) && count($selected) === $exercises->count() ? 'bg-accent text-white border-accent' : '' }}">
                            @if (count($selected) && count($selected) === $exercises->count())
                                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
                            @elseif (count($selected))
                                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14"/></svg>
                            @endif
                        </button>
                    </th>
                    <th class="p-4 font-medium">Name</th>
                    <th class="p-4 font-medium">Unlock day</th>
                    <th class="p-4 font-medium">Active</th>
                    <th class="p-4"></th>
                </tr>
            </thead>
            <tbody>
                @foreach ($exercises as $ex)
                    <tr class="border-b border-white/5 last:border-0 {{ in_array($ex->id, $selected) ? 'bg-accent/5' : '' }}">
                        <td class="p-4">
                            <label class="grid h-5 w-5 cursor-pointer place-items-center rounded border border-white/20 {{ in_array($ex->id, $selected) ? 'bg-accent text-white border-accent' : '' }}">
                                <input type="checkbox" wire:model.live="selected" value="{{ $ex->id }}" class="sr-only" />
                                @if (in_array($ex->id, $selected))
                                    <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>
                                @endif
                            </label>
                        </td>
                        <td class="p-4">
                            <div class="flex items-center gap-3">
                                <x-equipment-icon :exercise="$ex" :size="36" />
                                <span class="font-medium">{{ $ex->name }}</span>
                            </div>
                        </td>
                        <td class="p-4">{{ $ex->unlock_after_days }}</td>
                        <td class="p-4">
                            <button wire:click="toggleActive({{ $ex->id }})"
                                    class="rounded-full px-2.5 py-1 text-xs font-semibold {{ $ex->is_active ? 'bg-success/15 text-success' : 'bg-white/10 text-muted' }}">
                                {{ $ex->is_active ? 'Active' : 'Hidden' }}
                            </button>
                        </td>
                        <td class="p-4 text-right">
                            <a href="{{ route('admin.exercises.edit', $ex) }}" class="text-accent-soft">Edit</a>
                            <button wire:click="delete({{ $ex->id }})" wire:confirm="Delete this exercise?" class="ml-3 text-muted hover:text-accent-soft">Delete</button>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
</div>
