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

#[Fillable(['name', 'email', 'password', 'google_id', 'email_verified_at', 'is_admin', 'level_id', 'level_started_days', 'onboarded_at', 'timezone'])]
#[Hidden(['password', 'remember_token'])]
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
                });
            })
            ->latest('id')
            ->first();
    }

    public function isSubscribed(): bool
    {
        return (bool) $this->activeSubscription();
    }

    /**
     * True once the user has completed every "Learn the basics" lesson. The
     * basics are the only active knowledge lessons (see App\Support\BasicsLessons
     * / KnowledgeSeeder), so this is simply "all active lessons completed".
     * With no active lessons, there is nothing to gate on.
     */
    public function hasCompletedBasics(): bool
    {
        $active = KnowledgeLesson::where('is_active', true)->count();

        if ($active === 0) {
            return true;
        }

        $done = $this->completedLessons()
            ->where('is_active', true)
            ->wherePivotNotNull('completed_at')
            ->count();

        return $done >= $active;
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
