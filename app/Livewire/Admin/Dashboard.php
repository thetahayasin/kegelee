<?php

namespace App\Livewire\Admin;

use App\Models\Measurement;
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

        // Keyed on completed_at, not created_at.
        //
        // A workout row is created when the phone SYNCS it, and phones sync
        // when they find signal - so a week spent offline landed a week of
        // training on one bar and left six days looking empty. completed_at is
        // when the person actually did it, which is the only thing this chart
        // is meant to show.
        $todaySessions = WorkoutSession::whereDate('completed_at', today())->count();
        $weekSessions = WorkoutSession::where('completed_at', '>=', now()->subDays(7))->count();

        // Counted in the database rather than hydrated into models: this used
        // to pull every session of the last fortnight into memory to group
        // them in PHP, so the dashboard got slower with every user.
        // DATE(completed_at) is spelled the same in SQLite and MySQL.
        $sessionsByDay = WorkoutSession::query()
            ->where('completed_at', '>=', now()->subDays(13)->startOfDay())
            ->selectRaw('DATE(completed_at) as day, COUNT(*) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $chart = collect(range(13, 0))->map(function ($i) use ($sessionsByDay) {
            $date = Carbon::today()->subDays($i);
            return ['label' => $date->format('j'), 'value' => (int) ($sessionsByDay[$date->toDateString()] ?? 0)];
        });

        // --- The free funnel, as counts ---
        //
        // Signed up -> onboarded -> basics -> trained -> subscribed. Every
        // step between the first and the last used to happen entirely on the
        // device, so the only two numbers the backend could show were the two
        // ends, and nothing about where people actually stop.
        //
        // Two steps have been removed rather than repaired. The demo went with
        // the demo session. "Measured" went with the press-and-hold that used
        // to sit in onboarding: measuring now happens on the Progress tab,
        // which is behind the subscription, so the count would have been a
        // subset of "Subscribed" - which breaks the one property a funnel
        // needs, that each step contains the next.
        //
        // What is left is read from rows the client already pushes, so there
        // is no column here that can quietly stop being written.
        //
        // Cumulative, not exclusive: someone who subscribed also onboarded, and
        // a funnel that hid that would read as a collapse rather than a
        // progression.
        $funnelBase = User::where('is_admin', false);
        $onboarded = (clone $funnelBase)->whereNotNull('onboarding_completed_at')->count();
        $reachedBasics = (clone $funnelBase)
            ->whereHas('completedLessons', fn ($q) => $q->whereNotNull('knowledge_lesson_user.completed_at'))
            ->count();
        $trained = (clone $funnelBase)->whereHas('workoutSessions')->count();
        $subscribed = (clone $funnelBase)
            ->whereHas('subscriptions', fn ($q) => $q->whereIn('status', ['active', 'trialing']))
            ->count();

        $funnel = [
            ['label' => 'Signed up', 'value' => $totalUsers],
            ['label' => 'Onboarded', 'value' => $onboarded],
            ['label' => 'Basics started', 'value' => $reachedBasics],
            ['label' => 'Trained', 'value' => $trained],
            ['label' => 'Subscribed', 'value' => $subscribed],
        ];

        // The first hold each account ever recorded, averaged.
        //
        // Read from the measurements themselves rather than from
        // users.onboarding_baseline_seconds, which no longer gets written: the
        // onboarding measurement was removed, on the grounds that asking
        // somebody to perform a contraction correctly before they have read
        // the lesson explaining what one is produces a guess with a decimal
        // point on it. The Progress tab still measures, after the basics, and
        // a first reading taken there is the more truthful version of the same
        // number - so the card keeps its meaning and gains some accuracy.
        $avgBaseline = Measurement::query()
            ->whereIn('id', function ($q) {
                $q->selectRaw('MIN(id)')->from('measurements')->groupBy('user_id');
            })
            ->avg('seconds');

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
