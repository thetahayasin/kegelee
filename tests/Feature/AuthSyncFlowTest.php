<?php

namespace Tests\Feature;

use App\Models\Level;
use App\Models\User;
use App\Services\Sync\BackendClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Livewire\Livewire;
use Tests\TestCase;

class AuthSyncFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'app.sync_api_key' => 'Y5PqnYAf8MIW1tM8XDTNLUMmRAxRuiRBkCA8BY6kBFt12Uuo',
            'app.content_sync_url' => 'https://ke.downloadh.com/api/v1/content',
        ]);
        // Set client mode
        $_SERVER['HTTP_HOST'] = '127.0.0.1';

        // Levels are seeded by the hardcoded-catalogue migration; make sure
        // level 1 exists for the foreign keys used below.
        $this->assertNotNull(Level::where('number', 1)->first());
    }

    public function test_remote_login_success_replicates_user_locally(): void
    {
        Http::fake([
            'ke.downloadh.com/api/v1/auth/login' => Http::response([
                'user' => [
                    'id' => 45,
                    'name' => 'Remote User',
                    'email' => 'remote@example.com',
                    'email_verified_at' => now()->subDay()->toIso8601String(),
                    'password_hash' => 'dummy_hash',
                    'is_admin' => false,
                    'level_id' => 1,
                    'level_started_days' => 0,
                    'onboarded_at' => null,
                    'timezone' => 'UTC',
                ]
            ], 200),
        ]);

        Livewire::test(\App\Livewire\App\Onboarding::class)
            ->set('email', 'remote@example.com')
            ->set('password', 'password123')
            ->call('login')
            ->assertHasNoErrors()
            ->assertRedirect(route('home'));

        $this->assertDatabaseHas('users', [
            'email' => 'remote@example.com',
            'name' => 'Remote User',
        ]);
    }

    public function test_remote_login_failure_reports_credentials_error(): void
    {
        Http::fake([
            'ke.downloadh.com/api/v1/auth/login' => Http::response([
                'error' => 'These credentials do not match our records.'
            ], 401),
        ]);

        Livewire::test(\App\Livewire\App\Onboarding::class)
            ->set('email', 'remote@example.com')
            ->set('password', 'wrong')
            ->call('login')
            ->assertHasErrors(['email' => 'Email or password is incorrect.']);
    }

    public function test_remote_login_unreachable_reports_connection_error(): void
    {
        Http::fake([
            'ke.downloadh.com/api/v1/auth/login' => Http::response([
                'error' => 'Invalid API key.'
            ], 401),
        ]);

        Livewire::test(\App\Livewire\App\Onboarding::class)
            ->set('email', 'remote@example.com')
            ->set('password', 'password123')
            ->call('login')
            ->assertHasErrors(['email' => 'Could not reach the server. Check your internet connection and try again.']);
    }

    public function test_remote_registration_validation_errors(): void
    {
        Http::fake([
            'ke.downloadh.com/api/v1/auth/register' => Http::response([
                'message' => 'The email has already been taken.',
                'errors' => [
                    'email' => ['The email has already been taken.']
                ]
            ], 422),
        ]);

        Livewire::test(\App\Livewire\App\Onboarding::class)
            ->set('name', 'Some Name')
            ->set('email', 'existing@example.com')
            ->set('password', 'password123')
            ->set('password_confirmation', 'password123')
            ->call('register')
            ->assertHasErrors(['email' => 'The email has already been taken.']);
    }

    public function test_remote_verification_success(): void
    {
        Http::fake([
            'ke.downloadh.com/api/v1/auth/verify' => Http::response([
                'user' => [
                    'id' => 99,
                    'name' => 'Verified User',
                    'email' => 'verified@example.com',
                    'email_verified_at' => now()->toIso8601String(),
                    'password_hash' => 'dummy_hash',
                    'is_admin' => false,
                    'level_id' => 1,
                    'level_started_days' => 0,
                    'onboarded_at' => null,
                    'timezone' => 'UTC',
                ]
            ], 200),
        ]);

        session(['verify_email' => 'verified@example.com']);

        Livewire::test(\App\Livewire\Auth\Verify::class)
            ->set('code', '123456')
            ->call('verify')
            ->assertHasNoErrors()
            ->assertRedirect(route('home'));

        $this->assertDatabaseHas('users', [
            'email' => 'verified@example.com',
            'name' => 'Verified User',
        ]);
    }

    public function test_remote_verification_not_found(): void
    {
        Http::fake([
            'ke.downloadh.com/api/v1/auth/verify' => Http::response([
                'error' => 'User not found.'
            ], 404),
        ]);

        session(['verify_email' => 'missing@example.com']);

        Livewire::test(\App\Livewire\Auth\Verify::class)
            ->set('code', '123456')
            ->call('verify')
            ->assertHasErrors(['code' => 'User not found.']);
    }

    public function test_remote_resend_rate_limiting(): void
    {
        Http::fake([
            'ke.downloadh.com/api/v1/auth/resend' => Http::response([
                'error' => 'Too many requests.'
            ], 429),
        ]);

        session(['verify_email' => 'rate@example.com']);

        Livewire::test(\App\Livewire\Auth\Verify::class)
            ->call('resend')
            ->assertHasErrors(['code' => 'Too many requests. Try again later.']);
    }

    public function test_remote_login_does_not_fallback_to_local_auth_when_offline(): void
    {
        $user = User::factory()->create([
            'email' => 'local@example.com',
            'password' => bcrypt('password123'),
        ]);

        // Mock remote server to be offline / throw connection exception
        Http::fake([
            'ke.downloadh.com/api/v1/auth/login' => function () {
                throw new \Illuminate\Http\Client\ConnectionException('Connection refused');
            }
        ]);

        Livewire::test(\App\Livewire\App\Onboarding::class)
            ->set('email', 'local@example.com')
            ->set('password', 'password123')
            ->call('login')
            ->assertHasErrors(['email' => 'Could not reach the server. Check your internet connection and try again.']);

        $this->assertFalse(auth()->check());
    }

    public function test_user_sync_pull_replicates_subscriptions(): void
    {
        $user = User::factory()->create([
            'email' => 'sync-subs@example.com',
        ]);

        \App\Models\Plan::create([
            'id' => 10,
            'name' => 'Monthly Sync Plan',
            'slug' => 'monthly-sync-plan',
            'price' => 9.99,
            'currency' => 'USD',
            'interval' => 'month',
            'interval_count' => 1,
            'is_active' => true,
        ]);

        Http::fake([
            'ke.downloadh.com/api/v1/user/pull' => Http::response([
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'password_hash' => $user->password,
                ],
                'workout_sessions' => [],
                'measurements' => [],
                'reminders' => [],
                'training_days' => [],
                'subscriptions' => [[
                    'id' => 100,
                    'plan_id' => 10,
                    'discount_id' => null,
                    'status' => 'active',
                    'store' => 'stripe',
                    'store_transaction_id' => 'tx_123',
                    'purchase_token' => null,
                    'google_order_id' => null,
                    'trial_ends_at' => null,
                    'started_at' => now()->subDays(5)->toIso8601String(),
                    'ends_at' => now()->addDays(25)->toIso8601String(),
                    'canceled_at' => null,
                    'auto_renewing' => true,
                ]]
            ], 200),
        ]);

        $svc = app(\App\Services\Sync\UserSyncService::class);
        $ok = $svc->pull($user);

        $this->assertTrue($ok);
        $this->assertSame(1, $user->subscriptions()->count());
        $sub = $user->subscriptions()->first();
        $this->assertSame(100, $sub->id);
        $this->assertSame(10, $sub->plan_id);
        $this->assertSame('active', $sub->status);
        $this->assertSame('stripe', $sub->store);
        $this->assertTrue($user->isSubscribed());
    }
}
