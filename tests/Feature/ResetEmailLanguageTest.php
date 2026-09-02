<?php

namespace Tests\Feature;

use App\Mail\CodeMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * The header the app sends has to reach the email.
 *
 * CodeMailTranslationTest proves the mailable translates when handed a tag.
 * This proves the tag actually arrives - the reset endpoint takes an email
 * address and nothing else, so Accept-Language is the only thing connecting
 * the language somebody set in the app to the language they are written to in.
 */
class ResetEmailLanguageTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $email = 'reader@example.com'): User
    {
        return User::create([
            'name' => 'Reader',
            'email' => $email,
            'password' => Hash::make('secret-password'),
        ]);
    }

    private function requestReset(string $email, ?string $header): void
    {
        RateLimiter::clear('reset-code:'.strtolower($email));

        $headers = $header === null ? [] : ['Accept-Language' => $header];

        $this->postJson('/api/v1/auth/reset-code', ['email' => $email], $headers)
            ->assertOk()
            ->assertJson(['success' => true]);
    }

    public function test_the_reset_email_follows_the_apps_language(): void
    {
        Mail::fake();
        $user = $this->makeUser();

        $this->requestReset($user->email, 'de');

        Mail::assertSent(CodeMail::class, function (CodeMail $mail) {
            return $mail->langTag === 'de'
                && $mail->envelope()->subject === 'Kegelee - Code zum Zurücksetzen des Passworts';
        });
    }

    public function test_a_weighted_header_picks_the_best_supported_language(): void
    {
        Mail::fake();
        $user = $this->makeUser();

        // A real browser header. Klingon is not shipped; French is.
        $this->requestReset($user->email, 'tlh;q=0.9, fr-CA;q=0.8, en;q=0.1');

        Mail::assertSent(CodeMail::class, fn (CodeMail $mail) => $mail->langTag === 'fr');
    }

    public function test_no_header_still_sends_a_readable_email(): void
    {
        Mail::fake();
        $user = $this->makeUser();

        $this->requestReset($user->email, null);

        Mail::assertSent(CodeMail::class, function (CodeMail $mail) {
            return str_contains($mail->render(), 'Your code to reset your password');
        });
    }

    public function test_an_unknown_account_still_sends_nothing(): void
    {
        // The endpoint reports success either way so it cannot be used to
        // discover who has an account. Translation must not have changed that.
        Mail::fake();

        $this->requestReset('nobody@example.com', 'de');

        Mail::assertNothingSent();
    }
}
