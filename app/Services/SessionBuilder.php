<?php

namespace App\Services;

use App\Models\Exercise;
use App\Models\Level;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Builds a user's session playlist from the hardcoded exercise catalogue.
 *
 * The level defines the total session length (level 1 = 1.5 minutes, then the
 * level number in minutes), the rest between exercises and how many exercises
 * to include. Each picked exercise gets a whole number of movement cycles so
 * a pattern is never cut off mid-movement, sized so the session lands as
 * close to the level's total time as possible.
 *
 * Rules:
 * - Only unlocked exercises enter the pool.
 * - No two consecutive exercises are the same (when avoidable).
 * - Every exercise plays at least one full movement cycle.
 */
class SessionBuilder
{
    public function __construct(private readonly ProgressionService $progression)
    {
    }

    /**
     * @return array{steps: array<int,array<string,mixed>>, exercises: array<int,string>, total: float}
     */
    public function daily(User $user): array
    {
        $level = $this->level($user);
        $total = (float) ($level?->total_session_seconds ?: 90);
        $rest = (float) ($level?->rest_seconds ?: 5);
        $slots = max(1, (int) ($level?->min_exercises ?: 3));

        $unlocked = $this->unlockedExercises($user);
        if ($unlocked->isEmpty()) {
            return ['steps' => [], 'exercises' => [], 'total' => 0.0];
        }

        $sequence = $this->pickSequence($unlocked, $slots);
        $durations = $this->allocateDurations($sequence, $total, $rest);

        return $this->buildPlaylist($sequence, $durations, $rest);
    }

    /**
     * A single round of one exercise, for "Try it now" / the detail screen.
     */
    public function single(User $user, Exercise $exercise, ?Level $level = null): array
    {
        $duration = $exercise->durationForLevel($level ?? $this->level($user));

        $steps = [];
        $total = 0.0;
        foreach ($exercise->steps($duration) as $s) {
            $steps[] = $this->decorate($exercise, $s);
            $total += (float) $s['seconds'];
        }

        return ['steps' => $steps, 'exercises' => [$exercise->name], 'total' => round($total, 1)];
    }

    /**
     * Pick the session's exercise order: distinct random picks first, wrapping
     * around when the level asks for more slots than there are unlocked
     * exercises, and never the same exercise twice in a row (when avoidable).
     *
     * @param  Collection<int,Exercise>  $unlocked
     * @return Collection<int,Exercise>
     */
    private function pickSequence(Collection $unlocked, int $slots): Collection
    {
        $picks = $unlocked->shuffle()->values();
        $sequence = collect();

        for ($i = 0; $i < $slots; $i++) {
            $candidate = $picks[$i % $picks->count()];

            if ($sequence->isNotEmpty() && $sequence->last()->id === $candidate->id && $picks->count() > 1) {
                $candidate = $picks[($i + 1) % $picks->count()];
            }

            $sequence->push($candidate);
        }

        return $sequence;
    }

    /**
     * Give each slot a whole number of movement cycles, then nudge cycle
     * counts up or down so the summed session time lands as close to the
     * level total as whole cycles allow.
     *
     * @param  Collection<int,Exercise>  $sequence
     * @return array<int, float> slot index => seconds
     */
    private function allocateDurations(Collection $sequence, float $total, float $rest): array
    {
        $budget = $total - max(0, $sequence->count() - 1) * $rest;
        $share = $budget / max(1, $sequence->count());

        $cycles = [];
        $cycleLengths = [];
        foreach ($sequence as $i => $exercise) {
            $cycle = $exercise->cycleSeconds();
            $cycleLengths[$i] = $cycle > 0 ? $cycle : $share;
            $cycles[$i] = max(1, (int) round($share / $cycleLengths[$i]));
        }

        // Nudge towards the budget: add cycles while clearly under, remove
        // while clearly over (never below one cycle). Capped for safety.
        for ($guard = 0; $guard < 20; $guard++) {
            $sum = 0.0;
            foreach ($cycles as $i => $n) {
                $sum += $n * $cycleLengths[$i];
            }
            $diff = $budget - $sum;

            if ($diff > 0) {
                // Room left: add a cycle of the exercise that fits best.
                $best = null;
                foreach ($cycles as $i => $n) {
                    if ($cycleLengths[$i] <= $diff + 0.001 && ($best === null || $cycleLengths[$i] > $cycleLengths[$best])) {
                        $best = $i;
                    }
                }
                if ($best === null) {
                    break;
                }
                $cycles[$best]++;
            } else {
                // Over budget: drop a cycle where it helps, if allowed.
                $best = null;
                foreach ($cycles as $i => $n) {
                    if ($n > 1 && ($best === null || $cycleLengths[$i] > $cycleLengths[$best])) {
                        $best = $i;
                    }
                }
                if ($best === null || -$diff < $cycleLengths[$best] / 2) {
                    break;
                }
                $cycles[$best]--;
            }
        }

        $durations = [];
        foreach ($cycles as $i => $n) {
            $durations[$i] = round($n * $cycleLengths[$i], 1);
        }

        return $durations;
    }

    /**
     * @param  Collection<int,Exercise>  $sequence
     * @param  array<int, float>  $durations
     */
    private function buildPlaylist(Collection $sequence, array $durations, float $rest): array
    {
        $steps = [];
        $names = [];
        $acc = 0.0;

        foreach ($sequence as $i => $exercise) {
            if ($i > 0 && $rest > 0) {
                $steps[] = $this->decorate($exercise, ['phase' => 'rest', 'label' => 'Rest', 'seconds' => $rest]);
                $acc += $rest;
            }

            foreach ($exercise->steps($durations[$i]) as $s) {
                $steps[] = $this->decorate($exercise, $s);
                $acc += (float) $s['seconds'];
            }

            if (! in_array($exercise->name, $names, true)) {
                $names[] = $exercise->name;
            }
        }

        return ['steps' => $steps, 'exercises' => $names, 'total' => round($acc, 1)];
    }

    /** Attach the exercise identity the player shows around the circle. */
    private function decorate(Exercise $exercise, array $step): array
    {
        return ['exercise' => $exercise->name, 'slug' => $exercise->slug, 'instructions' => $exercise->instructions ?? ''] + $step;
    }

    private function level(User $user): ?Level
    {
        return $user->level ?? Level::where('is_active', true)->orderBy('number')->first();
    }

    /** @return Collection<int,Exercise> */
    private function unlockedExercises(User $user): Collection
    {
        return Exercise::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->filter(fn (Exercise $e) => $this->progression->isExerciseUnlocked($user, $e))
            ->values();
    }
}
