<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

/**
 * Web-based deploy tasks for hosts WITHOUT shell access: runs migrations,
 * ensures the public storage link, and rebuilds the production caches.
 *
 * Guarded by the SYNC_API_KEY (same long random secret the app uses), plus
 * a throttle. Hit it after every file upload:
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

        // storage:link without SSH - plain PHP symlink().
        $link = public_path('storage');
        $target = storage_path('app/public');
        if (is_link($link) || file_exists($link)) {
            $result['storage_link'] = 'exists';
        } else {
            try {
                symlink($target, $link);
                $result['storage_link'] = 'created';
            } catch (\Throwable $e) {
                $result['storage_link'] = 'failed: '.$e->getMessage();
            }
        }

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
