<?php

namespace App\Services\Sync;

use App\Models\Measurement;
use App\Models\User;
use App\Models\WorkoutSession;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Two-way sync of a user's own data (workout sessions, endurance measurements
 * and reminders) between this device's local SQLite and the remote backend.
 *
 * Push: local → backend (the backend de-duplicates by timestamp, so re-pushing
 *       is safe and idempotent).
 * Pull: backend → local (so the same account on another device / the web shows
 *       the same progress). Inserts are de-duplicated by timestamp.
 */
class UserSyncService
{
    /** Push local user data up to the backend. Returns true on success. */
    public function push(User $user): bool
    {
        if (! BackendClient::isClient()) {
            return false;
        }

        try {
            $sessions = $user->workoutSessions()
                ->with('exercise:id,slug')
                ->orderByDesc('completed_at')
                ->take(200)
                ->get()
                ->map(fn (WorkoutSession $s) => [
                    'exercise_slug'    => $s->exercise?->slug,
                    'duration_seconds' => (int) $s->duration_seconds,
                    'completed_at_iso' => $s->completed_at?->toIso8601String(),
                    'is_extra'         => (bool) $s->is_extra,
                ])->all();

            $measurements = $user->measurements()
                ->orderByDesc('measured_at')
                ->take(100)
                ->get()
                ->map(fn (Measurement $m) => [
                    'seconds'         => (float) $m->seconds,
                    'measured_at_iso' => $m->measured_at?->toIso8601String(),
                ])->all();

            $reminders = $user->reminders()->get()->map(fn ($r) => [
                'weekday'    => (int) $r->weekday,
                'times'      => $r->times,
                'is_enabled' => (bool) $r->is_enabled,
            ])->all();

            $timezone = $user->timezone;

            if (! $sessions && ! $measurements && ! $reminders && ! $timezone) {
                return true;
            }

            $response = BackendClient::request()
                ->withHeaders(BackendClient::userHeaders($user))
                ->post(BackendClient::base().'/v1/user/push', [
                    'workout_sessions' => $sessions,
                    'measurements'     => $measurements,
                    'reminders'        => $reminders,
                    'timezone'         => $timezone,
                ]);

            return $response->successful();
        } catch (\Throwable $e) {
            Log::warning('User sync push failed: '.$e->getMessage());

            return false;
        }
    }

