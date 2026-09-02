<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * One thing a person did, once.
 *
 * The vocabulary is closed on purpose. An open event name is how a log like
 * this becomes unreadable: six months of `tour_done`, `tourComplete` and
 * `TOUR_FINISHED` all meaning the same thing, and no report able to count any
 * of them. Anything not on this list is dropped at the door.
 *
 * Three slots, and they mean different things:
 * - subject: WHAT it was about (the tour id, the plan slug, the screen).
 * - detail: WHICH KIND (email or google, free or paid, cancelled or declined).
 * - meta: anything else worth keeping. Never grouped, only read per person.
 *
 * subject and detail are short columns because every report on them is a plain
 * GROUP BY. meta is JSON because nothing counts it.
 */
class UserEvent extends Model
{
    protected $guarded = [];

    protected $casts = [
        'meta' => 'array',
        'occurred_at' => 'datetime',
    ];

    // ─── App lifecycle ──────────────────────────────────────────────────────

    /** The app was brought up. Subject: cold (from closed) or foreground. */
    public const APP_OPENED = 'app_opened';

    // ─── Account ────────────────────────────────────────────────────────────

    /** The sign-up form was submitted. Subject: email|google. */
    public const SIGNUP_STARTED = 'signup_started';
    /** An account row was created. Subject: email|google. Written by the server. */
    public const ACCOUNT_CREATED = 'account_created';
    /** Somebody signed in. Subject: email|google. Written by the server. */
    public const LOGGED_IN = 'logged_in';
    /** Somebody signed out on the device. */
    public const LOGGED_OUT = 'logged_out';
    /** A one-time code was emailed. Subject: verify|reset|delete. */
    public const EMAIL_CODE_SENT = 'email_code_sent';
    /** A one-time code was accepted. Subject: verify|reset|delete. */
    public const EMAIL_CODE_VERIFIED = 'email_code_verified';
    /** A one-time code was rejected. Subject: verify|reset|delete. Detail: invalid|expired. */
    public const EMAIL_CODE_FAILED = 'email_code_failed';

    // ─── Onboarding ─────────────────────────────────────────────────────────

    /** An onboarding screen was reached. Subject: slide1|slide2|slide3|quiz. */
    public const ONBOARDING_STEP = 'onboarding_step';
    /** The onboarding quiz was answered through to the end. */
    public const QUIZ_COMPLETED = 'quiz_completed';
    /** The quiz was dismissed with Skip, at whichever question. */
    public const QUIZ_SKIPPED = 'quiz_skipped';
    /** One of the basics lessons was opened. Subject: the lesson slug. */
    public const LESSON_STARTED = 'lesson_started';
    /** One of the basics lessons was finished. Subject: the lesson slug. */
    public const LESSON_COMPLETED = 'lesson_completed';

    // ─── Training ───────────────────────────────────────────────────────────

    /** A workout was begun. Subject: daily|preview. Detail: free|paid. */
    public const WORKOUT_STARTED = 'workout_started';
    /** A workout ran to its end. Subject: daily|preview. Detail: free|paid. */
    public const WORKOUT_COMPLETED = 'workout_completed';
    /** A workout was quit part way. Subject: daily|preview. Detail: how far in (p00..p75). */
    public const WORKOUT_ABANDONED = 'workout_abandoned';
    /** The difficulty level moved. Subject: up|down. Detail: feedback|picker|lapse. */
    public const LEVEL_CHANGED = 'level_changed';
    /** An exercise page was opened. Subject: the slug. Detail: locked|unlocked. */
    public const EXERCISE_PREVIEWED = 'exercise_previewed';
    /** A measurement was recorded from the Progress tab. */
    public const MEASUREMENT_TAKEN = 'measurement_taken';
    /** A guided tour ran to its last card. Subject: the tour id. */
    public const TOUR_COMPLETED = 'tour_completed';
    /** A guided tour was dismissed early. Subject: the tour id. */
    public const TOUR_SKIPPED = 'tour_skipped';
    /** A padlocked feature was tapped. Subject: which one. */
    public const LOCK_TAPPED = 'lock_tapped';

    // ─── Money ──────────────────────────────────────────────────────────────

