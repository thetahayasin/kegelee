<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

/**
 * Web-based deploy tasks for hosts WITHOUT shell access: runs migrations
 * and rebuilds the production caches. Public uploads need no storage
 * symlink (the public disk writes straight into the webroot), so this is
 * everything a deploy requires.
 *
 * Guarded by the SYNC_API_KEY (the same long random secret the app uses),
 * plus a throttle. Hit it once after every file upload:
 *
 *   https://kegelee.com/deploy?key=YOUR_SYNC_API_KEY
 */
class DeployController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $key = (string) ($request->query('key') ?: $request->bearerToken());
        $expected = (string) config('app.sync_api_key');

        abort_unless($expected !== '' && $key !== '' && hash_equals($expected, $key), 403);

        $result = [];

        // Fresh uploads may carry stale caches; clear before anything else.
        Artisan::call('optimize:clear');
        $result['optimize:clear'] = 'ok';

        Artisan::call('migrate', ['--force' => true]);
        $result['migrate'] = trim(Artisan::output()) ?: 'nothing to migrate';

        // Make sure the public uploads folder exists in the webroot.
        $uploads = public_path('storage');
        if (! is_dir($uploads)) {
            @mkdir($uploads, 0755, true);
        }
        $result['uploads_dir'] = is_dir($uploads) ? 'ok' : 'missing';

        foreach (['config:cache', 'route:cache', 'view:cache', 'event:cache'] as $command) {
            try {
                Artisan::call($command);
                $result[$command] = 'ok';
            } catch (\Throwable $e) {
                $result[$command] = 'failed: '.$e->getMessage();
            }
        }

        return response()->json(['ok' => true] + $result);
    }
}