    /** Pull the user's backend data down into local SQLite. Returns true on success. */
    public function pull(User $user): bool
    {
        if (! BackendClient::isClient()) {
            return false;
        }

        try {
            $response = BackendClient::request()
                ->withHeaders(BackendClient::userHeaders($user))
                ->get(BackendClient::base().'/v1/user/pull');

            if (! $response->successful()) {
                return false;
            }

            $data = $response->json();
            if (! is_array($data)) {
                return false;
            }

            DB::transaction(function () use ($user, $data) {
                // Sync user profile fields (level, timezone, etc.) so the
                // local model reflects the backend's current state and the
                // level card / profile page show the correct level.
                if (! empty($data['user'])) {
                    $profileUpdates = [];
                    if (isset($data['user']['level_id'])) {
                        $profileUpdates['level_id'] = $data['user']['level_id'];
                    }
                    if (! empty($data['user']['timezone'])) {
                        $profileUpdates['timezone'] = $data['user']['timezone'];
                    }
                    if (isset($data['user']['level_started_days'])) {
                        $profileUpdates['level_started_days'] = (int) $data['user']['level_started_days'];
                    }
                    if ($profileUpdates) {
                        $user->update($profileUpdates);
                    }
                }

                $this->applySessions($user, $data['workout_sessions'] ?? []);
                $this->applyMeasurements($user, $data['measurements'] ?? []);
                $this->applyReminders($user, $data['reminders'] ?? []);
                $this->applyTrainingDays($user, $data['training_days'] ?? []);
                $this->applySubscriptions($user, $data['subscriptions'] ?? []);
            });

            return true;
        } catch (\Throwable $e) {
            Log::warning('User sync pull failed: '.$e->getMessage());

            return false;
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applySessions(User $user, array $rows): void
    {
        foreach ($rows as $row) {
            if (empty($row['completed_at'])) {
                continue;
            }
            $completedAt = Carbon::parse($row['completed_at']);

            // De-duplicate against a local session within a ±5s window.
            $exists = WorkoutSession::where('user_id', $user->id)
                ->whereBetween('completed_at', [
                    $completedAt->copy()->subSeconds(5),
                    $completedAt->copy()->addSeconds(5),
                ])->exists();

            if ($exists) {
                continue;
            }

            WorkoutSession::create([
                'user_id'          => $user->id,
                'exercise_id'      => $row['exercise_id'] ?? null,
                'level_id'         => $row['level_id'] ?? $user->level_id,
                'duration_seconds' => (int) ($row['duration_seconds'] ?? 0),
                'is_extra'         => (bool) ($row['is_extra'] ?? false),
                'started_at'       => $completedAt->copy()->subSeconds((int) ($row['duration_seconds'] ?? 0)),
                'completed_at'     => $completedAt,
            ]);
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyMeasurements(User $user, array $rows): void
    {
        foreach ($rows as $row) {
            if (empty($row['measured_at'])) {
                continue;
            }
            $measuredAt = Carbon::parse($row['measured_at']);

            $exists = Measurement::where('user_id', $user->id)
                ->whereBetween('measured_at', [
                    $measuredAt->copy()->subSeconds(5),
                    $measuredAt->copy()->addSeconds(5),
                ])->exists();

            if ($exists) {
                continue;
            }

            Measurement::create([
                'user_id'     => $user->id,
                'seconds'     => (float) ($row['seconds'] ?? 0),
                'measured_at' => $measuredAt,
            ]);
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyReminders(User $user, array $rows): void
    {
        foreach ($rows as $row) {
            $weekday = (int) ($row['weekday'] ?? -1);
            if ($weekday < 0 || $weekday > 6) {
                continue;
            }

            $user->reminders()->updateOrCreate(
                ['weekday' => $weekday],
                [
                    'times'      => $row['times'] ?? ['08:00'],
                    'is_enabled' => (bool) ($row['is_enabled'] ?? false),
                ],
            );
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applyTrainingDays(User $user, array $rows): void
    {
        foreach ($rows as $row) {
            if (empty($row['date'])) {
                continue;
            }

            DB::table('training_days')->updateOrInsert(
                ['user_id' => $user->id, 'date' => $row['date']],
                [
                    'sessions_count'    => (int) ($row['sessions_count'] ?? 0),
                    'required_sessions' => (int) ($row['required_sessions'] ?? 0),
                    'completed_at'      => $row['completed_at'] ?? null,
                    'updated_at'        => now(),
                ],
            );
        }
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function applySubscriptions(User $user, array $rows): void
    {
        $ids = array_filter(array_column($rows, 'id'));
        if (!empty($ids)) {
            $user->subscriptions()->whereNotIn('id', $ids)->delete();
        } else {
            $user->subscriptions()->delete();
        }

        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }

            // Check if plan exists locally to avoid foreign key issues
            if (!empty($row['plan_id']) && !\App\Models\Plan::where('id', $row['plan_id'])->exists()) {
                continue;
            }

            // Check if discount exists locally to avoid foreign key issues
            if (!empty($row['discount_id']) && !\App\Models\Discount::where('id', $row['discount_id'])->exists()) {
                $row['discount_id'] = null;
            }

            $user->subscriptions()->updateOrCreate(
                ['id' => $row['id']],
                [
                    'plan_id'              => $row['plan_id'] ?? null,
                    'discount_id'          => $row['discount_id'] ?? null,
                    'status'               => $row['status'] ?? 'active',
                    'store'                => $row['store'] ?? null,
                    'store_transaction_id' => $row['store_transaction_id'] ?? null,
                    'purchase_token'       => $row['purchase_token'] ?? null,
                    'google_order_id'      => $row['google_order_id'] ?? null,
                    'trial_ends_at'        => !empty($row['trial_ends_at']) ? Carbon::parse($row['trial_ends_at']) : null,
                    'started_at'           => !empty($row['started_at']) ? Carbon::parse($row['started_at']) : null,
                    'ends_at'              => !empty($row['ends_at']) ? Carbon::parse($row['ends_at']) : null,
                    'canceled_at'          => !empty($row['canceled_at']) ? Carbon::parse($row['canceled_at']) : null,
                    'auto_renewing'        => (bool) ($row['auto_renewing'] ?? true),
                ]
            );
        }
    }
}