    /** The paywall was opened. Subject: where from. Detail: new|renew. */
    public const PAYWALL_VIEWED = 'paywall_viewed';
    /** The paywall was closed without buying. Subject: where from. */
    public const PAYWALL_DISMISSED = 'paywall_dismissed';
    /** Checkout was launched. Subject: the plan slug. Detail: new|upgrade|downgrade. */
    public const PURCHASE_STARTED = 'purchase_started';
    /** The store confirmed a purchase. Subject: the plan slug. Detail: new|trial|upgrade|downgrade. */
    public const PURCHASE_COMPLETED = 'purchase_completed';
    /** Checkout ended without a purchase. Subject: the plan slug. Detail: why. */
    public const PURCHASE_FAILED = 'purchase_failed';
    /** Restore purchases was tapped. */
    public const RESTORE_ATTEMPTED = 'restore_attempted';
    /** Restore purchases finished. Subject: how it ended. */
    public const RESTORE_FINISHED = 'restore_finished';
    /** The "manage subscription" link to the store was followed. */
    public const SUBSCRIPTION_MANAGED = 'subscription_managed';
    /** A subscription began. Subject: the plan slug. Detail: trial|paid. Written by the server. */
    public const SUBSCRIPTION_STARTED = 'subscription_started';
    /** A subscription renewed and was paid for again. Subject: the plan slug. */
    public const SUBSCRIPTION_RENEWED = 'subscription_renewed';
    /** A subscription stopped. Subject: the plan slug. Detail: why. Written by the server. */
    public const SUBSCRIPTION_ENDED = 'subscription_ended';

    // ─── Engagement and health ──────────────────────────────────────────────

    /** Android answered the notification prompt. Subject: granted|denied|blocked. */
    public const NOTIFICATION_PERMISSION = 'notification_permission';
    /** A reminder notification was tapped. */
    public const REMINDER_TAPPED = 'reminder_tapped';
    /** Reminders were saved. Meta carries how many days and times. */
    public const REMINDERS_SET = 'reminders_set';
    /** The appearance setting was changed. Subject: system|light|dark. */
    public const APPEARANCE_CHANGED = 'appearance_changed';
    /** The app language was changed. Subject: the new tag. Detail: the old one. */
    public const LANGUAGE_CHANGED = 'language_changed';
    /** A screen crashed into the error boundary. Subject: the screen. */
    public const ERROR_BOUNDARY_HIT = 'error_boundary_hit';

    public const NAMES = [
        self::APP_OPENED,
        self::SIGNUP_STARTED,
        self::ACCOUNT_CREATED,
        self::LOGGED_IN,
        self::LOGGED_OUT,
        self::EMAIL_CODE_SENT,
        self::EMAIL_CODE_VERIFIED,
        self::EMAIL_CODE_FAILED,
        self::ONBOARDING_STEP,
        self::QUIZ_COMPLETED,
        self::QUIZ_SKIPPED,
        self::LESSON_STARTED,
        self::LESSON_COMPLETED,
        self::WORKOUT_STARTED,
        self::WORKOUT_COMPLETED,
        self::WORKOUT_ABANDONED,
        self::LEVEL_CHANGED,
        self::EXERCISE_PREVIEWED,
        self::MEASUREMENT_TAKEN,
        self::TOUR_COMPLETED,
        self::TOUR_SKIPPED,
        self::LOCK_TAPPED,
        self::PAYWALL_VIEWED,
        self::PAYWALL_DISMISSED,
        self::PURCHASE_STARTED,
        self::PURCHASE_COMPLETED,
        self::PURCHASE_FAILED,
        self::RESTORE_ATTEMPTED,
        self::RESTORE_FINISHED,
        self::SUBSCRIPTION_MANAGED,
        self::SUBSCRIPTION_STARTED,
        self::SUBSCRIPTION_RENEWED,
        self::SUBSCRIPTION_ENDED,
        self::NOTIFICATION_PERMISSION,
        self::REMINDER_TAPPED,
        self::REMINDERS_SET,
        self::APPEARANCE_CHANGED,
        self::LANGUAGE_CHANGED,
        self::ERROR_BOUNDARY_HIT,
    ];

