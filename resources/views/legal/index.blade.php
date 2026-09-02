<x-layouts.page title="Legal & Policies">
    <h1 class="text-2xl font-bold">Legal &amp; Policies</h1>
    <p class="mt-1 text-sm text-muted">Our policies, terms and other important information.</p>

    <div class="mt-6 divide-y divide-white/5 overflow-hidden rounded-2xl bg-surface">
        @forelse (\App\Models\Page::where('is_published', true)->orderBy('sort_order')->get() as $p)
            <a href="{{ route('page.show', $p) }}" class="flex items-center justify-between px-5 py-4 tap transition-colors hover:bg-white/5">
                <span class="font-medium">{{ $p->title }}</span>
                <svg viewBox="0 0 24 24" class="h-5 w-5 text-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </a>
        @empty
            <p class="px-5 py-8 text-center text-muted">No policies published yet.</p>
        @endforelse

        {{-- Listed here as well as in the footer: this is the page the Play
             Console's data-deletion URL points at, and a reviewer looking for
             it looks under Legal. --}}
        <a href="{{ route('account.delete') }}" class="flex items-center justify-between px-5 py-4 tap transition-colors hover:bg-white/5">
            <span class="font-medium">Delete your account</span>
            <svg viewBox="0 0 24 24" class="h-5 w-5 text-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
        </a>
    </div>
</x-layouts.page>
