<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class GooglePlayBillingService
{
    private string $packageName;
    private array $serviceAccount;

    public function __construct(SettingsService $settings)
    {
        $this->packageName = $settings->get('google_play_package_name')
            ?: config('services.google_play.package_name', '');

        $raw = $settings->get('google_play_service_account_json')
            ?: config('services.google_play.service_account_json', '{}');

        $this->serviceAccount = is_array($raw) ? $raw : (json_decode((string) $raw, true) ?? []);
    }

    /**
     * Whether a Play API call can be attempted at all.
     *
     * Callers that report a store outcome to a human (the admin cancel button)
     * must check this first, so "we never asked Google" is never presented as
     * "Google agreed".
     */
    public function isConfigured(): bool
    {
        return $this->packageName !== ''
            && ! empty($this->serviceAccount['client_email'])
            && ! empty($this->serviceAccount['private_key']);
    }

    /**
     * Verify a subscription purchase with the Google Play Developer API.
     * Returns the raw purchase resource on success.
     *
     * Note that $productId here is the bare SUBSCRIPTION id
     * (`premium_monthly`), not a base plan id - see Plan::storeSubscriptionId().
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
     *
     * A failure here is not cosmetic: Google REFUNDS and revokes any purchase
     * left unacknowledged for three days. The old code logged a warning and
     * carried on, so the one signal that a customer was about to be refunded
     * sat in a log nobody reads while the app went on serving them. Throwing
     * puts it in front of the caller, which either retries (webhook) or logs it
     * as an error (purchase flow).
     *
     * @throws \RuntimeException
     */
    public function acknowledgeSubscription(string $productId, string $purchaseToken): bool
    {
        $url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
            . "/{$this->packageName}/purchases/subscriptions/{$productId}/tokens/{$purchaseToken}:acknowledge";

        $response = Http::withToken($this->accessToken())->post($url);

        if ($response->successful()) {
            return true;
        }

        // Already acknowledged is the state we wanted, not an error. Google
        // answers it with a 400 (occasionally 409) rather than a 200, and it
        // happens routinely when the app and this server both acknowledge.
        if ($this->isAlreadyDone($response->status(), (string) $response->body())) {
            return true;
        }

        throw new \RuntimeException(
            "Google Play acknowledge failed [{$response->status()}]: {$response->body()}"
        );
    }

    /**
     * Cancel a subscription on Google Play (admin-initiated).
     *
     * The result was thrown away, so an admin pressing Cancel saw success
     * whether or not Google had done anything - and the subscription billed
     * again a month later.
     *
     * @throws \RuntimeException
     */
    public function cancelSubscription(string $productId, string $purchaseToken): bool
    {
        $url = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
            . "/{$this->packageName}/purchases/subscriptions/{$productId}/tokens/{$purchaseToken}:cancel";

        $response = Http::withToken($this->accessToken())->post($url);

        if ($response->successful()) {
            return true;
        }

        if ($this->isAlreadyDone($response->status(), (string) $response->body())) {
            return true;
        }

        throw new \RuntimeException(
            "Google Play cancel failed [{$response->status()}]: {$response->body()}"
        );
    }

    /** Google's way of saying "this was already in the state you asked for". */
    private function isAlreadyDone(int $status, string $body): bool
    {
        if (! in_array($status, [400, 409], true)) {
            return false;
        }

        $body = strtolower($body);

        return str_contains($body, 'already acknowledged')
            || str_contains($body, 'already canceled')
            || str_contains($body, 'already cancelled');
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
