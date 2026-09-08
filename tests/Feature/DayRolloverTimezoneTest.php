<?php

namespace Tests\Feature;

use App\Models\TrainingDay;
use App\Models\User;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The training day turns over at midnight where the USER is standing.
 *
 * PushTrainingDayTimezoneTest covers the write - a session filed under the
 * day the user trained. This covers the read: the day number the app shows
 * has to advance on the user's own midnight, not UTC's. For Rome that is an
 * hour or two early if the zone is ignored, which is the window where an
 * Italian user finishing at 23:30 would have seen tomorrow's day number.
 */
class DayRolloverTimezoneTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** A user in Rome who has completed `$days` consecutive days ending yesterday. */
    private function romeUserWithCompletedDays(int $days, string $throughDate): User
    {
        $user = User::factory()->create(['timezone' => 'Europe/Rome']);

        for ($i = 0; $i < $days; $i++) {
            TrainingDay::create([
                'user_id' => $user->id,
                'date' => Carbon::parse($throughDate)->subDays($i)->toDateString(),
                'required_sessions' => 2,
                'completed_at' => Carbon::parse($throughDate)->subDays($i)->setTime(20, 0),
            ]);
        }

        return $user;
    }

    public function test_the_day_holds_until_the_users_own_midnight(): void
    {
        // 23:30 in Rome on 8 Sep. UTC has been on the 8th all along, but Rome
        // is CEST (+02:00), so this instant is 21:30Z.
        Carbon::setTestNow(Carbon::parse('2026-09-08T21:30:00Z'));

        $user = $this->romeUserWithCompletedDays(5, '2026-09-08');

        // Five days done, the fifth of them TODAY, so today is still day 5.
        $this->assertSame(5, app(ProgressionService::class)->currentDayNumber($user));
    }

    public function test_it_advances_at_rome_midnight_not_utc_midnight(): void
    {
        // 22:30Z on 8 Sep: already the 9th in Rome (00:30 CEST).
        Carbon::setTestNow(Carbon::parse('2026-09-08T22:30:00Z'));
        $user = $this->romeUserWithCompletedDays(5, '2026-09-08');

        $this->assertSame(6, app(ProgressionService::class)->currentDayNumber($user));
    }

    public function test_utc_midnight_alone_does_not_move_the_day(): void
    {
        // 00:30Z on 9 Sep is 02:30 in Rome - past Rome's midnight too, so to
        // isolate UTC we need the other direction: an instant that has crossed
        // UTC's midnight while Rome has NOT. Rome is ahead of UTC, so that
        // cannot happen for Rome. Use Los Angeles, which is behind: 00:30Z on
        // the 9th is still 17:30 on the 8th in California.
        Carbon::setTestNow(Carbon::parse('2026-09-09T00:30:00Z'));

        $user = User::factory()->create(['timezone' => 'America/Los_Angeles']);
        for ($i = 0; $i < 5; $i++) {
            TrainingDay::create([
                'user_id' => $user->id,
                'date' => Carbon::parse('2026-09-08')->subDays($i)->toDateString(),
                'required_sessions' => 2,
                'completed_at' => Carbon::parse('2026-09-08')->subDays($i)->setTime(12, 0),
            ]);
        }

        // UTC says the 9th, California says the 8th. The user's day must hold.
        $this->assertSame(5, app(ProgressionService::class)->currentDayNumber($user));
    }

    public function test_an_uncompleted_day_does_not_advance_at_midnight(): void
    {
        // Midnight has passed in Rome, but the 8th was never finished.
        Carbon::setTestNow(Carbon::parse('2026-09-08T22:30:00Z'));

        $user = User::factory()->create(['timezone' => 'Europe/Rome']);
        for ($i = 1; $i <= 4; $i++) {
            TrainingDay::create([
                'user_id' => $user->id,
                'date' => Carbon::parse('2026-09-08')->subDays($i)->toDateString(),
                'required_sessions' => 2,
                'completed_at' => Carbon::parse('2026-09-08')->subDays($i)->setTime(20, 0),
            ]);
        }
        // The 8th exists but was never completed.
        TrainingDay::create([
            'user_id' => $user->id,
            'date' => '2026-09-08',
            'required_sessions' => 2,
            'completed_at' => null,
        ]);

        // Four completed days behind them, so they are working on day 5 - the
        // calendar turning over does not skip the day they did not do.
        $this->assertSame(5, app(ProgressionService::class)->currentDayNumber($user));
    }

    public function test_it_follows_the_summer_time_offset(): void
    {
        // Rome in January is CET (+01:00), not CEST. 23:30Z on 31 Dec is
        // already 00:30 on 1 Jan in Rome.
        Carbon::setTestNow(Carbon::parse('2025-12-31T23:30:00Z'));

        $user = $this->romeUserWithCompletedDays(3, '2025-12-31');

        $this->assertSame(4, app(ProgressionService::class)->currentDayNumber($user));
    }
}
