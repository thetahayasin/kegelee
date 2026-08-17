<?php

namespace App\Services;

use App\Models\Plan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class RevenueCatService
{
    private string $apiKey;
    private string $entitlementId;

    public function __construct(SettingsService $settings)
    {
        $this->apiKey = (string) ($settings->get('revenuecat_api_key') ?: config('services.revenuecat.api_key', ''));
        $this->entitlementId = (string) ($settings->get('revenuecat_entitlement_id') ?: config('services.revenuecat.entitlement_id', 'premium'));
    }

    /**
     * Get the subscriber object from RevenueCat REST API v1.
     *
     * @throws \RuntimeException
     */
    public function getSubscriber(string $appUserId): array
    {
        if (empty($this->apiKey)) {
            Log::warning('RevenueCat API key is not configured.');
            return [];
        }

        $url = "https://api.revenuecat.com/v1/subscribers/" . urlencode($appUserId);

        $response = Http::withHeaders([
            'Authorization' => "Bearer {$this->apiKey}",
            'Accept'        => 'application/json',
        ])->timeout(10)->get($url);

        if ($response->failed()) {
            throw new \RuntimeException("RevenueCat API request failed [{$response->status()}]: {$response->body()}");
        }

        $data = $response->json();

        return $data['subscriber'] ?? [];
    }

    /**
     * Inspect whether a subscriber has an active entitlement for the app.
     */
    public function getActiveEntitlement(array $subscriber): ?array
    {
        $entitlements = $subscriber['entitlements'] ?? [];

        if (isset($entitlements[$this->entitlementId])) {
            $ent = $entitlements[$this->entitlementId];
            $expiresDate = $ent['expires_date'] ?? null;
            if ($expiresDate === null || strtotime($expiresDate) > time()) {
                return $ent;
            }
        }

        // Search any active entitlement if named differently
        foreach ($entitlements as $ent) {
            $expiresDate = $ent['expires_date'] ?? null;
            if ($expiresDate === null || strtotime($expiresDate) > time()) {
                return $ent;
            }
        }

        return null;
    }

    /**
     * Resolve an internal Plan model from a RevenueCat product identifier.
     */
    public function resolvePlan(string $productId): ?Plan
    {
        // Strip store-specific suffixes if present (e.g. premium_monthly:base_plan)
        $cleanId = explode(':', $productId)[0];

        $plan = Plan::where('store_product_id', $cleanId)->where('is_active', true)->first();
        if ($plan) {
            return $plan;
        }

        // Check fallback by slug
        return Plan::where('slug', $cleanId)->first();
    }
}
