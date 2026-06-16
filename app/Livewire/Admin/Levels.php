<?php

namespace App\Livewire\Admin;

use App\Models\Level;
use App\Services\TimingValidator;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.admin')]
class Levels extends Component
{
    /** @var array<int, array<string, mixed>> */
    public array $rows = [];

    public ?string $savedMessage = null;

    public function mount(): void
    {
        $this->loadRows();
    }

    private function loadRows(): void
    {
        $this->rows = Level::orderBy('number')->get()->map(fn (Level $l) => [
            'id' => $l->id,
            'number' => $l->number,
            'name' => $l->name,
            'description' => $l->description,
            'days_to_complete' => $l->days_to_complete,
            'sessions_per_day' => $l->sessions_per_day,
            'total_session_seconds' => $l->total_session_seconds,
            'rest_seconds' => $l->rest_seconds,
            'is_active' => $l->is_active,
        ])->all();
    }

    public function addLevel(): void
    {
        $number = (int) (Level::max('number') ?? 0) + 1;
        Level::create([
            'number' => $number,
            'name' => 'Level '.$number,
            'days_to_complete' => 30,
            'total_session_seconds' => 300,
            'rest_seconds' => 10,
            'is_active' => true,
            'sort_order' => $number,
        ]);
        $this->loadRows();
    }

    public function delete(int $id): void
    {
        Level::findOrFail($id)->delete();
        $this->loadRows();
    }

    public function save(TimingValidator $validator): void
    {
        $this->validate([
            'rows.*.number' => 'required|integer|min:1',
            'rows.*.name' => 'required|string|max:60',
            'rows.*.days_to_complete' => 'required|integer|min:1',
            'rows.*.sessions_per_day' => 'nullable|integer|min:1',
            'rows.*.total_session_seconds' => 'required|numeric|min:1',
            'rows.*.rest_seconds' => 'required|numeric|min:0',
        ]);

        // Each exercise's per-level duration must fit inside this session time.
        foreach ($this->rows as $i => $row) {
            if (! ($row['is_active'] ?? false)) {
                continue;
            }
            $tooLong = $validator->exercisesExceedingSession((int) $row['id'], (float) $row['total_session_seconds']);
            if ($tooLong->isNotEmpty()) {
                $names = $tooLong->keys()->implode(', ');
                $this->addError("rows.{$i}.total_session_seconds", "Shorter than these exercises' duration at this level: {$names}. Raise the session time or lower those durations.");
                return;
            }
        }

        foreach ($this->rows as $row) {
            Level::where('id', $row['id'])->update([
                'number' => $row['number'],
                'name' => $row['name'],
                'description' => $row['description'],
                'days_to_complete' => $row['days_to_complete'],
                'sessions_per_day' => $row['sessions_per_day'] ?: null,
                'total_session_seconds' => $row['total_session_seconds'],
                'rest_seconds' => $row['rest_seconds'],
                'is_active' => (bool) $row['is_active'],
                'sort_order' => $row['number'],
            ]);
        }

        $this->savedMessage = 'Levels saved.';
        $this->loadRows();
    }

    public function render()
    {
        return view('livewire.admin.levels');
    }
}
