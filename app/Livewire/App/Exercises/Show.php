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

        // Copy comes straight from the hardcoded catalogue so the page always
        // shows the current text, never a stale database row.
        $catalog = $this->exercise->catalog();

        return view('livewire.app.exercises.show', [
            'unlocked' => $progression->isExerciseUnlocked($user, $this->exercise),
            'daysLeft' => $progression->daysUntilUnlock($user, $this->exercise),
            'description' => $catalog['description'] ?? $this->exercise->description,
            'howTo' => $catalog['how_to'] ?? $this->exercise->instructions,
        ]);
    }
}
