<?php

namespace App\Livewire\App;

use App\Models\Exercise;
use App\Models\Level;
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

    /** Try-it-now preview: runs the single exercise at level 1, records nothing. */
    public bool $trial = false;

    /** Seconds before the trial "Skip" affordance appears (one full cycle). */
    public float $skipAfter = 0.0;

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
            $this->trial = request()->boolean('trial');
            // The try-it-now preview runs at the user's current level.
            $level = $this->trial
                ? ($user->level ?? Level::where('is_active', true)->orderBy('number')->first())
                : null;
            $playlist = $builder->single($user, $this->exercise, $level);
            $this->exerciseNames = [$this->exercise->name];
            $this->skipAfter = $this->skipThreshold($playlist['steps'], $playlist['total']);
        } else {
            $this->sessionMode = true;
            $playlist = $builder->daily($user);
            $this->exerciseNames = $playlist['exercises'];
        }

        $this->steps = $playlist['steps'];
    }

    /** One full cycle (contract + relax) — or 5s for a sustained hold. */
    private function skipThreshold(array $steps, float $total): float
    {
        if ($this->exercise?->full_hold) {
            return min(5.0, $total);
        }

        $after = 0.0;
        $seen = [];
        foreach ($steps as $s) {
            if (in_array($s['phase'], $seen, true)) {
                break; // next cycle begins
            }
            $seen[] = $s['phase'];
            $after += (float) $s['seconds'];
        }

        return $after;
    }

    public function complete(int $seconds, ProgressionService $progression)
    {
        // A try-it-now preview is throwaway: don't touch progression, just show trial completion screen.
        if ($this->trial) {
            $this->done = true;
            return;
        }

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
            'animationSpeed' => (float) $settings->get('circle_animation_speed', 0.12),
            'glowSpeed' => (float) $settings->get('circle_glow_speed', 0.45),
            'timeScale' => (float) $settings->get('circle_time_scale', 0.7),
            'trial' => $this->trial,
            'skipAfter' => $this->skipAfter,
        ]);
    }
}
