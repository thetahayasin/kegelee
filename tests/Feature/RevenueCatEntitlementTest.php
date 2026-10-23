<?php

namespace Tests\Feature;

use App\Services\RevenueCatService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * What counts as "this subscriber is entitled".
 *
 * The old reading was generous in two ways that both handed out the paid app.
 * It fell back to ANY active entitlement "if named differently", so a
 * promotional or test entitlement created in the RevenueCat dashboard - or one
 * belonging to another app on the same project - unlocked this one. And it
 * treated a missing expires_date as lifetime access, when every plan in the
 * catalogue is recurring and a null expiry only ever means a malformed payload.
 */
class RevenueCatEntitlementTest extends TestCase
{
    use RefreshDatabase;

    private function service(): RevenueCatService
    {
        return app(RevenueCatService::class);
    }

    private function subscriber(array $entitlements): array
    {
        return ['entitlements' => $entitlements];
    }

    public function test_the_configured_entitlement_grants_while_it_runs(): void
    {
        $entitlement = $this->service()->getActiveEntitlement($this->subscriber([
            'premium' => ['expires_date' => now()->addMonth()->toIso8601String()],
        ]));

        $this->assertNotNull($entitlement);
    }

    public function test_an_expired_entitlement_grants_nothing(): void
    {
        $this->assertNull($this->service()->getActiveEntitlement($this->subscriber([
            'premium' => ['expires_date' => now()->subDay()->toIso8601String()],
        ])));
    }

    /** The fallback that used to accept anything active, whatever it was for. */
    public function test_an_entitlement_by_another_name_grants_nothing(): void
    {
        $this->assertNull($this->service()->getActiveEntitlement($this->subscriber([
            'some_other_app_entitlement' => ['expires_date' => now()->addYear()->toIso8601String()],
            'internal_test_grant' => ['expires_date' => now()->addYear()->toIso8601String()],
        ])));
    }

    /** No plan here is lifetime, so a missing expiry is a broken payload. */
    public function test_a_missing_expiry_is_not_lifetime_access(): void
    {
        $this->assertNull($this->service()->getActiveEntitlement($this->subscriber([
            'premium' => ['product_identifier' => 'premium_monthly'],
        ])));

        $this->assertNull($this->service()->getActiveEntitlement($this->subscriber([
            'premium' => ['expires_date' => null],
        ])));
    }

    public function test_a_subscriber_with_no_entitlements_grants_nothing(): void
    {
        $this->assertNull($this->service()->getActiveEntitlement([]));
        $this->assertNull($this->service()->getActiveEntitlement($this->subscriber([])));
    }

    // ------------------------------------------------------- product identifier

    public function test_the_base_plan_is_rejoined_to_the_subscription_id(): void
    {
        $this->assertSame('premium_monthly:p3m', $this->service()->entitlementProductId([
            'product_identifier' => 'premium_monthly',
            'product_plan_identifier' => 'p3m',
        ]));
    }

    public function test_an_identifier_that_already_carries_the_base_plan_is_left_alone(): void
    {
        $this->assertSame('premium_monthly:p1y', $this->service()->entitlementProductId([
            'product_identifier' => 'premium_monthly:p1y',
            'product_plan_identifier' => 'monthly',
        ]));
    }

    public function test_a_bare_subscription_id_is_returned_unchanged(): void
    {
        // It names no price on its own, and resolvePlan refuses it - which is
        // the point. Inventing a base plan here would be the guess.
        $this->assertSame('premium_monthly', $this->service()->entitlementProductId([
            'product_identifier' => 'premium_monthly',
        ]));

        $this->assertNull($this->service()->entitlementProductId([]));
    }

    // ------------------------------------------------------------- ownership

    public function test_the_original_app_user_id_proves_ownership(): void
    {
        $this->assertTrue($this->service()->subscriberOwnsUser(
            ['original_app_user_id' => '42'],
            '42',
        ));
    }

    public function test_an_alias_proves_ownership(): void
    {
        // Accounts get merged, and the id we ask about is then an alias rather
        // than the original.
        $this->assertTrue($this->service()->subscriberOwnsUser(
            ['original_app_user_id' => 'anonymous-device-id', 'aliases' => ['anonymous-device-id', '42']],
            '42',
        ));
    }

    public function test_a_stranger_does_not_own_the_subscriber(): void
    {
        $this->assertFalse($this->service()->subscriberOwnsUser(
            ['original_app_user_id' => '42', 'aliases' => ['42']],
            '43',
        ));

        $this->assertFalse($this->service()->subscriberOwnsUser([], '42'));
        $this->assertFalse($this->service()->subscriberOwnsUser(['original_app_user_id' => '42'], ''));
    }
}
