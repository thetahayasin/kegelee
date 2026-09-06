<?php

namespace Tests\Feature;

use App\Livewire\Admin\UserReport;
use App\Models\Measurement;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Models\UserEvent;
use App\Models\WorkoutSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * One account, in full, and it must agree with every other screen.
 *
 * The page exists because answering "what happened with this account" used to
 * mean reading three screens that each defined a subscriber differently. So
 * the tests that matter here are the ones that pin it to the shared rule: a
 * lapsed row is not access, a cancelled row still inside its period is, and an
 * admin's bypass is not a sale.
 *
 * The empty-account case is not a formality either. Averages, completion rates
 * and "change since the first measurement" all divide by something that is
 * zero for somebody who signed up a minute ago, and a report that 500s on a
 * new user is a report nobody trusts.
 */
class AdminUserReportTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\PlanSeeder::class);

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->member = User::factory()->create(['is_admin' => false]);

        $this->actingAs($this->admin);
    }

    private function subscribe(string $status, ?string $endsAt, bool $autoRenewing = true): Subscription
    {
        return Subscription::create([
            'user_id' => $this->member->id,
            'plan_id' => Plan::where('slug', 'premium-monthly')->value('id'),
            'status' => $status,
            'store' => 'revenuecat',
            'purchase_token' => 'TOKEN-'.uniqid('', true),
            'started_at' => now()->subMonths(2),
            'ends_at' => $endsAt,
            'auto_renewing' => $autoRenewing,
        ]);
    }

    public function test_it_renders_for_an_account_with_nothing_at_all(): void
    {
        // Every average and rate on the page divides by a count this account
        // does not have.
        Livewire::test(UserReport::class, ['user' => $this->member])
            ->assertOk()
            ->assertSee('No subscription')
            ->assertSee('Never subscribed');
    }

    public function test_the_page_is_closed_to_members(): void
    {
        $this->actingAs($this->member)
            ->get(route('admin.users.report', $this->member))
            ->assertRedirect();
    }

    public function test_a_lapsed_subscription_does_not_read_as_access(): void
    {
        // The status column still says 'active' because no EXPIRATION arrived.
        $this->subscribe('active', now()->subDay()->toDateTimeString());

        Livewire::test(UserReport::class, ['user' => $this->member])
            ->assertOk()
            ->assertSee('No subscription')
            // And it says WHY the row disagrees with itself, rather than
            // quietly showing the corrected value.
            ->assertSee('no expiry event was received');
    }

    public function test_a_cancelled_subscriber_inside_their_period_still_has_access(): void
    {
        $this->subscribe('canceled', now()->addWeek()->toDateTimeString(), autoRenewing: false);

        Livewire::test(UserReport::class, ['user' => $this->member])
            ->assertOk()
            ->assertSee('Subscribed')
            // Auto-renew is off, so the date is when it ends, not when it bills.
            ->assertSee('Ends');
    }

    public function test_an_admins_bypass_is_not_reported_as_a_sale(): void
    {
        Livewire::test(UserReport::class, ['user' => $this->admin])
            ->assertOk()
            ->assertSee('Full access, as an admin')
            ->assertSee('This is not a sale');
    }

    public function test_payments_are_totalled_at_list_price_and_trials_are_excluded(): void
    {
        $price = (float) Plan::where('slug', 'premium-monthly')->value('price');

        // A trial start is not money. The renewals after it are.
        UserEvent::record($this->member->id, UserEvent::SUBSCRIPTION_STARTED, 'premium-monthly', 'trial', null, 'a');
        UserEvent::record($this->member->id, UserEvent::SUBSCRIPTION_RENEWED, 'premium-monthly', null, null, 'b');
        UserEvent::record($this->member->id, UserEvent::SUBSCRIPTION_RENEWED, 'premium-monthly', null, null, 'c');

        Livewire::test(UserReport::class, ['user' => $this->member])
            ->assertOk()
            ->assertViewHas('money', function (array $money) use ($price) {
                return $money['count'] === 2
                    && abs($money['total'] - ($price * 2)) < 0.01;
            });
    }

    public function test_a_payment_naming_a_plan_that_no_longer_exists_is_flagged_not_hidden(): void
    {
        // It prices at zero, which understates what they paid. Saying so is
        // the difference between a gap and a lie.
        UserEvent::record($this->member->id, UserEvent::SUBSCRIPTION_RENEWED, 'plan-that-went-away', null, null, 'x');

        Livewire::test(UserReport::class, ['user' => $this->member])
            ->assertOk()
            ->assertSee('no longer exists')
            ->assertViewHas('money', fn (array $money) => $money['unpriced'] === 1);
    }

    public function test_the_streak_survives_a_day_that_has_not_been_trained_yet(): void
    {
        // Trained yesterday and the day before, nothing today. Today is not
        // over, so the streak is 2 and not 0.
        foreach ([1, 2] as $daysAgo) {
            \App\Models\TrainingDay::create([
                'user_id' => $this->member->id,
                'date' => now()->subDays($daysAgo)->toDateString(),
                'completed_at' => now()->subDays($daysAgo),
            ]);
        }

        Livewire::test(UserReport::class, ['user' => $this->member])
            ->assertOk()
            ->assertViewHas('training', fn (array $t) => $t['currentStreak'] === 2);
    }

    public function test_training_and_measurement_figures_are_reported(): void
    {
        WorkoutSession::create([
            'user_id' => $this->member->id,
            'started_at' => now()->subHour(),
            'completed_at' => now()->subMinutes(55),
            'duration_seconds' => 300,
        ]);
        WorkoutSession::create([
            'user_id' => $this->member->id,
            'started_at' => now()->subMinutes(30),
            'completed_at' => null,
            'duration_seconds' => 0,
        ]);

        Measurement::create(['user_id' => $this->member->id, 'seconds' => 10, 'measured_at' => now()->subMonth()]);
        Measurement::create(['user_id' => $this->member->id, 'seconds' => 18, 'measured_at' => now()]);

        Livewire::test(UserReport::class, ['user' => $this->member])
            ->assertOk()
            ->assertViewHas('training', fn (array $t) => $t['started'] === 2
                && $t['finished'] === 1
                && $t['completionRate'] === 50.0)
            ->assertViewHas('measurements', fn (array $m) => abs($m['change'] - 8.0) < 0.01);
    }

    public function test_the_timeline_filters_to_one_event_and_toggles_back(): void
    {
        UserEvent::record($this->member->id, UserEvent::APP_OPENED, 'cold', null, null, '1');
        UserEvent::record($this->member->id, UserEvent::WORKOUT_COMPLETED, null, null, null, '2');

        Livewire::test(UserReport::class, ['user' => $this->member])
            ->assertViewHas('timelineTotal', 2)
            ->call('filterEvent', UserEvent::APP_OPENED)
            ->assertViewHas('timelineTotal', 1)
            // Clicking the same chip clears it rather than needing the URL edited.
            ->call('filterEvent', UserEvent::APP_OPENED)
            ->assertViewHas('timelineTotal', 2);
    }
}
