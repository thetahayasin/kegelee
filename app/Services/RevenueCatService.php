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
     * Whether server-side verification is possible at all.
     *
     * Callers that treat "no active entitlement" as proof a purchase is fake
     * MUST check this first: without a REST key getSubscriber() returns an
     * empty array, which is indistinguishable from a real answer of "this
     * subscriber has nothing".
     */
    public function isConfigured(): bool
    {
        return $this->apiKey !== '';
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

    /** The entitlement identifier this app grants access on. */
    public function entitlementId(): string
    {
        return $this->entitlementId;
    }

    /**
     * The app's entitlement, if the subscriber currently holds it.
     *
     * Only the configured id counts. The old fallback returned "any active
     * entitlement if named differently", which meant a promotional or
     * test entitlement created in the RevenueCat dashboard - or one belonging
     * to a different app on the same project - unlocked this app.
     *
     * A null expiry is not lifetime access here. Every plan in the catalogue is
     * recurring, so RevenueCat always sends an expires_date; a missing one is a
     * malformed payload, and treating it as "never expires" is how an account
     * ends up entitled forever.
     */
    public function getActiveEntitlement(array $subscriber): ?array
    {
        $entitlement = $subscriber['entitlements'][$this->entitlementId] ?? null;

        if (! is_array($entitlement)) {
            return null;
        }

        $expiresDate = $entitlement['expires_date'] ?? null;
        if (! is_string($expiresDate) || $expiresDate === '') {
            return null;
        }

        $expiresAt = strtotime($expiresDate);

        return ($expiresAt !== false && $expiresAt > time()) ? $entitlement : null;
    }

    /**
     * The full base plan identifier an entitlement was granted by.
     *
     * Play splits a purchase across two fields: the subscription
     * (`premium_monthly`) and the base plan (`p3m`). Only the two joined name a
     * price, so anything that resolves a plan needs them back together. Ids
     * that already carry the suffix are left alone.
     */
    public function entitlementProductId(array $entitlement): ?string
    {
        $product = trim((string) ($entitlement['product_identifier'] ?? ''));
        if ($product === '') {
            return null;
        }

        if (str_contains($product, ':')) {
            return $product;
        }

        $basePlan = trim((string) ($entitlement['product_plan_identifier'] ?? ''));

        return $basePlan === '' ? $product : "{$product}:{$basePlan}";
    }

    /**
     * Does this subscriber actually belong to the given account?
     *
     * The app user id in a request body is a claim, not proof. RevenueCat's own
     * record of who the subscriber is - the original id plus every alias it has
     * been merged with - is, so anything that trusts a client-supplied id has
     * to check it against this.
     */
    public function subscriberOwnsUser(array $subscriber, string $userId): bool
    {
        $userId = trim($userId);
        if ($userId === '') {
            return false;
        }

        $owners = array_merge(
            [$subscriber['original_app_user_id'] ?? null],
            array_keys((array) ($subscriber['aliases'] ?? [])),
            array_values((array) ($subscriber['aliases'] ?? [])),
        );

        foreach ($owners as $owner) {
            if (is_string($owner) && trim($owner) !== '' && trim($owner) === $userId) {
                return true;
            }
        }

        return false;
    }

    /**
     * Resolve an internal Plan model from a RevenueCat product identifier.
     */
    /**
     * Resolve a store product id to a plan.
     *
     * Exact match, because the id IS the identifier. All three plans are base
     * plans of the single `premium_monthly` subscription, so the parent id on
     * its own names no plan: stripping the suffix would answer "1 Month" for a
     * yearly purchase and record a customer who paid $59.99 on the $5.99 plan.
     */
    public function resolvePlan(string $productId): ?Plan
    {
        $raw = trim($productId);
        if ($raw === '') {
            return null;
        }

        $appStoreSlug = array_search($raw, Plan::APP_STORE_PRODUCT_IDS, true);

        return Plan::where('is_active', true)
            ->where(function ($query) use ($raw, $appStoreSlug) {
                $query->where('store_product_id', $raw);
                if ($appStoreSlug !== false) {
                    $query->orWhere('slug', $appStoreSlug);
                }
            })
            ->first();
    }
}
