<?php

namespace App\Services;

use App\Mail\SubscriptionCanceledMail;
use App\Mail\SubscriptionRenewedMail;
use App\Mail\SubscriptionStartedMail;
use App\Models\Subscription;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * The one place subscription email is sent from, so it can be sent once.
 *
 * A single purchase reaches three code paths - the paywall, the device's sync
 * push and the RevenueCat webhook - and each used to mail the customer
 * directly. Add store redelivery on top and a renewal could be announced three
 * times in a minute. Every send is claimed in subscription_mail_log first, and
 * the unique key on that table is what actually prevents the duplicate.
 */
class SubscriptionMailer
{
    public static function started(Subscription $subscription): bool
    {
        return self::send(
            $subscription,
            // One welcome per subscription row, whichever path gets there first.
            'started',
            fn (Subscription $sub) => new SubscriptionStartedMail($sub),
        );
    }

    public static function renewed(Subscription $subscription): bool
    {
        // Keyed on the period being announced. A replayed RENEWAL carries the
        // same ends_at and is dropped; next month's genuine renewal carries a
        // new one and mails.
        $period = $subscription->ends_at?->toIso8601String() ?? 'none';

        return self::send(
            $subscription,
            "renewed:{$period}",
            fn (Subscription $sub) => new SubscriptionRenewedMail($sub),
        );
    }

    public static function canceled(Subscription $subscription): bool
    {
        // One cancellation notice per row. A cancellation followed by a refund
        // fires two events for the same ending, and telling the customer twice
        // reads as a system in a loop.
        return self::send(
            $subscription,
            'canceled',
            fn (Subscription $sub) => new SubscriptionCanceledMail($sub),
        );
    }

    /**
     * Claim the send, then send. Returns false when it was already sent.
     */
    private static function send(Subscription $subscription, string $key, callable $build): bool
    {
        $user = $subscription->user;

        if (! $subscription->exists || ! $user || ! $user->email) {
            return false;
        }

        try {
            DB::table('subscription_mail_log')->insert([
                'subscription_id' => $subscription->id,
                'mail_class' => $key,
                'sent_at' => now(),
            ]);
        } catch (QueryException $e) {
            // The unique key rejected it: this email has already gone out.
            return false;
        }

        try {
            Mail::to($user)->send($build($subscription));
        } catch (\Throwable $e) {
            // Nothing was delivered, so release the claim - otherwise a
            // transient mail outage silently costs the customer the email for
            // good.
            DB::table('subscription_mail_log')
                ->where('subscription_id', $subscription->id)
                ->where('mail_class', $key)
                ->delete();

            Log::warning('Subscription email failed to send', [
                'subscription_id' => $subscription->id,
                'mail' => $key,
                'error' => $e->getMessage(),
            ]);

            return false;
        }

        return true;
    }
}
