<?php

namespace App\Livewire\Admin;

use App\Models\Exercise;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.admin')]
class Exercises extends Component
{
    /** @var int[] */
    public array $selected = [];

    public function toggleActive(int $id): void
    {
        $exercise = Exercise::findOrFail($id);
        $exercise->update(['is_active' => ! $exercise->is_active]);
    }

    public function selectAll(): void
    {
        $allIds = Exercise::orderBy('sort_order')->pluck('id')->toArray();

        // If everything is already selected, deselect all instead.
        if (count($this->selected) === count($allIds)) {
            $this->selected = [];
        } else {
            $this->selected = $allIds;
        }
    }

    public function bulkSetActive(): void
    {
        if (empty($this->selected)) return;
        Exercise::whereIn('id', $this->selected)->update(['is_active' => true]);
        $this->selected = [];
    }

    public function bulkSetHidden(): void
    {
        if (empty($this->selected)) return;
        Exercise::whereIn('id', $this->selected)->update(['is_active' => false]);
        $this->selected = [];
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
