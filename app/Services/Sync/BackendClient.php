<?php

namespace App\Services\Sync;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * Thin client for talking to the remote backend's sync API.
 *
 * An install is a "client" (the NativePHP device app) when CONTENT_SYNC_URL is
 * configured; the backend itself leaves it empty, so the same codebase never
 * tries to sync against itself.
 */
class BackendClient
{
    /**
     * Bump this whenever the sync logic changes. It is surfaced in the on-device
     * diagnostics so we can tell at a glance whether a rebuild actually shipped
     * the latest code (vs. a stale bundled copy).
     */
    public const SYNC_BUILD = 'offapp-hardcoded-catalog-v1';

    /**
     * True when this install should pull/push against a remote backend — i.e.
     * it is the native device app, not the backend itself.
     *
     * Gated on the NativePHP runtime flag (true only inside the device app) so
     * the backend never syncs against itself, even though both share the same
     * codebase and may share the same .env (APP_URL == CONTENT_SYNC_URL host).
     */
    public static function isClient(): bool
    {
        return self::isDevice()
            && ! empty(config('app.content_sync_url'))
            && ! empty(config('app.sync_api_key'));
    }

    /**
     * Whether we are running inside the packaged NativePHP device app (vs. the
     * backend serving ke.downloadh.com).
     *
     * Primary signal is the REQUEST HOST: the native C bridge serves the app
     * from 127.0.0.1 (it hard-sets HTTP_HOST/SERVER_NAME), which can never
     * equal the public backend host. This is bulletproof and does NOT depend on
     * config caching. We also accept the NATIVEPHP_RUNNING env flag as a second
     * signal (read from the live environment, never via cached config()).
     */
    public static function isDevice(): bool
    {
        // 1) Native runtime flag, read straight from the live environment.
        $flag = $_SERVER['NATIVEPHP_RUNNING']
            ?? $_ENV['NATIVEPHP_RUNNING']
            ?? getenv('NATIVEPHP_RUNNING');
        if (filter_var($flag, FILTER_VALIDATE_BOOLEAN)) {
            return true;
        }

        // 2) Request host differs from the backend host → we are the device.
        $reqHost = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '';
        $reqHost = strtolower(preg_replace('/:\d+$/', '', (string) $reqHost));
        $backendHost = strtolower((string) parse_url((string) config('app.content_sync_url'), PHP_URL_HOST));

        return $reqHost !== '' && $backendHost !== '' && $reqHost !== $backendHost;
    }

    /** Diagnostic snapshot — surfaced to the device so failures are visible. */
    public static function diagnostics(): array
    {
        $reqHost = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? null;

        return [
            'sync_build'       => self::SYNC_BUILD,
            'is_device'        => self::isDevice(),
            'is_client'        => self::isClient(),
            'request_host'     => $reqHost,
            'backend_base'     => self::base(),
            'native_flag'      => $_SERVER['NATIVEPHP_RUNNING'] ?? $_ENV['NATIVEPHP_RUNNING'] ?? getenv('NATIVEPHP_RUNNING') ?: null,
            'has_api_key'      => ! empty(config('app.sync_api_key')),
        ];
    }

    /**
     * The API base, e.g. https://ke.downloadh.com/api — normalised from the
     * CONTENT_SYNC_URL setting (which may point at .../api/v1/content).
     */
    public static function base(): ?string
    {
        $url = config('app.content_sync_url');
        if (! $url) {
            return null;
        }

        if (str_ends_with($url, '/v1/content')) {
            $url = substr($url, 0, -strlen('/v1/content'));
        }
        $url = rtrim($url, '/');
        if (! str_ends_with($url, '/api')) {
            $url .= '/api';
        }

        return $url;
    }

    /** A pre-configured HTTP request carrying the API key. */
    public static function request(int $timeout = 6): PendingRequest
    {
        return Http::withHeaders([
            'Authorization' => 'Bearer '.config('app.sync_api_key'),
            'Accept'        => 'application/json',
        ])->timeout($timeout)->connectTimeout(3);
    }

    /**
     * Fast "is the backend reachable?" check (~1s). Used to back off quickly when
     * offline so the device never stacks multiple slow connection timeouts.
     */
    public static function reachable(int $timeout = 1): bool
    {
        $base = self::base();
        if (! $base) {
            return false;
        }

        $origin = preg_replace('#/api/?$#', '', $base);

        try {
            return Http::timeout($timeout)->connectTimeout($timeout)->get($origin.'/up')->successful();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Headers that identify the acting user to the backend's VerifySyncApiKey
     * middleware (stateless auth via email + stored password hash).
     *
     * @return array<string, string>
     */
    public static function userHeaders(\App\Models\User $user): array
    {
        return [
            'X-User-Email'         => $user->email,
            'X-User-Password-Hash' => (string) $user->password,
        ];
    }
}
