<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\UserEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The event log's two guarantees: it is idempotent, and its vocabulary is
 * closed. Both matter more than they look.
 *
 * The outbox re-sends anything it has not had acknowledged, so a flaky
 * connection makes duplicate pushes the NORMAL case rather than an error case.
 * And an open vocabulary turns the log into something no report can count.
 */
class UserEventSyncTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['is_admin' => false]);
    }

    private function push(array $payload)
    {
        return $this->withHeaders(['X-User-Token' => $this->user->apiToken()])
            ->postJson('/api/v1/user/push', $payload);
    }

    private function event(array $over = []): array
    {
        return array_merge([
            'client_id' => 'abc-123',
            'name' => UserEvent::TOUR_COMPLETED,
            'subject' => 'home',
            'occurred_at_iso' => now()->subMinutes(5)->toIso8601String(),
        ], $over);
    }

    public function test_it_stores_an_event(): void
    {
        $this->push(['events' => [$this->event(['meta' => ['steps' => 3]])]])->assertOk();

        $row = UserEvent::where('user_id', $this->user->id)->sole();
        $this->assertSame(UserEvent::TOUR_COMPLETED, $row->name);
        $this->assertSame('home', $row->subject);
        $this->assertSame(['steps' => 3], $row->meta);
    }

    public function test_the_same_event_pushed_twice_is_stored_once(): void
    {
        // The outbox keeps sending until it is acknowledged, so this is the
        // ordinary path on a bad connection - not an edge case.
        $this->push(['events' => [$this->event()]])->assertOk();
        $this->push(['events' => [$this->event()]])->assertOk();

        $this->assertSame(1, UserEvent::where('user_id', $this->user->id)->count());
    }

    public function test_two_users_may_share_a_client_id(): void
    {
        // Uniqueness is per user. Two devices generating the same id is not
        // worth engineering against; treating it as a collision across
        // accounts would silently drop one person's event.
        $other = User::factory()->create(['is_admin' => false]);

        $this->push(['events' => [$this->event()]])->assertOk();
        $this->withHeaders(['X-User-Token' => $other->apiToken()])
            ->postJson('/api/v1/user/push', ['events' => [$this->event()]])
            ->assertOk();

        $this->assertSame(1, UserEvent::where('user_id', $this->user->id)->count());
        $this->assertSame(1, UserEvent::where('user_id', $other->id)->count());
    }

    public function test_it_drops_an_unknown_event_name(): void
    {
        $this->push(['events' => [$this->event(['name' => 'tourDone'])]])->assertOk();
        $this->assertSame(0, UserEvent::count());
    }

    public function test_it_drops_an_event_with_no_client_id(): void
    {
        $this->push(['events' => [$this->event(['client_id' => ''])]])->assertOk();
        $this->assertSame(0, UserEvent::count());
    }

    public function test_it_keeps_the_device_time_it_happened_at(): void
    {
        // These arrive in batches after time offline. Filing them under the
        // moment the phone found signal would put a week of behaviour on one
        // minute and make every timeline useless.
        $when = now()->subDays(3)->startOfHour();
        $this->push(['events' => [$this->event(['occurred_at_iso' => $when->toIso8601String()])]])
            ->assertOk();

        $this->assertSame(
            $when->toDateTimeString(),
            UserEvent::sole()->occurred_at->toDateTimeString(),
        );
    }

    public function test_it_refuses_a_time_from_the_future(): void
    {
        // A device clock running fast would otherwise sit permanently at the
        // top of every timeline and skew every window.
        $this->push(['events' => [
            $this->event(['occurred_at_iso' => now()->addDays(2)->toIso8601String()]),
        ]])->assertOk();

        $this->assertTrue(UserEvent::sole()->occurred_at->isBefore(now()->addMinute()));
    }

    public function test_events_do_not_disturb_the_rest_of_the_push(): void
    {
        // Instrumentation must never be able to break the sync it rides on.
        $res = $this->push([
            'events' => [$this->event(['name' => 'nonsense'])],
            'workout_sessions' => [[
                'exercise_slug' => 'trembling',
                'duration_seconds' => 90,
                'completed_at_iso' => now()->toIso8601String(),
                'is_extra' => false,
            ]],
        ]);

        $res->assertOk();
        $this->assertSame(1, $this->user->workoutSessions()->count());
        $this->assertSame(0, UserEvent::count());
    }
}
