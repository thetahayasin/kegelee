<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The sync API authenticates with the per-user X-User-Token issued at
 * sign-in (ResolveApiUser). There is deliberately no shared app key, and the
 * legacy email/password-hash header scheme must never authenticate anything.
 */
class SyncAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_pull_requires_a_token(): void
    {
        $this->getJson('/api/v1/user/pull')->assertStatus(401);
    }

    public function test_legacy_header_scheme_does_not_authenticate(): void
    {
        $user = User::factory()->create();

        $this->withHeaders([
            'Authorization' => 'Bearer some-old-app-key',
            'X-User-Email' => $user->email,
            'X-User-Password-Hash' => $user->password,
        ])->getJson('/api/v1/user/pull')->assertStatus(401);
    }

    public function test_wrong_token_does_not_authenticate(): void
    {
        User::factory()->create();

        $this->withHeaders(['X-User-Token' => str_repeat('x', 64)])
            ->getJson('/api/v1/user/pull')
            ->assertStatus(401);
    }

    public function test_valid_token_pulls_the_owning_users_state(): void
    {
        $user = User::factory()->create();

        $response = $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull');

        $response->assertStatus(200);
        $response->assertJsonPath('user.id', $user->id);
        $response->assertJsonStructure([
            'user' => ['id', 'name', 'email', 'level_id', 'onboarded'],
            'workout_sessions',
            'measurements',
            'reminders',
            'training_days',
            'subscriptions',
        ]);
    }

    public function test_unverified_accounts_token_is_rejected(): void
    {
        // register hands out a token before the email code is confirmed; the
        // API must still refuse it until the account verifies (ResolveApiUser).
        $user = User::factory()->unverified()->create();

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->getJson('/api/v1/user/pull')
            ->assertStatus(401);
    }
}
