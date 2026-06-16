<?php

namespace App\Services;

use App\Models\Level;
use Illuminate\Support\Collection;

/**
 * Timing rules:
 *  - an exercise's contract + relax cycle must fit inside its per-level duration;
 *  - each per-level duration must fit inside that level's total session time.
 * Used by both editors so timings can never be saved into a broken state.
 */
class TimingValidator
{
    /**
     * For a level, the exercises whose per-level duration exceeds the given
     * total session time. Returns [name => duration].
     */
    public function exercisesExceedingSession(int $levelId, float $totalSessionSeconds): Collection
    {
        $level = Level::with('exercises')->find($levelId);
        if (! $level) {
            return collect();
        }

        return $level->exercises
            ->filter(fn ($e) => (float) $e->pivot->duration_seconds > $totalSessionSeconds + 1e-6)
            ->mapWithKeys(fn ($e) => [$e->name => (float) $e->pivot->duration_seconds]);
    }
}
