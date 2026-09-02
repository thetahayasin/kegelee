{{-- Switching page or language throws away whatever is in the editor, and a
     legal page is not something to retype. Any input marks the form dirty; the
     confirm only appears while it is. --}}
<div x-data="{
        dirty: false,
        leave(run) {
            if (this.dirty && ! window.confirm('You have unsaved changes. Discard them?')) return;
            this.dirty = false;
            run();
        },
     }"
     @page-saved.window="dirty = false">
    <div class="mb-6 flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold">Pages</h1>
            <p class="text-sm text-muted">Privacy policy, refund policy and any other content pages.</p>
        </div>
        <button type="button" @click="leave(() => $wire.newPage())" class="rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold tap">New page</button>
    </div>

    <div class="grid gap-6 lg:grid-cols-[260px_1fr]">
        {{-- List --}}
        <div class="space-y-2">
            @forelse ($pages as $page)
                <button type="button" @click="leave(() => $wire.edit({{ $page->id }}))"
                        class="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left tap {{ $editingId === $page->id ? 'bg-accent/15' : 'bg-surface' }}">
                    <span>
                        <span class="block text-sm font-medium">{{ $page->title }}</span>
                        <span class="block text-xs text-muted">/p/{{ $page->slug }}</span>
                    </span>
                    @unless ($page->is_published)<span class="text-xs text-muted">Draft</span>@endunless
                </button>
            @empty
                <div class="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
                    <p class="text-sm font-medium">No pages yet</p>
                    <p class="mt-1 text-xs text-muted">The privacy policy and terms are what the Play listing links to. Create them here.</p>
                </div>
            @endforelse
        </div>

        {{-- Editor --}}
        <form wire:submit="save" class="space-y-4 rounded-2xl bg-surface p-5"
              @input="dirty = true" @wysiwyg-input="dirty = true">
            <div class="flex items-center justify-between">
                <h2 class="font-semibold">{{ $editingId ? 'Edit page' : 'New page' }}</h2>
                @if ($savedMessage)<span class="text-sm font-semibold text-success">{{ $savedMessage }}</span>@endif
            </div>

            {{-- Language tabs. Only once the page exists: a translation needs
                 something to hang off, and English is what everything falls
                 back to, so it has to be written first. --}}
            @if ($editingId)
                <div class="rounded-xl bg-surface-2 p-3">
                    <div class="mb-2 flex items-center justify-between">
                        <span class="text-xs font-semibold uppercase tracking-wide text-muted">Language</span>
                        <span class="flex items-center gap-3 text-[11px] text-muted">
                            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-success"></span> reviewed</span>
                            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-accent/60"></span> draft</span>
                            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-full bg-white/20"></span> falls back to English</span>
                        </span>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        @foreach ($locales as $tag => $name)
                            @php($state = $localeStates[$tag] ?? 'missing')
                            <button type="button" @click="leave(() => $wire.switchLocale('{{ $tag }}'))"
                                    title="{{ $name }}"
                                    class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs tap {{ $locale === $tag ? 'bg-accent/20 font-semibold text-content' : 'bg-surface text-muted' }}">
                                <span class="h-2 w-2 shrink-0 rounded-full {{ $state === 'done' ? 'bg-success' : ($state === 'draft' ? 'bg-accent/60' : 'bg-white/20') }}"></span>
                                {{ $tag }}
                            </button>
                        @endforeach
                    </div>
                </div>
            @endif

            @unless ($this->isBase())
                <p class="rounded-xl bg-accent/10 px-4 py-3 text-sm text-muted">
                    Editing the <span class="font-semibold text-content">{{ $locales[$locale] }}</span> translation.
                    Slug, publish state and order belong to the page itself and are edited on the English tab.
                    Leave the body empty and this language falls back to English.
                </p>
            @endunless

            <div class="grid gap-4 md:grid-cols-2">
                <div>
                    <label class="mb-1 block text-sm text-muted">Title</label>
                    <input wire:model="title" @if($isRtl) dir="rtl" @endif
                           class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 focus:border-accent focus:outline-none">
                    @error('title') <p class="mt-1 text-sm text-red-400">{{ $message }}</p> @enderror
                </div>
                @if ($this->isBase())
                    <div>
                        <label class="mb-1 block text-sm text-muted">Slug</label>
                        <input wire:model="slug" placeholder="auto from title" class="h-11 w-full rounded-xl border border-white/10 bg-surface-2 px-3 font-mono text-sm focus:border-accent focus:outline-none">
                        @error('slug') <p class="mt-1 text-sm text-red-400">{{ $message }}</p> @enderror
                    </div>
                @endif
            </div>

            {{-- wire:key includes the locale so switching tabs actually swaps
                 the editor's contents; without it Livewire reuses the same
                 DOM node and the previous language's text stays on screen. --}}
            <div wire:key="page-content-{{ $editingId ?? 'new' }}-{{ $locale }}" @if($isRtl) dir="rtl" @endif>
                <label class="mb-1 block text-sm text-muted">Content</label>
                <x-wysiwyg model="content" placeholder="Write the page content..." />
            </div>

            <div class="flex items-center justify-between">
                <div class="flex items-center gap-5">
                    @if ($this->isBase())
                        <label class="flex items-center gap-2"><input type="checkbox" wire:model="is_published" class="h-5 w-5 accent-[var(--c-accent)]"> <span class="text-sm">Published</span></label>
                        <label class="flex items-center gap-2 text-sm text-muted">Order <input type="number" wire:model="sort_order" class="h-9 w-16 rounded-lg border border-white/10 bg-surface-2 px-2"></label>
                    @else
                        {{-- Machine translations land unreviewed. Legal text has
                             consequences, so the tab strip has to show which
                             languages a person has actually read. --}}
                        <label class="flex items-center gap-2"><input type="checkbox" wire:model="is_reviewed" class="h-5 w-5 accent-[var(--c-accent)]"> <span class="text-sm">Reviewed by a human</span></label>
                    @endif
                </div>
                @if ($editingId)
                    <a href="{{ route('page.show', $slug) }}{{ $this->isBase() ? '' : '?locale='.$locale }}" target="_blank" class="text-sm text-accent-soft">Preview ↗</a>
                @endif
            </div>

            <div class="flex gap-3">
                <button type="submit" class="rounded-xl bg-accent px-6 py-3 font-semibold tap">
                    {{ $this->isBase() ? 'Save page' : 'Save translation' }}
                </button>
                @if ($editingId && ! $this->isBase())
                    <button type="button" wire:click="deleteTranslation" wire:confirm="Remove the {{ $locales[$locale] }} translation? The page will fall back to English." class="rounded-xl bg-surface-2 px-6 py-3 font-semibold text-muted tap">Remove translation</button>
                @endif
                @if ($editingId && $this->isBase())
                    <button type="button" wire:click="delete({{ $editingId }})" wire:confirm="Delete this page and all its translations?" class="rounded-xl bg-surface-2 px-6 py-3 font-semibold text-muted tap">Delete</button>
                @endif
            </div>
        </form>
    </div>
</div>
