<?php

namespace App\Services;

use App\Exceptions\AppleSignInException;
use App\Models\User;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class AppleSignInService
{
    private const ISSUER = 'https://appleid.apple.com';

    public function challenge(?int $deletingUserId = null): array
    {
        $this->clientSecret();
        $challenge = [
            'challenge_id' => (string) Str::uuid(),
            'nonce' => Str::random(64),
            'state' => Str::random(64),
        ];
        Cache::put('apple-auth:'.$challenge['challenge_id'], $challenge + [
            'deleting_user_id' => $deletingUserId,
        ], 300);

        return $challenge;
    }

    /** Only a fresh Apple authorization for this app and challenge can be used. */
    public function redeem(array $data, ?int $deletingUserId = null): array
    {
        $result = Cache::lock('apple-auth-lock:'.$data['challenge_id'], 60)->get(function () use ($data, $deletingUserId) {
            $challenge = Cache::pull('apple-auth:'.$data['challenge_id']);
            if (! is_array($challenge)
                || ($challenge['deleting_user_id'] ?? null) !== $deletingUserId
                || ! hash_equals($challenge['state'], $data['state'])) {
                throw new AppleSignInException('That Apple sign-in has expired. Please try again.');
            }

            $claims = $this->verifyIdentityToken($data['identity_token'], $challenge['nonce']);
            $response = $this->post('/auth/token', [
                'grant_type' => 'authorization_code',
                'code' => $data['authorization_code'],
            ]);
            if (! $response->ok() || ! is_string($response->json('refresh_token')) || $response->json('refresh_token') === ''
                || ! is_string($response->json('id_token'))) {
                throw new AppleSignInException('That Apple sign-in is invalid or has expired. Please try again.');
            }
            $confirmed = $this->verifyIdentityToken($response->json('id_token'), $challenge['nonce']);
            if (! hash_equals($claims['sub'], $confirmed['sub'])) {
                throw new AppleSignInException('That Apple sign-in could not be verified.');
            }

            return ['claims' => $claims, 'refresh_token' => $response->json('refresh_token')];
        });
        if (! is_array($result)) {
            throw new AppleSignInException('That Apple sign-in is already being used. Please try again.');
        }

        return $result;
    }

    public function verifyIdentityToken(string $token, string $nonce): array
    {
        try {
            $header = JWT::jsonDecode(JWT::urlsafeB64Decode(explode('.', $token)[0]));
            if (($header->alg ?? null) !== 'RS256' || ! is_string($header->kid ?? null)) {
                throw new \UnexpectedValueException('Invalid algorithm.');
            }
        } catch (\Throwable) {
            throw new AppleSignInException('That Apple sign-in could not be verified.');
        }

        $keys = $this->publicKeys();
        if (! collect($keys['keys'] ?? [])->contains('kid', $header->kid)) {
            Cache::forget('apple-sign-in:jwks');
            $keys = $this->publicKeys();
        }
        try {
            $claims = (array) JWT::decode($token, JWK::parseKeySet($keys, 'RS256'));
        } catch (\Throwable) {
            throw new AppleSignInException('That Apple sign-in is invalid or has expired.');
        }

        if (($claims['iss'] ?? null) !== self::ISSUER
            || ($claims['aud'] ?? null) !== config('services.apple.client_id')
            || ! is_string($claims['sub'] ?? null) || $claims['sub'] === ''
            || ! is_int($claims['exp'] ?? null) || $claims['exp'] <= time()
            || ! is_string($claims['nonce'] ?? null) || ! hash_equals($nonce, $claims['nonce'])) {
            throw new AppleSignInException('That Apple sign-in could not be verified.');
        }

        return $claims;
    }

    public function revoke(User $user): void
    {
        if (! $user->apple_refresh_token) {
            return;
        }
        $response = $this->post('/auth/revoke', [
            'token' => $user->apple_refresh_token,
            'token_type_hint' => 'refresh_token',
        ]);
        if (! $response->successful()) {
            throw new AppleSignInException('Apple access could not be revoked. Please try deleting your account again.', 502);
        }
    }

    private function publicKeys(): array
    {
        return Cache::remember('apple-sign-in:jwks', 3600, function () {
            try {
                $keys = Http::timeout(10)->get(self::ISSUER.'/auth/keys')->throw()->json();
                if (! is_array($keys) || empty($keys['keys'])) {
                    throw new \UnexpectedValueException('Missing signing keys.');
                }

                return $keys;
            } catch (\Throwable) {
                throw new AppleSignInException('Apple sign-in is temporarily unavailable. Please try again.', 502);
            }
        });
    }

    private function post(string $path, array $data): Response
    {
        $credentials = [
            'client_id' => config('services.apple.client_id'),
            'client_secret' => $this->clientSecret(),
        ];
        try {
            return Http::asForm()->timeout(10)->post(self::ISSUER.$path, $credentials + $data);
        } catch (\Throwable) {
            throw new AppleSignInException('Apple sign-in is temporarily unavailable. Please try again.', 502);
        }
    }

    private function clientSecret(): string
    {
        $keyPath = config('services.apple.private_key_path');
        if (! config('services.apple.key_id') || ! config('services.apple.team_id')
            || ! config('services.apple.client_id') || ! is_string($keyPath)
            || ! is_readable($keyPath)) {
            throw new AppleSignInException('Apple sign-in is not available yet. Please use email sign-in.', 503);
        }
        try {
            return JWT::encode([
                'iss' => config('services.apple.team_id'),
                'iat' => time(), 'exp' => time() + 300,
                'aud' => self::ISSUER,
                'sub' => config('services.apple.client_id'),
            ], file_get_contents($keyPath), 'ES256', config('services.apple.key_id'));
        } catch (\Throwable) {
            throw new AppleSignInException('Apple sign-in is not available yet. Please use email sign-in.', 503);
        }
    }
}
