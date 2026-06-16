<?php

namespace App\Services;

use App\Models\Exercise;
use App\Models\Level;
use App\Models\User;
use App\Models\UserExerciseSetting;
use Illuminate\Support\Collection;

/**
 * Builds a user's session playlist: available (unlocked) exercises in a
 * randomised order, each running for its per-level duration (cycling its
 * universal contract/relax beat), separated by the level's rest, packed to
 * fill the level's total session time. The rotation repeats as needed.
 */
class SessionBuilder
{
    public function __construct(private readonly ProgressionService $progression)
    {
    }

    /**
     * @return array{steps: array<int,array{exercise:string,phase:string,label:string,seconds:float}>, exercises: array<int,string>, total: float}
     */
    public function daily(User $user): array
    {
        $level = $this->level($user);
        $total = (float) ($level?->total_session_seconds ?: 300);
        $rest = (float) ($level?->rest_seconds ?: 10);

        return $this->pack($this->unlockedExercises($user), $level, $total, $rest, $user);
    }

    /**
     * A single round of one exercise, for "Try" / detail. Pass $level to run
     * it at a specific level's duration (e.g. level 1 for the try-it preview);
     * defaults to the user's current level.
     */
    public function single(User $user, Exercise $exercise, ?Level $level = null): array
    {
        $duration = $exercise->durationForLevel($level ?? $this->level($user));
        $setting = UserExerciseSetting::where('user_id', $user->id)
            ->where('exercise_id', $exercise->id)
            ->first();

        $steps = [];
        $total = 0.0;
        // Pass null for startPhase so each exercise uses its own start_phase.
        foreach ($exercise->steps($duration, null, $setting?->contract_seconds, $setting?->relax_seconds) as $s) {
            $steps[] = ['exercise' => $exercise->name] + $s;
            $total += (float) $s['seconds'];
        }

        return ['steps' => $steps, 'exercises' => [$exercise->name], 'total' => round($total, 1)];
    }

    /**
     * Pack a randomised rotation of exercises to fill the total session time.
     *
     * @param Collection<int,Exercise> $pool
     */
    private function pack(Collection $pool, ?Level $level, float $total, float $rest, ?User $user = null): array
    {
        // Load user timing overrides in one query.
        $userSettings = ($user && $pool->isNotEmpty())
            ? UserExerciseSetting::where('user_id', $user->id)
                ->whereIn('exercise_id', $pool->pluck('id'))
                ->get()
                ->keyBy('exercise_id')
            : collect();

        // Map of exercise_id => per-level duration (from the pivot), resolved
        // once. Keep only exercises whose contract/relax cycle fits.
        $durations = $level
            ? $level->exercises->mapWithKeys(fn (Exercise $e) => [$e->id => (float) $e->pivot->duration_seconds])
            : collect();

        $usable = $pool
            ->map(fn (Exercise $e) => [
                'exercise' => $e,
                'duration' => (float) ($durations[$e->id] ?? 30),
                'setting' => $userSettings[$e->id] ?? null,
            ])
            ->map(function ($r) {
                // A full-hold exercise fills its whole duration as one
                // contraction, so its "cycle" always fits exactly.
                if ($r['exercise']->full_hold) {
                    return $r + ['cycle' => $r['duration']];
                }
                $contract = $r['setting']?->contract_seconds ?? (float) $r['exercise']->contract_seconds;
                $relax = $r['setting']?->relax_seconds ?? (float) $r['exercise']->relax_seconds;
                $hold = (float) $r['exercise']->hold_seconds;
                return $r + ['cycle' => $contract + $hold + $relax];
            })
            ->filter(fn ($r) => $r['duration'] > 0
                && $r['cycle'] > 0
                && $r['cycle'] <= $r['duration'] + 1e-6)
            ->values();

        if ($usable->isEmpty()) {
            return ['steps' => [], 'exercises' => [], 'total' => 0.0];
        }

        $minDuration = (float) $usable->min('duration');
        $steps = [];
        $names = [];
        $acc = 0.0;
        $bag = [];
        $guard = 0;

        while ($guard++ < 1000) {
            $need = ($steps ? $rest : 0) + $minDuration;
            if ($acc + $need > $total + 1e-6) {
                break; // no room for even the shortest exercise
            }

            if ($bag === []) {
                $bag = $usable->shuffle()->all();
            }

            $row = array_shift($bag);
            $exercise = $row['exercise'];
            $duration = $row['duration'];

            $add = ($steps ? $rest : 0) + $duration;
            if ($acc + $add > $total + 1e-6) {
                continue; // overshoots; try the next in the bag
            }

            if ($steps !== []) {
                $steps[] = ['exercise' => $exercise->name, 'phase' => 'rest', 'label' => 'Rest', 'seconds' => $rest];
                $acc += $rest;
            }

            $setting = $row['setting'] ?? null;
            foreach ($exercise->steps($duration, null, $setting?->contract_seconds, $setting?->relax_seconds) as $s) {
                $steps[] = ['exercise' => $exercise->name] + $s;
                $acc += (float) $s['seconds'];
            }

            if (! in_array($exercise->name, $names, true)) {
                $names[] = $exercise->name;
            }
        }

        return ['steps' => $steps, 'exercises' => $names, 'total' => round($acc, 1)];
    }

    private function level(User $user): ?Level
    {
        $level = $user->level ?? Level::where('is_active', true)->orderBy('number')->first();
        // Eager-load the pivot durations once for this build.
        return $level?->loadMissing('exercises');
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
