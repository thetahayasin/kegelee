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
        'auto_renewing' => 'boolean',
    ];

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
    public function isEntitled(): bool
    {
        $future = $this->ends_at === null || $this->ends_at->isFuture();

        return match ($this->status) {
            'active', 'trialing' => $future,
            // Auto-renew off, or a payment being retried: paid through the end
            // of the period either way.
            'canceled', 'past_due' => $this->ends_at !== null && $this->ends_at->isFuture(),
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
