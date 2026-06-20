<div x-data="{ showPwModal: false }">
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Users</h1>
        @if ($statusMessage)
            <span class="text-sm font-semibold text-success">{{ $statusMessage }}</span>
        @endif
    </div>

    <input wire:model.live.debounce.300ms="search" placeholder="Search name or email..."
           class="mb-4 h-11 w-full max-w-sm rounded-xl border border-white/10 bg-surface px-4 focus:border-accent focus:outline-none">

    <div class="overflow-x-auto rounded-2xl bg-surface">
        <table class="w-full text-sm">
            <thead class="text-left text-muted"><tr class="border-b border-white/5">
                <th class="p-4 font-medium">User</th>
                <th class="p-4 font-medium">Days</th>
                <th class="p-4 font-medium">Sessions</th>
                <th class="p-4 font-medium">Level</th>
                <th class="p-4 font-medium">Joined</th>
                <th class="p-4 font-medium">Role</th>
                <th class="p-4 font-medium text-right">Actions</th>
            </tr></thead>
            <tbody>
                @foreach ($users as $user)
                    <tr class="border-b border-white/5 last:border-0">
                        <td class="p-4">
                            <p class="font-medium">{{ $user->name }}</p>
                            <p class="text-xs text-muted">{{ $user->email }}</p>
                        </td>
                        <td class="p-4 tabular-nums">{{ $user->completed_days_count }}</td>
                        <td class="p-4 tabular-nums">{{ $user->sessions_count }}</td>
                        <td class="p-4">
                            <select wire:change="setLevel({{ $user->id }}, $event.target.value)"
                                    class="h-8 rounded-lg border border-white/10 bg-surface-2 px-2 text-xs focus:border-accent focus:outline-none">
                                <option value="">--</option>
                                @foreach ($levels as $level)
                                    <option value="{{ $level->id }}" @selected($user->level_id === $level->id)>{{ $level->name }}</option>
                                @endforeach
                            </select>
                        </td>
                        <td class="p-4 text-xs text-muted">{{ $user->created_at->format('j M Y') }}</td>
                        <td class="p-4">
                            <button wire:click="toggleAdmin({{ $user->id }})"
                                    @if($user->id === auth()->id()) disabled @endif
                                    class="rounded-full px-2.5 py-1 text-xs font-semibold {{ $user->is_admin ? 'bg-accent/20 text-accent-soft' : 'bg-white/10 text-muted' }} {{ $user->id === auth()->id() ? 'opacity-50 cursor-not-allowed' : '' }}">
                                {{ $user->is_admin ? 'Admin' : 'User' }}
                            </button>
                        </td>
                        <td class="p-4 text-right">
                            <div class="flex items-center justify-end gap-2">
                                <button wire:click="openPasswordReset({{ $user->id }})" @click="showPwModal = true"
                                        class="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-content transition-colors" title="Reset password">
                                    <svg viewBox="0 0 24 24" class="inline h-3.5 w-3.5 mr-0.5" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                                    Password
                                </button>
                                @if ($user->id !== auth()->id())
                                    <button wire:click="deleteUser({{ $user->id }})" wire:confirm="Delete {{ $user->name }}? This removes all their data."
                                            class="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-accent-soft transition-colors" title="Delete user">
                                        <svg viewBox="0 0 24 24" class="inline h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                    </button>
                                @endif
                            </div>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>

    <div class="mt-4">{{ $users->links() }}</div>

    {{-- Password reset modal --}}
    @if ($editingUserId)
        <template x-teleport="body">
            <div x-show="showPwModal" x-cloak
                 class="fixed inset-0 z-50 flex items-center justify-center px-6"
                 @keydown.escape.window="showPwModal = false">
                <div x-show="showPwModal" x-transition.opacity @click="showPwModal = false" class="absolute inset-0 bg-black/70"></div>
                <div x-show="showPwModal" x-transition class="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl">
                    <h2 class="text-lg font-bold">Reset password</h2>
                    <p class="mt-1 text-sm text-muted">Set a new password for {{ \App\Models\User::find($editingUserId)?->name }}.</p>
                    <form wire:submit="resetPassword" class="mt-4 space-y-4">
                        <div>
                            <label class="mb-1 block text-sm text-muted">New password</label>
                            <input type="password" wire:model="newPassword" autocomplete="new-password"
                                   class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                            @error('newPassword') <p class="mt-1 text-xs text-accent-soft">{{ $message }}</p> @enderror
                        </div>
                        <div class="flex gap-3">
                            <button type="button" @click="showPwModal = false" class="h-11 flex-1 rounded-xl bg-white/5 font-semibold tap">Cancel</button>
                            <button type="submit" @click="showPwModal = false" class="h-11 flex-1 rounded-xl bg-accent font-semibold tap">
                                <span wire:loading.remove wire:target="resetPassword">Update</span>
                                <span wire:loading wire:target="resetPassword">Updating...</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </template>
    @endif
</div>
