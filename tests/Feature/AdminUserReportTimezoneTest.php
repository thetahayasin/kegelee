<?php

namespace Tests\Feature;

use App\Livewire\Admin\UserReport;
use App\Models\TrainingDay;
use App\Models\User;
use App\Models\UserEvent;
use App\Models\WorkoutSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * The admin and the app have to agree about which day a session happened on.
 *
 * They did not. Every daily figure on the user report folded DATE(completed_at)
 * in SQL, which is UTC, while the app, the sync and the streak the person sees
 * on their phone all cut the day at THEIR midnight. For anyone far enough from
 * Greenwich the two disagreed by a day, so support read one number off the
 * admin and the customer read another off the app, and both were right.
 *
 * The clock chosen throughout is deliberate: Asia/Karachi is +05:00, so a
 * session at 01:30 their time is 20:30 UTC the day BEFORE. Every case here
 * turns on that one instant.
 */
class AdminUserReportTimezoneTest extends TestCase
{
    use RefreshDatabase;

    /**
     * 20:30 UTC on Sunday 13 Sep = 01:30 on Monday 14 Sep in Karachi.
     *
     * Chosen to straddle a week boundary as well as a day one, so the figures
     * can tell the two bucketings apart: on their calendar this session is the
     * first of a new week, and on UTC's it is the last of the old one.
     */
    private const INSTANT = '2026-09-13 20:30:00';

    private const THEIR_DAY = '2026-09-14';

    private const UTC_DAY = '2026-09-13';

    private User $admin;

    private User $member;

    protected function setUp(): void
    {
        parent::setUp();

        // Pinned so "today" is a fact rather than whatever day the suite runs
        // on. At this instant it is still Sunday the 13th in UTC and already
        // Monday the 14th in Karachi, which is the disagreement under test.
        Carbon::setTestNow(self::INSTANT);

        config(['app.admin_timezone' => 'Asia/Karachi']);

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->member = User::factory()->create([
            'is_admin' => false,
            'timezone' => 'Asia/Karachi',
        ]);

        $this->actingAs($this->admin);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function report(): \Livewire\Features\SupportTesting\Testable
    {
        return Livewire::test(UserReport::class, ['user' => $this->member]);
    }

    public function test_a_session_lands_on_the_day_they_trained_not_the_utc_day(): void
    {
        WorkoutSession::create([
            'user_id' => $this->member->id,
            'started_at' => Carbon::parse(self::INSTANT)->subMinutes(5),
            'completed_at' => self::INSTANT,
            'duration_seconds' => 300,
        ]);

        $this->report()->assertOk()->assertViewHas('activity', function (array $activity) {
            // Their Monday, so it is this week. Bucketed on the UTC day it
            // would be the Sunday before, and would have landed in last week
            // instead - which is exactly the figure support reads out when
            // somebody asks whether a customer has trained recently.
            return $activity['total'] === 1
                && $activity['daysTrained'] === 1
                && $activity['thisWeek'] === 1
                && $activity['lastWeek'] === 0;
        });
    }

    public function test_the_streak_counts_from_the_day_it_is_for_them(): void
    {
        // Their day, which is tomorrow as far as UTC is concerned. Counting
        // back from the server's "today" missed it entirely and reported a
        // live streak as zero.
        TrainingDay::create([
            'user_id' => $this->member->id,
            'date' => self::THEIR_DAY,
            'completed_at' => self::INSTANT,
        ]);

        $this->report()
            ->assertOk()
            ->assertViewHas('training', fn (array $t) => $t['currentStreak'] === 1);
    }

    public function test_the_timeline_gathers_events_into_the_day_they_happened_on(): void
    {
        UserEvent::record($this->member->id, UserEvent::WORKOUT_COMPLETED, null, null, null, 'evt-1');
        UserEvent::where('user_id', $this->member->id)->update(['occurred_at' => self::INSTANT]);

        $this->report()->assertOk()->assertViewHas('timeline', function ($timeline) {
            return $timeline->keys()->contains(self::THEIR_DAY)
                && ! $timeline->keys()->contains(self::UTC_DAY);
        });
    }

    public function test_the_page_prints_both_clocks_on_a_twelve_hour_dial(): void
    {
        UserEvent::record($this->member->id, UserEvent::WORKOUT_COMPLETED, null, null, null, 'evt-2');
        UserEvent::where('user_id', $this->member->id)->update(['occurred_at' => self::INSTANT]);

        $this->report()
            ->assertOk()
            // Their clock, on the row. 01:30 written the way a person reads it.
            ->assertSee('1:30 am')
            // And the day it belongs to, theirs, not UTC's.
            ->assertSee('Mon 14 Sep 2026');
    }

    public function test_it_names_both_zones_rather_than_leaving_the_reader_to_guess(): void
    {
        $this->member->update(['timezone' => 'America/Los_Angeles']);

        $this->report()
            ->assertOk()
            ->assertSee('America/Los_Angeles')
            ->assertSee('Asia/Karachi');
    }

    public function test_it_says_so_when_an_account_has_never_reported_a_zone(): void
    {
        // Falling back to UTC is fine; doing it silently is not, because the
        // reader has no way to tell a real UTC account from an unknown one.
        $this->member->update(['timezone' => null]);

        $this->report()
            ->assertOk()
            ->assertSee('never told us where it is');
    }

    public function test_the_second_clock_is_dropped_when_it_would_read_the_same(): void
    {
        // Reader and account on one clock. Printing the identical figure twice
        // discloses nothing and teaches the reader to ignore the second line.
        $this->member->update(['timezone' => 'Asia/Karachi']);

        $this->report()
            ->assertOk()
            ->assertSee('their clock and yours are the same');
    }

    public function test_the_usual_day_is_read_off_their_calendar_too(): void
    {
        // A session at 01:30 their Monday is 20:30 UTC on Sunday. Read off the
        // wrong calendar this account looks like a Sunday trainer, which is
        // both wrong and the sort of thing that ends up in a retention note.
        WorkoutSession::create([
            'user_id' => $this->member->id,
            'started_at' => Carbon::parse(self::INSTANT)->subMinutes(5),
            'completed_at' => self::INSTANT,
            'duration_seconds' => 300,
        ]);

        $this->report()
            ->assertOk()
            ->assertViewHas('activity', fn (array $a) => $a['busiestWeekday'] === 'Monday');
    }

    public function test_an_account_that_has_never_trained_is_not_given_a_habit(): void
    {
        // Sorting an all-zero tally still leaves a first key, and printing it
        // would invent a usual day out of nothing at all.
        $this->report()
            ->assertOk()
            ->assertViewHas('activity', fn (array $a) => $a['busiestWeekday'] === null);
    }
}
