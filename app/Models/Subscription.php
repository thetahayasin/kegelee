<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subscription extends Model
{
    protected $guarded = [];

    protected $casts = [
        'trial_ends_at' => 'datetime',
        'started_at'    => 'datetime',
        'ends_at'       => 'datetime',
        'canceled_at'   => 'datetime',
        'last_event_at' => 'datetime',
        'grace_period_ends_at' => 'datetime',
        'auto_renewing' => 'boolean',
    ];

    /**
     * The account identifier we hand Google Play at purchase time.
     *
     * Play echoes it back on every purchase resource as
     * obfuscatedExternalAccountId, which is the only way to attribute a
     * purchase token this server has never seen to an account. It is an HMAC
     * rather than the raw id so the value is useless to anyone who intercepts
     * it, and stable so the same user always produces the same string.
     */
    public static function obfuscatedAccountIdFor(int $userId): string
    {
        return hash_hmac('sha256', (string) $userId, (string) config('app.key'));
    }

    /**
     * Reverse an obfuscated account id back to a user.
     *
     * An HMAC cannot be inverted, so this compares against every account. That
     * is only acceptable because it is reached solely for a purchase token we
     * have no row for, which is rare by definition.
     */
    public static function userIdFromObfuscatedAccountId(string $obfuscated): ?int
    {
        if (trim($obfuscated) === '') {
            return null;
        }

        $match = null;

        User::query()->select('id')->orderBy('id')->chunk(500, function ($users) use ($obfuscated, &$match) {
            foreach ($users as $user) {
                if (hash_equals(self::obfuscatedAccountIdFor((int) $user->id), $obfuscated)) {
                    $match = (int) $user->id;

                    return false;
                }
            }

            return true;
        });

        return $match;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    /**
     * Does this row currently grant access?
     *
     * Deliberately mirrors User::activeSubscription()'s WHERE clause rather
     * than inventing a second definition. A status column alone cannot answer
     * this - 'canceled' still entitles the user until the paid period runs
     * out, and 'past_due' means Google is retrying the card and expects us to
     * keep serving - so an admin reading only the status pill will draw the
     * wrong conclusion about half the table.
     */
    /**
     * The status as it actually stands, not as it was last written.
     *
     * `status` only changes when a webhook says so. `ends_at` is a fact
     * recorded at purchase. A subscription that ran out without its
     * EXPIRATION event arriving keeps saying 'active' forever, which is how
     * the admin came to show "Active" and "No access" on the same row and to
     * count lapsed subscribers as live ones.
     *
     * 'canceled' and 'past_due' are left alone: both mean the customer is
     * still inside a period they paid for, and both already read as finished
     * once that period ends.
     */
    public function getEffectiveStatusAttribute(): string
    {
        $lapsed = $this->ends_at !== null && $this->ends_at->isPast();

        return $lapsed && in_array($this->status, ['active', 'trialing'], true)
            ? 'expired'
            : $this->status;
    }

    public function isEntitled(): bool
    {
        $future = $this->ends_at === null || $this->ends_at->isFuture();

        return match ($this->status) {
            'active', 'trialing' => $future,
            // Auto-renew off, or a payment being retried: paid through the end
            // of the period either way.
            'canceled', 'past_due' => $this->ends_at !== null && $this->ends_at->isFuture(),
            // Play has suspended billing in both of these. Spelled out rather
            // than left to `default` so nobody reads the omission as an
            // oversight and "fixes" it into an entitlement.
            'paused', 'on_hold' => false,
            default => false,
        };
    }

    /**
     * isEntitled(), in SQL.
     *
     * This has to exist as a scope and not only as a predicate. isEntitled()
     * answers for ONE loaded row, and every "how many subscribers" figure in
     * the admin is a count() that cannot call it - so each screen wrote the
     * WHERE by hand and they disagreed. The dashboard counted
     * `status IN (active, trialing)` with no date bound at all, which counts
     * every lapsed row whose EXPIRATION never arrived; the subscriptions page
     * bounded it; the reports bounded it a third way that dropped cancelled
     * subscribers who are still inside a period they paid for. One question,
     * four answers, and nothing to say which was the real one.
     *
     * Edit this and isEntitled() together. They are one sentence written
     * twice, because PHP and SQL cannot share it.
     */
    public function scopeEntitled(Builder $query): Builder
    {
        // Qualified because half the callers join `plans` to price the rows.
        // An unqualified `status` is fine today only because plans happens not
        // to have that column, which is not a guarantee worth resting on.
        $status = $query->qualifyColumn('status');
        $endsAt = $query->qualifyColumn('ends_at');

        return $query->where(function (Builder $q) use ($status, $endsAt) {
            $q->where(function (Builder $w) use ($status, $endsAt) {
                // A null ends_at is an open-ended grant (an admin comp), and
                // it stays entitled until something puts a date on it.
                $w->whereIn($status, ['active', 'trialing'])
                    ->where(fn (Builder $e) => $e->whereNull($endsAt)->orWhere($endsAt, '>', now()));
            })->orWhere(function (Builder $w) use ($status, $endsAt) {
                // Paid through the end of the period, whichever reason it will
                // not renew. Never null here: an open-ended cancelled row
                // would grant access forever, which is the one shape that
                // escapes every sweep we have.
                $w->whereIn($status, ['canceled', 'past_due'])
                    ->whereNotNull($endsAt)
                    ->where($endsAt, '>', now());
            });
        });
    }

    /**
     * Whether this will bill again, as far as we know.
     *
     * `auto_renewing` is written by both webhooks and is the only field that
     * says whether money will move again, but nothing in the admin surfaced
     * it - so a subscription silently switched off in Google Play looked
     * identical to a healthy one right up until it expired.
     */
    public function willRenew(): bool
    {
        // The date bound is not decoration. A row whose period ended while its
        // EXPIRATION was lost still says auto_renewing = true forever, and
        // without this the subscriptions table printed "Renews" beside a row
        // it was simultaneously calling expired.
        return $this->auto_renewing
            && in_array($this->status, ['active', 'trialing', 'past_due'], true)
            && ($this->ends_at === null || $this->ends_at->isFuture());
    }

    /**
     * willRenew(), in SQL. The money question, not the access one.
     *
     * Deliberately NOT the same set as entitled(). Somebody who cancelled
     * yesterday still has access and still counts as a subscriber, but their
     * next payment is never arriving, so folding them into MRR overstates
     * recurring revenue by exactly the people who have already left. Counting
     * one of these two sets and labelling it the other is the same mistake as
     * ignoring ends_at, one storey up, so the two scopes are named for the
     * question rather than for the rows.
     */
    public function scopeRenewing(Builder $query): Builder
    {
        $endsAt = $query->qualifyColumn('ends_at');

        return $query->where($query->qualifyColumn('auto_renewing'), true)
            ->whereIn($query->qualifyColumn('status'), ['active', 'trialing', 'past_due'])
            ->where(fn (Builder $e) => $e->whereNull($endsAt)->orWhere($endsAt, '>', now()));
    }

    /**
     * Rows that have run out, whatever their status column still claims.
     *
     * The complement of entitled() for reporting on churn, and the set the
     * dashboard was silently counting as live.
     */
    public function scopeLapsed(Builder $query): Builder
    {
        return $query->whereNotNull($query->qualifyColumn('ends_at'))
            ->where($query->qualifyColumn('ends_at'), '<=', now());
    }

    public function discount(): BelongsTo
    {
        return $this->belongsTo(Discount::class);
    }

    public function isActive(): bool
    {
        // A canceled subscription (auto-renew off) is still entitled until the
        // paid period ends.
        if ($this->status === 'canceled') {
            return (bool) $this->ends_at?->isFuture();
        }

        return in_array($this->status, ['trialing', 'active'], true)
            && (! $this->ends_at || $this->ends_at->isFuture());
    }

    public function isRevenueCat(): bool
    {
        return $this->store === 'revenuecat';
    }

    public function isGooglePlay(): bool
    {
        return $this->store === 'google_play';
    }
}
