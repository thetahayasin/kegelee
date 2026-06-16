<div>
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Exercises</h1>
        <a href="{{ route('admin.exercises.create') }}" class="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white tap">New exercise</a>
    </div>

    <div class="overflow-hidden rounded-2xl bg-surface">
        <table class="w-full text-sm">
            <thead class="text-left text-muted">
                <tr class="border-b border-white/5">
                    <th class="p-4 font-medium">Name</th>
                    <th class="p-4 font-medium">Unlock day</th>
                    <th class="p-4 font-medium">Premium</th>
                    <th class="p-4 font-medium">Active</th>
                    <th class="p-4"></th>
                </tr>
            </thead>
            <tbody>
                @foreach ($exercises as $ex)
                    <tr class="border-b border-white/5 last:border-0">
                        <td class="p-4">
                            <div class="flex items-center gap-3">
                                <x-equipment-icon :exercise="$ex" :size="36" />
                                <span class="font-medium">{{ $ex->name }}</span>
                            </div>
                        </td>
                        <td class="p-4">{{ $ex->unlock_after_days }}</td>
                        <td class="p-4">{{ $ex->is_premium ? 'Yes' : '-' }}</td>
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
