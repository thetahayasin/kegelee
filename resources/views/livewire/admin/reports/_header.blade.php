{{-- The same header on all six pages: what this page answers, the six pills,
     the window, and the two buttons. Shared so a change to any of it cannot
     land on five pages and miss the sixth. --}}
<div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
            <h1 class="text-2xl font-bold">{{ $title }}</h1>
            <p class="mt-0.5 max-w-2xl text-sm text-muted">{{ $question }}</p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            {{-- Three fixed windows rather than a date picker: every question
                 here is "better or worse than before", which needs a
                 consistent window more than an arbitrary one. --}}
            <div class="flex items-center gap-1 rounded-xl bg-white/5 p-1">
                @foreach (\App\Support\Reports\Window::CHOICES as $d)
                    <button type="button" wire:click="setDays({{ $d }})"
                            class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                                   {{ $days === $d ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-content' }}">
                        {{ $d }}d
                    </button>
                @endforeach
            </div>

            {{-- Figures are held for ten minutes so clicking between pages is
                 instant. This is the way to see a change you just made. --}}
            <button type="button" wire:click="refreshData"
                    class="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-muted hover:text-content transition-colors">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>
                </svg>
                <span wire:loading.remove wire:target="refreshData">Refresh</span>
                <span wire:loading wire:target="refreshData">Counting...</span>
            </button>

            <a href="{{ route('admin.reports.export', ['report' => $exportReport, 'days' => $days]) }}"
               class="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-muted hover:text-content transition-colors">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export CSV
            </a>
        </div>
    </div>

    @include('livewire.admin.reports._tabs')

    @if ($statusMessage)
        <p class="text-xs font-semibold text-success">{{ $statusMessage }}</p>
    @endif
</div>
