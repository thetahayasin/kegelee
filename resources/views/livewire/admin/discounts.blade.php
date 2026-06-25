<div>
    <div class="mb-6">
        <h1 class="text-2xl font-bold">Discounts</h1>
        <p class="text-sm text-muted">Promo codes applied at checkout to reduce the subscription price.</p>
    </div>

    <form wire:submit="create" class="mb-6 grid gap-3 rounded-2xl bg-surface p-5 md:grid-cols-3">
        <div>
            <label class="mb-1 block text-sm text-muted">Code</label>
            <input wire:model="code" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 uppercase focus:border-accent focus:outline-none">
            @error('code') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
        </div>
        <div>
            <label class="mb-1 block text-sm text-muted">Type</label>
            <select wire:model="type" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                <option value="percent">Percent %</option>
                <option value="fixed">Fixed $</option>
            </select>
        </div>
        <div>
            <label class="mb-1 block text-sm text-muted">Value</label>
            <input type="number" step="0.01" wire:model="value" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
        </div>
        <div>
            <label class="mb-1 block text-sm text-muted">Max redemptions</label>
            <input type="number" wire:model="max_redemptions" placeholder="unlimited" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
        </div>
        <div>
            <label class="mb-1 block text-sm text-muted">Expires at</label>
            <input type="date" wire:model="expires_at" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
        </div>
        <div class="md:col-span-3">
            <label class="mb-1 block text-sm text-muted">Description</label>
            <input wire:model="description" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
        </div>
        <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold text-white tap md:w-max">Create discount</button>
    </form>

    <div class="overflow-hidden rounded-2xl border border-white/5 bg-surface">
        <table class="w-full text-sm">
            <thead class="text-left text-muted"><tr class="border-b border-white/5">
                <th class="p-4 font-medium">Code</th><th class="p-4 font-medium">Value</th>
                <th class="p-4 font-medium">Used</th><th class="p-4 font-medium">Status</th><th class="p-4"></th>
            </tr></thead>
            <tbody>
                @forelse ($discounts as $d)
                    <tr class="border-b border-white/5 last:border-0">
                        <td class="p-4 font-mono">{{ $d->code }}</td>
                        <td class="p-4">{{ $d->type === 'percent' ? $d->value.'%' : '$'.$d->value }}</td>
                        <td class="p-4">{{ $d->redemptions }}{{ $d->max_redemptions ? '/'.$d->max_redemptions : '' }}</td>
                        <td class="p-4"><button wire:click="toggle({{ $d->id }})" class="rounded-full px-2.5 py-1 text-xs font-semibold {{ $d->is_active ? 'bg-success/15 text-success' : 'bg-white/10 text-muted' }}">{{ $d->is_active ? 'Active' : 'Off' }}</button></td>
                        <td class="p-4 text-right"><button wire:click="delete({{ $d->id }})" wire:confirm="Delete?" class="text-muted hover:text-accent-soft">Delete</button></td>
                    </tr>
                @empty
                    <tr><td colspan="5" class="p-4 text-muted">No discounts yet.</td></tr>
                @endforelse
            </tbody>
        </table>
    </div>
</div>
