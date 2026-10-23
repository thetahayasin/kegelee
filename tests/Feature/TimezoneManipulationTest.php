<?php

namespace Tests\Feature;

use App\Models\TrainingDay;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The timezone is client-supplied, so nothing that matters may depend on it.
 *
 * The device reports its own zone on every sync and the server stores it, so
 * a determined user can name any of the ~400 IANA zones and move their
 * calendar day by up to 26 hours. That is fine as long as it buys nothing:
 * the free allowance is a LIFETIME count of completed days, not a per-day
 * rate, so becoming a different date cannot mint another one.
 *
 * These tests exist to keep it that way. Rewriting the cap as "days completed
 * today" would look like a tightening and would in fact hand every free
 * account an unlimited supply.
 */
class TimezoneManipulationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function pushDay(User $user, string $date, string $prefix): void
    {
        $sessions = [];

        for ($n = 0; $n < 2; $n++) {
            $sessions[] = [
                'client_id' => $prefix.'-'.$n,
                'exercise_slug' => 'trembling',
                'duration_seconds' => 120,
                'completed_at_iso' => $date.'T1'.$n.':00:00+00:00',
            ];
        }

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', array_merge(
                ['workout_sessions' => $sessions],
                ['timezone' => $user->fresh()->timezone],
            ))
            ->assertOk();
    }

    public function test_jumping_the_date_line_does_not_buy_another_free_day(): void
    {
        // The widest swing the IANA list allows: Baker Island to Kiritimati,
        // 26 hours apart, so one real instant can be made to read as two
        // different calendar dates.
        $user = User::factory()->create(['is_admin' => false, 'timezone' => 'Pacific/Kiritimati']);

        // Asserted on counts, not on date strings: which local date a session
        // lands on is exactly what the swing is changing, so naming one here
        // would test the arithmetic rather than the allowance.
        $this->pushDay($user, '2026-08-01', 'a');
        $this->assertSame(
            1,
            TrainingDay::where('user_id', $user->id)->whereNotNull('completed_at')->count(),
            'The first free day should close normally.',
        );

        // Now claim to be a day behind and complete "another" day.
        $user->update(['timezone' => 'Etc/GMT+12']);
        $this->pushDay($user, '2026-08-02', 'b');

        $this->assertSame(
            1,
            TrainingDay::where('user_id', $user->id)->whereNotNull('completed_at')->count(),
            'A second day must not close: the allowance counts days ever completed, not days completed today.',
        );
    }

    public function test_the_allowance_counts_days_not_dates(): void
    {
        // Same point without the timezone theatre: the cap is a lifetime
        // total, so no arrangement of dates gets a free account past it.
        $user = User::factory()->create(['is_admin' => false, 'timezone' => 'UTC']);

        $this->pushDay($user, '2026-08-01', 'a');
        $this->pushDay($user, '2027-12-25', 'b');

        $closed = TrainingDay::where('user_id', $user->id)->whereNotNull('completed_at')->count();

        $this->assertSame(1, $closed, 'A free account closes its allowance once, whatever the dates say.');
    }

    public function test_an_invalid_timezone_is_refused_rather_than_stored(): void
    {
        $user = User::factory()->create(['timezone' => 'Europe/Rome']);

        $this->withHeaders(['X-User-Token' => $user->apiToken()])
            ->postJson('/api/v1/user/push', ['timezone' => 'Mars/Olympus_Mons'])
            ->assertOk();

        $this->assertSame('Europe/Rome', $user->fresh()->timezone);
    }

    public function test_the_sessions_themselves_are_still_recorded(): void
    {
        // The workout is a fact and is always kept. It is the DAY that stops
        // closing, so a capped account sees its own history without gaining
        // plan position from it.
        $user = User::factory()->create(['is_admin' => false, 'timezone' => 'UTC']);

        $this->pushDay($user, '2026-08-01', 'a');
        $this->pushDay($user, '2026-08-02', 'b');

        $this->assertSame(4, $user->workoutSessions()->count());
    }
}
