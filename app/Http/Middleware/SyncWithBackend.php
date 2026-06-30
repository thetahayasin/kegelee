<?php

namespace App\Http\Middleware;

use App\Models\User;
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
 * CRITICAL: the sync runs in terminate() — AFTER the response is sent — never in
 * handle(). The page renders from the local database immediately, so an offline
 * or slow backend can never block or blank a screen (the bug where opening the
 * app without internet showed a blank page while the sync hung on timeouts).
 *
 * Only active on the device (where CONTENT_SYNC_URL is set); the backend itself
 * never syncs against itself. Throttled per-domain, with a short cooldown when
 * the backend is unreachable so offline navigations don't keep retrying.
 */
class SyncWithBackend
{
    private const CONTENT_THROTTLE = 120; // seconds
    private const USER_THROTTLE = 90;     // seconds
    private const COOLDOWN = 30;          // back off this long after a failure

    public function handle(Request $request, Closure $next): Response
    {
        // Never sync here — rendering must not wait on the network.
        return $next($request);
    }

    /**
     * Runs after the response has been sent to the browser, so the network calls
     * never delay the page. Fails silently and backs off when offline.
     */
    public function terminate(Request $request, Response $response): void
    {
        if (! $this->shouldSync($request)) {
            return;
        }

        $ok = true;

        if (Cache::add('sync:content:lock', 1, self::CONTENT_THROTTLE)) {
            try {
                $ok = app(ContentSyncService::class)->pull() && $ok;
            } catch (\Throwable $e) {
                $ok = false;
            }
        }

        if (($user = $request->user()) && Cache::add('sync:user:'.$user->id, 1, self::USER_THROTTLE)) {
            try {
                $userSync = app(UserSyncService::class);
                $ok = $userSync->push($user) && $ok;
                $ok = $userSync->pull($user) && $ok;
            } catch (\Throwable $e) {
                $ok = false;
            }
        }

        // Backend unreachable (offline) → back off so the next navigations skip
        // the sync entirely instead of repeatedly hanging on connection timeouts.
        if (! $ok) {
            Cache::put('sync:backend:cooldown', 1, self::COOLDOWN);
        }
    }

    private function shouldSync(Request $request): bool
    {
        // Recently failed → assume offline and skip until the cooldown expires.
        if (Cache::has('sync:backend:cooldown')) {
            return false;
        }

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
