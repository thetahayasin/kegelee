<?php

namespace App\Http\Controllers;

use App\Models\Exercise;
use App\Models\Level;
use App\Models\Measurement;
use App\Models\Page;
use App\Models\Reminder;
use App\Models\TrainingDay;
use App\Models\WorkoutSession;
use App\Services\ProgressionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * API for the offline-first sync engine.
 *
 * The ResolveApiUser middleware authenticates requests carrying the per-user
 * X-User-Token; public endpoints (content, auth) are throttled and
 * credential-checked, and user endpoints require the token (or a session).
 */
class SyncController extends Controller
{
    /**
     * GET /api/v1/content
     *
     * Returns the only backend-managed content left: legal pages. Exercises,
     * levels, onboarding, plans and the basics tutorials are all hardcoded in
     * the app and never sync.
     */
    public function content(): JsonResponse
    {
        // Content ships too so the device holds a current fallback copy;
        // opening a page still fetches the live version first.
        $pages = Page::where('is_published', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn (Page $p) => [
                'id'         => $p->id,
                'slug'       => $p->slug,
                'title'      => $p->title,
                'content'    => $p->content,
                'sort_order' => (int) $p->sort_order,
                'updated_at' => $p->updated_at?->toIso8601String(),
            ]);

        $settings = app(\App\Services\SettingsService::class);

        return response()->json([
            'pages'     => $pages,
            // Feature flags the device UI reads locally (synced into its own
            // settings store; see ContentSyncService::applySettings).
            'settings'  => [
                'google_login_enabled' => (bool) $settings->get('google_login_enabled'),
                // The OAuth web client id, needed by the device's NATIVE Google
                // sign-in (it pins the ID token audience). Client ids are
                // public by design - only the client secret stays server-side.
                'google_web_client_id' => (string) $settings->get('google_client_id'),
            ],
            'synced_at' => now()->toIso8601String(),
        ]);
    }

