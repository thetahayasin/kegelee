<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A push answers with exactly which rows landed, by the device's own ids.
 *
 * Counts alone cannot be acted on. A push of ten sessions that comes back
 * saying "nine" leaves the device with no way to tell WHICH one is missing, so
 * it either re-sends all ten forever or marks all ten synced and loses the one
 * that never arrived. The echo turns that into a decision it can make.
 */
class PushAcceptedIdsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['is_admin' => false, 'timezone' => 'UTC']);
    }

    private function push(array $payload)
    {
        return $this->withHeaders(['X-User-Token' => $this->user->apiToken()])
            ->postJson('/api/v1/user/push', $payload);
    }

    public function test_it_echoes_the_ids_of_everything_it_stored(): void
    {
        $response = $this->push([
            'workout_sessions' => [[
                'client_id' => 'session-a',
                'exercise_slug' => 'trembling',
                'duration_seconds' => 120,
                'completed_at_iso' => now()->toIso8601String(),
            ]],
            'measurements' => [[
                'client_id' => 'measure-a',
                'seconds' => 12.5,
                'measured_at_iso' => now()->toIso8601String(),
            ]],
            'events' => [[
                'client_id' => 'event-a',
                'name' => UserEvent::APP_OPENED,
                'subject' => 'cold',
                'occurred_at_iso' => now()->toIso8601String(),
            ]],
            'reminders' => [[
                'weekday' => 1,
                'times' => ['08:00'],
                'is_enabled' => true,
            ]],
        ])->assertOk();

        $this->assertSame(['session-a'], $response->json('accepted.workout_sessions'));
        $this->assertSame(['measure-a'], $response->json('accepted.measurements'));
        $this->assertSame(['event-a'], $response->json('accepted.events'));
        // Reminders have no client id - they upsert on (user, weekday), which
        // is a real natural key - so the weekday comes back instead.
        $this->assertSame([1], $response->json('accepted.reminders'));
    }

    public function test_a_row_we_already_hold_is_accepted_again(): void
    {
        // "We have it" and "we have just taken it" mean the same thing to an
        // outbox. Leaving duplicates out of the echo would make the device
        // re-send them for ever.
        $session = [
            'client_id' => 'session-b',
            'exercise_slug' => 'trembling',
            'duration_seconds' => 120,
            'completed_at_iso' => now()->toIso8601String(),
        ];

        $this->push(['workout_sessions' => [$session]])->assertOk();
        $second = $this->push(['workout_sessions' => [$session]])->assertOk();

        $this->assertSame(['session-b'], $second->json('accepted.workout_sessions'));
        // Counted once, though: the second push changed nothing.
        $this->assertSame(0, $second->json('synced.sessions'));
        $this->assertSame(1, $this->user->workoutSessions()->count());
    }

    public function test_a_row_that_was_skipped_is_not_accepted(): void
    {
        // A session with no client id and an event with a name we do not know
        // are both dropped, and the device must keep hearing that.
        $response = $this->push([
            'workout_sessions' => [[
                'client_id' => '',
                'duration_seconds' => 120,
                'completed_at_iso' => now()->toIso8601String(),
            ]],
            'events' => [[
                'client_id' => 'event-c',
                'name' => 'tourDone',
                'occurred_at_iso' => now()->toIso8601String(),
            ]],
        ])->assertOk();

        $this->assertSame([], $response->json('accepted.workout_sessions'));
        $this->assertSame([], $response->json('accepted.events'));
    }

    public function test_the_old_counts_are_still_there(): void
    {
        // The device in the field reads these, and a reply it cannot parse is
        // a sync that never completes.
        $response = $this->push([])->assertOk();

        $this->assertSame(0, $response->json('synced.sessions'));
        $this->assertSame(0, $response->json('synced.measurements'));
        $this->assertSame(0, $response->json('synced.events'));
        $this->assertSame(0, $response->json('synced.reminders'));
        $this->assertSame(0, $response->json('synced.subscriptions'));
    }
}
