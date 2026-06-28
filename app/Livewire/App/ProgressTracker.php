<?php

namespace App\Livewire\App;

use App\Models\Measurement;
use Illuminate\Support\Carbon;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class ProgressTracker extends Component
{
    public bool $measuring = false;

    public string $mode = 'weeks'; // days | weeks | months

    public ?float $lastResult = null;

    public function startMeasure(): void
    {
        $this->measuring = true;
        $this->lastResult = null;
    }

    public function record(float $seconds)
    {
        $seconds = round(max(0, min($seconds, 600)), 1);

        Measurement::create([
            'user_id' => auth()->id(),
            'seconds' => $seconds,
            'measured_at' => now(),
        ]);

        // Hard redirect reloads the page with completely fresh server data,
        // bypassing any stale Alpine state from the previous render.
        return redirect()->route('progress');
    }

    public function render()
    {
        $user = auth()->user();
        $measurements = $user->measurements()->orderBy('measured_at')->get();

        $bars = $this->buckets($measurements);

        return view('livewire.app.progress-tracker', [
            'bars' => $bars,
            'best' => $measurements->max('seconds'),
            'last' => $measurements->last(),
            'maxScale' => max(6, ceil(($bars->max('value') ?: 0) / 2) * 2),
            'rangeLabel' => $this->rangeLabel(),
        ]);
    }

    private function tz(): string
    {
        return auth()->user()->timezone ?: config('app.timezone', 'UTC');
    }

    private function buckets($measurements)
    {
        [$count, $unit, $format] = match ($this->mode) {
            'days' => [7, 'day', 'j M'],
            'months' => [6, 'month', 'M'],
            default => [6, 'week', 'j M'],
        };

        $now = Carbon::now($this->tz());

        return collect(range($count - 1, 0))->map(function ($i) use ($measurements, $unit, $format, $now) {
            $start = $now->copy()->sub($unit, $i)->startOf($unit);
            $end = $start->copy()->endOf($unit);
            $value = $measurements
                ->whereBetween('measured_at', [$start, $end])
                ->max('seconds') ?? 0;

            return ['label' => $start->translatedFormat($format), 'value' => (float) $value];
        });
    }

    private function rangeLabel(): string
    {
        $unit = $this->mode === 'days' ? 'day' : ($this->mode === 'months' ? 'month' : 'week');
        $count = $this->mode === 'days' ? 7 : 6;
        $start = Carbon::now($this->tz())->sub($unit, $count - 1)->startOf($unit);

        return $start->translatedFormat('j M').' - '.Carbon::now($this->tz())->translatedFormat('j M Y');
    }
}
