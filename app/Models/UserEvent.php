<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One thing a person did, once.
 *
 * The vocabulary is closed on purpose. An open event name is how a log like
 * this becomes unreadable: six months of `tour_done`, `tourComplete` and
 * `TOUR_FINISHED` all meaning the same thing, and no report able to count any
 * of them. Anything not on this list is dropped at the door.
 */
class UserEvent extends Model
{
    protected $guarded = [];

    protected $casts = [
        'meta' => 'array',
        'occurred_at' => 'datetime',
    ];

    /** The onboarding quiz was answered through to the end. */
    public const QUIZ_COMPLETED = 'quiz_completed';
    /** The quiz was dismissed with Skip, at whichever question. */
    public const QUIZ_SKIPPED = 'quiz_skipped';
    /** A guided tour ran to its last card. Subject: the tour id. */
    public const TOUR_COMPLETED = 'tour_completed';
    /** A guided tour was dismissed early. Subject: the tour id. */
    public const TOUR_SKIPPED = 'tour_skipped';
    /** One of the basics lessons was finished. Subject: the lesson slug. */
    public const LESSON_COMPLETED = 'lesson_completed';
    /** A padlocked feature was tapped. Subject: which one. */
    public const LOCK_TAPPED = 'lock_tapped';
    /** The paywall was opened. Subject: where from. */
    public const PAYWALL_VIEWED = 'paywall_viewed';
    /** Reminders were saved. Meta carries how many days and times. */
    public const REMINDERS_SET = 'reminders_set';
    /** A measurement was recorded from the Progress tab. */
    public const MEASUREMENT_TAKEN = 'measurement_taken';
    /** The appearance setting was changed. Subject: system|light|dark. */
    public const APPEARANCE_CHANGED = 'appearance_changed';

    public const NAMES = [
        self::QUIZ_COMPLETED,
        self::QUIZ_SKIPPED,
        self::TOUR_COMPLETED,
        self::TOUR_SKIPPED,
        self::LESSON_COMPLETED,
        self::LOCK_TAPPED,
        self::PAYWALL_VIEWED,
        self::REMINDERS_SET,
        self::MEASUREMENT_TAKEN,
        self::APPEARANCE_CHANGED,
    ];

    /**
     * How each event reads in the admin, in plain English.
     *
     * Kept beside the constants rather than in a Blade file so that adding an
     * event and forgetting to label it is impossible to miss - the label list
     * and the name list sit two lines apart.
     */
    public const LABELS = [
        self::QUIZ_COMPLETED => 'Finished the quiz',
        self::QUIZ_SKIPPED => 'Skipped the quiz',
        self::TOUR_COMPLETED => 'Finished a tour',
        self::TOUR_SKIPPED => 'Skipped a tour',
        self::LESSON_COMPLETED => 'Finished a lesson',
        self::LOCK_TAPPED => 'Tapped a locked feature',
        self::PAYWALL_VIEWED => 'Opened the paywall',
        self::REMINDERS_SET => 'Set reminders',
        self::MEASUREMENT_TAKEN => 'Took a measurement',
        self::APPEARANCE_CHANGED => 'Changed appearance',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function getLabelAttribute(): string
    {
        return self::LABELS[$this->name] ?? $this->name;
    }
}
