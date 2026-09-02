<?php

namespace App\Models;

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
     * Whether this will bill again, as far as we know.
     *
     * `auto_renewing` is written by both webhooks and is the only field that
     * says whether money will move again, but nothing in the admin surfaced
     * it - so a subscription silently switched off in Google Play looked
     * identical to a healthy one right up until it expired.
     */
    public function willRenew(): bool
    {
        return $this->auto_renewing
            && in_array($this->status, ['active', 'trialing', 'past_due'], true);
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
