<?php

namespace App\Livewire\App;

use App\Models\Exercise;
use App\Services\ProgressionService;
use App\Services\SessionBuilder;
use App\Services\SettingsService;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Workout extends Component
{
    public ?Exercise $exercise = null;

    public bool $sessionMode = false;

    /** @var array<int, array{exercise:string,phase:string,label:string,seconds:float}> */
    public array $steps = [];

    /** @var array<int, string> */
    public array $exerciseNames = [];

    public bool $done = false;

    /** Completion context for the day-complete screen. */
    public array $result = [];

    public function mount(SessionBuilder $builder)
    {
        $user = auth()->user();

        if ($this->exercise) {
            $playlist = $builder->single($user, $this->exercise);
            $this->exerciseNames = [$this->exercise->name];
        } else {
            $this->sessionMode = true;
            $playlist = $builder->daily($user);
            $this->exerciseNames = $playlist['exercises'];
        }

        $this->steps = $playlist['steps'];
    }

    public function complete(int $seconds, ProgressionService $progression): void
    {
        $user = auth()->user();
        $context = $progression->recordSession($user, $this->sessionMode ? null : $this->exercise, $seconds);

        $position = $progression->position($user);
        $planLength = $position['plan_length'];
        $completed = $position['completed'];

        // Build the month grid for the completion calendar strip.
        $days = [];
        $start = max(1, $position['day'] - 4);
        for ($d = $start; $d <= min($planLength, $start + 6); $d++) {
            $days[] = ['n' => $d, 'done' => $d <= $completed, 'today' => $d === $position['day']];
        }

        $this->result = [
            'day_completed' => $context['day_completed'],
            'is_extra' => $context['is_extra'],
            'progress' => $context['progress'],
            'position' => $position,
            'days' => $days,
            'unlocked' => collect($context['unlocked'])->pluck('name')->all(),
            'next_unlock' => $progression->nextUnlock($user)?->only(['name', 'unlock_after_days']),
            'next_unlock_completed' => $completed,
        ];

        $this->done = true;
    }

    public function render(SettingsService $settings)
    {
        return view('livewire.app.workout', [
            'glowEnabled' => (bool) $settings->get('circle_glow_enabled'),
            'glowColor' => $settings->get('circle_glow_color'),
            'circleSize' => (int) $settings->get('circle_size'),
            'trackWidth' => (int) $settings->get('circle_track_width'),
            'haptics' => (bool) $settings->get('haptics_enabled'),
        ]);
    }
}
