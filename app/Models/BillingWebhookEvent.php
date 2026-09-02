<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A store webhook we have seen, keyed by the store's own event id.
 *
 * Both RevenueCat and Pub/Sub redeliver, so this row is what tells a second
 * copy of an event from the first one. `note` records why an event changed
 * nothing, which is what makes a missing subscription reconcilable later.
 */
class BillingWebhookEvent extends Model
{
    protected $guarded = [];

    protected $casts = [
        'payload' => 'array',
        'occurred_at' => 'datetime',
        'handled_at' => 'datetime',
    ];

    /** Mark the event finished so a redelivery of it can be dropped. */
    public function markHandled(?string $note = null, ?int $userId = null, ?int $subscriptionId = null): void
    {
        $this->forceFill(array_filter([
            'handled_at' => now(),
            'note' => $note,
            'user_id' => $userId,
            'subscription_id' => $subscriptionId,
        ], fn ($value) => $value !== null))->save();
    }
}
