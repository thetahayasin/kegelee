<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The free, ad-supported build (config app.free_app).
 *
 * The phone opens every feature on its own, but the server owns the level and
 * the free day cap. If it kept the paid rules, a free account's level change
 * would be refused on push and undone on the next pull, so this pins that the
 * switch reaches all three: the push guard, the lapse revert and the
 * `is_subscribed` the devices (phone and watch) read.
 */
class FreeAppModeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.free_app' => true]);
        $this->seed(\Database\Seeders\PlanSeeder::class);
    }

    private function user(): User
    {
        return User::factory()->create([
            'level_id' => 1,
            'onboarding_level' => 1,
            'email_verified_at' => now(),
        ]);
    }

    public function test_a_non_paying_account_may_change_level_and_keep_it(): void
    {
        $user = $this->user();

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', ['level_id' => 4])
            ->assertOk();
        $this->assertSame(4, (int) $user->fresh()->level_id);

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull')
            ->assertOk()
            ->assertJsonPath('user.level_id', 4)
            ->assertJsonPath('user.is_subscribed', true);
        $this->assertSame(4, (int) $user->fresh()->level_id);
    }

    public function test_paying_still_means_paying(): void
    {
        $user = $this->user();

        $this->assertTrue($user->hasPremiumAccess());
        // Reports and the admin console count real subscribers only.
        $this->assertFalse($user->isSubscribed());
    }
}
