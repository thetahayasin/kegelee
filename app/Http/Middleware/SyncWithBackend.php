<?php

namespace App\Http\Middleware;

use App\Services\Sync\BackendClient;
use App\Services\Sync\ContentSyncService;
use App\Services\Sync\UserSyncService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keeps the native device app in sync with the remote backend.
 *
 * On normal page navigations (GET HTML), this pulls fresh content into the
 * local database and runs a two-way sync of the signed-in user's data. Both
 * are throttled via the cache so we don't hit the network on every request,
 * and both fail silently — sync must never block or break a page render.
 *
 * Only active on the device (where CONTENT_SYNC_URL is set); the backend
 * itself never syncs against itself.
 */
class SyncWithBackend
{
    private const CONTENT_THROTTLE = 120; // seconds
    private const USER_THROTTLE = 90;     // seconds

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->shouldSync($request)) {
            return $next($request);
        }

        // Content pull (throttled) — makes admin-managed content appear locally.
        if (Cache::add('sync:content:lock', 1, self::CONTENT_THROTTLE)) {
            app(ContentSyncService::class)->pull();
        }

        // Two-way user-data sync (throttled) for the signed-in user.
        if (($user = $request->user()) && Cache::add('sync:user:'.$user->id, 1, self::USER_THROTTLE)) {
            $userSync = app(UserSyncService::class);
            $userSync->push($user);
            $userSync->pull($user);
        }

        return $next($request);
    }

    private function shouldSync(Request $request): bool
    {
        if (! BackendClient::isClient()) {
            return false;
        }

        // Only on top-level page navigations — skip XHR, Livewire updates,
        // assets, the admin panel and the API itself.
        if (! $request->isMethod('GET')) {
            return false;
        }
        if ($request->ajax() || $request->headers->has('X-Livewire')) {
            return false;
        }
        if ($request->is('api/*', 'admin/*', 'livewire/*', 'storage/*', 'sync/*')) {
            return false;
        }
        if (! $request->acceptsHtml()) {
            return false;
        }

        return true;
    }
}
