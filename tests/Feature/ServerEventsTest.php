<?php

namespace Tests\Feature;

use App\Models\AccountDeletion;
use App\Models\EmailCode;
use App\Models\User;
use App\Models\UserEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The events only the SERVER can honestly record.
 *
 * An account really being created, a sign-in really working, a code really
 * being right: the device can only report what it believes happened, and the
 * whole point of these is that they are written by the side that knows.
 *
 * Every one of them is wrapped in rescue() in the controller, so the other
 * half of this file's job is proving that the auth endpoints still behave
 * exactly as they did.
 */
class ServerEventsTest extends TestCase
{
    use RefreshDatabase;

    private function register(array $over = [])
    {
        return $this->postJson('/api/v1/auth/register', array_merge([
            'name' => 'Alex',
            'email' => 'alex@example.com',
            'password' => 'secret1',
        ], $over));
    }

    public function test_registering_records_one_account_created(): void
    {
        $this->register()->assertOk();

        $user = User::where('email', 'alex@example.com')->sole();

        $created = UserEvent::where('user_id', $user->id)
            ->where('name', UserEvent::ACCOUNT_CREATED)
            ->get();

        $this->assertCount(1, $created);
        $this->assertSame('email', $created->first()->subject);
    }

    public function test_registering_records_the_code_we_emailed(): void
    {
        $this->register()->assertOk();

        $user = User::where('email', 'alex@example.com')->sole();

        $this->assertDatabaseHas('user_events', [
            'user_id' => $user->id,
            'name' => UserEvent::EMAIL_CODE_SENT,
            'subject' => 'verify',
        ]);
    }

    public function test_a_code_sent_to_an_address_with_no_account_is_not_recorded(): void
    {
        // "Forgot password" answers the same way whether or not the account
        // exists, on purpose. There is nobody to file this against, and
        // inventing a user for it would put that same answer in the database.
        \App\Services\CodeSender::send('nobody@example.com', 'reset');

        $this->assertSame(0, UserEvent::where('name', UserEvent::EMAIL_CODE_SENT)->count());
    }

    public function test_signing_in_records_logged_in(): void
    {
        $user = User::factory()->create([
            'email' => 'in@example.com',
            'password' => 'secret1',
            'email_verified_at' => now(),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'in@example.com',
            'password' => 'secret1',
        ])->assertOk();

        $this->assertDatabaseHas('user_events', [
            'user_id' => $user->id,
            'name' => UserEvent::LOGGED_IN,
            'subject' => 'email',
        ]);
    }

    public function test_a_failed_sign_in_records_nothing(): void
    {
        User::factory()->create([
            'email' => 'in@example.com',
            'password' => 'secret1',
            'email_verified_at' => now(),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'in@example.com',
            'password' => 'wrong-one1',
        ])->assertStatus(401);

        $this->assertSame(0, UserEvent::where('name', UserEvent::LOGGED_IN)->count());
    }

    public function test_the_right_code_records_a_verification(): void
    {
        $user = User::factory()->create(['email' => 'v@example.com', 'email_verified_at' => null]);
        $code = EmailCode::issue('v@example.com', 'verify');

        $this->postJson('/api/v1/auth/verify', [
            'email' => 'v@example.com',
            'code' => $code->code,
        ])->assertOk();

        $this->assertDatabaseHas('user_events', [
            'user_id' => $user->id,
            'name' => UserEvent::EMAIL_CODE_VERIFIED,
            'subject' => 'verify',
        ]);
    }

    public function test_a_wrong_code_records_a_failure_marked_invalid(): void
    {
        $user = User::factory()->create(['email' => 'v@example.com', 'email_verified_at' => null]);
        EmailCode::issue('v@example.com', 'verify');

        $this->postJson('/api/v1/auth/verify', [
            'email' => 'v@example.com',
            'code' => '000000',
        ])->assertStatus(422);

        $row = UserEvent::where('user_id', $user->id)
            ->where('name', UserEvent::EMAIL_CODE_FAILED)
            ->sole();

        $this->assertSame('verify', $row->subject);
        $this->assertSame('invalid', $row->detail);
    }

