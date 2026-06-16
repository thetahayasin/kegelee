<?php

namespace App\Livewire\Admin;

use App\Models\Exercise;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.admin')]
class Exercises extends Component
{
    public function toggleActive(int $id): void
    {
        $exercise = Exercise::findOrFail($id);
        $exercise->update(['is_active' => ! $exercise->is_active]);
    }

    public function delete(int $id): void
    {
        Exercise::findOrFail($id)->delete();
    }

    public function render()
    {
        return view('livewire.admin.exercises', [
            'exercises' => Exercise::orderBy('sort_order')->get(),
        ]);
    }
}
