<?php

namespace App\Livewire\App\Exercises;

use App\Models\Exercise;
use App\Services\ProgressionService;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Show extends Component
{
    public Exercise $exercise;

    public function render(ProgressionService $progression)
    {
        $user = auth()->user();
        $duration = $this->exercise->durationForLevel($user->level);

        return view('livewire.app.exercises.show', [
            'unlocked' => $progression->isExerciseUnlocked($user, $this->exercise),
            'daysLeft' => $progression->daysUntilUnlock($user, $this->exercise),
            'needsSubscription' => $this->exercise->is_premium && ! $user->isSubscribed(),
            'levelName' => $user->level?->name,
            'reps' => $this->exercise->repsForDuration($duration),
            'duration' => $duration,
        ]);
    }
}
