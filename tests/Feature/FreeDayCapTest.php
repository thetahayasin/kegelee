<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\TrainingDay;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A free account may complete only so many training days, and the backend has
 * to draw the line in exactly the same place the app does.
 *
 * The app withholds completed_at once the allowance is spent (see
 * recordCompletedSession in react-native-app/src/db/queries.ts). If the server
 * disagreed, the device would show day 1 and the next pull would move the
 * person to day 2 - or the other way round, which is worse.
 *
 * The workout itself is always recorded either way. A session somebody did is
 * a fact, and they should see it; it is the DAY that stops closing, which is
 * what freezes plan position, exercise unlocks and the streak.
 */
class FreeDayCapTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['is_admin' => false, 'timezone' => 'UTC']);
    }

    private function pushDay(string $date, string $prefix): void
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

        $this->withHeaders(['X-User-Token' => $this->user->apiToken()])
            ->postJson('/api/v1/user/push', ['workout_sessions' => $sessions])
            ->assertOk();
    }

    public function test_a_free_account_completes_its_first_day(): void
    {
        $this->pushDay('2026-08-01', 'a');

        $this->assertNotNull(
            TrainingDay::where('user_id', $this->user->id)->where('date', '2026-08-01')->sole()->completed_at,
        );
    }

    public function test_a_free_account_stops_completing_days_after_the_allowance(): void
    {
        $this->pushDay('2026-08-01', 'a');
        $this->pushDay('2026-08-02', 'b');

        $second = TrainingDay::where('user_id', $this->user->id)->where('date', '2026-08-02')->sole();

        // Both workouts landed - they are facts about what somebody did.
        $this->assertSame(2, $second->sessions_count);
        $this->assertSame(4, $this->user->workoutSessions()->count());
        // The day did not close.
        $this->assertNull($second->completed_at);
    }

    public function test_a_subscriber_has_no_cap(): void
    {
        $plan = Plan::first() ?? Plan::create([
            'name' => 'Premium monthly',
            'slug' => 'premium-monthly',
            'price' => 9.99,
            'interval' => 'month',
            'interval_count' => 1,
        ]);

        Subscription::create([
            'user_id' => $this->user->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'started_at' => now()->subDay(),
            'ends_at' => now()->addMonth(),
            'purchase_token' => 'cap-test-token',
        ]);

        $this->pushDay('2026-08-01', 'a');
        $this->pushDay('2026-08-02', 'b');

        $this->assertNotNull(
            TrainingDay::where('user_id', $this->user->id)->where('date', '2026-08-02')->sole()->completed_at,
        );
    }

    public function test_a_day_already_under_way_is_allowed_to_finish(): void
    {
        // Today is excluded from the count on purpose: a free account must not
        // be cut off half way through the very day that takes it to the cap.
        TrainingDay::create([
            'user_id' => $this->user->id,
            'date' => '2026-08-01',
            'sessions_count' => 1,
            'required_sessions' => 2,
            'completed_at' => null,
        ]);

        $this->pushDay('2026-08-01', 'a');

        $this->assertNotNull(
            TrainingDay::where('user_id', $this->user->id)->where('date', '2026-08-01')->sole()->completed_at,
        );
    }

    public function test_the_allowance_can_be_widened_from_the_settings(): void
    {
        app(\App\Services\SettingsService::class)->set('free_day_cap', 2, 'int');

        $this->pushDay('2026-08-01', 'a');
        $this->pushDay('2026-08-02', 'b');
        $this->pushDay('2026-08-03', 'c');

        $days = TrainingDay::where('user_id', $this->user->id)->orderBy('date')->get();

        $this->assertNotNull($days[0]->completed_at);
        $this->assertNotNull($days[1]->completed_at);
        $this->assertNull($days[2]->completed_at);
    }
    private function subscribe(): void
    {
        $plan = Plan::first() ?? Plan::create([
            'name' => 'Premium monthly',
            'slug' => 'premium-monthly',
            'price' => 9.99,
            'interval' => 'month',
            'interval_count' => 1,
        ]);

        Subscription::create([
            'user_id' => $this->user->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'started_at' => now()->subDay(),
            'ends_at' => now()->addMonth(),
            'purchase_token' => 'cap-test-'.uniqid('', true),
        ]);

        $this->user->refresh();
    }

    /** One extra workout on a date that already has its two. */
    private function pushOneMore(string $date, string $clientId): void
    {
        $this->withHeaders(['X-User-Token' => $this->user->apiToken()])
            ->postJson('/api/v1/user/push', ['workout_sessions' => [[
                'client_id' => $clientId,
                'exercise_slug' => 'trembling',
                'duration_seconds' => 120,
                'completed_at_iso' => $date.'T18:00:00+00:00',
            ]]])
            ->assertOk();
    }

    private function day(string $date): TrainingDay
    {
        return TrainingDay::where('user_id', $this->user->id)->where('date', $date)->sole();
    }

    /**
     * What paying actually buys, step by step.
     *
     * The cap is checked when a session is RECORDED, and nothing sweeps back
     * over days that were left open. So subscribing does not tick over a day
     * the account was already stuck on - it takes one more workout - and the
     * days abandoned before that stay abandoned. Support gets asked this
     * ("I paid, why does it still say day 1"), so the sequence is pinned
     * rather than left to be reasoned out from two call sites.
     */
    public function test_subscribing_lifts_the_cap_but_does_not_close_the_stuck_day_by_itself(): void
    {
        $this->pushDay('2026-08-01', 'a');
        $this->pushDay('2026-08-02', 'b');

        $this->assertNotNull($this->day('2026-08-01')->completed_at, 'the one free day closed');
        $this->assertNull($this->day('2026-08-02')->completed_at, 'the second day was capped');

        $this->subscribe();

        // Paying alone changes nothing already written down.
        $this->assertNull(
            $this->day('2026-08-02')->completed_at,
            'nothing sweeps back over a day that was left open',
        );

        // One more workout on that day is what closes it: the session count is
        // already past the requirement, and the cap no longer blocks.
        $this->pushOneMore('2026-08-02', 'b-extra');

        $this->assertNotNull($this->day('2026-08-02')->completed_at);
        $this->assertSame(3, $this->day('2026-08-02')->sessions_count);
    }

    public function test_days_after_subscribing_close_on_two_workouts_like_anybody_else(): void
    {
        $this->pushDay('2026-08-01', 'a');
        $this->pushDay('2026-08-02', 'b');
        $this->subscribe();

        $this->pushDay('2026-08-03', 'c');
        $this->pushDay('2026-08-04', 'd');

        $this->assertNotNull($this->day('2026-08-03')->completed_at);
        $this->assertNotNull($this->day('2026-08-04')->completed_at);
    }

    public function test_the_plan_carries_on_rather_than_restarting(): void
    {
        // The point of freezing the DAY rather than the workout: when the cap
        // lifts, the count picks up from what they had actually reached.
        $this->pushDay('2026-08-01', 'a');
        $this->pushDay('2026-08-02', 'b');
        $this->subscribe();
        $this->pushOneMore('2026-08-02', 'b-extra');
        $this->pushDay('2026-08-03', 'c');

        $completed = TrainingDay::where('user_id', $this->user->id)
            ->whereNotNull('completed_at')
            ->count();

        $this->assertSame(3, $completed, 'day 1 free, day 2 unstuck, day 3 normal');
    }
}
