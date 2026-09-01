<div x-data="{ showPwModal: false, showEditModal: false }">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
            <h1 class="text-2xl font-bold">Users</h1>
            <p class="text-sm text-muted">Manage accounts, roles and progress.</p>
        </div>
        @if ($statusMessage)
            <span class="rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success">{{ $statusMessage }}</span>
        @endif
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-56">
            <svg viewBox="0 0 24 24" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input wire:model.live.debounce.300ms="search" placeholder="Search name or email…"
                   class="h-10 w-full rounded-xl border border-white/10 bg-surface pl-9 pr-4 text-sm focus:border-accent focus:outline-none">
        </div>
        <button wire:click="$toggle('creating')"
                class="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-[var(--c-on-accent)] tap">+ New user</button>
    </div>

    {{-- Create user: makes a verified account that can log in immediately (no email code needed). --}}
    @if ($creating)
        <form wire:submit="createUser" class="mb-4 grid gap-3 rounded-2xl border border-white/10 bg-surface p-4 sm:grid-cols-4">
            <div>
                <label class="mb-1 block text-xs text-muted">Name</label>
                <input type="text" wire:model="newName" class="h-10 w-full rounded-xl border border-white/10 bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none">
                @error('newName') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-xs text-muted">Email</label>
                <input type="email" wire:model="newEmail" autocomplete="off" class="h-10 w-full rounded-xl border border-white/10 bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none">
                @error('newEmail') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="mb-1 block text-xs text-muted">Password</label>
                <input type="text" wire:model="newUserPassword" autocomplete="off" class="h-10 w-full rounded-xl border border-white/10 bg-surface-2 px-3 text-sm focus:border-accent focus:outline-none">
                @error('newUserPassword') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
            </div>
            <div class="flex items-end">
                <button type="submit" class="h-10 w-full rounded-xl bg-accent font-semibold text-[var(--c-on-accent)] tap">Create &amp; verify</button>
            </div>
        </form>
    @endif

    <div class="overflow-x-auto rounded-2xl border border-white/5 bg-surface">
        <table class="admin-table w-full text-sm">
            <thead class="text-left text-muted"><tr class="border-b border-white/5">
                <th class="p-4 font-medium">User</th>
                <th class="p-4 font-medium">Funnel</th>
                <th class="p-4 font-medium">Start</th>
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
                            @if (! $user->email_verified_at)
                                <span class="mt-1 inline-block rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">Unverified</span>
                            @endif
                        </td>
                        @php
                            // How far into the free funnel this account got.
                            // Read from columns and eager counts only - no
                            // query runs inside the loop.
                            $stage = $user->active_subs_count > 0 ? 'Subscribed'
                                : ($user->sessions_count > 0 ? 'Trained'
                                : ($user->lessons_done_count > 0 ? 'Basics'
                                : ($user->onboarding_completed_at ? 'Onboarded' : 'Signed up')));
                            // Design tokens only - no raw palette colours.
                            // app.css maps every utility onto runtime CSS
                            // variables emitted from the admin settings, so a
                            // hardcoded emerald would be the one badge on the
                            // page that ignores a theme change. The ramp is
                            // weight rather than hue, and lime keeps its one
                            // job: the goal state.
                            $stageClass = [
                                'Subscribed' => 'bg-accent/20 text-accent-soft',
                                'Trained'    => 'bg-white/10 text-content',
                                'Basics'     => 'bg-white/10 text-muted',
                                'Onboarded'  => 'bg-white/5 text-muted',
                                'Signed up'  => 'bg-white/5 text-dim',
                            ][$stage];
                        @endphp
                        <td class="p-4">
                            <span class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold {{ $stageClass }}">{{ $stage }}</span>
                            @if ($user->lessons_done_count > 0)
                                <p class="mt-1 text-[10px] text-muted">{{ $user->lessons_done_count }}/3 lessons</p>
                            @endif
                        </td>
                        <td class="p-4">
                            @if ($user->onboarding_completed_at)
                                @if ($user->onboarding_baseline_seconds)
                                    <p class="text-xs tabular-nums">{{ $user->onboarding_baseline_seconds }}s hold</p>
                                @else
                                    <p class="text-xs text-muted">Not measured</p>
                                @endif
                                <p class="text-[10px] text-muted">
                                    {{ $user->onboarding_level ? 'L' . $user->onboarding_level : '--' }}
                                    @if ($user->onboarding_skipped) &middot; skipped @endif
                                </p>
                                @if ($user->onboarding_experience_label)
                                    <p class="text-[10px] text-muted">{{ $user->onboarding_experience_label }}</p>
                                @endif
                                @if ($user->onboarding_time_label)
                                    <p class="text-[10px] text-muted">{{ $user->onboarding_time_label }}</p>
                                @endif
                            @else
                                <span class="text-xs text-muted">--</span>
                            @endif
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
                                <button wire:click="openEditProfile({{ $user->id }})" @click="showEditModal = true"
                                        class="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-content transition-colors" title="Edit profile">
                                    <svg viewBox="0 0 24 24" class="inline h-3.5 w-3.5 mr-0.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    Edit
                                </button>
                                <button wire:click="openPasswordReset({{ $user->id }})" @click="showPwModal = true"
                                        class="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-content transition-colors" title="Reset password">
                                    <svg viewBox="0 0 24 24" class="inline h-3.5 w-3.5 mr-0.5" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                                    Password
                                </button>
                                @if (! $user->email_verified_at)
                                    <button wire:click="markVerified({{ $user->id }})"
                                            class="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-success transition-colors" title="Mark verified">
                                        <svg viewBox="0 0 24 24" class="inline h-3.5 w-3.5 mr-0.5" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                                        Verify
                                    </button>
                                @endif
                                @if ($user->id !== auth()->id())
                                    <button wire:click="deleteUser({{ $user->id }})" wire:confirm="Delete {{ $user->name }}? This removes all their data."
                                            class="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-accent-soft transition-colors" title="Delete user">
                                        <svg viewBox="0 0 24 24" class="inline h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                    </button>
                                @endif
                                {{-- The timeline toggle.
                                     Last, because it is the only control here
                                     that reads rather than changes anything. --}}
                                <button wire:click="toggleTimeline({{ $user->id }})"
                                        title="Activity"
                                        class="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-content
                                               {{ $timelineUserId === $user->id ? 'bg-white/10 text-content' : '' }}">
                                    <svg viewBox="0 0 24 24" class="inline h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                </button>
                            </div>
                        </td>
                    </tr>

                    @if ($timelineUserId === $user->id)
                        <tr>
                            <td colspan="99" class="bg-white/[0.03] p-0">
                                <div class="px-4 py-4">
                                    <p class="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted">
                                        Activity - most recent first
                                    </p>

                                    @forelse ($timeline as $ev)
                                        <div class="flex items-baseline gap-3 border-l border-white/10 py-1.5 pl-3">
                                            <span class="w-32 shrink-0 text-[11px] tabular-nums text-dim">
                                                {{ $ev->occurred_at->format('j M, H:i') }}
                                            </span>
                                            <span class="text-xs font-semibold">{{ $ev->label }}</span>
                                            @if ($ev->subject)
                                                <span class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted">
                                                    {{ $ev->subject }}
                                                </span>
                                            @endif
                                            @if ($ev->meta)
                                                <span class="text-[10px] text-dim">
                                                    {{ collect($ev->meta)->map(fn ($v, $k) => "$k: $v")->implode(', ') }}
                                                </span>
                                            @endif
                                        </div>
                                    @empty
                                        {{-- Absence of events is not absence of the
                                             user: builds before this shipped sent
                                             nothing, and that is worth saying rather
                                             than showing an empty box. --}}
                                        <p class="text-xs text-muted">
                                            Nothing recorded yet. Behaviour arrives with the next sync
                                            from a build that includes it.
                                        </p>
                                    @endforelse
                                </div>
                            </td>
                        </tr>
                    @endif
                @endforeach
            </tbody>
        </table>
    </div>

    <div class="mt-4">{{ $users->links() }}</div>

    {{-- Edit profile modal --}}
    @if ($editingProfileId)
        <template x-teleport="body">
            <div x-show="showEditModal" x-cloak
                 class="fixed inset-0 z-50 flex items-center justify-center px-6"
                 @keydown.escape.window="showEditModal = false">
                <div x-show="showEditModal" x-transition.opacity @click="showEditModal = false" class="absolute inset-0 bg-black/70"></div>
                <div x-show="showEditModal" x-transition class="relative w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl">
                    <h2 class="text-lg font-bold">Edit user</h2>
                    <form wire:submit="updateProfile" class="mt-4 space-y-4">
                        <div>
                            <label class="mb-1 block text-sm text-muted">Name</label>
                            <input type="text" wire:model="editName" autocomplete="off"
                                   class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                            @error('editName') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label class="mb-1 block text-sm text-muted">Email</label>
                            <input type="email" wire:model="editEmail" autocomplete="off"
                                   class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                            @error('editEmail') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
                        </div>
                        <div class="flex gap-3">
                            <button type="button" @click="showEditModal = false" class="h-11 flex-1 rounded-xl bg-white/5 font-semibold tap">Cancel</button>
                            <button type="submit" @click="showEditModal = false" class="h-11 flex-1 rounded-xl bg-accent font-semibold tap">
                                <span wire:loading.remove wire:target="updateProfile">Save</span>
                                <span wire:loading wire:target="updateProfile">Saving...</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </template>
    @endif

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
                            @error('newPassword') <p class="mt-1 text-xs text-red-400">{{ $message }}</p> @enderror
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
