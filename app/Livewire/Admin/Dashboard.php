<?php

namespace App\Livewire\Admin;

use App\Models\Exercise;
use App\Models\KnowledgeLesson;
use App\Models\Level;
use App\Models\Plan;
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

        return view('livewire.admin.dashboard', [
            'stats' => [
                ['label' => 'Total users', 'value' => $totalUsers, 'icon' => 'users'],
                ['label' => 'Today sessions', 'value' => $todaySessions, 'icon' => 'activity'],
                ['label' => 'This week', 'value' => $weekSessions, 'icon' => 'trending'],
                ['label' => 'Active subs', 'value' => Subscription::whereIn('status', ['active', 'trialing'])->count(), 'icon' => 'star'],
            ],
            'secondary' => [
                'Exercises' => Exercise::where('is_active', true)->count(),
                'Levels' => Level::where('is_active', true)->count(),
                'Knowledge' => KnowledgeLesson::where('is_active', true)->count(),
                'Plans' => Plan::where('is_active', true)->count(),
            ],
            'chart' => $chart,
            'chartMax' => max(1, $chart->max('value')),
            'recentUsers' => User::where('is_admin', false)->latest()->take(8)->get(),
        ]);
    }
}
