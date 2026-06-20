<div>
    <h1 class="mb-6 text-2xl font-bold">Dashboard</h1>

    {{-- Primary stats --}}
    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        @foreach ($stats as $stat)
            <div class="rounded-2xl bg-surface p-5">
                <div class="flex items-center justify-between">
                    <p class="text-3xl font-bold tabular-nums">{{ $stat['value'] }}</p>
                    @if ($stat['icon'] === 'users')
                        <svg viewBox="0 0 24 24" class="h-5 w-5 text-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                    @elseif ($stat['icon'] === 'activity')
                        <svg viewBox="0 0 24 24" class="h-5 w-5 text-muted" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    @elseif ($stat['icon'] === 'trending')
                        <svg viewBox="0 0 24 24" class="h-5 w-5 text-muted" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                    @elseif ($stat['icon'] === 'star')
                        <svg viewBox="0 0 24 24" class="h-5 w-5 text-muted" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    @endif
                </div>
                <p class="mt-1 text-sm text-muted">{{ $stat['label'] }}</p>
            </div>
        @endforeach
    </div>

    {{-- Secondary counts --}}
    <div class="mt-4 grid grid-cols-4 gap-4">
        @foreach ($secondary as $label => $value)
            <div class="rounded-xl bg-surface px-4 py-3 text-center">
                <p class="text-lg font-bold tabular-nums">{{ $value }}</p>
                <p class="text-xs text-muted">{{ $label }}</p>
            </div>
        @endforeach
    </div>

    {{-- Chart --}}
    <div class="mt-6 rounded-2xl bg-surface p-5">
        <div class="mb-4 flex items-center justify-between">
            <p class="font-semibold">Workout sessions</p>
            <span class="text-xs text-muted">Last 14 days</span>
        </div>
        <div class="flex h-40 items-end gap-1.5">
            @foreach ($chart as $bar)
                <div class="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span class="text-[9px] font-medium text-muted tabular-nums">{{ $bar['value'] ?: '' }}</span>
                    <div class="w-full rounded-t bg-accent/80 transition-all" style="height: {{ max(2, $bar['value'] / $chartMax * 100) }}%"></div>
                    <span class="text-[10px] text-muted">{{ $bar['label'] }}</span>
                </div>
            @endforeach
        </div>
    </div>

    {{-- Recent users --}}
    <div class="mt-6 rounded-2xl bg-surface p-5">
        <div class="mb-4 flex items-center justify-between">
            <p class="font-semibold">Recent users</p>
            <a href="{{ route('admin.users') }}" class="text-xs font-medium text-accent hover:underline">View all</a>
        </div>
        @forelse ($recentUsers as $user)
            <div class="flex items-center justify-between border-b border-white/5 py-2.5 last:border-0">
                <div class="flex items-center gap-3">
                    <div class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted">
                        {{ strtoupper(substr($user->name, 0, 1)) }}
                    </div>
                    <div>
                        <p class="text-sm font-medium">{{ $user->name }}</p>
                        <p class="text-xs text-muted">{{ $user->email }}</p>
                    </div>
                </div>
                <span class="text-xs text-muted">{{ $user->created_at->diffForHumans() }}</span>
            </div>
        @empty
            <p class="text-sm text-muted">No users yet.</p>
        @endforelse
    </div>
</div>
