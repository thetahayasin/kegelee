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
 * level number in minutes) and the rest between exercises. Each exercise runs
 * its natural duration for the level (its 20-60s range, Holding 12-30s,
 * interpolated by level) rounded to whole movement cycles, and the session
 * fills with as many exercises as fit the level's total time.
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

        $unlocked = $this->unlockedExercises($user);
        if ($unlocked->isEmpty()) {
            return ['steps' => [], 'exercises' => [], 'total' => 0.0];
        }

        [$sequence, $durations] = $this->fillSession($unlocked, $level, $total, $rest);

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
     * Fill the session with exercises at their natural level durations until
     * the level's total time is reached: random order, wrapping around the
     * unlocked pool, never the same exercise twice in a row (when avoidable).
     * The last exercise is included only when that lands the session closer
     * to the level total than stopping without it.
     *
     * @param  Collection<int,Exercise>  $unlocked
     * @return array{0: Collection<int,Exercise>, 1: array<int, float>}
     */
    private function fillSession(Collection $unlocked, ?\App\Models\Level $level, float $total, float $rest): array
    {
        $picks = $unlocked->shuffle()->values();
        $sequence = collect();
        $durations = [];
        $acc = 0.0;
        $idx = 0;

        while ($sequence->count() < 30) {
            $candidate = $picks[$idx % $picks->count()];
            if ($sequence->isNotEmpty() && $sequence->last()->id === $candidate->id && $picks->count() > 1) {
                $idx++;
                $candidate = $picks[$idx % $picks->count()];
            }

            $duration = $candidate->durationForLevel($level);
            $addition = ($sequence->isEmpty() ? 0.0 : $rest) + $duration;

            if ($sequence->isNotEmpty() && $acc + $addition > $total) {
                $over = ($acc + $addition) - $total;
                $under = $total - $acc;
                if ($over >= $under) {
                    break;
                }
            }

            $durations[$sequence->count()] = $duration;
            $sequence->push($candidate);
            $acc += $addition;
            $idx++;

            if ($acc >= $total) {
                break;
            }
        }

        return [$sequence, $durations];
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
