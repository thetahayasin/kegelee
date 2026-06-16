<div>
    <h1 class="mb-6 text-2xl font-bold">Users</h1>

    <input wire:model.live.debounce.300ms="search" placeholder="Search name or email"
           class="mb-4 h-11 w-full max-w-sm rounded-xl border border-white/10 bg-surface px-4 focus:border-accent focus:outline-none">

    <div class="overflow-hidden rounded-2xl bg-surface">
        <table class="w-full text-sm">
            <thead class="text-left text-muted"><tr class="border-b border-white/5">
                <th class="p-4 font-medium">User</th>
                <th class="p-4 font-medium">Days done</th>
                <th class="p-4 font-medium">Level</th>
                <th class="p-4 font-medium">Subscribed</th>
                <th class="p-4 font-medium">Admin</th>
            </tr></thead>
            <tbody>
                @foreach ($users as $user)
                    <tr class="border-b border-white/5 last:border-0">
                        <td class="p-4">
                            <p class="font-medium">{{ $user->name }}</p>
                            <p class="text-muted">{{ $user->email }}</p>
                        </td>
                        <td class="p-4">{{ $user->completed_days_count }}</td>
                        <td class="p-4">
                            <select wire:change="setLevel({{ $user->id }}, $event.target.value)"
                                    class="h-9 rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                                <option value="">—</option>
                                @foreach ($levels as $level)
                                    <option value="{{ $level->id }}" @selected($user->level_id === $level->id)>{{ $level->name }}</option>
                                @endforeach
                            </select>
                        </td>
                        <td class="p-4">{{ $user->isSubscribed() ? 'Yes' : '-' }}</td>
                        <td class="p-4">
                            <button wire:click="toggleAdmin({{ $user->id }})"
                                    class="rounded-full px-2.5 py-1 text-xs font-semibold {{ $user->is_admin ? 'bg-accent/20 text-accent-soft' : 'bg-white/10 text-muted' }}">
                                {{ $user->is_admin ? 'Admin' : 'User' }}
                            </button>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>

    <div class="mt-4">{{ $users->links() }}</div>
</div>
