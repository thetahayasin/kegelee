<div>
    <div class="mb-6 flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold">Pages</h1>
            <p class="text-sm text-muted">Privacy policy, refund policy and any other content pages.</p>
        </div>
        <button wire:click="newPage" class="rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold tap">New page</button>
    </div>

    <div class="grid gap-6 lg:grid-cols-[260px_1fr]">
        {{-- List --}}
        <div class="space-y-2">
            @foreach ($pages as $page)
                <button wire:click="edit({{ $page->id }})"
                        class="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left tap {{ $editingId === $page->id ? 'bg-accent/15' : 'bg-surface' }}">
                    <span>
                        <span class="block text-sm font-medium">{{ $page->title }}</span>
                        <span class="block text-xs text-muted">/p/{{ $page->slug }}</span>
                    </span>
                    @unless ($page->is_published)<span class="text-xs text-muted">Draft</span>@endunless
                </button>
            @endforeach
        </div>

        {{-- Editor --}}
        <form wire:submit="save" class="space-y-4 rounded-2xl bg-surface p-5">
            <div class="flex items-center justify-between">
                <h2 class="font-semibold">{{ $editingId ? 'Edit page' : 'New page' }}</h2>
                @if ($savedMessage)<span class="text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
            </div>

            <div class="grid gap-4 md:grid-cols-2">
                <div>
                    <label class="mb-1 block text-sm text-muted">Title</label>
                    <input wire:model="title" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                    @error('title') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
                </div>
                <div>
                    <label class="mb-1 block text-sm text-muted">Slug</label>
                    <input wire:model="slug" placeholder="auto from title" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none">
                    @error('slug') <p class="mt-1 text-sm text-accent-soft">{{ $message }}</p> @enderror
                </div>
            </div>

            <div wire:key="page-content-{{ $editingId ?? 'new' }}">
                <label class="mb-1 block text-sm text-muted">Content</label>
                <x-wysiwyg model="content" placeholder="Write the page content..." />
            </div>

            <div class="flex items-center justify-between">
                <div class="flex items-center gap-5">
                    <label class="flex items-center gap-2"><input type="checkbox" wire:model="is_published" class="h-5 w-5 accent-[var(--c-accent)]"> <span class="text-sm">Published</span></label>
                    <label class="flex items-center gap-2 text-sm text-muted">Order <input type="number" wire:model="sort_order" class="h-9 w-16 rounded-lg border border-white/10 bg-surface-2 px-2"></label>
                </div>
                @if ($editingId)
                    <a href="{{ route('page.show', $slug) }}" target="_blank" class="text-sm text-accent-soft">Preview ↗</a>
                @endif
            </div>

            <div class="flex gap-3">
                <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold tap">Save page</button>
                @if ($editingId)
                    <button type="button" wire:click="delete({{ $editingId }})" wire:confirm="Delete this page?" class="rounded-xl bg-surface-2 px-6 py-3 font-semibold text-muted tap">Delete</button>
                @endif
            </div>
        </form>
    </div>
</div>
