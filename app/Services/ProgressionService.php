<?php

namespace App\Services;

use App\Models\Exercise;
use App\Models\Level;
use App\Models\TrainingDay;
use App\Models\User;
use App\Models\WorkoutSession;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * Owns every rule about how a user moves through the programme:
 * how many sessions count as a completed day, how completed days unlock
 * exercises and levels, and what "today" looks like. All thresholds come
 * from the level or from {@see SettingsService}, so behaviour is fully
 * tunable from the backend without code changes.
 */
class ProgressionService
{
    public function __construct(private readonly SettingsService $settings)
    {
    }

    public function requiredSessionsPerDay(User $user): int
    {
        $level = $user->level;

        return $level?->effectiveSessionsPerDay()
            ?? (int) $this->settings->get('sessions_per_day', 2);
    }

    public function planLength(User $user): int
    {
        return $user->level?->days_to_complete
            ?? (int) $this->settings->get('plan_length_days', 30);
    }

    /** Total fully completed training days for the user. */
    public function completedDays(User $user): int
    {
        return $user->trainingDays()->whereNotNull('completed_at')->count();
    }

    /** 1-based day the user is currently working on, capped at the plan length. */
    public function currentDayNumber(User $user): int
    {
        return min($this->completedDays($user) + 1, $this->planLength($user));
    }

    /** Month/day pair derived from completed days (Month 1 Day 20, etc.). */
    public function position(User $user): array
    {
        $planLength = max(1, $this->planLength($user));
        $current = $this->currentDayNumber($user);
        $completed = $this->completedDays($user);

        return [
            'month' => intdiv($completed, $planLength) + 1,
            'day' => $current,
            'plan_length' => $planLength,
            'completed' => $completed,
            'days_left' => max(0, $planLength - $completed),
        ];
    }

    public function todayRecord(User $user, ?CarbonInterface $date = null): TrainingDay
    {
        $date ??= $this->today($user);

        return TrainingDay::firstOrCreate(
            ['user_id' => $user->id, 'date' => $date->toDateString()],
            ['required_sessions' => $this->requiredSessionsPerDay($user)],
        );
    }

    /**
     * Today's progress toward a completed day: ['done' => x, 'required' => y, 'complete' => bool].
     */
    public function todayProgress(User $user): array
    {
        $record = $this->todayRecord($user);

        return [
            'done' => $record->sessions_count,
            'required' => $record->required_sessions ?: $this->requiredSessionsPerDay($user),
            'complete' => $record->completed_at !== null,
        ];
    }

    /**
     * Record one finished workout. Returns context describing what happened
     * (whether it completed the day, whether it was an extra/optional session,
     * and any exercises that just unlocked).
     */
    public function recordSession(User $user, ?Exercise $exercise, int $durationSeconds): array
    {
        $record = $this->todayRecord($user);
        $wasComplete = $record->completed_at !== null;

        $session = WorkoutSession::create([
            'user_id' => $user->id,
            'exercise_id' => $exercise?->id,
            'level_id' => $user->level_id,
            'started_at' => now()->subSeconds($durationSeconds),
            'completed_at' => now(),
            'duration_seconds' => $durationSeconds,
            'is_extra' => $wasComplete,
        ]);

        $record->increment('sessions_count');

        $justCompletedDay = false;
        if (! $wasComplete && $record->sessions_count >= $record->required_sessions) {
            $record->update(['completed_at' => now()]);
            $justCompletedDay = true;
        }

        return [
            'session' => $session,
            'is_extra' => $wasComplete,
            'day_completed' => $justCompletedDay,
            'unlocked' => $justCompletedDay ? $this->exercisesUnlockedAt($this->completedDays($user)) : [],
            'progress' => $this->todayProgress($user->refresh()),
        ];
    }

    public function isExerciseUnlocked(User $user, Exercise $exercise): bool
    {
        return $this->completedDays($user) >= $exercise->unlock_after_days;
    }

    /** Days the user still needs to train before an exercise unlocks. */
    public function daysUntilUnlock(User $user, Exercise $exercise): int
    {
        return max(0, $exercise->unlock_after_days - $this->completedDays($user));
    }

    /** A locked exercise can still be previewed/tried once, like Dr Kegel. */
    public function canPreview(User $user, Exercise $exercise): bool
    {
        return ! $this->isExerciseUnlocked($user, $exercise);
    }

    /** @return \Illuminate\Support\Collection<int, Exercise> */
    public function exercisesUnlockedAt(int $completedDays)
    {
        return Exercise::query()
            ->where('is_active', true)
            ->where('unlock_after_days', $completedDays)
            ->orderBy('sort_order')
            ->get();
    }

    /** The next exercise the user is working toward unlocking. */
    public function nextUnlock(User $user): ?Exercise
    {
        return Exercise::query()
            ->where('is_active', true)
            ->where('unlock_after_days', '>', $this->completedDays($user))
            ->orderBy('unlock_after_days')
            ->first();
    }

    public function levelComplete(User $user): bool
    {
        return $this->completedDays($user) >= $this->planLength($user);
    }

    public function nextLevel(User $user): ?Level
    {
        if (! $user->level) {
            return Level::where('is_active', true)->orderBy('number')->first();
        }

        return Level::where('is_active', true)
            ->where('number', '>', $user->level->number)
            ->orderBy('number')
            ->first();
    }

    private function today(User $user): Carbon
    {
        return $user->timezone
            ? Carbon::now($user->timezone)
            : Carbon::now();
    }
}
