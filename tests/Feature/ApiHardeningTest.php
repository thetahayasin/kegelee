<?php

namespace Tests\Feature;

use App\Models\Reminder;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * The rules that keep one client from being everyone else's problem: request
 * limits, per-account isolation, and input that is rejected row by row rather
 * than by falling over.
 */
class ApiHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function push(User $as, array $payload)
    {
        return $this->withHeaders(['X-User-Token' => $as->apiToken()])
            ->postJson('/api/v1/user/push', $payload);
    }

    public function test_delete_code_is_throttled(): void
    {
        $user = User::factory()->create();

        // Six a minute, because every one of them costs an email.
        for ($i = 0; $i < 6; $i++) {
            $this->withHeaders(['X-User-Token' => $user->apiToken()])
                ->postJson('/api/v1/user/delete-code')
                ->assertOk();
        }

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/delete-code')
            ->assertStatus(429);
    }

    public function test_one_account_never_sees_another_accounts_data(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();

        $this->push($alice, ['workout_sessions' => [[
            'client_id' => 'alice-1',
            'duration_seconds' => 90,
            'completed_at_iso' => now()->toIso8601String(),
        ]]])->assertOk();

        $this->assertSame(1, WorkoutSession::where('user_id', $alice->id)->count());

        $pull = $this->withHeaders(['X-User-Token' => $bob->apiToken()])
            ->getJson('/api/v1/user/pull');

        $pull->assertOk();
        $this->assertSame([], $pull->json('workout_sessions'));
        $this->assertSame($bob->id, $pull->json('user.id'));
    }

    /**
     * A row the server cannot read is skipped and the push still succeeds
     * (200, not 422). The device clears its outbox on a 200, which is what we
     * want here: it would otherwise re-send the same unparseable row forever,
     * and one bad row would block every good one queued behind it.
     */
    public function test_an_unreadable_timestamp_skips_the_row_without_failing_the_push(): void
    {
        $user = User::factory()->create();

        $res = $this->push($user, ['workout_sessions' => [
            [
                'client_id' => 'bad-date',
                'duration_seconds' => 90,
                'completed_at_iso' => 'yesterday-ish',
            ],
            [
                'client_id' => 'good-date',
                'duration_seconds' => 90,
                'completed_at_iso' => now()->toIso8601String(),
            ],
        ]]);

        $res->assertOk();
        $res->assertJsonPath('synced.sessions', 1);

        $this->assertSame(1, WorkoutSession::where('user_id', $user->id)->count());
        $this->assertDatabaseMissing('workout_sessions', ['client_id' => 'bad-date']);
    }

    public function test_oversized_payloads_are_rejected(): void
    {
        $user = User::factory()->create();

        $sessions = [];
        for ($i = 0; $i <= 500; $i++) {
            $sessions[] = [
                'client_id' => "bulk-{$i}",
                'duration_seconds' => 60,
                'completed_at_iso' => now()->toIso8601String(),
            ];
        }

        $this->push($user, ['workout_sessions' => $sessions])
            ->assertStatus(422);

        $this->assertSame(0, WorkoutSession::where('user_id', $user->id)->count());
    }

    /**
     * Reminder times go straight into the app's alarm scheduler, so anything
     * that is not a real time of day is dropped on the way in rather than
     * halfway through scheduling a notification.
     */
    public function test_bad_reminder_times_are_sanitised(): void
    {
        $user = User::factory()->create();

        $this->push($user, ['reminders' => [[
            'weekday' => 1,
            'times' => ['25:00', '8:00', 'abc', '09:15', '21:45', null],
            'is_enabled' => true,
        ]]])->assertOk();

        $reminder = Reminder::where('user_id', $user->id)->sole();
        $this->assertSame(['09:15', '21:45'], $reminder->times);
    }

    /** A reminder whose times are all junk keeps the default rather than vanishing. */
    public function test_a_reminder_with_no_usable_time_falls_back_to_the_default(): void
    {
        $user = User::factory()->create();

        $this->push($user, ['reminders' => [[
            'weekday' => 3,
            'times' => ['nope', '99:99'],
            'is_enabled' => true,
        ]]])->assertOk();

        $this->assertSame(['08:00'], Reminder::where('user_id', $user->id)->sole()->times);
    }

    public function test_change_password_requires_authentication(): void
    {
        $user = User::factory()->create(['password' => bcrypt('oldpass1')]);

        $this->postJson('/api/v1/auth/change-password', [
            'current_password' => 'oldpass1',
            'password' => 'newpass1',
        ])->assertStatus(401);

        // And it acts on the token holder, not on an email in the body: the
        // account named here is untouched.
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('oldpass1', $user->fresh()->password));
    }

    public function test_change_password_rotates_the_token_and_hands_back_the_new_one(): void
    {
        $user = User::factory()->create(['password' => bcrypt('oldpass1')]);
        $oldToken = $user->apiToken();

        $res = $this->withHeaders(['X-User-Token' => $oldToken])
            ->postJson('/api/v1/auth/change-password', [
                'current_password' => 'oldpass1',
                'password' => 'newpass1',
            ]);

        $res->assertOk();

        $newToken = $res->json('api_token');
        $this->assertNotSame($oldToken, $newToken);
        $this->assertSame($user->fresh()->api_token, $newToken);
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('newpass1', $user->fresh()->password));

        // The old token is dead - it resolves to nobody - and the returned
        // one is what keeps the device signed in.
        $this->assertNull(User::where('api_token', $oldToken)->first());
        $this->assertSame($user->id, User::where('api_token', $newToken)->value('id'));
    }

    public function test_a_wrong_current_password_is_one_generic_422(): void
    {
        $user = User::factory()->create(['password' => bcrypt('oldpass1')]);

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/auth/change-password', [
                'current_password' => 'not-it',
                'password' => 'newpass1',
            ])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Your current password is incorrect.');
    }

    public function test_admin_login_locks_out_after_five_failures(): void
    {
        User::factory()->create(['email' => 'boss@example.com', 'is_admin' => true, 'password' => bcrypt('correct1')]);

        for ($i = 0; $i < 5; $i++) {
            Livewire::test(\App\Livewire\Admin\Login::class)
                ->set('email', 'boss@example.com')
                ->set('password', 'wrong')
                ->call('authenticate')
                ->assertHasErrors('email');
        }

        // The sixth attempt is refused even with the right password.
        Livewire::test(\App\Livewire\Admin\Login::class)
            ->set('email', 'boss@example.com')
            ->set('password', 'correct1')
            ->call('authenticate')
            ->assertHasErrors('email');

        $this->assertGuest();
    }

    public function test_the_resend_endpoint_only_emails_unverified_accounts(): void
    {
        \Illuminate\Support\Facades\Mail::fake();

        User::factory()->create(['email' => 'done@example.com']);

        $this->postJson('/api/v1/auth/resend', ['email' => 'DONE@example.com'])
            ->assertOk()
            ->assertJsonPath('success', true);

        // Same answer for an address with no account at all: the endpoint
        // never says which is which.
        $this->postJson('/api/v1/auth/resend', ['email' => 'nobody@example.com'])
            ->assertOk()
            ->assertJsonPath('success', true);

        \Illuminate\Support\Facades\Mail::assertNothingSent();
    }

    public function test_the_resend_endpoint_emails_a_pending_account(): void
    {
        \Illuminate\Support\Facades\Mail::fake();

        User::factory()->unverified()->create(['email' => 'pending@example.com']);

        $this->postJson('/api/v1/auth/resend', ['email' => 'PENDING@example.com'])
            ->assertOk();

        \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\CodeMail::class);
    }
}
