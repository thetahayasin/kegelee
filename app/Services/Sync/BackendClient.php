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
     * True when this install should pull/push against a remote backend — i.e.
     * it is the native device app, not the backend itself.
     *
     * Gated on the NativePHP runtime flag (true only inside the device app) so
     * the backend never syncs against itself, even though both share the same
     * codebase and may share the same .env (APP_URL == CONTENT_SYNC_URL host).
     */
    public static function isClient(): bool
    {
        return (bool) config('nativephp-internal.running')
            && ! empty(config('app.content_sync_url'))
            && ! empty(config('app.sync_api_key'));
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
    public static function request(int $timeout = 8): PendingRequest
    {
        return Http::withHeaders([
            'Authorization' => 'Bearer '.config('app.sync_api_key'),
            'Accept'        => 'application/json',
        ])->timeout($timeout)->connectTimeout(5);
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
