<div>
    <h1 class="mb-6 text-2xl font-bold">Subscriptions</h1>

    <div class="overflow-hidden rounded-2xl bg-surface">
        <table class="w-full text-sm">
            <thead class="text-left text-muted"><tr class="border-b border-white/5">
                <th class="p-4 font-medium">User</th><th class="p-4 font-medium">Plan</th>
                <th class="p-4 font-medium">Status</th><th class="p-4 font-medium">Ends</th><th class="p-4"></th>
            </tr></thead>
            <tbody>
                @forelse ($subscriptions as $sub)
                    <tr class="border-b border-white/5 last:border-0">
                        <td class="p-4">{{ $sub->user?->email ?? '—' }}</td>
                        <td class="p-4">{{ $sub->plan?->name ?? '—' }}</td>
                        <td class="p-4">
                            <span class="rounded-full px-2.5 py-1 text-xs font-semibold
                                {{ in_array($sub->status, ['active','trialing']) ? 'bg-success/15 text-success' : 'bg-white/10 text-muted' }}">{{ $sub->status }}</span>
                        </td>
                        <td class="p-4 text-muted">{{ $sub->ends_at?->translatedFormat('j M Y') ?? '—' }}</td>
                        <td class="p-4 text-right">
                            @if (in_array($sub->status, ['active','trialing']))
                                <button wire:click="cancel({{ $sub->id }})" wire:confirm="Cancel subscription?" class="text-muted hover:text-accent-soft">Cancel</button>
                            @endif
                        </td>
                    </tr>
                @empty
                    <tr><td colspan="5" class="p-4 text-muted">No subscriptions yet.</td></tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="mt-4">{{ $subscriptions->links() }}</div>
</div>
