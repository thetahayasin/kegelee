<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

/**
 * GET /.well-known/assetlinks.json
 *
 * Android reads this to decide whether https://kegelee.com links belong to the
 * app. Once it verifies, /auth/google/finish opens in the app instead of a
 * browser, which is what makes the Google sign-in return an App Link rather
 * than a custom scheme any installed app could claim.
 *
 * A route rather than a static file because the certificate fingerprint is
 * per-build and lives in the environment: debug, internal-testing and Play's
 * own app-signing key all differ, and a file committed with one of them is
 * wrong everywhere else.
 */
class AssetLinksController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $package = (string) config('services.google_play.package_name');

        // Play re-signs uploads with its own key, so a build usually needs
        // BOTH fingerprints (upload + app-signing) listed. Comma or whitespace
        // separated in the env value.
        $fingerprints = array_values(array_filter(array_map(
            fn (string $f) => strtoupper(trim($f)),
            preg_split('/[\s,]+/', (string) config('services.google_play.app_link_sha256')) ?: [],
        )));

        $statements = [];

        // An empty list would otherwise publish a statement matching nothing,
        // which Android reports as a verification failure rather than as "not
        // configured yet". Serving an empty array says the same thing honestly.
        if ($package !== '' && $fingerprints !== []) {
            $statements[] = [
                'relation' => ['delegate_permission/common.handle_all_urls'],
                'target' => [
                    'namespace' => 'android_app',
                    'package_name' => $package,
                    'sha256_cert_fingerprints' => $fingerprints,
                ],
            ];
        }

        // Android insists on application/json; a text/html copy of the same
        // bytes fails verification silently.
        return response()->json($statements, 200, [
            'Content-Type' => 'application/json',
        ], JSON_UNESCAPED_SLASHES);
    }
}
