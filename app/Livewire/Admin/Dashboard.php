<?php

namespace App\Livewire\Admin;

use App\Models\Page;
use App\Models\Subscription;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Support\Carbon;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.admin')]
class Dashboard extends Component
{
    public function render()
    {
        $totalUsers = User::where('is_admin', false)->count();
        $todaySessions = WorkoutSession::whereDate('created_at', today())->count();
        $weekSessions = WorkoutSession::where('created_at', '>=', now()->subDays(7))->count();

        $sessionsByDay = WorkoutSession::query()
            ->where('created_at', '>=', now()->subDays(13)->startOfDay())
            ->get()
            ->groupBy(fn ($s) => $s->created_at->toDateString());

        $chart = collect(range(13, 0))->map(function ($i) use ($sessionsByDay) {
            $date = Carbon::today()->subDays($i);
            return ['label' => $date->format('j'), 'value' => ($sessionsByDay[$date->toDateString()] ?? collect())->count()];
        });

        // --- The free funnel, as counts ---
        //
        // Signed up -> onboarded -> basics -> demo -> subscribed. Every step
        // between the first and the last used to happen entirely on the
        // device, so the only two numbers the backend could show were the two
        // ends, and nothing about where people actually stop.
        //
        // Cumulative, not exclusive: someone who subscribed also onboarded, and
        // a funnel that hid that would read as a collapse rather than a
        // progression.
        $funnelBase = User::where('is_admin', false);
        $onboarded = (clone $funnelBase)->whereNotNull('onboarding_completed_at')->count();
        $measured = (clone $funnelBase)->whereNotNull('onboarding_baseline_seconds')->count();
        $reachedBasics = (clone $funnelBase)
            ->whereHas('completedLessons', fn ($q) => $q->wherePivotNotNull('completed_at'))
            ->count();
        $demoDone = (clone $funnelBase)->whereNotNull('free_session_completed_at')->count();
        $subscribed = (clone $funnelBase)
            ->whereHas('subscriptions', fn ($q) => $q->whereIn('status', ['active', 'trialing']))
            ->count();

        $funnel = [
            ['label' => 'Signed up', 'value' => $totalUsers],
            ['label' => 'Onboarded', 'value' => $onboarded],
            ['label' => 'Measured', 'value' => $measured],
            ['label' => 'Basics started', 'value' => $reachedBasics],
            ['label' => 'Demo completed', 'value' => $demoDone],
            ['label' => 'Subscribed', 'value' => $subscribed],
        ];

        // The opening hold across everyone who took one - the number every
        // "you have improved" claim is eventually measured against.
        $avgBaseline = (clone $funnelBase)->whereNotNull('onboarding_baseline_seconds')
            ->avg('onboarding_baseline_seconds');

        return view('livewire.admin.dashboard', [
            'funnel' => $funnel,
            'funnelMax' => max(1, $totalUsers),
            'avgBaseline' => $avgBaseline ? round((float) $avgBaseline, 1) : null,
            'stats' => [
                ['label' => 'Total users', 'value' => $totalUsers, 'icon' => 'users'],
                ['label' => 'Today sessions', 'value' => $todaySessions, 'icon' => 'activity'],
                ['label' => 'This week', 'value' => $weekSessions, 'icon' => 'trending'],
                ['label' => 'Active subs', 'value' => Subscription::whereIn('status', ['active', 'trialing'])->count(), 'icon' => 'star'],
            ],
            'secondary' => [
                'Pages' => Page::where('is_published', true)->count(),
                'Subscribers' => Subscription::whereIn('status', ['active', 'trialing'])->distinct('user_id')->count('user_id'),
                'Users' => $totalUsers,
                'Sessions' => WorkoutSession::count(),
            ],
            'chart' => $chart,
            'chartMax' => max(1, $chart->max('value')),
            'recentUsers' => User::where('is_admin', false)->latest()->take(8)->get(),
        ]);
    }
}
