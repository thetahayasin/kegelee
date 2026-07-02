<?php

namespace App\Services;

use App\Models\User;
use App\Services\Sync\BackendClient;

/**
 * Device-side authentication against the backend, which owns all accounts.
 *
 * On the native device the backend is the auth source of truth: login and
 * registration go to the backend first, and the confirmed account (including
 * its password hash) is mirrored into the local database so the app can run
 * offline afterwards. On the backend itself these helpers are never used.
 */
class RemoteAuth
{
    /**
     * @return array{user?: array<string,mixed>, reason?: string}
     *   ['user'=>...] on success; otherwise ['reason'=>'invalid'|'unreachable'|'offline'].
     */
    public static function login(string $email, string $password): array
    {
        if (! BackendClient::isClient()) {
            return ['reason' => 'offline'];
        }

        try {
            $response = BackendClient::request()
                ->post(BackendClient::base().'/v1/auth/login', [
                    'email' => $email,
                    'password' => $password,
                ]);

            if ($response->successful()) {
                return ['user' => $response->json('user')];
            }

            // 401/422 = the backend rejected the credentials.
            if (in_array($response->status(), [401, 422], true)) {
                if ($response->json('error') === 'Invalid API key.') {
                    return ['reason' => 'unreachable'];
                }

                return ['reason' => 'invalid'];
            }

            return ['reason' => 'unreachable'];
        } catch (\Throwable $e) {
            return ['reason' => 'unreachable'];
        }
    }

    /**
     * @return array{user?: array<string,mixed>, error?: string}
     */
    public static function register(string $name, string $email, string $password): array
    {
        if (! BackendClient::isClient()) {
            return ['error' => 'offline'];
        }

        try {
            $response = BackendClient::request()
                ->post(BackendClient::base().'/v1/auth/register', [
                    'name' => $name,
                    'email' => $email,
                    'password' => $password,
                ]);

            if ($response->successful()) {
                return ['user' => $response->json('user')];
            }

            if ($response->status() === 422) {
                $errors = $response->json('errors.email');
                $message = $errors ? $errors[0] : $response->json('message');

                return ['error' => $message ?: 'Validation failed.'];
            }

            return ['error' => 'Could not reach the server. Check your internet connection and try again.'];
        } catch (\Throwable $e) {
            return ['error' => 'Could not reach the server. Check your internet connection and try again.'];
        }
    }

    /**
     * Mirror the backend's confirmed account into the local database so the
     * app works offline. Keeps the backend's user id on first insert so
     * synced records line up across devices.
     *
     * @param array<string, mixed> $remoteUser
     */
    public static function mirror(array $remoteUser): User
    {
        $attributes = [
            'name' => $remoteUser['name'],
            'email_verified_at' => ! empty($remoteUser['email_verified_at']) ? now()->parse($remoteUser['email_verified_at']) : null,
            'password' => $remoteUser['password_hash'],
            'is_admin' => (bool) ($remoteUser['is_admin'] ?? false),
            'level_id' => $remoteUser['level_id'] ?? null,
            'level_started_days' => (int) ($remoteUser['level_started_days'] ?? 0),
            'onboarded_at' => ! empty($remoteUser['onboarded_at']) ? now()->parse($remoteUser['onboarded_at']) : null,
            'timezone' => $remoteUser['timezone'] ?? null,
        ];

        if (! User::where('email', strtolower($remoteUser['email']))->exists()) {
            $attributes['id'] = $remoteUser['id'];
        }

        return User::updateOrCreate(['email' => strtolower($remoteUser['email'])], $attributes);
    }

    /**
     * Best-effort full sync right after a successful sign-in so the first
     * screen renders with fresh data. Never blocks or throws.
     */
    public static function syncAfterLogin(User $user): void
    {
        if (! BackendClient::isClient()) {
            return;
        }

        try {
            app(\App\Services\Sync\ContentSyncService::class)->pull();
            $userSync = app(\App\Services\Sync\UserSyncService::class);
            $userSync->push($user);
            $userSync->pull($user);
        } catch (\Throwable $e) {
            // Best-effort - don't block login if sync fails.
        }
    }
}
