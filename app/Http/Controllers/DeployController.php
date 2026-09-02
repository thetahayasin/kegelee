<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;

/**
 * Web-based deploy tasks for hosts WITHOUT shell access: runs migrations
 * and rebuilds the production caches. Public uploads need no storage
 * symlink (the public disk writes straight into the webroot), so this is
 * everything a deploy requires.
 *
 * Guarded by DEPLOY_KEY (a server-only secret - it never ships in the app),
 * plus a throttle. Hit it once after every file upload:
 *
 *   curl -X POST -H "Authorization: Bearer $DEPLOY_KEY" https://kegelee.com/deploy
 */
class DeployController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        // Header only. ?key= put the deploy secret into the access log of
        // every server, proxy and browser history between here and the caller,
        // and made the endpoint reachable from a plain link.
        $key = (string) $request->bearerToken();
        $expected = (string) config('app.deploy_key');

        abort_unless($expected !== '' && $key !== '' && hash_equals($expected, $key), 403);

        // One deploy at a time. Two overlapping runs mean two `migrate`
        // processes on the same schema and a cache rebuilt from half-written
        // files; the second caller is told to wait instead.
        $lock = Cache::lock('deploy', 300);

        $result = $lock->get(function () {
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

            // config:cache is deliberately NOT here. It freezes the config of
            // the process that ran it, and this one runs inside a web request:
            // anything env() answered differently for the web user (or was
            // missing from a partially uploaded .env) is baked in for every
            // request afterwards, and the only way back is shell access this
            // endpoint exists because we do not have.
            foreach (['route:cache', 'view:cache', 'event:cache'] as $command) {
                try {
                    Artisan::call($command);
                    $result[$command] = 'ok';
                } catch (\Throwable $e) {
                    $result[$command] = 'failed: '.$e->getMessage();
                }
            }

            return $result;
        });

        if ($result === false) {
            return response()->json([
                'ok'    => false,
                'error' => 'A deploy is already running. Try again in a moment.',
            ], 409);
        }

        return response()->json(['ok' => true] + $result);
    }
}
