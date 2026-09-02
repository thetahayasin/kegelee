<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CacheStaticAssets
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        // Vite writes the content hash into the filename, so a build asset at
        // a given URL never changes. That is what 'immutable' promises.
        if ($request->is('build/*')) {
            $response->headers->set('Cache-Control', 'public, max-age=31536000, immutable');
        }

        // Uploads keep their path when they are replaced: an admin who swaps
        // the logo reuses branding/<name>. 'immutable' told browsers never to
        // re-check, so the old image stayed for a year. A day, revalidated,
        // gives the same bandwidth saving without the trap.
        if ($request->is('storage/*')) {
            $response->headers->set('Cache-Control', 'public, max-age=86400, must-revalidate');
        }

        return $response;
    }
}
