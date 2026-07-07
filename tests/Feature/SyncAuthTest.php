<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SyncAuthTest extends TestCase
{
    use RefreshDatabase;

    private string $apiKey = 'testing-key-not-a-real-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.sync_api_key' => $this->apiKey]);
    }

    public function test_sync_requires_valid_api_key(): void
    {
        $response = $this->getJson('/api/v1/user/pull');
        $response->assertStatus(401);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer INVALID_KEY',
        ])->getJson('/api/v1/user/pull');
        $response->assertStatus(401);
    }

    public function test_sync_fails_without_user_headers(): void
    {
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->apiKey,
        ])->getJson('/api/v1/user/pull');

        $response->assertStatus(401);
    }

    public function test_sync_fails_with_invalid_password_hash(): void
    {
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password' => Hash::make('password123'),
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->apiKey,
            'X-User-Email' => $user->email,
            'X-User-Password-Hash' => 'wrong_hash_here',
        ])->getJson('/api/v1/user/pull');

        $response->assertStatus(401);
    }

    public function test_sync_succeeds_with_valid_api_key_and_user_headers(): void
    {
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password' => Hash::make('password123'),
        ]);

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $this->apiKey,
            'X-User-Email' => $user->email,
            'X-User-Password-Hash' => $user->password, // Send the actual hash
        ])->getJson('/api/v1/user/pull');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'user' => ['id', 'name', 'email', 'password_hash'],
            'workout_sessions',
            'measurements',
            'reminders',
            'training_days',
            'subscriptions',
        ]);
    }
}
