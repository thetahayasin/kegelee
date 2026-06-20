<?php

namespace App\Livewire\App;

use App\Services\ProgressionService;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Schedule extends Component
{
    public function render(ProgressionService $progression)
    {
        $user = auth()->user();
        $position = $progression->position($user);

        $calendarDays = [];
        for ($d = 1; $d <= $position['plan_length']; $d++) {
            $calendarDays[] = [
                'n' => $d,
                'done' => $d <= $position['completed'],
                'today' => $d === $position['day'],
            ];
        }

        return view('livewire.app.schedule', [
            'position' => $position,
            'calendarDays' => $calendarDays,
            'reminderCount' => $user->reminders()->where('is_enabled', true)->count(),
        ]);
    }
}
