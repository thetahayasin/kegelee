<?php

namespace App\Livewire\Admin;

use App\Models\Exercise;
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
                'Users' => User::where('is_admin', false)->count(),
                'Exercises' => Exercise::count(),
                'Levels' => Level::count(),
                'Active subs' => Subscription::whereIn('status', ['active', 'trialing'])->count(),
            ],
            'chart' => $chart,
            'chartMax' => max(1, $chart->max('value')),
            'recentUsers' => User::where('is_admin', false)->latest()->take(5)->get(),
            'plans' => Plan::where('is_active', true)->count(),
        ]);
    }
}
