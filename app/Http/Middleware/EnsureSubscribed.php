<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates the core training experience behind an active subscription.
 *
 * The public videos stage (onboarding + knowledge lessons) is freely browsable
 * without an account. Once a user wants to actually train, a subscription is
 * required - non-subscribed users are sent to the paywall (the subscription
 * screen) where they purchase a plan via Google Play Billing.
 *
 * Admins bypass the gate so they can preview the app.
 */
class EnsureSubscribed
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->is_admin && ! $user->isSubscribed()) {
            // Livewire navigation requests need a redirect they can follow.
            return redirect()->route('paywall');
        }

        return $next($request);
    }
}
