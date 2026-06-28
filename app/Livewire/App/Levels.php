<?php

namespace App\Livewire\App;

use App\Models\Level;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Levels extends Component
{
    public function select(int $levelId)
    {
        $level = Level::where('is_active', true)->findOrFail($levelId);
        auth()->user()->update(['level_id' => $level->id]);

        // Hard redirect (navigate: false) clears the wire:navigate SPA cache
        // so every page (Profile, Home, etc.) re-renders with the new level.
        $this->redirect(route('home'), navigate: false);
    }

    public function render()
    {
        return view('livewire.app.levels', [
            'levels' => Level::where('is_active', true)->orderBy('number')->get(),
            'currentId' => auth()->user()->level_id,
        ]);
    }
}
