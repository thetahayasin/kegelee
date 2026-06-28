<?php

namespace App\Http\Controllers;

use App\Models\Exercise;
use App\Models\KnowledgeLesson;
use App\Models\Level;
use App\Models\Measurement;
use App\Models\OnboardingSlide;
use App\Models\Reminder;
use App\Models\TrainingDay;
use App\Models\WorkoutSession;
use App\Services\ProgressionService;
use App\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Secure API for the offline-first sync engine.
 *
 * All endpoints sit behind the VerifySyncApiKey middleware.
 * User-specific endpoints additionally require auth (session cookie).
 */
class SyncController extends Controller
{
    /**
     * GET /api/v1/content
     *
     * Returns the full content catalog: exercises, levels, onboarding slides,
     * knowledge lessons, and app settings. The client stores this in IndexedDB
     * and uses it as the offline source of truth for content.
     */
    public function content(SettingsService $settings): JsonResponse
    {
        // Media paths are stored relative ("/storage/..."). Devices render these
        // against their own local server, so we must hand back ABSOLUTE URLs
        // pointing at this backend, or the device can't load the asset.
        $abs = static function (?string $url): ?string {
            if (! $url) {
                return null;
            }
            if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
                return $url;
            }

            return url($url);
        };

        $exercises = Exercise::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn (Exercise $e) => [
                'id'                 => $e->id,
                'slug'               => $e->slug,
                'name'               => $e->name,
                'description'        => $e->description,
                'instructions'       => $e->instructions,
                'contract_seconds'   => (float) $e->contract_seconds,
                'relax_seconds'      => (float) $e->relax_seconds,
                'hold_seconds'       => (float) $e->hold_seconds,
                'min_duration'       => (float) $e->min_duration,
                'max_duration'       => (float) $e->max_duration,
                'is_active'          => (bool) $e->is_active,
                'full_hold'          => (bool) $e->full_hold,
                'start_phase'        => $e->start_phase,
                'contract_glow_mode' => $e->contract_glow_mode,
                'relax_glow_mode'    => $e->relax_glow_mode,
                'contract_label'     => $e->contract_label,
                'relax_label'        => $e->relax_label,
                'unlock_after_days'  => (int) $e->unlock_after_days,
                'sort_order'         => (int) $e->sort_order,
                'icon_url'           => $abs($e->iconUrl()),
                'video_url'          => $abs($e->videoUrl()),
                'updated_at'         => $e->updated_at?->toIso8601String(),
            ]);

        // Per-level run durations (the exercise_level pivot) — the SessionBuilder
        // needs these to assemble each level's workout, so they must sync too.
        $exerciseLevels = \Illuminate\Support\Facades\DB::table('exercise_level')
            ->get()
            ->map(fn ($row) => [
                'exercise_id'      => (int) $row->exercise_id,
                'level_id'         => (int) $row->level_id,
                'duration_seconds' => (float) $row->duration_seconds,
            ]);

        $levels = Level::where('is_active', true)
            ->orderBy('number')
            ->get()
            ->map(fn (Level $l) => [
                'id'                    => $l->id,
                'number'                => (int) $l->number,
                'name'                  => $l->name,
                'description'           => $l->description,
                'total_session_seconds' => (float) $l->total_session_seconds,
                'rest_seconds'          => (float) $l->rest_seconds,
                'min_exercises'         => (int) $l->min_exercises,
                'days_to_complete'      => (int) $l->days_to_complete,
                'sessions_per_day'      => $l->sessions_per_day,
                'updated_at'            => $l->updated_at?->toIso8601String(),
            ]);

        $slides = OnboardingSlide::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn (OnboardingSlide $s) => [
                'id'         => $s->id,
                'title'      => $s->title,
                'body'       => $s->body,
                'icon'       => $s->icon,
                'cta_label'  => $s->cta_label,
                'media_url'  => $abs($s->mediaUrl()),
                'sort_order' => (int) $s->sort_order,
                'updated_at' => $s->updated_at?->toIso8601String(),
            ]);

        $lessons = KnowledgeLesson::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn (KnowledgeLesson $k) => [
                'id'          => $k->id,
                'title'       => $k->title,
                'description' => $k->description,
                'video_src'   => $abs($k->videoSrc()),
                'sort_order'  => (int) $k->sort_order,
                'updated_at'  => $k->updated_at?->toIso8601String(),
            ]);

        $plans = \App\Models\Plan::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn (\App\Models\Plan $p) => [
                'id'               => $p->id,
                'name'             => $p->name,
                'slug'             => $p->slug,
                'description'      => $p->description,
                'price'            => (float) $p->price,
                'currency'         => $p->currency,
                'interval'         => $p->interval,
                'interval_count'   => (int) $p->interval_count,
                'features'         => $p->features,
                'store_product_id' => $p->store_product_id,
                'is_active'        => (bool) $p->is_active,
                'is_featured'      => (bool) $p->is_featured,
                'sort_order'       => (int) $p->sort_order,
                'updated_at'       => $p->updated_at?->toIso8601String(),
            ]);

        $discounts = \App\Models\Discount::where('is_active', true)
            ->get()
            ->map(fn (\App\Models\Discount $d) => [
                'id'              => $d->id,
                'code'            => $d->code,
                'description'     => $d->description,
                'type'            => $d->type,
                'value'           => (float) $d->value,
                'max_redemptions' => $d->max_redemptions !== null ? (int) $d->max_redemptions : null,
                'redemptions'     => (int) $d->redemptions,
                'starts_at'       => $d->starts_at?->toIso8601String(),
                'expires_at'      => $d->expires_at?->toIso8601String(),
                'is_active'       => (bool) $d->is_active,
                'updated_at'      => $d->updated_at?->toIso8601String(),
            ]);

        // Only send client-relevant settings (not SMTP credentials, etc.)
        $publicKeys = [
            'app_name', 'app_tagline', 'color_accent', 'color_accent_soft',
            'color_success', 'color_bg', 'color_surface', 'color_surface_2',
            'color_text', 'color_text_muted', 'circle_size', 'circle_track_width',
            'circle_glow_enabled', 'circle_glow_color', 'circle_animation_speed',
            'circle_glow_speed', 'circle_time_scale', 'haptics_enabled',
            'sound_enabled', 'sessions_per_day', 'plan_length_days',
            'onboarding_enabled', 'home_hero_image',
        ];

        $appSettings = [];
        foreach ($publicKeys as $key) {
            $appSettings[$key] = $settings->get($key);
        }
        // The hero image is a stored path; hand back an absolute URL.
        if (! empty($appSettings['home_hero_image'])) {
            $appSettings['home_hero_image'] = $abs($appSettings['home_hero_image']);
        }

        return response()->json([
            'exercises'        => $exercises,
            'exercise_levels'  => $exerciseLevels,
            'levels'           => $levels,
            'onboarding_slides' => $slides,
            'knowledge_lessons' => $lessons,
            'settings'         => $appSettings,
            'plans'            => $plans,
            'discounts'        => $discounts,
            'synced_at'        => now()->toIso8601String(),
        ]);
    }

    /**
     * POST /api/v1/user/push
     *
     * Accepts queued offline data from the client:
     * - workout_sessions: [{exercise_slug, duration_seconds, completed_at_iso, is_extra}]
     * - measurements: [{seconds, measured_at_iso}]
     * - reminders: [{weekday, times[], is_enabled}]
     *
     * De-duplicates sessions and measurements by timestamp (±5 seconds window).
     */
    public function push(Request $request, ProgressionService $progression): JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $synced = ['sessions' => 0, 'measurements' => 0, 'reminders' => 0];

        // --- Timezone (per-device; last write wins) ---
        $tz = (string) $request->input('timezone', '');
        if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true) && $user->timezone !== $tz) {
            $user->update(['timezone' => $tz]);
        }

        // --- Workout Sessions ---
        foreach ($request->input('workout_sessions', []) as $s) {
            $completedAt = isset($s['completed_at_iso'])
                ? \Carbon\Carbon::parse($s['completed_at_iso'])
                : now();

            $durationSeconds = max(0, (int) ($s['duration_seconds'] ?? 0));
            if ($durationSeconds < 10) {
                continue;
            }

            // De-duplicate: skip if a session exists within ±5 seconds
            $exists = WorkoutSession::where('user_id', $user->id)
                ->where('completed_at', '>=', $completedAt->copy()->subSeconds(5))
                ->where('completed_at', '<=', $completedAt->copy()->addSeconds(5))
                ->exists();

            if (! $exists) {
                $exercise = isset($s['exercise_slug'])
                    ? Exercise::where('slug', $s['exercise_slug'])->first()
                    : null;

                // Use the original client timestamp so subsequent pushes of the
                // same session are correctly deduplicated by the ±5s window.
                $record = $progression->todayRecord($user, $completedAt);
                $wasComplete = $record->completed_at !== null;

                WorkoutSession::create([
                    'user_id'          => $user->id,
                    'exercise_id'      => $exercise?->id,
                    'level_id'         => $user->level_id,
                    'started_at'       => $completedAt->copy()->subSeconds($durationSeconds),
                    'completed_at'     => $completedAt,
                    'duration_seconds' => $durationSeconds,
                    'is_extra'         => $wasComplete,
                ]);

                $record->increment('sessions_count');
                if (! $wasComplete && $record->sessions_count >= $record->required_sessions) {
                    $record->update(['completed_at' => $completedAt]);
                }

                $synced['sessions']++;
            }
        }

        // --- Measurements ---
        foreach ($request->input('measurements', []) as $m) {
            $measuredAt = isset($m['measured_at_iso'])
                ? \Carbon\Carbon::parse($m['measured_at_iso'])
                : now();

            $seconds = round(max(0, min((float) ($m['seconds'] ?? 0), 600)), 1);
            if ($seconds <= 0) {
                continue;
            }

            // De-duplicate
            $exists = Measurement::where('user_id', $user->id)
                ->where('measured_at', '>=', $measuredAt->copy()->subSeconds(5))
                ->where('measured_at', '<=', $measuredAt->copy()->addSeconds(5))
                ->exists();

            if (! $exists) {
                Measurement::create([
                    'user_id'     => $user->id,
                    'seconds'     => $seconds,
                    'measured_at' => $measuredAt,
                ]);
                $synced['measurements']++;
            }
        }

        // --- Reminders ---
        foreach ($request->input('reminders', []) as $r) {
            $weekday = (int) ($r['weekday'] ?? -1);
            if ($weekday < 0 || $weekday > 6) {
                continue;
            }

            $user->reminders()->updateOrCreate(
                ['weekday' => $weekday],
                [
                    'times'      => $r['times'] ?? ['08:00'],
                    'is_enabled' => (bool) ($r['is_enabled'] ?? false),
                ],
            );
            $synced['reminders']++;
        }

        return response()->json([
            'ok'     => true,
            'synced' => $synced,
        ]);
    }

    /**
     * GET /api/v1/user/pull
     *
     * Returns the authenticated user's progress data so a device can
     * re-hydrate its local IndexedDB after a fresh install or cache clear.
     */
    public function pull(Request $request, ProgressionService $progression): JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $position = $progression->position($user);
        $today = $progression->todayProgress($user);

        return response()->json([
            'user' => [
                'id'        => $user->id,
                'name'      => $user->name,
                'email'     => $user->email,
                'password_hash' => $user->password,
                'level_id'  => $user->level_id,
                'timezone'  => $user->timezone,
                'onboarded' => (bool) $user->onboarded_at,
            ],
            'position'         => $position,
            'today'            => $today,
            'workout_sessions' => $user->workoutSessions()
                ->orderByDesc('completed_at')
                ->take(200)
                ->get()
                ->map(fn (WorkoutSession $ws) => [
                    'id'               => $ws->id,
                    'exercise_id'      => $ws->exercise_id,
                    'level_id'         => $ws->level_id,
                    'duration_seconds' => (int) $ws->duration_seconds,
                    'is_extra'         => (bool) $ws->is_extra,
                    'completed_at'     => $ws->completed_at?->toIso8601String(),
                ]),
            'measurements' => $user->measurements()
                ->orderByDesc('measured_at')
                ->take(100)
                ->get()
                ->map(fn (Measurement $m) => [
                    'id'          => $m->id,
                    'seconds'     => (float) $m->seconds,
                    'measured_at' => $m->measured_at?->toIso8601String(),
                ]),
            'reminders' => $user->reminders()->get()->map(fn (Reminder $r) => [
                'weekday'    => (int) $r->weekday,
                'times'      => $r->times,
                'is_enabled' => (bool) $r->is_enabled,
            ]),
            'training_days' => $user->trainingDays()
                ->orderByDesc('date')
                ->take(200)
                ->get()
                ->map(fn (TrainingDay $td) => [
                    'date'              => $td->date,
                    'sessions_count'    => (int) $td->sessions_count,
                    'required_sessions' => (int) $td->required_sessions,
                    'completed_at'      => $td->completed_at?->toIso8601String(),
                ]),
            'subscriptions' => $user->subscriptions()->get()->map(fn (\App\Models\Subscription $s) => [
                'id'                   => $s->id,
                'plan_id'              => $s->plan_id,
                'discount_id'          => $s->discount_id,
                'status'               => $s->status,
                'store'                => $s->store,
                'store_transaction_id' => $s->store_transaction_id,
                'purchase_token'       => $s->purchase_token,
                'google_order_id'      => $s->google_order_id,
                'trial_ends_at'        => $s->trial_ends_at?->toIso8601String(),
                'started_at'           => $s->started_at?->toIso8601String(),
                'ends_at'              => $s->ends_at?->toIso8601String(),
                'canceled_at'          => $s->canceled_at?->toIso8601String(),
                'auto_renewing'        => (bool) $s->auto_renewing,
            ]),
            'synced_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * POST /api/v1/user/reset — wipe the acting user's progress on the backend
     * (training days, sessions, measurements, lesson completions) so "Reset
     * progress" on the device clears server-side too and can't sync back.
     */
    public function reset(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        \Illuminate\Support\Facades\DB::table('training_days')->where('user_id', $user->id)->delete();
        \Illuminate\Support\Facades\DB::table('workout_sessions')->where('user_id', $user->id)->delete();
        \Illuminate\Support\Facades\DB::table('measurements')->where('user_id', $user->id)->delete();
        \Illuminate\Support\Facades\DB::table('knowledge_lesson_user')->where('user_id', $user->id)->delete();
        \Illuminate\Support\Facades\DB::table('reminders')->where('user_id', $user->id)->delete();
        $user->update(['level_started_days' => 0]);

        return response()->json(['success' => true]);
    }

    public function remoteLogin(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        if (! auth()->attempt($credentials)) {
            return response()->json(['error' => 'These credentials do not match our records.'], 401);
        }

        $user = auth()->user();

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'email_verified_at' => $user->email_verified_at?->toIso8601String(),
                'password_hash' => $user->password,
                'is_admin' => (bool) $user->is_admin,
                'level_id' => $user->level_id,
                'level_started_days' => (int) $user->level_started_days,
                'onboarded_at' => $user->onboarded_at?->toIso8601String(),
                'timezone' => $user->timezone,
            ]
        ]);
    }

    /**
     * Change a user's password on the backend (the auth source of truth). The
     * native device calls this so a password change actually persists server-side
     * and is reflected on every device, not just locally.
     */
    public function remoteChangePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email',
            'current_password' => 'required|string',
            'password' => 'required|string|min:6',
        ]);

        $user = \App\Models\User::where('email', strtolower($data['email']))->first();

        if (! $user) {
            return response()->json(['error' => 'Account not found.'], 404);
        }

        if ($user->password && ! \Illuminate\Support\Facades\Hash::check($data['current_password'], $user->password)) {
            return response()->json(['error' => 'Your current password is incorrect.'], 422);
        }

        $user->update(['password' => \Illuminate\Support\Facades\Hash::make($data['password'])]);

        // Hand back the new hash so the device can mirror it and stay signed in.
        return response()->json(['success' => true, 'password_hash' => $user->password]);
    }

    public function remoteRegister(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:190|unique:users,email',
            'password' => 'required|string|min:6',
        ]);

        $user = \App\Models\User::create([
            'name' => trim($data['name']),
            'email' => strtolower($data['email']),
            'password' => \Illuminate\Support\Facades\Hash::make($data['password']),
            'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
        ]);

        \App\Services\CodeSender::send($user->email, 'verify');

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'email_verified_at' => $user->email_verified_at?->toIso8601String(),
                'password_hash' => $user->password,
                'is_admin' => (bool) $user->is_admin,
                'level_id' => $user->level_id,
                'level_started_days' => (int) $user->level_started_days,
                'onboarded_at' => $user->onboarded_at?->toIso8601String(),
                'timezone' => $user->timezone,
            ]
        ]);
    }

    public function remoteVerify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email',
            'code' => 'required|digits:6',
        ]);

        if (! \App\Models\EmailCode::verify($data['email'], $data['code'], 'verify')) {
            return response()->json(['error' => 'That code is invalid or has expired.'], 422);
        }

        $user = \App\Models\User::where('email', $data['email'])->first();
        if (! $user) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        $user->update(['email_verified_at' => now()]);

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'email_verified_at' => $user->email_verified_at?->toIso8601String(),
                'password_hash' => $user->password,
                'is_admin' => (bool) $user->is_admin,
                'level_id' => $user->level_id,
                'level_started_days' => (int) $user->level_started_days,
                'onboarded_at' => $user->onboarded_at?->toIso8601String(),
                'timezone' => $user->timezone,
            ]
        ]);
    }

    public function remoteResend(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email',
        ]);

        $key = 'resend:'.$data['email'];
        if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, 3)) {
            return response()->json(['error' => 'Too many requests. Try again later.'], 429);
        }
        \Illuminate\Support\Facades\RateLimiter::hit($key, 300);

        \App\Services\CodeSender::send($data['email'], 'verify');

        return response()->json(['success' => true]);
    }
}