    /**
     * How each event reads in the admin, in plain English.
     *
     * Kept beside the constants rather than in a Blade file so that adding an
     * event and forgetting to label it is impossible to miss - the label list
     * and the name list sit two lines apart. Four words or fewer, and no word
     * that needs a glossary to read.
     */
    public const LABELS = [
        self::APP_OPENED => 'Opened the app',
        self::SIGNUP_STARTED => 'Started signing up',
        self::ACCOUNT_CREATED => 'Created an account',
        self::LOGGED_IN => 'Signed in',
        self::LOGGED_OUT => 'Signed out',
        self::EMAIL_CODE_SENT => 'Was sent a code',
        self::EMAIL_CODE_VERIFIED => 'Entered the right code',
        self::EMAIL_CODE_FAILED => 'Entered a wrong code',
        self::ONBOARDING_STEP => 'Reached a first-run screen',
        self::QUIZ_COMPLETED => 'Finished the quiz',
        self::QUIZ_SKIPPED => 'Skipped the quiz',
        self::LESSON_STARTED => 'Opened a lesson',
        self::LESSON_COMPLETED => 'Finished a lesson',
        self::WORKOUT_STARTED => 'Started a workout',
        self::WORKOUT_COMPLETED => 'Finished a workout',
        self::WORKOUT_ABANDONED => 'Quit a workout',
        self::LEVEL_CHANGED => 'Changed difficulty',
        self::EXERCISE_PREVIEWED => 'Looked at an exercise',
        self::MEASUREMENT_TAKEN => 'Took a measurement',
        self::TOUR_COMPLETED => 'Finished a tour',
        self::TOUR_SKIPPED => 'Skipped a tour',
        self::LOCK_TAPPED => 'Tapped a locked feature',
        self::PAYWALL_VIEWED => 'Opened the paywall',
        self::PAYWALL_DISMISSED => 'Closed the paywall',
        self::PURCHASE_STARTED => 'Started buying',
        self::PURCHASE_COMPLETED => 'Bought a plan',
        self::PURCHASE_FAILED => 'Buying did not finish',
        self::RESTORE_ATTEMPTED => 'Tried to restore a purchase',
        self::RESTORE_FINISHED => 'Restore finished',
        self::SUBSCRIPTION_MANAGED => 'Opened store settings',
        self::SUBSCRIPTION_STARTED => 'Subscription started',
        self::SUBSCRIPTION_RENEWED => 'Subscription renewed',
        self::SUBSCRIPTION_ENDED => 'Subscription ended',
        self::NOTIFICATION_PERMISSION => 'Answered the reminder prompt',
        self::REMINDER_TAPPED => 'Tapped a reminder',
        self::REMINDERS_SET => 'Set reminders',
        self::APPEARANCE_CHANGED => 'Changed appearance',
        self::LANGUAGE_CHANGED => 'Changed language',
        self::ERROR_BOUNDARY_HIT => 'Hit an error screen',
    ];

    /**
     * One sentence saying exactly what each event means, for anyone reading a
     * report who was not in the room when it was named.
     *
     * Shown as the title on a timeline row and in the reports glossary. A label
     * of four words always leaves something out; this is where that goes.
     */
    public const DESCRIPTIONS = [
        self::APP_OPENED => 'The app came to the front, either from closed or from the background. At most one every 30 minutes per person.',
        self::SIGNUP_STARTED => 'The sign-up form was submitted, before we knew whether it would work.',
        self::ACCOUNT_CREATED => 'An account really was created. Recorded by the server, so it cannot be faked by a device.',
        self::LOGGED_IN => 'Somebody signed in to an account that already existed.',
        self::LOGGED_OUT => 'Somebody signed out on their device.',
        self::EMAIL_CODE_SENT => 'A six-digit code was emailed, for signing up, resetting a password or deleting an account.',
        self::EMAIL_CODE_VERIFIED => 'The code they typed was the right one.',
        self::EMAIL_CODE_FAILED => 'The code they typed was wrong or too old. Several in a row usually means the email is slow to arrive.',
        self::ONBOARDING_STEP => 'They reached one of the first-run screens. The highest step reached is where they stopped.',
        self::QUIZ_COMPLETED => 'They answered every question in the first-run quiz.',
        self::QUIZ_SKIPPED => 'They pressed Skip on the first-run quiz, at whichever question.',
        self::LESSON_STARTED => 'They opened one of the three "Learn the basics" lessons.',
        self::LESSON_COMPLETED => 'They read one of the basics lessons to the end.',
        self::WORKOUT_STARTED => 'A workout began playing. Not the same as one being finished.',
        self::WORKOUT_COMPLETED => 'A workout ran all the way to its last exercise.',
        self::WORKOUT_ABANDONED => 'A workout was quit part way through. The detail says how far in they got.',
        self::LEVEL_CHANGED => 'The difficulty moved up or down, either because they chose it or because a subscription lapsed.',
        self::EXERCISE_PREVIEWED => 'They opened an exercise page to look at it. The detail says whether it was locked for them.',
        self::MEASUREMENT_TAKEN => 'They recorded a hold measurement on the Progress tab.',
        self::TOUR_COMPLETED => 'A guided tour was read to its last card.',
        self::TOUR_SKIPPED => 'A guided tour was dismissed before the end.',
        self::LOCK_TAPPED => 'They tapped something with a padlock on it. The clearest signal of what people would pay for.',
        self::PAYWALL_VIEWED => 'The paywall screen was opened. The subject says which screen sent them there.',
        self::PAYWALL_DISMISSED => 'The paywall was closed without buying anything.',
        self::PURCHASE_STARTED => 'The store checkout sheet was opened.',
        self::PURCHASE_COMPLETED => 'The store confirmed the purchase.',
        self::PURCHASE_FAILED => 'Checkout ended without a purchase. Most of these are people changing their mind, which is normal.',
        self::RESTORE_ATTEMPTED => 'They tapped "Restore purchases", usually after reinstalling or changing phone.',
        self::RESTORE_FINISHED => 'The restore finished. The subject says whether anything was found.',
        self::SUBSCRIPTION_MANAGED => 'They opened the store page where a subscription is cancelled or changed.',
        self::SUBSCRIPTION_STARTED => 'A subscription began, either as a free trial or as a paid one. Recorded by the server from the store.',
        self::SUBSCRIPTION_RENEWED => 'The store charged them again and the subscription carried on.',
        self::SUBSCRIPTION_ENDED => 'A subscription stopped. The subject says whether it was cancelled, expired or a billing problem.',
        self::NOTIFICATION_PERMISSION => 'Android asked whether the app may send reminders, and this is what they answered.',
        self::REMINDER_TAPPED => 'They tapped a reminder notification and came back into the app.',
        self::REMINDERS_SET => 'They saved a reminder schedule. The strongest single predictor of coming back.',
        self::APPEARANCE_CHANGED => 'They changed the app between light, dark and follow-the-system.',
        self::LANGUAGE_CHANGED => 'They changed the app language.',
        self::ERROR_BOUNDARY_HIT => 'A screen crashed and showed the error page. Any of these is worth looking at.',
    ];

