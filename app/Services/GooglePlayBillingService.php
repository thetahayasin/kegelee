<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GooglePlayBillingService
{
    private string $packageName;
    private array $serviceAccount;

    public function __construct()
    {
        $this->packageName = config('services.google_play.package_name');
        $raw = config('services.google_play.service_account_json', '{}');
        $this->serviceAccount = is_array($raw) ? $raw : (json_decode($raw, true) ?? []);
    }

    /**
     * Verify a subscription purchase with the Google Play Developer API.
     * Returns the raw purchase resource on success.
     *
     * @throws \RuntimeException
     */
    public function verifySubscription(string $productId, string $purchaseToken): array
    {
        $url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
            . "/{$this->packageName}/purchases/subscriptions/{$productId}/tokens/{$purchaseToken}";

        $response = Http::withToken($this->accessToken())->get($url);

        if ($response->failed()) {
            throw new \RuntimeException("Google Play verification failed [{$response->status()}]: {$response->body()}");
        }

        return $response->json();
    }

    /**
     * Acknowledge a subscription so Google stops voiding it after 3 days.
     */
    public function acknowledgeSubscription(string $productId, string $purchaseToken): void
    {
        $url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
            . "/{$this->packageName}/purchases/subscriptions/{$productId}/tokens/{$purchaseToken}:acknowledge";

        $response = Http::withToken($this->accessToken())->post($url);

        if ($response->failed()) {
            Log::warning('Google Play acknowledge failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
        }
    }

    /**
     * Cancel a subscription on Google Play (admin-initiated).
     */
    public function cancelSubscription(string $productId, string $purchaseToken): void
    {
        $url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
            . "/{$this->packageName}/purchases/subscriptions/{$productId}/tokens/{$purchaseToken}:cancel";

        Http::withToken($this->accessToken())->post($url);
    }

    // -------------------------------------------------------------------------

    private function accessToken(): string
    {
        return Cache::remember('google_play_access_token', 3500, function () {
            $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $this->buildJwt(),
            ]);

            if ($response->failed()) {
                throw new \RuntimeException("Failed to get Google access token: {$response->body()}");
            }

            return $response->json('access_token');
        });
    }

    private function buildJwt(): string
    {
        $now = time();

        $header = $this->base64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $payload = $this->base64url(json_encode([
            'iss' => $this->serviceAccount['client_email'] ?? '',
            'scope' => 'https://www.googleapis.com/auth/androidpublisher',
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600,
        ]));

        $signingInput = "{$header}.{$payload}";

        $key = openssl_pkey_get_private($this->serviceAccount['private_key'] ?? '');
        if (! $key) {
            throw new \RuntimeException('Invalid Google service account private key.');
        }

        openssl_sign($signingInput, $signature, $key, OPENSSL_ALGO_SHA256);

        return "{$signingInput}.{$this->base64url($signature)}";
    }

    private function base64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
