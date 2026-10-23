<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'password', 'google_id', 'email_verified_at', 'is_admin', 'level_id', 'level_started_days', 'onboarded_at', 'timezone', 'api_token', 'onboarding_experience', 'onboarding_daily_time', 'onboarding_baseline_seconds', 'onboarding_level', 'onboarding_completed_at', 'onboarding_skipped', 'free_session_completed_at', 'last_seen_at'])]
#[Hidden(['password', 'remember_token', 'api_token', 'apple_id', 'apple_refresh_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'onboarded_at' => 'datetime',
            // Stamped on every sync push, so it is "last had the app open"
            // to within a sync interval - the cheapest answer there is to
            // whether an account is still alive.
            'last_seen_at' => 'datetime',
            'password' => 'hashed',
            'apple_refresh_token' => 'encrypted',
            'is_admin' => 'boolean',
            'onboarding_completed_at' => 'datetime',
            'onboarding_skipped' => 'boolean',
            'onboarding_baseline_seconds' => 'float',
            // Deprecated: written only by the demo session, which no
            // longer exists. Kept so the historic dates are not thrown away;
            // nothing reads it, and 'trained' is derived from workoutSessions.
            'free_session_completed_at' => 'datetime',
        ];
    }

    /**
     * The onboarding answers as words rather than the 0/1/2 the app sends.
     *
     * Kept here rather than in the Blade so the admin table and anything
     * else that ever reads these agree on what a 1 means. Null stays null:
     * an account from before the quiz existed has no answer, and printing
     * "Never" for it would be inventing data.
     */
    public const ONBOARDING_EXPERIENCE_LABELS = [0 => 'Never trained', 1 => 'Trained a little', 2 => 'Trains regularly'];
    public const ONBOARDING_TIME_LABELS = [0 => 'A couple of minutes', 1 => 'About five minutes', 2 => 'Ten minutes or more'];

    public function getOnboardingExperienceLabelAttribute(): ?string
    {
        return self::ONBOARDING_EXPERIENCE_LABELS[$this->onboarding_experience] ?? null;
    }

    public function getOnboardingTimeLabelAttribute(): ?string
    {
        return self::ONBOARDING_TIME_LABELS[$this->onboarding_daily_time] ?? null;
    }

    /**
     * How far into the free funnel this account actually got.
     *
     * The whole point of storing any of this: 'signed up' and 'subscribed'
     * were the only two facts the backend held, and everything that explains
     * the gap between them happened on the device.
     */
    public function getFunnelStageAttribute(): string
    {
        // Bounded by ends_at, like activeSubscription(). Without it a row left
        // 'active' with a date in the past counted as subscribed here while
        // the gate that decides access said otherwise, so the funnel reported
        // customers the app was showing a paywall to.
        $subscribed = $this->subscriptions()
            ->whereIn('status', ['active', 'trialing'])
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()))
            ->exists();

        if ($subscribed) {
            return 'subscribed';
        }
        if ($this->workoutSessions()->exists()) {
            return 'trained';
        }
        if ($this->completedLessons()->wherePivotNotNull('completed_at')->exists()) {
            return 'basics';
        }
        if ($this->onboarding_completed_at) {
            return 'onboarded';
        }
        return 'signed up';
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(Reminder::class)->orderBy('weekday');
    }

    public function level(): BelongsTo
    {
        return $this->belongsTo(Level::class);
    }

    /** Every install this account has pushed from. */
    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }

    public function workoutSessions(): HasMany
    {
        return $this->hasMany(WorkoutSession::class);
    }

    public function trainingDays(): HasMany
    {
        return $this->hasMany(TrainingDay::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function measurements(): HasMany
    {
        return $this->hasMany(Measurement::class);
    }

    public function completedLessons(): BelongsToMany
    {
        return $this->belongsToMany(KnowledgeLesson::class, 'knowledge_lesson_user')
            ->withPivot('completed_at')
            ->withTimestamps();
    }

    /**
     * The row that currently grants this account access, if any.
     *
     * The rule itself lives in Subscription::scopeEntitled(), which is the one
     * definition of "entitled" in the codebase. It used to be written out here
     * instead, which made this the fourth place the question was answered and
     * the only one that answered it correctly - the admin's own counts each
     * had a partial copy, and every copy was wrong in a different direction.
     *
     * Worth spelling out what the scope encodes, because two of its three
     * branches look like bugs until you know the store's behaviour:
     *
     * - 'canceled' means auto-renew was switched off in Google Play. The
     *   customer has paid through the end of the period and keeps access to it.
     * - 'past_due' means Google is RETRYING the card, and its grace period is
     *   defined as the window where the subscriber keeps access. Excluding it
     *   locked out paying customers the instant Google told us to keep serving
     *   them.
     *
     * Both are bounded by ends_at, so neither can grant a day beyond what was
     * paid for: when the grace really does run out, Play sends the expiration.
     */
    public function activeSubscription(): ?Subscription
    {
        return $this->subscriptions()->entitled()->latest('id')->first();
    }

    /** @var bool|null Per-request cache for isSubscribed(). */
    private ?bool $_subscribed = null;

    public function isSubscribed(): bool
    {
        return $this->_subscribed ??= (bool) $this->activeSubscription();
    }

    /**
     * The difficulty a NON-paying account belongs on, as a levels.id.
     *
     * Choosing a difficulty is part of the subscription: the picker is
     * padlocked for a free account, so whatever level someone was on when they
     * stopped paying is a level they can no longer leave. Paying again is the
     * only exit. This is where they go back to.
     *
     * The quiz level is the first answer, because it is where the app put them
     * on its own judgement and where a free account that never subscribed
     * would be sitting. Level 1 is the second, and it is the reason this
     * method exists: both callers used to give up entirely when
     * onboarding_level was null - an account created before the quiz was
     * captured, or one whose profile push never landed - which meant the ONE
     * case with no starting level of its own was also the one case that stayed
     * on a paid difficulty forever. There is always somewhere to go back to.
     *
     * onboarding_level is a level NUMBER (1-5, a tinyint); users.level_id is a
     * foreign key to levels.id. They are not the same thing and only look
     * alike on a freshly seeded database, where the seeder happens to hand out
     * ids in number order - it matches on `number`, so they drift the moment a
     * level is recreated. Writing the number straight into the key is a
     * foreign key violation on any database where they have. So the number is
     * resolved to an id here, once, and callers only ever see an id.
     *
     * Null means this database has no level to offer at all - not even a level
     * 1 - and a caller that gets it must leave the account alone rather than
     * write something the foreign key will reject.
     */
    public function freeLevelId(): ?int
    {
        $number = (int) ($this->onboarding_level ?? 0);

        if ($number >= 1) {
            $id = (int) (Level::where('number', $number)->value('id') ?? 0);

            if ($id > 0) {
                return $id;
            }
        }

        // Their own starting level is gone, or they never had one. Level 1 is
        // the free tier's floor and the level every account starts on.
        return (int) (Level::where('number', 1)->value('id') ?? 0) ?: null;
    }

    /**
     * True once the user has completed every "Learn the basics" lesson. The
     * basics are the only active knowledge lessons (see App\Support\BasicsLessons
     * / KnowledgeSeeder), so this is simply "all active lessons completed".
     * With no active lessons, there is nothing to gate on.
     */
    /** @var bool|null Per-request cache for hasCompletedBasics(). */
    private ?bool $_basicsCompleted = null;

    public function hasCompletedBasics(): bool
    {
        if ($this->_basicsCompleted !== null) {
            return $this->_basicsCompleted;
        }

        $active = KnowledgeLesson::where('is_active', true)->count();

        if ($active === 0) {
            return $this->_basicsCompleted = true;
        }

        $done = $this->completedLessons()
            ->where('is_active', true)
            ->wherePivotNotNull('completed_at')
            ->count();

        return $this->_basicsCompleted = $done >= $active;
    }

    /**
     * The user's sync-API token, created on first use. Stable (not rotated per
     * login) so the same account keeps working across multiple devices; null it
     * to revoke access everywhere and force a fresh sign-in.
     */
    public function apiToken(): string
    {
        if (! $this->api_token) {
            $this->forceFill(['api_token' => \Illuminate\Support\Str::random(64)])->save();
        }

        return $this->api_token;
    }

    /**
     * Permanently remove this account and everything it owns. Irreversible.
     * Used by "Delete account" on both the backend and the device (which also
     * purges its local mirror). Does NOT touch Google Play billing - Google
     * owns subscriptions, so the user is warned to cancel there separately.
     */
    public function deleteWithData(): void
    {
        app(\App\Services\AppleSignInService::class)->revoke($this);

        $this->workoutSessions()->delete();
        $this->trainingDays()->delete();
        $this->measurements()->delete();
        $this->reminders()->delete();
        $this->subscriptions()->delete();
        $this->completedLessons()->detach();
        EmailCode::where('email', $this->email)->delete();

        $this->delete();
    }
}
