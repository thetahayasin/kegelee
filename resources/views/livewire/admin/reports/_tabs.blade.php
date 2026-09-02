{{-- The six reports, as pills. Same visual language as the 7/30/90 toggle,
     because they do the same job: pick one of a short fixed list. --}}
@php
    $tabs = [
        ['admin.reports.overview', 'Overview'],
        ['admin.reports.funnel', 'Funnel'],
        ['admin.reports.retention', 'Coming back'],
        ['admin.reports.training', 'Training'],
        ['admin.reports.money', 'Money'],
        ['admin.reports.engagement', 'Engagement'],
    ];
@endphp

<div class="flex flex-wrap items-center gap-1 rounded-xl bg-white/5 p-1">
    @foreach ($tabs as [$route, $label])
        {{-- The window travels with the link: clicking through the reports
             should not silently put you back on 30 days. --}}
        <a href="{{ route($route, ['days' => $days]) }}"
           class="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                  {{ request()->routeIs($route) ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-content' }}">
            {{ $label }}
        </a>
    @endforeach
</div>
