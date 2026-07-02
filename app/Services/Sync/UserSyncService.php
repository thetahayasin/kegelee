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

            // Google Play purchases complete ON the device, so the backend
            // learns about them here. Keyed by purchase_token; plans map by
            // slug (both sides seed the same fixed plans).
            $subscriptions = $user->subscriptions()
                ->whereNotNull('purchase_token')
                ->get()
                ->map(fn (\App\Models\Subscription $s) => [
                    'plan_slug'      => $s->plan?->slug,
                    'status'         => $s->status,
                    'store'          => $s->store,
                    'purchase_token' => $s->purchase_token,
                    'google_order_id'=> $s->google_order_id,
                    'trial_ends_at'  => $s->trial_ends_at?->toIso8601String(),
                    'started_at'     => $s->started_at?->toIso8601String(),
                    'ends_at'        => $s->ends_at?->toIso8601String(),
                    'canceled_at'    => $s->canceled_at?->toIso8601String(),
                    'auto_renewing'  => (bool) $s->auto_renewing,
                ])->all();

            $timezone = $user->timezone;

            if (! $sessions && ! $measurements && ! $reminders && ! $subscriptions && ! $timezone) {
                return true;
            }

            $response = BackendClient::request()
                ->withHeaders(BackendClient::userHeaders($user))
                ->post(BackendClient::base().'/v1/user/push', [
                    'workout_sessions'   => $sessions,
                    'measurements'       => $measurements,
                    'reminders'          => $reminders,
                    'subscriptions'      => $subscriptions,
                    'timezone'           => $timezone,
                    'level_id'           => $user->level_id,
                    'level_started_days' => (int) $user->level_started_days,
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
                // IMPORTANT: do NOT overwrite the device-owned scalar settings
                // (level_id, timezone, level_started_days) from the pull. The
                // device is the writer for those — it changes them locally and
                // PUSHES them up. Applying the backend's copy here reverted a
                // fresh local change (e.g. a difficulty change snapping straight
                // back to the old level on the very next sync). They arrive from
                // the backend at login time, which is the correct moment.

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
        // Reconcile by purchase_token, NOT raw id: a purchase completes on the
        // device first, so a fresh local record must never be deleted just
        // because the backend has not received the push yet.
        $tokens = array_filter(array_column($rows, 'purchase_token'));

        $stale = $user->subscriptions();
        if ($tokens) {
            $stale = $stale->whereNotIn('purchase_token', $tokens);
        }
        // Only remove local records the backend has had a full day to verify
        // and adopt - a fresh purchase must never lose access because the
        // backend hasn't seen its token yet. Token-less manual rows stay.
        $stale->whereNotNull('purchase_token')
            ->where('created_at', '<', now()->subDay())
            ->delete();

        foreach ($rows as $row) {
            if (empty($row['id']) && empty($row['purchase_token'])) {
                continue;
            }

            // Plans are the fixed hardcoded set on both sides; slugs are the
            // stable key. Fall back to plan_id only when it exists locally.
            $planId = null;
            if (! empty($row['plan_slug'])) {
                $planId = \App\Models\Plan::where('slug', $row['plan_slug'])->value('id');
            }
            if (! $planId && ! empty($row['plan_id']) && \App\Models\Plan::where('id', $row['plan_id'])->exists()) {
                $planId = $row['plan_id'];
            }

            $key = ! empty($row['purchase_token'])
                ? ['purchase_token' => $row['purchase_token']]
                : ['id' => $row['id']];

            $user->subscriptions()->updateOrCreate(
                $key,
                [
                    'plan_id'              => $planId,
                    'status'               => $row['status'] ?? 'active',
                    'store'                => $row['store'] ?? null,
                    'store_transaction_id' => $row['store_transaction_id'] ?? null,
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
