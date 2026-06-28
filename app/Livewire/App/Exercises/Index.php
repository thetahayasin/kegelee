<?php

namespace App\Livewire\App\Exercises;

use App\Models\Exercise;
use App\Services\ProgressionService;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Index extends Component
{
    public function render(ProgressionService $progression)
    {
        $user = auth()->user();
        $completed = $progression->completedDays($user);

        $exercises = Exercise::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn (Exercise $e) => [
                'model' => $e,
                'unlocked' => $progression->isExerciseUnlocked($user, $e),
                'days_left' => $progression->daysUntilUnlock($user, $e),
                'completed' => min($completed, $e->unlock_after_days),
            ]);

        return view('livewire.app.exercises.index', ['exercises' => $exercises]);
    }
}
