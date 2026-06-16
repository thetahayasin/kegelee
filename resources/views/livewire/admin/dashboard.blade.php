<div>
    <h1 class="mb-6 text-2xl font-bold">Dashboard</h1>

    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        @foreach ($stats as $label => $value)
            <div class="rounded-2xl bg-surface p-5">
                <p class="text-3xl font-bold">{{ $value }}</p>
                <p class="text-sm text-muted">{{ $label }}</p>
            </div>
        @endforeach
    </div>

    <div class="mt-6 rounded-2xl bg-surface p-5">
        <p class="mb-4 font-semibold">Workout sessions · last 14 days</p>
        <div class="flex h-40 items-end gap-2">
            @foreach ($chart as $bar)
                <div class="flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <div class="w-full rounded-t bg-accent/80" style="height: {{ max(2, $bar['value'] / $chartMax * 100) }}%" title="{{ $bar['value'] }}"></div>
                    <span class="text-[10px] text-muted">{{ $bar['label'] }}</span>
                </div>
            @endforeach
        </div>
    </div>

    <div class="mt-6 rounded-2xl bg-surface p-5">
        <p class="mb-4 font-semibold">Recent users</p>
        @forelse ($recentUsers as $user)
            <div class="flex items-center justify-between border-b border-white/5 py-2 last:border-0">
                <div>
                    <p class="font-medium">{{ $user->name }}</p>
                    <p class="text-sm text-muted">{{ $user->email }}</p>
                </div>
                <span class="text-sm text-muted">{{ $user->created_at->diffForHumans() }}</span>
            </div>
        @empty
            <p class="text-sm text-muted">No users yet.</p>
        @endforelse
    </div>
</div>