    public function test_an_expired_code_records_a_failure_marked_expired(): void
    {
        // Worth separating: a run of expired codes means the email is arriving
        // too slowly, which is a mail problem, and a run of invalid ones is a
        // person mistyping or a machine guessing.
        $user = User::factory()->create(['email' => 'v@example.com', 'email_verified_at' => null]);
        $code = EmailCode::issue('v@example.com', 'verify');
        $code->update(['expires_at' => now()->subMinute()]);

        $this->postJson('/api/v1/auth/verify', [
            'email' => 'v@example.com',
            'code' => $code->code,
        ])->assertStatus(422);

        $row = UserEvent::where('user_id', $user->id)
            ->where('name', UserEvent::EMAIL_CODE_FAILED)
            ->sole();

        $this->assertSame('expired', $row->detail);
    }

    public function test_five_wrong_codes_for_one_address_earns_a_wait(): void
    {
        // On top of the guess budget the code itself carries: asking for a
        // fresh code between guesses would otherwise buy five more every time.
        User::factory()->create(['email' => 'v@example.com', 'email_verified_at' => null]);
        EmailCode::issue('v@example.com', 'verify');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/verify', ['email' => 'v@example.com', 'code' => '000000']);
        }

        $this->postJson('/api/v1/auth/verify', ['email' => 'v@example.com', 'code' => '000000'])
            ->assertStatus(429);
    }

    public function test_the_email_case_does_not_get_around_the_limiter(): void
    {
        User::factory()->create(['email' => 'v@example.com', 'email_verified_at' => null]);
        EmailCode::issue('v@example.com', 'reset');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/reset', [
                'email' => 'v@example.com',
                'code' => '000000',
                'password' => 'newpass1',
            ]);
        }

        $this->postJson('/api/v1/auth/reset', [
            'email' => 'V@Example.COM',
            'code' => '000000',
            'password' => 'newpass1',
        ])->assertStatus(429);
    }

    public function test_deleting_an_account_leaves_a_tally_mark_and_nothing_else(): void
    {
        $user = User::factory()->create(['email' => 'bye@example.com', 'created_at' => now()->subDays(12)]);
        $code = EmailCode::issue('bye@example.com', 'delete');

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/delete', ['code' => $code->code])
            ->assertOk();

        $this->assertSame(0, User::where('id', $user->id)->count());

        $row = AccountDeletion::sole();
        $this->assertSame(12, $row->days_since_signup);
        $this->assertFalse($row->had_subscription);
        $this->assertSame(0, $row->sessions_done);

        // The whole point: the row cannot be traced back to anybody.
        $this->assertArrayNotHasKey('user_id', $row->getAttributes());
    }

    // ─── The code's own guess budget ────────────────────────────────────────

    public function test_the_attempt_cap_is_counted_in_the_database(): void
    {
        // Counted with a conditional increment rather than read-then-write, so
        // two requests arriving together cannot both read four and both write
        // five - which is how a cap of five turns into a cap of nobody knows.
        $issued = EmailCode::issue('cap@example.com', 'verify');
        $wrong = $issued->code === '000000' ? '111111' : '000000';

        for ($i = 0; $i < EmailCode::MAX_ATTEMPTS - 1; $i++) {
            $this->assertFalse(EmailCode::verify('cap@example.com', $wrong, 'verify'));
        }

        $this->assertSame(EmailCode::MAX_ATTEMPTS - 1, (int) $issued->fresh()->attempts);

        // The last allowed guess burns the code rather than bumping it again.
        $this->assertFalse(EmailCode::verify('cap@example.com', $wrong, 'verify'));
        $this->assertNull($issued->fresh());
    }

    public function test_a_code_that_has_spent_its_budget_is_refused_even_when_it_is_right(): void
    {
        $issued = EmailCode::issue('cap@example.com', 'verify');
        $issued->update(['attempts' => EmailCode::MAX_ATTEMPTS]);

        $this->assertFalse(EmailCode::verify('cap@example.com', $issued->code, 'verify'));
        $this->assertNull($issued->fresh());
    }

    public function test_a_fresh_code_starts_the_budget_again(): void
    {
        $issued = EmailCode::issue('cap@example.com', 'verify');
        $issued->update(['attempts' => 3]);

        $reissued = EmailCode::issue('cap@example.com', 'verify');

        $this->assertSame(0, (int) $reissued->attempts);
        $this->assertTrue(EmailCode::verify('cap@example.com', $reissued->code, 'verify'));
    }
}