    /**
     * GET /api/v1/pages/{slug}
     *
     * Serves a single legal page (privacy policy, terms, ...) live so the app
     * always shows the current version. Legal content is online-only by
     * design and never cached on the device.
     */
    public function page(string $slug): JsonResponse
    {
        $page = Page::where('slug', $slug)->where('is_published', true)->first();

        if (! $page) {
            return response()->json(['error' => 'Page not found.'], 404);
        }

        return response()->json([
            'slug'       => $page->slug,
            'title'      => $page->title,
            'content'    => $page->content,
            'updated_at' => $page->updated_at?->toIso8601String(),
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

        // --- Level (chosen difficulty) — so a level change persists server-side. ---
        $levelId = $request->input('level_id');
        if ($levelId && Level::where('id', $levelId)->exists()) {
            $user->update(['level_id' => (int) $levelId]);
        }
        if ($request->has('level_started_days')) {
            $user->update(['level_started_days' => max(0, (int) $request->input('level_started_days'))]);
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

        // --- Completed Basics Lessons ---
        $completedSlugs = $request->input('completed_lessons', []);
        $slugToOrder = ['why' => 0, 'find' => 1, 'first' => 2];
        $orders = [];
        foreach ($completedSlugs as $slug) {
            if (isset($slugToOrder[$slug])) {
                $orders[] = $slugToOrder[$slug];
            }
        }
        if (! empty($orders)) {
            $lessons = \App\Models\KnowledgeLesson::whereIn('sort_order', $orders)->get();
            $syncData = [];
            foreach ($lessons as $lesson) {
                $syncData[$lesson->id] = ['completed_at' => now()];
            }
            $user->completedLessons()->syncWithoutDetaching($syncData);
        }

        // --- Subscriptions (Google Play purchases complete on the device) ---
        // The device reports the purchase token; the backend VERIFIES it with
        // the Play Developer API before storing anything, so a forged token
        // can never grant access. Known tokens are ignored here - the backend
        // record is authoritative and kept current by the RTDN webhooks.
        $synced['subscriptions'] = 0;
        foreach ($request->input('subscriptions', []) as $s) {
            $token = (string) ($s['purchase_token'] ?? '');
            if ($token === '') {
                continue;
            }

            if (\App\Models\Subscription::where('purchase_token', $token)->exists()) {
                continue;
            }

            $plan = ! empty($s['plan_slug'])
                ? \App\Models\Plan::where('slug', $s['plan_slug'])->first()
                : null;

            if (! $plan || empty($plan->store_product_id)) {
                continue;
            }

            try {
                $billing = app(\App\Services\GooglePlayBillingService::class);
                $data = $billing->verifySubscription($plan->store_product_id, $token);

                // 1 = paid, 2 = free trial. Anything else is not a valid purchase.
                if (! in_array($data['paymentState'] ?? -1, [1, 2], true)) {
                    continue;
                }

                $billing->acknowledgeSubscription($plan->store_product_id, $token);

                $expiresAt = isset($data['expiryTimeMillis'])
                    ? \Carbon\Carbon::createFromTimestampMs((int) $data['expiryTimeMillis'])
                    : null;
                $isTrial = ($data['paymentState'] ?? 0) === 2;

                \App\Models\Subscription::create([
                    'user_id'         => $user->id,
                    'plan_id'         => $plan->id,
                    'status'          => $isTrial ? 'trialing' : 'active',
                    'store'           => 'google_play',
                    'purchase_token'  => $token,
                    'google_order_id' => $data['orderId'] ?? ($s['google_order_id'] ?? null),
                    'store_transaction_id' => $data['orderId'] ?? ($s['google_order_id'] ?? null),
                    'trial_ends_at'   => $isTrial ? $expiresAt : null,
                    'started_at'      => ! empty($s['started_at']) ? \Carbon\Carbon::parse($s['started_at']) : now(),
                    'ends_at'         => $expiresAt,
                    'auto_renewing'   => (bool) ($data['autoRenewing'] ?? true),
                ]);
                $synced['subscriptions']++;
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Pushed purchase token failed verification', [
                    'user_id' => $user->id,
                    'error'   => $e->getMessage(),
                ]);
            }
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
                'api_token' => $user->apiToken(),
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
            'subscriptions' => $user->subscriptions()->with('plan:id,slug')->get()->map(fn (\App\Models\Subscription $s) => [
                'id'                   => $s->id,
                'plan_id'              => $s->plan_id,
                'plan_slug'            => $s->plan?->slug,
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
            'completed_lessons' => $user->completedLessons()
                ->wherePivotNotNull('completed_at')
                ->get()
                ->map(function ($lesson) {
                    $orderToSlug = [0 => 'why', 1 => 'find', 2 => 'first'];
                    return $orderToSlug[$lesson->sort_order] ?? null;
                })
                ->filter()
                ->values()
                ->all(),
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

    /**
     * Email a one-time code so the signed-in user can confirm deleting their
     * account. The device calls this before showing the code field.
     */
    public function deleteCode(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        \App\Services\CodeSender::send($user->email, 'delete');

        return response()->json(['success' => true]);
    }

    /**
     * Permanently delete the signed-in user and everything they own, after
     * verifying the emailed code. Irreversible. Google Play subscriptions are
     * unaffected (Google owns billing) - the app warns the user separately.
     */
    public function deleteAccount(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        $data = $request->validate(['code' => 'required|digits:6']);

        if (! \App\Models\EmailCode::verify($user->email, $data['code'], 'delete')) {
            return response()->json(['error' => 'That code is invalid or has expired.'], 422);
        }

        $user->deleteWithData();

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

        if (! $user->email_verified_at) {
            auth()->logout();
            \App\Services\CodeSender::send($user->email, 'verify');
            return response()->json(['error' => 'unverified'], 403);
        }

        // Update timezone if provided
        $tz = (string) $request->input('timezone', '');
        if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true) && $user->timezone !== $tz) {
            $user->update(['timezone' => $tz]);
        }

        return response()->json([
            'success' => true,
            'user' => $this->remoteUserPayload($user),
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
            'password' => 'required|string|min:6|regex:/[0-9]/',
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
            'password' => 'required|string|min:6|regex:/[0-9]/',
        ]);

        $tz = (string) $request->input('timezone', '');
        $validTz = ($tz !== '' && in_array($tz, timezone_identifiers_list(), true)) ? $tz : null;

        $user = \App\Models\User::create([
            'name' => trim($data['name']),
            'email' => strtolower($data['email']),
            'password' => \Illuminate\Support\Facades\Hash::make($data['password']),
            'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
            'timezone' => $validTz,
        ]);

        \App\Services\CodeSender::send($user->email, 'verify');

        return response()->json([
            'success' => true,
            'user' => $this->remoteUserPayload($user),
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
            'user' => $this->remoteUserPayload($user),
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

    /**
     * Email a password-reset code. Always reports success (no account
     * enumeration); only actually sends when the account exists.
     */
    public function remoteResetCode(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email']);
        $email = strtolower($data['email']);

        $key = 'reset-code:'.$email;
        if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, 3)) {
            return response()->json(['error' => 'Too many requests. Try again later.'], 429);
        }
        \Illuminate\Support\Facades\RateLimiter::hit($key, 900);

        if (\App\Models\User::where('email', $email)->exists()) {
            \App\Services\CodeSender::send($email, 'reset');
        }

        return response()->json(['success' => true]);
    }

    /**
     * Verify a reset code and set the new password. Returns the account so the
     * device can mirror the fresh hash and stay signed in.
     */
    public function remoteReset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email',
            'code' => 'required|digits:6',
            'password' => 'required|string|min:6|regex:/[0-9]/',
        ]);
        $email = strtolower($data['email']);

        if (! \App\Models\EmailCode::verify($email, $data['code'], 'reset')) {
            return response()->json(['error' => 'That code is invalid or has expired.'], 422);
        }

        $user = \App\Models\User::where('email', $email)->first();
        if (! $user) {
            return response()->json(['error' => 'Account not found.'], 404);
        }

        $user->update([
            'password' => \Illuminate\Support\Facades\Hash::make($data['password']),
            'email_verified_at' => $user->email_verified_at ?? now(),
            // Rotate the API token: a reset is the account-recovery moment, so
            // every previously issued token dies here. The payload below
            // regenerates a fresh one, keeping the resetting device signed in.
            'api_token' => null,
        ]);

        return response()->json([
            'success' => true,
            'user' => $this->remoteUserPayload($user),
        ]);
    }

    /**
     * POST /api/v1/auth/google/token — fully native Google sign-in (no
     * browser). The device's Google account picker hands the app an ID token;
     * Google's tokeninfo endpoint validates its signature and expiry, and we
     * additionally pin the audience to OUR client id (a token minted for any
     * other app must not sign in here), the Google issuer, and a verified
     * email. Then find-or-create exactly like the web OAuth callback: a
     * Google sign-in IS a completed, verified sign-up.
     */
    public function googleToken(Request $request): JsonResponse
    {
        $data = $request->validate(['id_token' => 'required|string']);

        $settings = app(\App\Services\SettingsService::class);
        $clientId = (string) $settings->get('google_client_id');

        if (! $clientId || ! $settings->get('google_login_enabled')) {
            return response()->json(['error' => 'Google sign-in is not available.'], 422);
        }

        try {
            $response = \Illuminate\Support\Facades\Http::timeout(10)
                ->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $data['id_token']]);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Could not verify the Google sign-in. Please try again.'], 502);
        }

