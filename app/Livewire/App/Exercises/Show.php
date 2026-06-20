<?php

namespace App\Livewire\App\Exercises;

use App\Models\Exercise;
use App\Models\UserExerciseSetting;
use App\Services\ProgressionService;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Show extends Component
{
    public Exercise $exercise;

    public float $contractSeconds;

    public float $relaxSeconds;

    public function mount(): void
    {
        $setting = UserExerciseSetting::where('user_id', auth()->id())
            ->where('exercise_id', $this->exercise->id)
            ->first();

        $this->contractSeconds = $setting?->contract_seconds ?? (float) $this->exercise->contract_seconds;
        $this->relaxSeconds = $setting?->relax_seconds ?? (float) $this->exercise->relax_seconds;
    }

    public function adjustContract(float $delta): void
    {
        $this->contractSeconds = max(0.5, round($this->contractSeconds + $delta, 1));
        $this->saveSetting();
    }

    public function adjustRelax(float $delta): void
    {
        $this->relaxSeconds = max(0, round($this->relaxSeconds + $delta, 1));
        $this->saveSetting();
    }

    public function resetTiming(): void
    {
        UserExerciseSetting::where('user_id', auth()->id())
            ->where('exercise_id', $this->exercise->id)
            ->delete();

        $this->contractSeconds = (float) $this->exercise->contract_seconds;
        $this->relaxSeconds = (float) $this->exercise->relax_seconds;
    }

    public function render(ProgressionService $progression)
    {
        $user = auth()->user();
        $duration = $this->exercise->durationForLevel($user->level);
        $cycle = $this->contractSeconds + (float) $this->exercise->hold_seconds + $this->relaxSeconds;
        $reps = $this->exercise->full_hold
            ? 1
            : ($cycle > 0 ? max(1, (int) floor($duration / $cycle + 1e-6)) : 0);

        $isDefault = round($this->contractSeconds, 1) === round((float) $this->exercise->contract_seconds, 1)
            && round($this->relaxSeconds, 1) === round((float) $this->exercise->relax_seconds, 1);

        return view('livewire.app.exercises.show', [
            'unlocked' => $progression->isExerciseUnlocked($user, $this->exercise),
            'daysLeft' => $progression->daysUntilUnlock($user, $this->exercise),
            'levelName' => $user->level?->name,
            'reps' => $reps,
            'duration' => $duration,
            'isDefault' => $isDefault,
        ]);
    }

    private function saveSetting(): void
    {
        UserExerciseSetting::updateOrCreate(
            ['user_id' => auth()->id(), 'exercise_id' => $this->exercise->id],
            ['contract_seconds' => $this->contractSeconds, 'relax_seconds' => $this->relaxSeconds],
        );
    }
}
