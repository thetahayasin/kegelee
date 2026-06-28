<div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
            <h1 class="text-2xl font-bold">Plans</h1>
            <p class="text-sm text-muted">Subscription tiers available for purchase. Every plan grants full app access.</p>
        </div>
        <div class="flex items-center gap-3">
            @if ($savedMessage)
                <span class="rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success">{{ $savedMessage }}</span>
            @endif
            <button wire:click="addPlan"
                    class="flex items-center gap-1.5 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm font-semibold tap hover:border-accent/40 transition-colors">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                Add plan
            </button>
        </div>
    </div>

    <form wire:submit="save" class="space-y-4">
        @foreach ($rows as $i => $row)
            <div wire:key="plan-{{ $row['id'] }}" class="grid gap-3 rounded-2xl border border-white/5 bg-surface p-5 md:grid-cols-2">
                <div>
                    <label class="mb-1 block text-sm text-muted">Name</label>
                    <input wire:model="rows.{{ $i }}.name" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <div><label class="mb-1 block text-sm text-muted">Price</label>
                        <input type="number" step="0.01" wire:model="rows.{{ $i }}.price" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none"></div>
                    <div><label class="mb-1 block text-sm text-muted">Every</label>
                        <input type="number" min="1" wire:model="rows.{{ $i }}.interval_count" title="e.g. 3 + month = every 3 months" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none"></div>
                    <div><label class="mb-1 block text-sm text-muted">Interval</label>
                        <select wire:model="rows.{{ $i }}.interval" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                            @foreach ($intervals as $opt)<option value="{{ $opt }}">{{ $opt }}</option>@endforeach
                        </select></div>
                </div>
                <div class="md:col-span-2">
                    <p class="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">Every plan grants full access to the entire app. There are no per-plan feature differences.</p>
                </div>
                <div>
                    <label class="mb-1 block text-sm text-muted">Store product ID</label>
                    <input wire:model="rows.{{ $i }}.store_product_id" class="h-10 w-full rounded-lg border border-white/10 bg-surface-2 px-2 focus:border-accent focus:outline-none">
                </div>
                <div class="flex items-center gap-5">
                    <label class="flex items-center gap-2"><input type="checkbox" wire:model="rows.{{ $i }}.is_featured" class="h-5 w-5 accent-[var(--c-accent)]"> <span class="text-sm">Featured</span></label>
                    <label class="flex items-center gap-2"><input type="checkbox" wire:model="rows.{{ $i }}.is_active" class="h-5 w-5 accent-[var(--c-accent)]"> <span class="text-sm">Active</span></label>
                    <button type="button" wire:click="delete({{ $row['id'] }})" wire:confirm="Delete plan?" class="ml-auto text-sm text-muted hover:text-accent-soft">Delete</button>
                </div>
            </div>
        @endforeach
        <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold text-white tap">Save plans</button>
    </form>
</div>
