<?php

namespace App\Livewire\App;

use App\Services\ProgressionService;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Profile extends Component
{
    public function render(ProgressionService $progression)
    {
        $user = auth()->user();

        return view('livewire.app.profile', [
            'user' => $user,
            'completedDays' => $progression->completedDays($user),
            'subscription' => $user->activeSubscription(),
            'levelName' => $user->level?->name ?? 'Not set',
        ]);
    }
}
