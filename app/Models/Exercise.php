<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Storage;

class Exercise extends Model
{
    protected $guarded = [];

    protected $casts = [
        'contract_seconds' => 'float',
        'relax_seconds' => 'float',
        'is_premium' => 'boolean',
        'is_active' => 'boolean',
    ];

    /** Per-level run duration lives on the pivot. */
    public function levels(): BelongsToMany
    {
        return $this->belongsToMany(Level::class)
            ->withPivot('duration_seconds')
            ->withTimestamps();
    }

    /** One contract + relax cycle, in seconds - the rhythm the circle follows. */
    public function cycleSeconds(): float
    {
        return (float) $this->contract_seconds + (float) $this->relax_seconds;
    }

    /** How long this exercise runs at the given level (seconds). */
    public function durationForLevel(?Level $level): float
    {
        if (! $level) {
            return 30.0;
        }

        $pivot = $this->levels->firstWhere('id', $level->id)?->pivot
            ?? $this->levels()->where('levels.id', $level->id)->first()?->pivot;

        return (float) ($pivot->duration_seconds ?? 30);
    }

    public function repsForDuration(float $duration): int
    {
        $cycle = $this->cycleSeconds();

        return $cycle > 0 ? max(1, (int) floor($duration / $cycle + 1e-6)) : 0;
    }

    /**
     * Expand this exercise into timed steps filling the given duration. The
     * circle follows each contract/relax beat.
     *
     * @return array<int, array{phase: string, label: string, seconds: float}>
     */
    public function steps(float $duration): array
    {
        $cycle = $this->cycleSeconds();
        if ($cycle <= 0) {
            return [];
        }

        $reps = $this->repsForDuration($duration);
        $steps = [];
        for ($i = 0; $i < $reps; $i++) {
            $steps[] = ['phase' => 'contract', 'label' => 'Contract & hold', 'seconds' => (float) $this->contract_seconds];
            $steps[] = ['phase' => 'relax', 'label' => 'Relax', 'seconds' => (float) $this->relax_seconds];
        }

        return $steps;
    }

    public function iconUrl(): ?string
    {
        return $this->icon_path ? Storage::url($this->icon_path) : null;
    }

    public function videoUrl(): ?string
    {
        return $this->video_path ? Storage::url($this->video_path) : null;
    }
}
