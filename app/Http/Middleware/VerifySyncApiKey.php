<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Secures the content-sync API behind the SYNC_API_KEY environment variable.
 *
 * Every request to /api/v1/* must include:
 *   Authorization: Bearer <SYNC_API_KEY>
 *
 * Without a valid key the endpoint returns 401, keeping the API private.
 */
class VerifySyncApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = config('app.sync_api_key');

        if (! $expected) {
            abort(503, 'Sync API key not configured.');
        }

        $provided = $request->bearerToken();

        if (! $provided || ! hash_equals($expected, $provided)) {
            return response()->json(['error' => 'Invalid API key.'], 401);
        }

        return $next($request);
    }
}
