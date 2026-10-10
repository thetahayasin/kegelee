<?php

namespace Tests\Feature;

use App\Models\Level;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The app is free and the backend has no subscription machinery left.
 *
 * What remains is pinned here: anybody may choose a level and keep it, every
 * account is reported as entitled (older builds and the watch gate on that
 * flag), purchase tokens pushed by older builds are ignored, and the store
 * webhooks are gone.
 */
class FreeAppTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        return User::factory()->create([
            'level_id' => Level::where('number', 1)->value('id'),
            'onboarding_level' => 1,
            'email_verified_at' => now(),
        ]);
    }

    public function test_any_account_may_change_level_and_keep_it(): void
    {
        $user = $this->user();
        $level4 = Level::where('number', 4)->value('id');

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', ['level_id' => $level4])
            ->assertOk();

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull')
            ->assertOk()
            ->assertJsonPath('user.level_id', $level4)
            ->assertJsonPath('user.is_subscribed', true)
            ->assertJsonMissingPath('subscriptions');

        $this->assertSame($level4, (int) $user->fresh()->level_id);
    }

    public function test_purchase_tokens_from_older_builds_are_ignored(): void
    {
        $user = $this->user();

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', [
                'subscriptions' => [[
                    'purchase_token' => 'legacy-token',
                    'plan_slug' => 'premium-yearly',
                    'store' => 'revenuecat',
                ]],
            ])
            ->assertOk();

        $this->assertSame(0, $user->subscriptions()->count());
    }

    public function test_the_store_webhooks_are_gone(): void
    {
        $this->postJson('/webhooks/revenuecat', [])->assertNotFound();
        $this->postJson('/webhooks/google-play', [])->assertNotFound();
    }
}
