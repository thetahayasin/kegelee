<?php

namespace App\Models;

use App\Support\ExerciseCatalog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Exercise extends Model
{
    protected $guarded = [];

    protected $casts = [
        'contract_seconds' => 'float',
        'relax_seconds' => 'float',
        'hold_seconds' => 'float',
        'min_duration' => 'float',
        'max_duration' => 'float',
        'is_active' => 'boolean',
        'full_hold' => 'boolean',
    ];

    /** The hardcoded catalogue definition for this exercise (movement pattern, how to, summary). */
    public function catalog(): ?array
    {
        return ExerciseCatalog::get((string) $this->slug);
    }

    /** Short plain-language summary of the movement, e.g. "Squeeze, hold 3 seconds, rest". */
    public function summary(): ?string
    {
        return $this->catalog()['summary'] ?? null;
    }

    /** One full movement cycle, in seconds - the rhythm the circle follows. */
    public function cycleSeconds(): float
    {
        $cycle = ExerciseCatalog::cycleSeconds((string) $this->slug);
        if ($cycle > 0) {
            return $cycle;
        }

        // Legacy two-phase fallback for anything not in the catalogue.
        return (float) $this->contract_seconds + (float) $this->hold_seconds + (float) $this->relax_seconds;
    }

    /**
     * How long this exercise runs at the given level (seconds). Every
     * exercise has a duration range (20-60s by default, Holding 12-30s):
     * level 1 runs the minimum, the top level runs the maximum, levels in
     * between interpolate. The result is rounded to whole movement cycles so
     * a pattern is never cut off mid-movement.
     */
    public function durationForLevel(?Level $level): float
    {
        $cycle = $this->cycleSeconds();
        if ($cycle <= 0) {
            return 30.0;
        }

        [$min, $max] = ExerciseCatalog::durationBounds((string) $this->slug);

        $topNumber = max(1, ...array_keys(\App\Support\LevelCatalog::all()));
        $number = (int) ($level?->number ?? 1);
        $pct = $topNumber > 1 ? max(0.0, min(1.0, ($number - 1) / ($topNumber - 1))) : 0.0;
        $target = $min + ($max - $min) * $pct;

        $cycles = max(1, (int) round($target / $cycle));
        // Whole cycles, but never blow past the range maximum on rounding.
        while ($cycles > 1 && $cycles * $cycle > $max + 0.01) {
            $cycles--;
        }

        return round($cycles * $cycle, 1);
    }

    /** Whole movement cycles that fit in the given duration (at least one). */
    public function repsForDuration(float $duration): int
    {
        $cycle = $this->cycleSeconds();

        return $cycle > 0 ? max(1, (int) floor($duration / $cycle + 1e-6)) : 0;
    }

    /**
     * Expand this exercise into timed player steps filling the given duration.
     *
     * Catalogue exercises play their keyframed movement pattern: each step
     * carries from/to intensity plus the cue label (Contract, Hold, Release,
     * Rest, Floor 1, ...) shown inside the circle.
     *
     * @return array<int, array<string, mixed>>
     */
    public function steps(float $duration): array
    {
        $patternSteps = ExerciseCatalog::steps((string) $this->slug, $duration);
        if ($patternSteps) {
            return $patternSteps;
        }

        // Legacy two-phase fallback for anything not in the catalogue.
        $contract = (float) $this->contract_seconds;
        $relax = (float) $this->relax_seconds;
        $hold = (float) $this->hold_seconds;
        $cycle = $contract + $hold + $relax;

        if ($this->full_hold) {
            return [[
                'phase' => 'contract',
                'label' => $this->contract_label ?: 'Contract and hold',
                'seconds' => $duration,
                'glow_mode' => $this->contract_glow_mode ?: 'slowly',
                'full' => true,
            ]];
        }

        if ($cycle <= 0) {
            return [];
        }

        $steps = [];
        $contractStep = ['phase' => 'contract', 'label' => $this->contract_label ?: 'Contract and hold', 'seconds' => $contract, 'glow_mode' => $this->contract_glow_mode ?: 'slowly'];
        $relaxStep = ['phase' => 'relax', 'label' => $this->relax_label ?: 'Relax', 'seconds' => $relax, 'glow_mode' => $this->relax_glow_mode ?: 'slowly'];

        $order = ($this->start_phase === 'relax' && $relax > 0) ? [$relaxStep, $contractStep] : [$contractStep, $relaxStep];
        $order = array_values(array_filter($order, fn ($p) => $p['seconds'] > 0));

        for ($i = 0, $reps = $this->repsForDuration($duration); $i < $reps; $i++) {
            foreach ($order as $step) {
                $steps[] = $step;
            }
        }

        return $steps;
    }

    public function iconUrl(): ?string
    {
        return $this->resolveMedia($this->icon_path);
    }

    public function videoUrl(): ?string
    {
        return $this->resolveMedia($this->video_path);
    }

    /** Resolve a stored media path to a URL, passing through absolute URLs. */
    private function resolveMedia(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        return Storage::url($path);
    }
}
