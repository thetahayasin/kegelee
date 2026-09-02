<?php

namespace Tests\Feature;

use App\Mail\CodeMail;
use App\Models\AccountDeletion;
use App\Models\EmailCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * The deletion route that has to work with no app installed.
 *
 * Google Play checks this URL from a browser, and the person using it has
 * usually uninstalled the app already - there is no token, no session and no
 * device. What this pins: it deletes, it refuses a wrong code, and it answers
 * an address with no account exactly as it answers one with an account, so a
 * public form cannot be used to ask who uses this app.
 */
class AccountDeletionWebTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        RateLimiter::clear('delete-code127.0.0.1');
    }

    private function makeUser(string $email = 'leaver@example.com'): User
    {
        return User::create([
            'name' => 'Leaver',
            'email' => $email,
            'password' => Hash::make('secret-password'),
        ]);
    }

    public function test_the_page_is_public(): void
    {
        $this->get('/delete-account')
            ->assertOk()
            ->assertSee('Delete your account');
    }

    public function test_it_emails_a_code_and_moves_to_the_confirmation_step(): void
    {
        $user = $this->makeUser();

        $this->post('/delete-account/code', ['email' => $user->email])
            ->assertRedirect(route('account.delete'));

        Mail::assertSent(CodeMail::class);
        $this->assertDatabaseHas('email_codes', ['email' => $user->email, 'purpose' => 'delete']);

        $this->get('/delete-account')->assertSee('Step 2 of 2', false);
    }

    public function test_an_unknown_address_is_answered_the_same_way_but_mails_nobody(): void
    {
        $this->post('/delete-account/code', ['email' => 'nobody@example.com'])
            ->assertRedirect(route('account.delete'))
            ->assertSessionHasNoErrors();

        Mail::assertNothingSent();
        $this->assertDatabaseCount('email_codes', 0);

        // Same screen, same wording, so the two cases are indistinguishable.
        $this->get('/delete-account')->assertSee('Step 2 of 2', false);
    }

    public function test_a_wrong_code_deletes_nothing(): void
    {
        $user = $this->makeUser();

        $this->post('/delete-account/code', ['email' => $user->email]);
        $this->post('/delete-account', ['code' => '000000'])
            ->assertSessionHasErrors('code');

        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_the_right_code_deletes_the_account_and_its_data(): void
    {
        $user = $this->makeUser();
        $user->measurements()->create(['seconds' => 12.5, 'measured_at' => now()]);

        $this->post('/delete-account/code', ['email' => $user->email]);
        $code = EmailCode::where('email', $user->email)->where('purpose', 'delete')->value('code');

        $this->post('/delete-account', ['code' => $code])
            ->assertRedirect(route('account.deleted'));

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('measurements', ['user_id' => $user->id]);

        // The anonymous tally the API path writes too - it is the only thing
        // that survives, and it carries nothing identifying.
        $this->assertSame(1, AccountDeletion::count());

        $this->get('/delete-account/done')->assertOk()->assertSee('Account deleted');
    }

    public function test_confirming_without_asking_for_a_code_starts_over(): void
    {
        $this->post('/delete-account', ['code' => '123456'])
            ->assertRedirect(route('account.delete'))
            ->assertSessionHasNoErrors();
    }
}
