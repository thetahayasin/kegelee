<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates sync-API requests via the per-user token (X-User-Token) that
 * the backend issues at login/register/Google sign-in.
 *
 * There is deliberately NO shared app key: it would ship inside the APK
 * (extractable) while adding a fleet-wide breakage risk on rotation. Public
 * endpoints are throttled and credential-checked instead, exactly like the
 * website's own login form; user endpoints require this token (the routes
 * behind the 'auth' middleware 401 when it is missing or wrong).
 */
class ResolveApiUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = (string) $request->header('X-User-Token', '');

        if (strlen($token) === 64) {
            $user = \App\Models\User::where('api_token', $token)->first();

            // Verified accounts only: register hands out a token before the
            // email code is confirmed (the app just doesn't use it yet), so
            // without this check the whole /user/* API would be reachable by
            // accounts that never proved their email. Every sign-in path
            // verifies first, so no legitimate client is affected.
            if ($user && $user->email_verified_at) {
                auth()->setUser($user);
            }
        }

        return $next($request);
    }
}
