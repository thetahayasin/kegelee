<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SeedAppReviewerTest extends TestCase
{
    use RefreshDatabase;

    private array $credentialFiles = [];

    protected function tearDown(): void
    {
        foreach ($this->credentialFiles as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    private function credentials(array $overrides = []): string
    {
        $path = tempnam(sys_get_temp_dir(), 'reviewer-test-');
        $this->credentialFiles[] = $path;
        file_put_contents($path, json_encode($overrides + [
            'name' => 'App Review', 'email' => 'reviewer@example.test',
            'password' => 'LocalTestOnly9!password',
        ]));
        chmod($path, 0600);
        return $path;
    }

    public function test_it_creates_a_verified_reviewer_without_admin_privileges_or_store_billing(): void
    {
        $this->artisan('app:seed-reviewer', ['--credentials-file' => $this->credentials()])
            ->doesntExpectOutputToContain('LocalTestOnly9!password')->assertSuccessful();

        $user = User::where('email', 'reviewer@example.test')->firstOrFail();
        $this->assertFalse($user->is_admin);
        $this->assertNotNull($user->email_verified_at);
        $this->assertTrue(Hash::check('LocalTestOnly9!password', $user->password));
        $this->assertTrue($user->hasCompletedBasics());
        $this->assertTrue($user->isSubscribed());
        $sub = $user->activeSubscription();
        $this->assertSame('manual', $sub->store);
        $this->assertFalse($sub->auto_renewing);
        $this->assertTrue($sub->ends_at->isAfter(now()->addMonths(11)));
        $this->assertTrue($sub->ends_at->isBefore(now()->addMonths(13)));
        $this->postJson('/api/v1/auth/login', [
            'email' => 'reviewer@example.test', 'password' => 'LocalTestOnly9!password',
        ])->assertOk()->assertJsonPath('user.is_subscribed', true);
    }

    public function test_it_does_not_reset_or_grant_access_to_an_existing_account(): void
    {
        $user = User::factory()->create(['email' => 'reviewer@example.test']);
        $original = $user->fresh()->getAttributes();
        $this->artisan('app:seed-reviewer', ['--credentials-file' => $this->credentials()])->assertFailed();
        $this->assertSame($original, $user->fresh()->getAttributes());
        $this->assertSame(0, $user->subscriptions()->count());
    }

    public function test_invalid_credentials_do_not_create_an_account(): void
    {
        $this->artisan('app:seed-reviewer', ['--credentials-file' => $this->credentials(['password' => 'short'])])
            ->assertFailed();
        $this->assertDatabaseMissing('users', ['email' => 'reviewer@example.test']);
    }
}
