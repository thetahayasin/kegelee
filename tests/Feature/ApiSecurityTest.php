<?php

namespace Tests\Feature;

use App\Models\EmailCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Hardening guarantees for the auth surface: emailed 6-digit codes cannot be
 * brute-forced (attempt cap), and a password reset revokes every previously
 * issued API token.
 */
class ApiSecurityTest extends TestCase
{
    use RefreshDatabase;

    /** A code that differs from the issued one. */
    private function wrongCode(EmailCode $issued): string
    {
        return $issued->code === '000000' ? '000001' : '000000';
    }

    public function test_email_codes_burn_after_too_many_wrong_guesses(): void
    {
        $issued = EmailCode::issue('a@example.com', 'reset');
        $wrong = $this->wrongCode($issued);

        for ($i = 0; $i < EmailCode::MAX_ATTEMPTS; $i++) {
            $this->assertFalse(EmailCode::verify('a@example.com', $wrong, 'reset'));
        }

        // Burned: even the real code no longer verifies.
        $this->assertFalse(EmailCode::verify('a@example.com', $issued->code, 'reset'));
        $this->assertDatabaseMissing('email_codes', ['email' => 'a@example.com']);
    }

    public function test_email_code_still_works_below_the_attempt_cap(): void
    {
        $issued = EmailCode::issue('b@example.com', 'verify');
        $wrong = $this->wrongCode($issued);

        for ($i = 0; $i < EmailCode::MAX_ATTEMPTS - 1; $i++) {
            $this->assertFalse(EmailCode::verify('b@example.com', $wrong, 'verify'));
        }

        $this->assertTrue(EmailCode::verify('b@example.com', $issued->code, 'verify'));
    }

    public function test_password_reset_rotates_the_api_token(): void
    {
        $user = User::factory()->create(['email' => 'reset@example.com']);
        $oldToken = $user->apiToken();
        $code = EmailCode::issue('reset@example.com', 'reset')->code;

        $response = $this->postJson('/api/v1/auth/reset', [
            'email' => 'reset@example.com',
            'code' => $code,
            'password' => 'newpass1',
        ]);

        $response->assertStatus(200);
        $newToken = $response->json('user.api_token');
        $this->assertNotSame($oldToken, $newToken);

        // Every pre-reset token is dead; the fresh one authenticates.
        $this->withHeaders(['X-User-Token' => $oldToken])
            ->getJson('/api/v1/user/pull')
            ->assertStatus(401);
        $this->withHeaders(['X-User-Token' => $newToken])
            ->getJson('/api/v1/user/pull')
            ->assertStatus(200);
    }
}
