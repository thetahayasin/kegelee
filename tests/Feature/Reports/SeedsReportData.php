<?php

namespace Tests\Feature\Reports;

use App\Models\Exercise;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\TrainingDay;
use App\Models\User;
use App\Models\UserEvent;
use App\Models\WorkoutSession;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * One fixture, shared by every report test, with numbers chosen to be
 * recognisable in an assertion.
 *
 * Ten people join five days ago. All ten finish the first-run questions and
 * read the basics; three of them train; two see the paywall and one of those
 * buys; one starts a trial. Every figure the reports print can be worked out
 * on paper from that paragraph, which is the point - a fixture nobody can
 * hold in their head proves nothing when a test goes red.
 */
trait SeedsReportData
{
    /** @var \Illuminate\Support\Collection<int, User> */
    protected $people;

    protected User $admin;

    protected function seedReportData(): void
    {
        $this->admin = User::factory()->create(['is_admin' => true, 'email' => 'boss@example.com']);

        $joined = Carbon::today()->subDays(5)->setTime(9, 0);

        $this->people = collect(range(1, 10))->map(fn ($i) => User::factory()->create([
            'is_admin' => false,
            'email' => "person{$i}@example.com",
            'created_at' => $joined,
            'updated_at' => $joined,
            'last_seen_at' => $i <= 4 ? Carbon::today()->subDay() : null,
        ]));

        // Everybody finished the first-run questions and read the basics, so
        // the interesting drop in the funnel is the one into training.
        foreach ($this->people as $person) {
            $this->event($person, UserEvent::QUIZ_COMPLETED, occurredAt: $joined);
            $this->event($person, UserEvent::LESSON_COMPLETED, 'why', occurredAt: $joined);
        }

        // Four of them opened the app again the day after joining.
        foreach ($this->people->take(4) as $person) {
            $this->event($person, UserEvent::APP_OPENED, 'cold', occurredAt: $joined->copy()->addDay());
        }

        // Three trained. Two finished workouts each, on the day after joining,
        // which makes three completed days.
        $exercise = Exercise::where('is_active', true)->orderBy('sort_order')->first();

        foreach ($this->people->take(3) as $person) {
            $when = $joined->copy()->addDay()->setTime(18, 0);

            for ($n = 0; $n < 2; $n++) {
                WorkoutSession::create([
                    'user_id' => $person->id,
                    'client_id' => (string) Str::uuid(),
                    'exercise_id' => $exercise?->id,
                    'level_id' => $person->level_id,
                    'started_at' => $when->copy()->subSeconds(120),
                    'completed_at' => $when->copy()->addMinutes($n),
                    'duration_seconds' => 120,
                    'is_extra' => false,
                ]);

                $this->event($person, UserEvent::WORKOUT_COMPLETED, 'daily', 'free', $when);
            }

            TrainingDay::create([
                'user_id' => $person->id,
                'date' => $when->toDateString(),
                'sessions_count' => 2,
                'required_sessions' => 2,
                'completed_at' => $when,
            ]);
        }

        // Two people quit a workout part way, both before the first quarter.
        foreach ($this->people->take(2) as $person) {
            $this->event($person, UserEvent::WORKOUT_ABANDONED, 'daily', 'p00', $joined->copy()->addDay());
        }

        // Two saw the paywall, from the difficulty picker. One of them bought.
        foreach ($this->people->take(2) as $person) {
            $this->event($person, UserEvent::PAYWALL_VIEWED, 'difficulty', 'new', $joined->copy()->addDays(2));
        }

        $buyer = $this->people->first();
        $plan = Plan::first() ?? Plan::create([
            'name' => 'Premium monthly',
            'slug' => 'premium-monthly',
            'price' => 9.99,
            'interval' => 'month',
            'interval_count' => 1,
            'is_active' => true,
        ]);

        $this->event($buyer, UserEvent::PURCHASE_COMPLETED, $plan->slug, 'new', $joined->copy()->addDays(2));
        $this->event($buyer, UserEvent::SUBSCRIPTION_STARTED, $plan->slug, 'trial', $joined->copy()->addDays(2));

        Subscription::create([
            'user_id' => $buyer->id,
            'plan_id' => $plan->id,
            'status' => 'trialing',
            'store' => 'revenuecat',
            'purchase_token' => 'token-fixture-1',
            'store_transaction_id' => 'txn-fixture-1',
            'trial_ends_at' => Carbon::today()->addDays(9),
            'started_at' => $joined->copy()->addDays(2),
            'ends_at' => Carbon::today()->addDays(9),
        ]);

        // Engagement odds and ends: one padlock tap and one set of reminders.
        $this->event($this->people[3], UserEvent::LOCK_TAPPED, 'exercise', occurredAt: $joined->copy()->addDay());
        $this->event($this->people[3], UserEvent::REMINDERS_SET, occurredAt: $joined->copy()->addDay());
    }

    /** One event, dated. */
    protected function event(
        User $user,
        string $name,
        ?string $subject = null,
        ?string $detail = null,
        ?Carbon $occurredAt = null,
    ): UserEvent {
        return UserEvent::create([
            'user_id' => $user->id,
            'client_id' => (string) Str::uuid(),
            'name' => $name,
            'subject' => $subject,
            'detail' => $detail,
            'occurred_at' => $occurredAt ?? now(),
        ]);
    }

    /** Sign in as the admin these pages are behind. */
    protected function asAdmin(): static
    {
        $this->actingAs($this->admin);

        return $this;
    }
}
