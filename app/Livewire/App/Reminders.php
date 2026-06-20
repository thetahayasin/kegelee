<?php

namespace App\Livewire\App;

use App\Models\Reminder;
use App\Services\IcsBuilder;
use Livewire\Attributes\Layout;
use Livewire\Component;
use Symfony\Component\HttpFoundation\StreamedResponse;

#[Layout('components.layouts.app')]
class Reminders extends Component
{
    /** @var array<int, array{enabled: bool, times: list<string>}> keyed by weekday 0-6 */
    public array $days = [];

    public bool $saved = false;

    public function mount(): void
    {
        $existing = auth()->user()->reminders()->get()->keyBy('weekday');

        foreach (Reminder::DAYS as $i => $name) {
            $row = $existing->get($i);
            $this->days[$i] = [
                'enabled' => (bool) ($row?->is_enabled ?? false),
                'times' => $row?->times ?? ['08:00'],
            ];
        }
    }

    public function addTime(int $weekday): void
    {
        $this->days[$weekday]['times'][] = '08:00';
        $this->saved = false;
    }

    public function removeTime(int $weekday, int $index): void
    {
        if (count($this->days[$weekday]['times']) > 1) {
            array_splice($this->days[$weekday]['times'], $index, 1);
            $this->days[$weekday]['times'] = array_values($this->days[$weekday]['times']);
            $this->saved = false;
        }
    }

    public function save(): void
    {
        $this->validate([
            'days.*.times.*' => 'required|date_format:H:i',
            'days.*.enabled' => 'boolean',
        ]);

        $user = auth()->user();

        foreach ($this->days as $weekday => $row) {
            $user->reminders()->updateOrCreate(
                ['weekday' => $weekday],
                ['times' => $row['times'], 'is_enabled' => $row['enabled']],
            );
        }

        $this->saved = true;
    }

    public function addToCalendar(IcsBuilder $builder): ?StreamedResponse
    {
        $this->save();

        if ($this->enabledCount === 0) {
            $this->addError('days', 'Turn on at least one day first.');
            return null;
        }

        $ics = $builder->forUser(auth()->user());

        return response()->streamDownload(
            fn () => print($ics),
            'reminders.ics',
            ['Content-Type' => 'text/calendar; charset=utf-8'],
        );
    }

    public function getEnabledCountProperty(): int
    {
        return collect($this->days)->where('enabled', true)->count();
    }

    public function render()
    {
        return view('livewire.app.reminders', [
            'dayNames' => Reminder::DAYS,
            'enabledCount' => $this->enabledCount,
        ]);
    }
}
