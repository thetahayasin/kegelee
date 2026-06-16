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
        'hold_seconds' => 'float',
        'is_premium' => 'boolean',
        'is_active' => 'boolean',
        'full_hold' => 'boolean',
    ];

    /** Per-level run duration lives on the pivot. */
    public function levels(): BelongsToMany
    {
        return $this->belongsToMany(Level::class)
            ->withPivot('duration_seconds')
            ->withTimestamps();
    }

    /** One contract (+ peak hold) + relax cycle, in seconds - the rhythm the circle follows. */
    public function cycleSeconds(): float
    {
        return (float) $this->contract_seconds + (float) $this->hold_seconds + (float) $this->relax_seconds;
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
    public function steps(float $duration, ?string $startPhase = null, ?float $contractOverride = null, ?float $relaxOverride = null): array
    {
        $contract = $contractOverride ?? (float) $this->contract_seconds;
        $relax = $relaxOverride ?? (float) $this->relax_seconds;
        $hold = (float) $this->hold_seconds;
        $cycle = $contract + $hold + $relax;
        $contractGlowMode = $this->contract_glow_mode ?: 'slowly';
        $relaxGlowMode    = $this->relax_glow_mode ?: 'slowly';
        $phase = $startPhase ?? $this->start_phase ?? 'contract';

        // Full-hold exercises are one sustained contraction for the whole
        // duration: a single contract step, no relax beats, glow pinned full.
        if ($this->full_hold) {
            return [[
                'phase' => 'contract',
                'label' => $this->contract_label ?: 'Contract & hold',
                'seconds' => $duration,
                'glow_mode' => $contractGlowMode,
                'full' => true,
            ]];
        }

        if ($cycle <= 0) {
            return [];
        }

        $reps = max(1, (int) floor($duration / $cycle + 1e-6));
        $steps = [];

        $contractLabel = $this->contract_label ?: 'Contract & hold';
        $contractStep = ['phase' => 'contract', 'label' => $contractLabel,                'seconds' => $contract, 'glow_mode' => $contractGlowMode];
        $relaxStep    = ['phase' => 'relax',    'label' => $this->relax_label ?: 'Relax', 'seconds' => $relax,    'glow_mode' => $relaxGlowMode];

        // The contraction is the ramp followed by an optional peak hold (glow
        // pinned full), kept together so the phase ordering stays intact.
        $contractGroup = [$contractStep];
        if ($hold > 0) {
            $contractGroup[] = ['phase' => 'contract', 'label' => $contractLabel, 'seconds' => $hold, 'glow_mode' => $contractGlowMode, 'full' => true];
        }

        $phaseOrder = ($phase === 'relax' && $relax > 0)
            ? array_merge([$relaxStep], $contractGroup)
            : array_merge($contractGroup, [$relaxStep]);

        $phaseOrder = array_values(array_filter($phaseOrder, fn ($p) => $p['seconds'] > 0));

        for ($i = 0; $i < $reps; $i++) {
            foreach ($phaseOrder as $step) {
                $steps[] = $step;
            }
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
