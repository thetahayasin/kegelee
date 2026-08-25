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

#[Fillable(['name', 'email', 'password', 'google_id', 'email_verified_at', 'is_admin', 'level_id', 'level_started_days', 'onboarded_at', 'timezone', 'api_token'])]
#[Hidden(['password', 'remember_token', 'api_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'onboarded_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
        ];
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(Reminder::class)->orderBy('weekday');
    }

    public function level(): BelongsTo
    {
        return $this->belongsTo(Level::class);
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

    public function activeSubscription(): ?Subscription
    {
        return $this->subscriptions()
            ->where(function ($q) {
                // Active / trialing: entitled while not yet expired.
                $q->where(function ($w) {
                    $w->whereIn('status', ['trialing', 'active'])
                      ->where(fn ($e) => $e->whereNull('ends_at')->orWhere('ends_at', '>', now()));
                })
                // Canceled (e.g. auto-renew turned off in Google Play): keep
                // access until the paid period actually ends.
                ->orWhere(function ($w) {
                    $w->where('status', 'canceled')->where('ends_at', '>', now());
                })
                // Past due = Google is RETRYING the card, and its grace period
                // is defined as the window where the subscriber keeps access.
                // We were doing the opposite: SUBSCRIPTION_IN_GRACE_PERIOD and
                // BILLING_ISSUE both write 'past_due', which this clause used
                // to exclude, so a card blip locked out a paying customer the
                // instant Google told us to keep serving them. Bounded by
                // ends_at exactly like 'canceled', so it can never grant
                // beyond the period already paid for - when the grace really
                // does run out, Play sends the expiration that sets 'expired'.
                ->orWhere(function ($w) {
                    $w->where('status', 'past_due')->where('ends_at', '>', now());
                });
            })
            ->latest('id')
            ->first();
    }

    /** @var bool|null Per-request cache for isSubscribed(). */
    private ?bool $_subscribed = null;

    public function isSubscribed(): bool
    {
        return $this->_subscribed ??= (bool) $this->activeSubscription();
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