        if (! $response->ok()) {
            return response()->json(['error' => 'That Google sign-in is invalid or has expired.'], 422);
        }

        $claims = $response->json();

        $sub = (string) ($claims['sub'] ?? '');
        $email = strtolower((string) ($claims['email'] ?? ''));
        $emailVerified = ($claims['email_verified'] ?? null);
        $emailVerified = $emailVerified === true || $emailVerified === 'true';

        if (($claims['aud'] ?? null) !== $clientId
            || ! in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
            || $sub === ''
            || $email === ''
            || ! $emailVerified
        ) {
            return response()->json(['error' => 'That Google sign-in is invalid or has expired.'], 422);
        }

        $user = \App\Models\User::where('google_id', $sub)
            ->orWhere('email', $email)
            ->first();

        if (! $user) {
            $user = \App\Models\User::create([
                'name' => ((string) ($claims['name'] ?? '')) ?: 'Member',
                'email' => $email,
                'google_id' => $sub,
                'email_verified_at' => now(), // Google accounts are pre-verified
                'password' => \Illuminate\Support\Facades\Hash::make(\Illuminate\Support\Str::random(40)),
                'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
                'onboarded_at' => now(),
            ]);
        } elseif (! $user->google_id || ! $user->onboarded_at || ! $user->email_verified_at) {
            // Linking Google to an existing account (or one that never finished
            // signing up): a Google sign-in IS a completed, verified sign-up.
            $user->update([
                'google_id' => $user->google_id ?: $sub,
                'email_verified_at' => $user->email_verified_at ?? now(),
                'onboarded_at' => $user->onboarded_at ?? now(),
            ]);
        }

        // Per-device timezone, like remoteLogin (last write wins).
        $tz = (string) $request->input('timezone', '');
        if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true) && $user->timezone !== $tz) {
            $user->update(['timezone' => $tz]);
        }

        return response()->json([
            'success' => true,
            'user' => $this->remoteUserPayload($user),
        ]);
    }

    /**
     * Redeem the one-time token minted by the native Google callback and hand
     * back the account so the device can mirror it and sign in. Single use.
     */
    public function googleRedeem(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => 'required|string']);

        $userId = \Illuminate\Support\Facades\Cache::pull('goauth:'.$data['token']);
        if (! $userId) {
            return response()->json(['error' => 'That sign-in link has expired.'], 422);
        }

        $user = \App\Models\User::find($userId);
        if (! $user) {
            return response()->json(['error' => 'Account not found.'], 404);
        }

        // Update timezone if provided
        $tz = (string) $request->input('timezone', '');
        if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true) && $user->timezone !== $tz) {
            $user->update(['timezone' => $tz]);
        }

        return response()->json([
            'success' => true,
            'user' => $this->remoteUserPayload($user),
        ]);
    }

    /**
     * The account payload every auth endpoint returns so the device can mirror
     * the user locally (password_hash enables offline login on the device) and
     * authenticate future sync calls (api_token).
     *
     * @return array<string, mixed>
     */
    private function remoteUserPayload(\App\Models\User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            'password_hash' => $user->password,
            'api_token' => $user->apiToken(),
            'is_admin' => (bool) $user->is_admin,
            'level_id' => $user->level_id,
            'level_started_days' => (int) $user->level_started_days,
            'onboarded_at' => $user->onboarded_at?->toIso8601String(),
            'timezone' => $user->timezone,
        ];
    }
}
