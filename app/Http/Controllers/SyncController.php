<?php

namespace App\Http\Controllers;

use App\Models\Exercise;
use App\Models\Level;
use App\Models\Measurement;
use App\Models\Page;
use App\Models\Reminder;
use App\Models\TrainingDay;
use App\Models\UserEvent;
use App\Models\WorkoutSession;
use App\Services\ProgressionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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
    public function content(Request $request): JsonResponse
    {
        // ?locale= is the device's current language. Unsupported or absent
        // means English. Each page independently falls back to English when
        // that language has no translation, so a partly-translated set never
        // leaves a legal page blank.
        $locale = \App\Support\Locales::resolve($request->query('locale'));

        // Content ships too so the device holds a current fallback copy;
        // opening a page still fetches the live version first.
        $pages = Page::where('is_published', true)
            ->with('translations')
            ->orderBy('sort_order')
            ->get()
            ->map(function (Page $p) use ($locale) {
                $localized = $p->localized($locale);

                return [
                    'id'          => $p->id,
                    'slug'        => $p->slug,
                    'title'       => $localized['title'],
                    'content'     => $localized['content'],
                    'locale'      => $localized['locale'],
                    'is_fallback' => $localized['is_fallback'],
                    'sort_order'  => (int) $p->sort_order,
                    'updated_at'  => $p->updated_at?->toIso8601String(),
                ];
            });

        $settings = app(\App\Services\SettingsService::class);

        return response()->json([
            'pages'     => $pages,
            // Feature flags the device UI reads locally (synced into its own
            // settings store; see ContentSyncService::applySettings).
            'settings'  => [
                'google_login_enabled'               => (bool) $settings->get('google_login_enabled'),
                'google_web_client_id'               => (string) $settings->get('google_client_id'),
                'revenuecat_enabled'                  => (bool) $settings->get('revenuecat_enabled', true),
                'revenuecat_android_public_sdk_key' => (string) $settings->get('revenuecat_android_public_sdk_key'),
                'revenuecat_ios_public_sdk_key'     => (string) $settings->get('revenuecat_ios_public_sdk_key'),
                'revenuecat_entitlement_id'         => (string) $settings->get('revenuecat_entitlement_id', 'premium'),
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
    public function page(Request $request, string $slug): JsonResponse
    {
        $page = Page::where('slug', $slug)->where('is_published', true)->first();

        if (! $page) {
            return response()->json(['error' => 'Page not found.'], 404);
        }

        $localized = $page->localized($request->query('locale'));

        return response()->json([
            'slug'    => $page->slug,
            'title'   => $localized['title'],
            'content' => $localized['content'],
            // The language actually returned, which is not always the one
            // asked for. The client needs it to set text direction.
            'locale'      => $localized['locale'],
            'is_fallback' => $localized['is_fallback'],
            'updated_at'  => $page->updated_at?->toIso8601String(),
        ]);
    }

    /**
     * POST /api/v1/user/push
     *
     * Accepts queued offline data from the client:
     * - workout_sessions: [{client_id, exercise_slug, duration_seconds, completed_at_iso}]
     * - measurements: [{client_id, seconds, measured_at_iso}]
     * - reminders: [{weekday, times[], is_enabled}]
     * - events: [{client_id, name, subject?, meta?, occurred_at_iso}]
     * - subscriptions: [{purchase_token, store, ...}] - checked with the store
     *
     * Sessions, measurements and events de-duplicate on the client's own id,
     * so a push that succeeded server-side and lost its reply is safe to retry.
     */
    public function push(Request $request, ProgressionService $progression): JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Unauthenticated.'], 401);
        }

        // A push drains a device's outbox; it is never a bulk import. Bounding
        // every array stops a single request tying up the server, and the
        // shapes reject payloads no client of ours sends. Individual rows are
        // still SKIPPED rather than rejected inside the loops below: one bad
        // row must not fail the same sync forever.
        $request->validate([
            'timezone'                            => 'sometimes|nullable|string|max:64',
            'level_id'                            => 'sometimes|nullable|integer',
            'level_started_days'                  => 'sometimes|nullable|numeric',
            'completed_lessons'                   => 'sometimes|nullable|array|max:20',
            'onboarding'                          => 'sometimes|nullable|array',
            'workout_sessions'                    => 'sometimes|array|max:500',
            'workout_sessions.*'                  => 'array',
            'workout_sessions.*.client_id'        => 'sometimes|nullable|string|max:64',
            'workout_sessions.*.exercise_slug'    => 'sometimes|nullable|string|max:120',
            'workout_sessions.*.duration_seconds' => 'sometimes|nullable|numeric',
            'workout_sessions.*.completed_at_iso' => 'sometimes|nullable|string|max:64',
            'measurements'                        => 'sometimes|array|max:500',
            'measurements.*'                      => 'array',
            'measurements.*.client_id'            => 'sometimes|nullable|string|max:64',
            'measurements.*.seconds'              => 'sometimes|nullable|numeric',
            'measurements.*.measured_at_iso'      => 'sometimes|nullable|string|max:64',
            'events'                              => 'sometimes|array|max:500',
            'events.*'                            => 'array',
            'events.*.client_id'                  => 'sometimes|nullable|string|max:64',
            'events.*.name'                       => 'sometimes|nullable|string|max:64',
            'events.*.meta'                       => 'sometimes|nullable|array',
            'events.*.occurred_at_iso'            => 'sometimes|nullable|string|max:64',
            // Only the shape is checked here. Every field inside is bounded
            // and pattern-checked in the device block itself, so a phone that
            // reports a strange OS string still gets its push accepted - the
            // facts are a nice-to-have, and the progress in the same request
            // is not.
            'device'                              => 'sometimes|nullable|array',
            'reminders'                           => 'sometimes|array|max:7',
            'reminders.*'                         => 'array',
            'reminders.*.weekday'                 => 'sometimes|nullable|integer',
            'reminders.*.times'                   => 'sometimes|nullable|array|max:10',
            'training_days'                       => 'sometimes|array|max:500',
            'training_days.*'                     => 'array',
            'subscriptions'                       => 'sometimes|array|max:10',
            'subscriptions.*'                     => 'array',
            'subscriptions.*.purchase_token'      => 'sometimes|nullable|string|max:512',
            'subscriptions.*.plan_slug'           => 'sometimes|nullable|string|max:64',
            'subscriptions.*.store'               => 'sometimes|nullable|string|max:32',
        ]);

        // One transaction for the whole local write set. A half-applied push
        // is worse than a failed one: the device clears its outbox on a 200
        // and never offers the missing rows again.
        $applied = DB::transaction(fn () => $this->applyPushedData($request, $user, $progression));

        $synced = $applied['synced'];

        // Store verification stays OUTSIDE that transaction: it calls
        // RevenueCat and Google over the network, and a transaction held open
        // across those is a database lock waiting on someone else's server.
        $synced['subscriptions'] = $this->applyPushedSubscriptions($request, $user);

        return response()->json([
            'ok'     => true,
            'synced' => $synced,
            /**
             * Exactly which rows landed, by the device's own ids.
             *
             * Counts alone cannot be acted on: a push of ten sessions that
             * comes back saying nine leaves the device with no way to tell
             * WHICH one to keep, so it either re-sends all ten forever or
             * marks all ten synced and loses the missing one. Rows that were
             * already here are listed too - "we have it" and "we have just
             * taken it" mean the same thing to an outbox.
             */
            'accepted' => $applied['accepted'],
        ]);
    }

    /**
     * Everything in a push except purchases: progress, reminders, the
     * first-run profile, finished lessons and behaviour events.
     *
     * Returns both what changed (counts, for the log) and what the device may
     * now stop offering us (its own ids, for its outbox).
     *
     * @return array{synced: array<string, int>, accepted: array<string, array<int, mixed>>}
     */
    private function applyPushedData(Request $request, \App\Models\User $user, ProgressionService $progression): array
    {
        $synced = ['sessions' => 0, 'measurements' => 0, 'reminders' => 0, 'events' => 0];

        // Keyed by table, filled with the client's own ids as each row is
        // stored or recognised.
        $accepted = [
            'workout_sessions' => [],
            'measurements' => [],
            'events' => [],
            'reminders' => [],
        ];

        // --- Timezone (per-device; last write wins) ---
        $tz = (string) $request->input('timezone', '');
        if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true) && $user->timezone !== $tz) {
            $user->update(['timezone' => $tz]);
        }

        // --- Level (chosen difficulty) - so a level change persists server-side. ---
        $levelId = $request->input('level_id');
        if ($levelId && Level::where('id', $levelId)->exists()) {
            $user->update(['level_id' => (int) $levelId]);
        }
        if ($request->has('level_started_days')) {
            $user->update(['level_started_days' => max(0, (int) $request->input('level_started_days'))]);
        }

        // --- Workout Sessions ---
        foreach ($request->input('workout_sessions', []) as $s) {
            if (isset($s['completed_at_iso'])) {
                $completedAt = $this->parseClientDate($s['completed_at_iso']);
                if (! $completedAt) {
                    // One unparseable timestamp from one device must not 500
                    // the whole push - the device would retry it forever.
                    Log::info('Skipped pushed session with an unreadable completed_at_iso', [
                        'user_id' => $user->id,
                    ]);
                    continue;
                }
            } else {
                $completedAt = now();
            }

            $durationSeconds = max(0, (int) ($s['duration_seconds'] ?? 0));
            if ($durationSeconds < 10) {
                continue;
            }

            // Identity, not a guess. The device stamps client_id when it
            // WRITES the session, so a push that succeeded server-side and
            // lost its reply arrives again carrying the same one.
            //
            // This replaces a +/-5 second window on completed_at, which was
            // right in practice only because sessions are minutes apart: it
            // could miss a real duplicate pushed slightly later, and could
            // discard a genuine second session inside the window.
            //
            // A row with no key is dropped rather than guessed at. Clients
            // that do not send one are not supported.
            $clientId = trim((string) ($s['client_id'] ?? ''));
            if ($clientId === '') {
                continue;
            }

            $exercise = isset($s['exercise_slug'])
                ? Exercise::where('slug', $s['exercise_slug'])->first()
                : null;

            // The day key is the user's calendar day, not UTC's. A session
            // finished at 21:30 in New York arrives stamped 02:30Z the NEXT
            // day, so keying straight off the instant filed it under tomorrow
            // while the pull - which asks in the user's zone - kept looking at
            // today, and the day never completed. completed_at itself stays
            // the original instant.
            $localDay = $completedAt->copy()->setTimezone($user->timezone ?: config('app.timezone'));

            $record = $progression->todayRecord($user, $localDay);
            $wasComplete = $record->completed_at !== null;

            // firstOrCreate rather than exists-then-create: the unique index on
            // (user_id, client_id) is the real guard, and two pushes racing
            // each other both passed the old check.
            $session = WorkoutSession::firstOrCreate(
                ['user_id' => $user->id, 'client_id' => $clientId],
                [
                    'exercise_id'      => $exercise?->id,
                    'level_id'         => $user->level_id,
                    'started_at'       => $completedAt->copy()->subSeconds($durationSeconds),
                    'completed_at'     => $completedAt,
                    'duration_seconds' => $durationSeconds,
                    'is_extra'         => $wasComplete,
                ],
            );

            // Accepted either way. A row we already hold is a row the device
            // never needs to send again, which is the whole question its
            // outbox is asking.
            $accepted['workout_sessions'][] = $clientId;

            if (! $session->wasRecentlyCreated) {
                continue;
            }

            $record->increment('sessions_count');
            // The same free allowance the app applies before it writes the day
            // locally. Both sides have to agree: without this the device stops
            // a free account at day 1 and the backend carried it on, so the
            // next pull moved the person's plan position backwards.
            if (! $wasComplete
                && $record->sessions_count >= $record->required_sessions
                && ! $progression->freeDayCapReached($user, $record->date)
            ) {
                $record->update(['completed_at' => $completedAt]);
            }

            $synced['sessions']++;
        }

        // --- Measurements ---
        foreach ($request->input('measurements', []) as $m) {
            if (isset($m['measured_at_iso'])) {
                $measuredAt = $this->parseClientDate($m['measured_at_iso']);
                if (! $measuredAt) {
                    Log::info('Skipped pushed measurement with an unreadable measured_at_iso', [
                        'user_id' => $user->id,
                    ]);
                    continue;
                }
            } else {
                $measuredAt = now();
            }

            $seconds = round(max(0, min((float) ($m['seconds'] ?? 0), 600)), 1);
            if ($seconds <= 0) {
                continue;
            }

            // Keyed on the client id the device stamped at write time, not
            // on a timestamp window. See the sessions block above.
            $clientId = trim((string) ($m['client_id'] ?? ''));
            if ($clientId === '') {
                continue;
            }

            $measurement = Measurement::firstOrCreate(
                ['user_id' => $user->id, 'client_id' => $clientId],
                ['seconds' => $seconds, 'measured_at' => $measuredAt],
            );

            $accepted['measurements'][] = $clientId;

            if ($measurement->wasRecentlyCreated) {
                $synced['measurements']++;
            }
        }

        // --- Reminders ---
        foreach ($request->input('reminders', []) as $r) {
            $weekday = (int) ($r['weekday'] ?? -1);
            if ($weekday < 0 || $weekday > 6) {
                continue;
            }

            $reminder = $user->reminders()->updateOrCreate(
                ['weekday' => $weekday],
                [
                    'times'      => $this->reminderTimes($r['times'] ?? null),
                    'is_enabled' => (bool) ($r['is_enabled'] ?? false),
                ],
            );

            // Reminders have no client id: they upsert on (user, weekday),
            // which is a real natural key. The weekday is what comes back,
            // because it is the only handle the device has for the row - a
            // server row id would match nothing in the local outbox.
            $accepted['reminders'][] = (int) $reminder->weekday;
            $synced['reminders']++;
        }

        // --- Onboarding profile (write-once) ---
        //
        // Everything here describes a first run, so it is recorded once and
        // never overwritten. The app re-sends it on every push until a pull
        // confirms it landed, which means the same payload arrives repeatedly
        // and must be idempotent - and it also means a later device, signing
        // in to an account that already has a profile, cannot overwrite the
        // real first run with its own.
        $onboarding = $request->input('onboarding');
        if (is_array($onboarding) && ! $user->onboarding_completed_at) {
            $experience = $onboarding['experience'] ?? null;
            $dailyTime = $onboarding['daily_time'] ?? null;
            $baseline = $onboarding['baseline_seconds'] ?? null;
            $level = $onboarding['level'] ?? null;

            $user->update([
                'onboarding_experience' => is_numeric($experience) && $experience >= 0 && $experience <= 2
                    ? (int) $experience
                    : null,
                'onboarding_daily_time' => is_numeric($dailyTime) && $dailyTime >= 0 && $dailyTime <= 2
                    ? (int) $dailyTime
                    : null,
                // A skipped quiz sends 0, which means "not measured" rather
                // than "measured as nothing" - so it is stored as null and no
                // later comparison mistakes it for a real opening hold.
                'onboarding_baseline_seconds' => is_numeric($baseline) && $baseline > 0
                    ? round((float) $baseline, 1)
                    : null,
                'onboarding_level' => is_numeric($level) && $level >= 1 && $level <= 5
                    ? (int) $level
                    : null,
                'onboarding_skipped' => (bool) ($onboarding['skipped'] ?? false),
                'onboarding_completed_at' => now(),
            ]);
        }

        // The demo session used to be stamped here. It no longer exists:
        // under freemium the first three exercises are the free tier, so
        // "has trained" is simply whether any workout_sessions row arrived,
        // which this same push already writes above.

        // --- Completed Basics Lessons ---
        $completedSlugs = $request->input('completed_lessons', []);
        $slugToOrder = ['why' => 0, 'find' => 1, 'first' => 2];
        $orders = [];
        foreach ($completedSlugs as $slug) {
            if (is_string($slug) && isset($slugToOrder[$slug])) {
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

        /**
         * --- Behaviour events ---
         *
         * Append-only, and idempotent on (user_id, client_id) so a retried
         * push cannot turn one quiz completion into five. The client keeps its
         * outbox until we acknowledge, which means duplicates are the NORMAL
         * case here rather than an error case.
         *
         * Unknown names are dropped rather than stored. An event log is only
         * worth having if its vocabulary is closed - once `tour_done` and
         * `tourComplete` both exist, no report can count either.
         */
        // Bounded twice on purpose. The validation above rejects a payload
        // carrying more than 500, and this bounds what we loop over even if
        // that rule is ever loosened: one device draining a long outbox must
        // not be able to hold a database transaction open across thousands of
        // inserts.
        foreach (array_slice((array) $request->input('events', []), 0, 500) as $e) {
            $name = (string) ($e['name'] ?? '');
            $clientId = (string) ($e['client_id'] ?? '');

            if ($clientId === '' || ! in_array($name, UserEvent::NAMES, true)) {
                continue;
            }

            $occurredAt = isset($e['occurred_at_iso'])
                ? $this->parseClientDate($e['occurred_at_iso'])
                : now();

            if (! $occurredAt) {
                Log::info('Skipped pushed event with an unreadable occurred_at_iso', [
                    'user_id' => $user->id,
                ]);
                continue;
            }

            // A device clock running fast would otherwise file events in the
            // future and sit permanently at the top of every timeline.
            if ($occurredAt->isAfter(now()->addMinutes(5))) {
                $occurredAt = now();
            }

            // The mirror of that clamp, for a clock running slow or an outbox
            // that survived a phone sitting in a drawer. Anything older than
            // four months is dropped rather than filed: no report here looks
            // further back than 90 days, so the row would never be read, and
            // a wildly wrong date is more likely than four-month-old news.
            if ($occurredAt->isBefore(now()->subDays(120))) {
                Log::info('Skipped a pushed event older than 120 days', [
                    'user_id' => $user->id,
                    'name' => $name,
                ]);
                continue;
            }

            $subject = $e['subject'] ?? null;
            $detail = $e['detail'] ?? null;
            $meta = $e['meta'] ?? null;
            $meta = is_array($meta) ? $meta : null;

            // A meta bag this large is a client bug (a whole playlist, a stack
            // trace) rather than something worth keeping. The EVENT is still
            // stored - losing the fact that a workout finished because its
            // extras were oversized would be the wrong trade - only the bag
            // is dropped.
            if ($meta !== null && mb_strlen((string) json_encode($meta)) > 2000) {
                Log::info('Dropped oversized meta from a pushed event', [
                    'user_id' => $user->id,
                    'name' => $name,
                ]);
                $meta = null;
            }

            UserEvent::firstOrCreate(
                ['user_id' => $user->id, 'client_id' => $clientId],
                [
                    'name' => $name,
                    'subject' => is_scalar($subject) ? mb_substr((string) $subject, 0, 48) : null,
                    // Read exactly like subject, and just as short: both are
                    // grouped by, never searched in.
                    'detail' => is_scalar($detail) ? mb_substr((string) $detail, 0, 48) : null,
                    'meta' => $meta,
                    'occurred_at' => $occurredAt,
                ],
            );
            $accepted['events'][] = $clientId;
            $synced['events']++;
        }

        /**
         * --- Device / context ---
         *
         * Sent once per push rather than stamped on every event, because it is
         * a fact about the INSTALL and not about any one thing that happened.
         * "Which build is that person on" is the first question every support
         * conversation needs, and nothing recorded it before.
         *
         * Every field is bounded here rather than in the validation above: a
         * phone reporting a strange OS string should still have its training
         * accepted. A bad device block is ignored, not an error.
         */
        $device = $request->input('device');
        if (is_array($device)) {
            $installId = trim((string) ($device['install_id'] ?? ''));
            $platform = strtolower(trim((string) ($device['platform'] ?? '')));

            // The id is generated by the app and stored on the phone, so it is
            // always a uuid in practice. Checked anyway: it is the key of a row
            // we create on demand, and it arrives from the client.
            $looksReal = $installId !== ''
                && mb_strlen($installId) <= 64
                && preg_match('/^[A-Za-z0-9._:-]+$/', $installId) === 1
                && in_array($platform, \App\Models\Device::PLATFORMS, true);

            if ($looksReal) {
                $row = \App\Models\Device::firstOrNew([
                    'user_id' => $user->id,
                    'install_id' => $installId,
                ]);

                $row->platform = $platform;
                $row->os_version = mb_substr(trim((string) ($device['os_version'] ?? '')), 0, 24) ?: null;
                $row->app_version = mb_substr(trim((string) ($device['app_version'] ?? '')), 0, 24) ?: null;
                $row->locale = mb_substr(trim((string) ($device['locale'] ?? '')), 0, 12) ?: null;
                // first_seen_at is written once and then left alone: it is the
                // day this install appeared, and overwriting it on every push
                // would make every device look brand new.
                $row->first_seen_at ??= now();
                $row->last_seen_at = now();
                $row->save();
            } else {
                Log::info('Ignored a device block that did not look real', [
                    'user_id' => $user->id,
                ]);
            }
        }

        /**
         * A push is the only moment the backend hears from a device at all, so
         * it is the best available answer to "when was this account last
         * alive". saveQuietly: this is bookkeeping, not a change the user made,
         * and it must not fire model events or touch updated_at.
         */
        $user->last_seen_at = now();
        $user->saveQuietly();

        return ['synced' => $synced, 'accepted' => $accepted];
    }

    /**
     * Record purchases the device reports.
     *
     * Nothing here trusts the client with anything that decides entitlement:
     * the RevenueCat app user id is OUR user id, the plan comes from the
     * product the store confirms, and a token already recorded against
     * another account is refused rather than moved.
     *
     * Declining is safe: the device re-sends every local purchase token on
     * every sync, and the store webhooks write the row server-side as well.
     */
    private function applyPushedSubscriptions(Request $request, \App\Models\User $user): int
    {
        $recorded = 0;

        foreach ($request->input('subscriptions', []) as $s) {
            $token = trim((string) ($s['purchase_token'] ?? ''));
            if ($token === '') {
                continue;
            }

            $existing = \App\Models\Subscription::where('purchase_token', $token)->first();
            if ($existing) {
                // Our own token: the backend row is authoritative and the
                // webhooks keep it current, so a push never rewrites it.
                // Someone else's: a purchase token is proof of ONE account's
                // payment, and re-attributing it would hand a second account
                // the same subscription.
                if ((int) $existing->user_id !== (int) $user->id) {
                    Log::warning('Pushed purchase token belongs to another account; rejected', [
                        'user_id'  => $user->id,
                        'owner_id' => $existing->user_id,
                    ]);
                }

                continue;
            }

            $pushedPlan = ! empty($s['plan_slug'])
                ? \App\Models\Plan::where('slug', $s['plan_slug'])->first()
                : null;

            $store = (string) ($s['store'] ?? 'revenuecat');

            if ($store === 'revenuecat') {
                $recorded += $this->recordRevenueCatPurchase($user, $s, $token, $pushedPlan);
            } elseif ($store === 'google_play') {
                $recorded += $this->recordGooglePlayPurchase($user, $s, $token, $pushedPlan);
            }
        }

        return $recorded;
    }

    /**
     * A RevenueCat purchase, verified against RevenueCat before anything is
     * written. Returns 1 when a subscription was recorded.
     *
     * @param  array<string, mixed>  $s
     */
    private function recordRevenueCatPurchase(\App\Models\User $user, array $s, string $token, ?\App\Models\Plan $pushedPlan): int
    {
        $rcService = app(\App\Services\RevenueCatService::class);

        // No REST key means no way to check, and an unverifiable purchase is
        // exactly the forgery this guard exists for.
        if (! $rcService->isConfigured()) {
            Log::error('RevenueCat REST key missing - cannot verify pushed purchase, declined', [
                'user_id' => $user->id,
            ]);

            return 0;
        }

        // The app user id is OURS, never the client's. A pushed
        // revenuecat_app_user_id let any signed-in account claim a stranger's
        // entitlement simply by naming their subscriber id.
        $appUserId = (string) $user->id;

        try {
            $subscriber = $rcService->getSubscriber($appUserId);

            // Belt and braces on top of pinning the id: the subscriber
            // RevenueCat answers with must actually be this user, by
            // original_app_user_id or by alias.
            $ownsUser = $subscriber && $rcService->subscriberOwnsUser($subscriber, $appUserId);
        } catch (\Throwable $e) {
            // Could not reach RevenueCat. Unknown is not the same as invalid,
            // so decline for now and let the next sync retry rather than
            // taking the client's word for it.
            Log::warning('RevenueCat verification unavailable; purchase not recorded yet', [
                'user_id' => $user->id,
                'error'   => $e->getMessage(),
            ]);

            return 0;
        }

        if (! $ownsUser) {
            Log::warning('RevenueCat subscriber does not belong to this account; purchase rejected', [
                'user_id' => $user->id,
            ]);

            return 0;
        }

        $entitlement = $rcService->getActiveEntitlement($subscriber);

        if (! $entitlement) {
            Log::warning('Pushed RevenueCat purchase has no active entitlement; rejected', [
                'user_id' => $user->id,
            ]);

            return 0;
        }

        // The plan follows the VERIFIED product, never the pushed slug: the
        // client naming 'premium-yearly' on a monthly purchase would otherwise
        // record a year of access for a month's money.
        $productId = $rcService->entitlementProductId($entitlement)
            ?: trim((string) ($s['revenuecat_product_id'] ?? ''));

        $plan = $productId !== '' ? $rcService->resolvePlan($productId) : null;

        if (! $plan) {
            // A row with no plan is worse than no row: it grants access that
            // no price, period or renewal can be read off.
            Log::warning('Pushed RevenueCat purchase matches no known plan; not recorded', [
                'user_id'    => $user->id,
                'product_id' => $productId,
            ]);

            return 0;
        }

        if ($pushedPlan && $pushedPlan->id !== $plan->id) {
            Log::warning('Pushed plan_slug disagrees with the verified product; using the verified plan', [
                'user_id'     => $user->id,
                'pushed_slug' => $pushedPlan->slug,
                'verified'    => $plan->slug,
            ]);
        }

        $expiresAt = ! empty($entitlement['expires_date'])
            ? $this->parseClientDate($entitlement['expires_date'])
            : $this->parseClientDate($s['ends_at'] ?? null);
        $isTrial = ($entitlement['period_type'] ?? '') === 'TRIAL';
        $startedAt = $this->parseClientDate($s['started_at'] ?? null) ?? now();

        // Retire whatever the user was on before.
        //
        // A plan change is a product change at the store: Play replaces the old
        // subscription rather than running both. This code only ever CREATED
        // rows though, so the previous one stayed 'active' with a future
        // ends_at and the account ended up with two live subscriptions - a
        // duplicate in the admin list, and an access loophole, since
        // isSubscribed() stayed true off the stale row.
        //
        // Scoped to a DIFFERENT purchase_token so a repeat push of the same
        // purchase never retires the row it is about to update.
        \App\Models\Subscription::where('user_id', $user->id)
            ->where('purchase_token', '!=', $token)
            ->whereIn('status', ['active', 'trialing'])
            ->update([
                'status'        => 'expired',
                'auto_renewing' => false,
            ]);

        $sub = \App\Models\Subscription::create([
            'user_id'              => $user->id,
            'plan_id'              => $plan->id,
            'status'               => $isTrial ? 'trialing' : 'active',
            'store'                => 'revenuecat',
            'purchase_token'       => $token,
            'google_order_id'      => $s['google_order_id'] ?? null,
            'store_transaction_id' => $s['store_transaction_id'] ?? ($s['google_order_id'] ?? $token),
            'trial_ends_at'        => $isTrial ? $expiresAt : null,
            'started_at'           => $startedAt,
            'ends_at'              => $expiresAt,
            'auto_renewing'        => (bool) ($s['auto_renewing'] ?? true),
        ]);

        $this->mailSubscriptionStarted($sub);

        // Keyed on the purchase token, which is the store's own name for this
        // subscription. RevenueCat's webhook records the same fact from the
        // other direction, and whichever arrives second finds the row already
        // there rather than counting the sale twice.
        $this->recordEvent(
            $user->id,
            UserEvent::SUBSCRIPTION_STARTED,
            $plan->slug,
            $isTrial ? 'trial' : 'paid',
            ['store' => 'revenuecat'],
            'push-'.$token,
        );

        return 1;
    }

    /**
     * A Google Play purchase, verified against the Play Developer API.
     * Returns 1 when a subscription was recorded.
     *
     * @param  array<string, mixed>  $s
     */
    private function recordGooglePlayPurchase(\App\Models\User $user, array $s, string $token, ?\App\Models\Plan $pushedPlan): int
    {
        // Play's URL names the product, so the plan has to be known BEFORE the
        // call. The pushed slug is the only starting point here; what it
        // cannot do is decide whether the purchase is real - that is what the
        // verification below is for.
        if (! $pushedPlan || ! $pushedPlan->store_product_id) {
            Log::warning('Pushed Google Play purchase names no known plan; not recorded', [
                'user_id' => $user->id,
            ]);

            return 0;
        }

        try {
            $billing = app(\App\Services\GooglePlayBillingService::class);

            // Play wants the SUBSCRIPTION id, not the base plan id. Our
            // store_product_id is `premium_monthly:p1y`, and the full string
            // 404s against .../subscriptions/{id}/tokens/{token}.
            $productId = $pushedPlan->storeSubscriptionId();

            $data = $billing->verifySubscription($productId, $token);

            // 1 = paid, 2 = free trial. Anything else is not a valid purchase.
            if (! in_array($data['paymentState'] ?? -1, [1, 2], true)) {
                return 0;
            }

            $billing->acknowledgeSubscription($productId, $token);

            $expiresAt = isset($data['expiryTimeMillis'])
                ? \Carbon\Carbon::createFromTimestampMs((int) $data['expiryTimeMillis'])
                : null;
            $isTrial = ($data['paymentState'] ?? 0) === 2;

            $sub = \App\Models\Subscription::create([
                'user_id'              => $user->id,
                'plan_id'              => $pushedPlan->id,
                'status'               => $isTrial ? 'trialing' : 'active',
                'store'                => 'google_play',
                'purchase_token'       => $token,
                'google_order_id'      => $data['orderId'] ?? ($s['google_order_id'] ?? null),
                'store_transaction_id' => $data['orderId'] ?? ($s['google_order_id'] ?? null),
                'trial_ends_at'        => $isTrial ? $expiresAt : null,
                'started_at'           => $this->parseClientDate($s['started_at'] ?? null) ?? now(),
                'ends_at'              => $expiresAt,
                'auto_renewing'        => (bool) ($data['autoRenewing'] ?? true),
            ]);

            $this->mailSubscriptionStarted($sub);

            return 1;
        } catch (\Throwable $e) {
            Log::warning('Pushed purchase token failed verification', [
                'user_id' => $user->id,
                'error'   => $e->getMessage(),
            ]);

            return 0;
        }
    }

    /**
     * Welcome mail through SubscriptionMailer, which de-duplicates: the same
     * purchase can arrive here and from a webhook within seconds.
     */
    private function mailSubscriptionStarted(\App\Models\Subscription $sub): void
    {
        try {
            \App\Services\SubscriptionMailer::started($sub);
        } catch (\Throwable $e) {
            // A subscription that exists but sent no email is a support
            // question; one that failed to save is lost money.
            Log::warning('Subscription welcome mail failed', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Parse a timestamp a client sent us, or null when it is unreadable.
     *
     * Carbon::parse THROWS on malformed input, so a single bad string turned
     * one device's bad row into a 500 for the whole push - and the device
     * retried the same payload on every sync afterwards.
     */
    private function parseClientDate(mixed $value): ?\Carbon\Carbon
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return \Carbon\Carbon::parse($value);
        } catch (\Carbon\Exceptions\InvalidFormatException|\InvalidArgumentException $e) {
            return null;
        }
    }

    /**
     * The reminder times we are willing to store: HH:MM, at most ten a day.
     *
     * These go straight into a calendar feed and into the device's alarm
     * scheduler, so anything that is not a real time of day is dropped here
     * rather than halfway through building an .ics file.
     *
     * @return list<string>
     */
    private function reminderTimes(mixed $times): array
    {
        $clean = [];

        foreach (is_array($times) ? $times : [] as $time) {
            if (is_string($time) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) {
                $clean[] = $time;
            }
        }

        $clean = array_values(array_unique($clean));

        // A reminder with no usable time is still a reminder the user asked
        // for, so it keeps the default rather than being silently dropped.
        return $clean === [] ? ['08:00'] : array_slice($clean, 0, 10);
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
                // Both of these are written by the app and were echoed back
                // nowhere, so a reinstall could not tell how far through the
                // current level the account was, or when it had actually
                // finished signing up - it restarted both.
                'level_started_days' => (int) $user->level_started_days,
                'onboarded_at' => $user->onboarded_at?->toIso8601String(),
            ],
            'position'         => $position,
            'today'            => $today,
            'workout_sessions' => $user->workoutSessions()
                // Eager loaded, not read per row: the slug below is needed for
                // every one of these 200 rows, and asking per row is 200 extra
                // queries on the endpoint the app calls most often.
                ->with('exercise:id,slug')
                ->orderByDesc('completed_at')
                ->take(200)
                ->get()
                ->map(fn (WorkoutSession $ws) => [
                    'id'               => $ws->id,
                    'exercise_id'      => $ws->exercise_id,
                    // The app stores exercises by slug, not by our id - it
                    // ships its own catalogue - so a pulled session used to
                    // arrive with no exercise on it at all.
                    'exercise_slug'    => $ws->exercise?->slug,
                    // The device's own id for the row. Sent back so a
                    // reinstall can match what it pulls against anything still
                    // sitting in its outbox instead of writing it twice.
                    'client_id'        => $ws->client_id,
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
            // Echoed back so the device knows the profile landed and can
            // stop re-sending it, and so a reinstall can tell that this
            // account already has a first run recorded.
            'onboarding' => $user->onboarding_completed_at ? [
                'experience'       => $user->onboarding_experience,
                'daily_time'       => $user->onboarding_daily_time,
                'baseline_seconds' => $user->onboarding_baseline_seconds,
                'level'            => $user->onboarding_level,
                'skipped'          => (bool) $user->onboarding_skipped,
                'completed_at'     => $user->onboarding_completed_at->toIso8601String(),
            ] : null,
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

        // A code that never left the mail server is not a success: the device
        // would show the "enter the code" field for a code nobody can read.
        if (! \App\Services\CodeSender::send($user->email, 'delete')) {
            return response()->json(['error' => 'We could not send the email right now. Please try again in a minute.'], 502);
        }

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
            $this->recordCodeFailure($user->email, 'delete');

            return response()->json(['error' => 'That code is invalid or has expired.'], 422);
        }

        $this->recordEvent($user->id, UserEvent::EMAIL_CODE_VERIFIED, 'delete');

        /**
         * A tally mark, written before the account goes.
         *
         * Deleting cascades every event this person ever had, so "how many
         * people leave, and how long did they stay first" is a question the
         * event log can never answer about itself. The row carries no user id
         * and no email - three facts about the departure, and nothing that
         * could be traced back to them.
         */
        rescue(function () use ($user) {
            \App\Models\AccountDeletion::create([
                'deleted_at' => now(),
                'days_since_signup' => $user->created_at
                    ? max(0, (int) $user->created_at->diffInDays(now()))
                    : null,
                'had_subscription' => $user->isSubscribed(),
                'sessions_done' => $user->workoutSessions()->count(),
            ]);
        }, report: false);

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

        // Recorded here rather than on the device, because this is the only
        // place that knows the sign-in actually worked.
        $this->recordEvent($user->id, UserEvent::LOGGED_IN, 'email');

        return response()->json([
            'success' => true,
            'user' => $this->remoteUserPayload($user),
        ]);
    }

    /**
     * Change the SIGNED-IN user's password on the backend (the auth source of
     * truth), so the change persists server-side and reaches every device.
     *
     * Behind the authenticated group. It used to take an email and act on
     * whatever account that named, which made it a password-guessing oracle
     * for any address you knew; the acting account is now the token holder and
     * the request body no longer says who to act on.
     */
    public function remoteChangePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => 'required|string',
            'password' => 'required|string|min:6|regex:/[0-9]/',
        ]);

        $user = $request->user();

        // One message for every failure. The old check was skipped entirely
        // when the row had no password (a Google-only account), so anyone
        // reaching this endpoint could set one for it.
        if (! \Illuminate\Support\Facades\Hash::check($data['current_password'], (string) $user->password)) {
            return response()->json(['error' => 'Your current password is incorrect.'], 422);
        }

        $user->update([
            'password' => \Illuminate\Support\Facades\Hash::make($data['password']),
            // A password change revokes every token issued before it, exactly
            // like a reset does.
            'api_token' => null,
        ]);

        // The device authenticated THIS request with the token just revoked,
        // so it gets the replacement in the reply and stays signed in. Nulling
        // it without handing one back would sign the user out mid-flow.
        return response()->json([
            'success' => true,
            'password_hash' => $user->password,
            'api_token' => $user->apiToken(),
        ]);
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

        // Before the email: the account exists either way, and a mail server
        // having a bad afternoon must not lose the record of a sign-up.
        $this->recordEvent($user->id, UserEvent::ACCOUNT_CREATED, 'email');

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

        // Lower-cased everywhere: the code was issued against the address the
        // account was created with, so a device sending "User@Example.com"
        // looked up nothing and reported an expired code.
        $email = strtolower($data['email']);

        // Per address, on top of the guess budget the code itself carries.
        // The code cap burns ONE code after five wrong guesses; without this,
        // asking for a fresh code between guesses buys five more, and the
        // route throttle is per IP, which a spread-out attacker is not.
        if ($this->tooManyCodeAttempts('verify-code:'.$email)) {
            return response()->json(['error' => 'Too many attempts. Try again later.'], 429);
        }

        if (! \App\Models\EmailCode::verify($email, $data['code'], 'verify')) {
            $this->recordCodeFailure($email, 'verify');

            return response()->json(['error' => 'That code is invalid or has expired.'], 422);
        }

        $user = \App\Models\User::where('email', $email)->first();
        if (! $user) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        $this->recordEvent($user->id, UserEvent::EMAIL_CODE_VERIFIED, 'verify');

        $user->update(['email_verified_at' => now()]);

        return response()->json([
            'success' => true,
            'user' => $this->remoteUserPayload($user),
        ]);
    }

    /**
     * Re-send the verification code. Always reports success, and only sends
     * when an unverified account with that address exists - otherwise the
     * endpoint answers "does this email have an account here?" for anyone who
     * asks, and re-sends codes to addresses that already verified.
     */
    public function remoteResend(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email',
        ]);

        // Keyed on the normalised address, so varying the capitalisation is
        // not a way around the limiter.
        $email = strtolower($data['email']);

        $key = 'resend:'.$email;
        if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, 3)) {
            return response()->json(['error' => 'Too many requests. Try again later.'], 429);
        }
        \Illuminate\Support\Facades\RateLimiter::hit($key, 300);

        $pending = \App\Models\User::where('email', $email)
            ->whereNull('email_verified_at')
            ->exists();

        if ($pending) {
            \App\Services\CodeSender::send($email, 'verify');
        }

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

        // Same per-address budget as remoteVerify, and for the same reason:
        // this endpoint hands out a password.
        if ($this->tooManyCodeAttempts('reset-pw:'.$email)) {
            return response()->json(['error' => 'Too many attempts. Try again later.'], 429);
        }

        if (! \App\Models\EmailCode::verify($email, $data['code'], 'reset')) {
            $this->recordCodeFailure($email, 'reset');

            return response()->json(['error' => 'That code is invalid or has expired.'], 422);
        }

        $user = \App\Models\User::where('email', $email)->first();
        if (! $user) {
            return response()->json(['error' => 'Account not found.'], 404);
        }

        $this->recordEvent($user->id, UserEvent::EMAIL_CODE_VERIFIED, 'reset');

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

        $isNewAccount = ! $user;

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

        // A Google sign-in is either a sign-up or a sign-in, never both, and
        // the difference is the whole reason the funnel can tell where new
        // people come from.
        $this->recordEvent(
            $user->id,
            $isNewAccount ? UserEvent::ACCOUNT_CREATED : UserEvent::LOGGED_IN,
            'google',
        );

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

        // The browser half of this flow may have created the account a moment
        // ago; this half only ever hands an existing one to the device, so it
        // is a sign-in either way.
        $this->recordEvent($user->id, UserEvent::LOGGED_IN, 'google');

        return response()->json([
            'success' => true,
            'user' => $this->remoteUserPayload($user),
        ]);
    }

    /**
     * Server-side event helpers.
     *
     * Every one of these is wrapped in rescue(). Instrumentation is worth
     * having and worth nothing: a report that cannot be written must never
     * turn a working sign-in into a 500.
     */
    private function recordEvent(
        int $userId,
        string $name,
        ?string $subject = null,
        ?string $detail = null,
        ?array $meta = null,
        ?string $clientId = null,
    ): void {
        rescue(
            fn () => UserEvent::record($userId, $name, $subject, $detail, $meta, $clientId),
            report: false,
        );
    }

    /**
     * A wrong or expired code, recorded against the account it was aimed at.
     *
     * Only when an account exists: codes are also sent to addresses that have
     * none (that is how "forgot password" avoids answering "is this email
     * registered?"), and there is nobody to file those against.
     *
     * invalid vs expired is worth separating - a run of expired ones means the
     * email is arriving too slowly, which is a mail problem, and a run of
     * invalid ones is a person mistyping or a bot guessing.
     */
    private function recordCodeFailure(string $email, string $purpose): void
    {
        rescue(function () use ($email, $purpose) {
            $userId = \App\Models\User::where('email', $email)->value('id');

            if (! $userId) {
                return;
            }

            // verify() only ever reads a code that is still live, so a row
            // left sitting here past its expiry is exactly the case where
            // somebody typed a code that had run out.
            $expired = \App\Models\EmailCode::where('email', $email)
                ->where('purpose', $purpose)
                ->where('expires_at', '<=', now())
                ->exists();

            UserEvent::record(
                $userId,
                UserEvent::EMAIL_CODE_FAILED,
                $purpose,
                $expired ? 'expired' : 'invalid',
            );
        }, report: false);
    }

    /**
     * Five tries per address per fifteen minutes.
     *
     * Counted per lower-cased email rather than per IP, because an IP is the
     * one thing an attacker can change for free. The code's own attempt cap
     * still applies underneath; this is what stops the loop of "ask for a new
     * code, spend five more guesses".
     */
    private function tooManyCodeAttempts(string $key): bool
    {
        if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, 5)) {
            return true;
        }

        \Illuminate\Support\Facades\RateLimiter::hit($key, 900);

        return false;
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
            // Whether the account is past "Learn the basics" (admin, lessons
            // done, or existing training history - the same condition as the
            // web's EnsureBasicsCompleted gate). The app seeds its gate from
            // this at sign-in, so a returning user lands straight on Training
            // instead of being held on the basics list (with a visible flash)
            // until the first sync pulls their history down.
            'basics_completed' => (bool) $user->is_admin
                || $user->hasCompletedBasics()
                || $user->workoutSessions()->exists(),
            // Whether the account holds an active subscription (same rule as
            // the web's EnsureSubscribed gate). The app seeds its subscription
            // gate from this at sign-in - the local subscriptions table is
            // still empty until the first sync pulls the rows down - so a
            // subscribed returning user goes straight in and an unsubscribed
            // one lands on the paywall with no flash in between.
            'is_subscribed' => $user->isSubscribed(),
            'timezone' => $user->timezone,
        ];
    }
}
