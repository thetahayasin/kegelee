<?php

namespace Tests\Feature;

use App\Mail\CodeMail;
use App\Support\Locales;
use App\Support\MailTranslations;
use Tests\TestCase;

class CodeMailTranslationTest extends TestCase
{
    private function render(string $purpose, ?string $locale): string
    {
        return (new CodeMail(
            code: '123456',
            purpose: $purpose,
            appName: 'Kegelee',
            langTag: $locale,
        ))->render();
    }

    private function subject(string $purpose, ?string $locale): string
    {
        $mail = new CodeMail(
            code: '123456',
            purpose: $purpose,
            appName: 'Kegelee',
            langTag: $locale,
        );

        return $mail->envelope()->subject;
    }

    public function test_every_supported_language_has_every_string(): void
    {
        $keys = array_keys(MailTranslations::BASE);

        foreach (array_keys(Locales::SUPPORTED) as $locale) {
            $strings = MailTranslations::strings($locale);

            foreach ($keys as $key) {
                $this->assertArrayHasKey($key, $strings, "$locale is missing $key");
                $this->assertNotSame('', trim($strings[$key]), "$locale has an empty $key");
            }
        }
    }

    public function test_reset_email_is_written_in_the_requested_language(): void
    {
        $html = $this->render('reset', 'de');

        $this->assertStringContainsString('Dein Code zum Zurücksetzen des Passworts', $html);
        $this->assertStringContainsString('Gib diesen 6-stelligen Code', $html);
        $this->assertStringNotContainsString('Your code to reset your password', $html);

        $this->assertSame('Kegelee - Code zum Zurücksetzen des Passworts', $this->subject('reset', 'de'));
    }

    public function test_the_app_name_lands_where_the_language_wants_it(): void
    {
        // :app is a placeholder rather than a prefix, so this is really
        // asserting that the substitution happens at all in a non-Latin script.
        $this->assertStringContainsString('Kegelee', $this->subject('reset', 'ja'));
        $this->assertStringNotContainsString(':app', $this->subject('reset', 'ja'));
    }

    public function test_deleting_an_account_no_longer_says_verify_your_email(): void
    {
        // 'delete' used to fall through to the verify branch, so the mail
        // confirming account deletion was headed "verify your email".
        $html = $this->render('delete', 'en');

        $this->assertStringContainsString('Your code to delete your account', $html);
        $this->assertStringNotContainsString('verify your email', $html);
        $this->assertSame('Kegelee - Account deletion code', $this->subject('delete', 'en'));
    }

    public function test_an_unknown_purpose_is_treated_as_verification(): void
    {
        $this->assertSame('Kegelee - Email verification code', $this->subject('nonsense', 'en'));
    }

    public function test_an_unknown_or_missing_language_falls_back_to_english(): void
    {
        foreach ([null, '', 'xx', 'klingon'] as $locale) {
            $html = $this->render('reset', $locale);
            $this->assertStringContainsString('Your code to reset your password', $html);
        }
    }

    public function test_a_regional_tag_resolves_to_the_closest_translation(): void
    {
        // de-AT has no file of its own; German is a far better answer than English.
        $this->assertStringContainsString(
            'Dein Code zum Zurücksetzen des Passworts',
            $this->render('reset', 'de-AT'),
        );
    }

    public function test_right_to_left_languages_set_the_direction(): void
    {
        $html = $this->render('reset', 'ar');

        $this->assertStringContainsString('dir="rtl"', $html);
        $this->assertStringContainsString('رمزك لإعادة تعيين كلمة المرور', $html);

        // The code itself stays left to right in every language - a six digit
        // number read back reversed is a support ticket.
        $this->assertStringContainsString('<div dir="ltr"', $html);
    }

    public function test_left_to_right_languages_are_not_flipped(): void
    {
        $this->assertStringContainsString('dir="ltr"', $this->render('reset', 'fr'));
        $this->assertStringNotContainsString('dir="rtl"', $this->render('reset', 'fr'));
    }

    public function test_the_code_survives_translation(): void
    {
        foreach (['en', 'ar', 'ja', 'de', 'th'] as $locale) {
            $this->assertStringContainsString('123456', $this->render('reset', $locale));
        }
    }
}