    /**
     * Write one event from the SERVER side.
     *
     * The device has its own path in (the sync push), which is deliberately
     * separate: it validates a whole batch, keeps client ids and never throws.
     * This is the one-at-a-time version for things only the backend witnesses -
     * an account really being created, a store webhook, a code accepted.
     *
     * Idempotent on (user_id, client_id) exactly like a pushed event, so a
     * webhook redelivered three times writes one row: callers with a natural
     * id for the thing pass it (RevenueCat passes 'rc-'.$event['id']), and
     * everything else gets a fresh ulid, which can never collide.
     *
     * Unknown names return null rather than writing: the vocabulary is closed
     * on this side too, or the reports quietly stop adding up.
     */
    public static function record(
        int $userId,
        string $name,
        ?string $subject = null,
        ?string $detail = null,
        ?array $meta = null,
        ?string $clientId = null,
    ): ?self {
        if (! in_array($name, self::NAMES, true)) {
            return null;
        }

        return static::firstOrCreate(
            ['user_id' => $userId, 'client_id' => self::idempotencyKey($clientId)],
            [
                'name' => $name,
                'subject' => $subject !== null ? mb_substr($subject, 0, 48) : null,
                'detail' => $detail !== null ? mb_substr($detail, 0, 48) : null,
                'meta' => $meta,
                'occurred_at' => now(),
            ],
        );
    }

    /**
     * The key an event de-duplicates on, cut to fit the column.
     *
     * client_id is a uuid column - 36 characters on MySQL - because that is
     * what devices send. Server-side callers have their own natural ids for
     * the thing that happened, and some of them are longer than that: a Google
     * purchase token runs to hundreds of characters. Hashing keeps the
     * property that matters (the same input always produces the same key, so a
     * redelivery finds the row) and fits.
     */
    private static function idempotencyKey(?string $clientId): string
    {
        if (! $clientId) {
            return 'srv-'.Str::ulid();
        }

        return mb_strlen($clientId) <= 36 ? $clientId : 'h-'.md5($clientId);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function getLabelAttribute(): string
    {
        return self::LABELS[$this->name] ?? $this->name;
    }

    public function getDescriptionAttribute(): string
    {
        return self::DESCRIPTIONS[$this->name] ?? '';
    }

    /**
     * The detail as a phrase rather than a code, where we have one.
     *
     * Only the codes that are not already readable get a translation. 'email',
     * 'trial' and 'granted' say themselves; 'p25' does not.
     */
    public const DETAIL_LABELS = [
        'p00' => 'before the first quarter',
        'p25' => 'in the first half',
        'p50' => 'in the second half',
        'p75' => 'in the last quarter',
    ];

    public function getDetailLabelAttribute(): ?string
    {
        if ($this->detail === null || $this->detail === '') {
            return null;
        }

        return self::DETAIL_LABELS[$this->detail] ?? $this->detail;
    }
}
