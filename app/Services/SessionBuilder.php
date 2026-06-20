<?php

namespace App\Services;

use App\Models\Exercise;
use App\Models\Level;
use App\Models\User;
use App\Models\UserExerciseSetting;
use Illuminate\Support\Collection;

/**
 * Builds a user's session playlist.
 *
 * The level defines how many beginner, pro and expert exercises to include.
 * Each exercise has a min/max duration range; the system interpolates a base
 * duration from that range according to the level number, then scales all
 * durations proportionally so total_session_seconds is filled exactly (with
 * rests between exercises).
 *
 * Rules:
 * - Only active + unlocked exercises enter the pool.
 * - No two consecutive exercises may be the same.
 * - An exercise may repeat later in the sequence.
 * - The total time (exercises + rests) must equal total_session_seconds.
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

        $picks = $this->selectExercises($user, $level);

        if ($picks->isEmpty()) {
            return ['steps' => [], 'exercises' => [], 'total' => 0.0];
        }

        $unlocked = $this->unlockedExercises($user);
        $sequence = $level ? $this->generateSequence($picks, $level, $unlocked) : $picks;

        return $this->buildPlaylist($sequence, $level, $total, $rest, $user);
    }

    /**
     * A single round of one exercise, for "Try" / detail.
     */
    public function single(User $user, Exercise $exercise, ?Level $level = null): array
    {
        $duration = $exercise->durationForLevel($level ?? $this->level($user));
        $setting = UserExerciseSetting::where('user_id', $user->id)
            ->where('exercise_id', $exercise->id)
            ->first();

        $steps = [];
        $total = 0.0;
        foreach ($exercise->steps($duration, null, $setting?->contract_seconds, $setting?->relax_seconds) as $s) {
            $steps[] = ['exercise' => $exercise->name, 'slug' => $exercise->slug, 'instructions' => $exercise->instructions ?? ''] + $s;
            $total += (float) $s['seconds'];
        }

        return ['steps' => $steps, 'exercises' => [$exercise->name], 'total' => round($total, 1)];
    }

    /**
     * Select exercises for the session based on the level's minimum exercise requirements.
     * Returns an ordered Collection of Exercise models with no two consecutive
     * being the same.
     *
     * @return Collection<int,Exercise>
     */
    private function selectExercises(User $user, ?Level $level): Collection
    {
        $unlocked = $this->unlockedExercises($user);

        if ($unlocked->isEmpty()) {
            return collect();
        }

        if (! $level) {
            return $unlocked->shuffle()->take(3)->values();
        }

        $minExercises = (int) ($level->min_exercises ?? 3);
        if ($minExercises <= 0) {
            $minExercises = 3;
        }

        // Randomly pick the minimum required unique exercises from the unlocked pool.
        return $unlocked->shuffle()->take($minExercises)->values();
    }

    /**
     * Rearrange exercises so no two consecutive are the same.
     * If only one unique exercise exists, consecutive duplication is unavoidable.
     */
    private function arrangeNoConsecutive(Collection $exercises): Collection
    {
        $result = collect();
        $remaining = $exercises->values()->all();

        while (count($remaining) > 0) {
            $placed = false;
            foreach ($remaining as $idx => $ex) {
                if ($result->isEmpty() || $result->last()->id !== $ex->id) {
                    $result->push($ex);
                    array_splice($remaining, $idx, 1);
                    $placed = true;
                    break;
                }
            }
            // If we couldn't place without duplication, force the first one.
            if (! $placed) {
                $result->push(array_shift($remaining));
            }
        }

        return $result;
    }

    /**
     * Repeat the selected exercises in round-robin order until the total
     * session time is roughly filled.  Each exercise slot gets its natural
     * durationForLevel value — no single slot exceeds max_duration.
     *
     * @param Collection<int,Exercise> $picks     Distinct exercises chosen for the session.
     * @param Level                    $level     Current user level.
     * @param Collection<int,Exercise> $unlocked  All unlocked exercises for the user.
     * @return Collection<int,Exercise>
     */
    private function generateSequence(Collection $picks, Level $level, Collection $unlocked): Collection
    {
        $totalSession = (float) ($level->total_session_seconds ?: 300);
        $rest = (float) ($level->rest_seconds ?: 10);

        // Estimate target count of exercises based on average duration.
        $durations = $picks->map(fn ($e) => $e->durationForLevel($level));
        $avgDuration = $durations->avg() ?: 30.0;
        $targetCount = (int) max(1, round(($totalSession + $rest) / ($avgDuration + $rest)));

        // If target count is greater than picks, fill with MORE unique exercises from unlocked first.
        if ($picks->count() < $targetCount) {
            $remaining = $unlocked->diff($picks)->shuffle();
            $needed = $targetCount - $picks->count();
            $picks = $picks->merge($remaining->take($needed));
        }

        $sequence = collect();
        $acc = 0.0;
        $idx = 0;
        $all = $picks->values()->all();
        $count = count($all);

        if ($count === 0) {
            return $sequence;
        }

        while ($acc < $totalSession) {
            $exercise = $all[$idx % $count];
            $dur = $exercise->durationForLevel($level);

            // Add rest before every exercise except the first.
            if ($sequence->isNotEmpty()) {
                $acc += $rest;
            }

            $acc += $dur;
            $sequence->push($exercise);
            $idx++;

            // Safety: cap at 30 slots to avoid infinite loops.
            if ($idx >= 30) {
                break;
            }
        }

        return $this->arrangeNoConsecutive($sequence);
    }

    /**
     * Build the full playlist with exact time scaling.
     *
     * @param Collection<int,Exercise> $sequence
     */
    private function buildPlaylist(Collection $sequence, ?Level $level, float $totalSession, float $rest, ?User $user = null): array
    {
        // Load user timing overrides in one query.
        $userSettings = ($user && $sequence->isNotEmpty())
            ? UserExerciseSetting::where('user_id', $user->id)
                ->whereIn('exercise_id', $sequence->pluck('id')->unique())
                ->get()
                ->keyBy('exercise_id')
            : collect();

        // Calculate base durations for each exercise in the sequence.
        $baseDurations = [];
        foreach ($sequence as $i => $exercise) {
            $baseDurations[$i] = $exercise->durationForLevel($level);
        }

        // Total rest time = rest between each pair of exercises.
        $numRests = max(0, $sequence->count() - 1);
        $totalRestTime = $numRests * $rest;

        // Available time for exercises = total session - total rest.
        $availableForExercises = $totalSession - $totalRestTime;

        if ($availableForExercises <= 0) {
            return ['steps' => [], 'exercises' => [], 'total' => 0.0];
        }

        // Scale base durations proportionally to fill the available time exactly.
        $baseSum = array_sum($baseDurations);
        if ($baseSum <= 0) {
            return ['steps' => [], 'exercises' => [], 'total' => 0.0];
        }

        $scale = $availableForExercises / $baseSum;
        $scaledDurations = [];
        foreach ($baseDurations as $i => $bd) {
            $ex = $sequence[$i];
            $maxDur = (float) ($ex->max_duration ?: 120);
            $scaledDurations[$i] = round(min($bd * $scale, $maxDur), 1);
        }

        // Ensure sum matches exactly — distribute any rounding remainder to last.
        $scaledSum = array_sum($scaledDurations);
        $diff = $availableForExercises - $scaledSum;
        if (abs($diff) > 0.01 && count($scaledDurations) > 0) {
            $lastIdx = array_key_last($scaledDurations);
            $scaledDurations[$lastIdx] = round($scaledDurations[$lastIdx] + $diff, 1);
        }

        // Ensure each exercise duration fits at least one cycle.
        foreach ($scaledDurations as $i => $dur) {
            $ex = $sequence[$i];
            $setting = $userSettings[$ex->id] ?? null;
            $contract = $setting?->contract_seconds ?? (float) $ex->contract_seconds;
            $relax = $setting?->relax_seconds ?? (float) $ex->relax_seconds;
            $hold = (float) $ex->hold_seconds;
            $cycle = $contract + $hold + $relax;

            if (! $ex->full_hold && $cycle > 0 && $dur < $cycle) {
                $scaledDurations[$i] = $cycle;
            }
        }

        // Build the step array.
        $steps = [];
        $names = [];
        $acc = 0.0;

        foreach ($sequence as $i => $exercise) {
            $duration = $scaledDurations[$i];

            // Add rest before every exercise except the first.
            if ($i > 0 && $rest > 0) {
                $steps[] = ['exercise' => $exercise->name, 'slug' => $exercise->slug, 'instructions' => $exercise->instructions ?? '', 'phase' => 'rest', 'label' => 'Rest', 'seconds' => $rest];
                $acc += $rest;
            }

            $setting = $userSettings[$exercise->id] ?? null;
            foreach ($exercise->steps($duration, null, $setting?->contract_seconds, $setting?->relax_seconds) as $s) {
                $steps[] = ['exercise' => $exercise->name, 'slug' => $exercise->slug, 'instructions' => $exercise->instructions ?? ''] + $s;
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
