<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * What the app is running on, and when it was last heard from.
 *
 * Both arrive in the push envelope rather than on every event: they are facts
 * about the INSTALL, they change once in a while, and copying them onto
 * thousands of event rows would be a lot of storage for a question nobody asks
 * that way round.
 */
class DeviceSyncTest extends TestCase
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

    private function device(array $over = []): array
    {
        return array_merge([
            'install_id' => 'b3f1c2d4-0000-4444-8888-abcdefabcdef',
            'platform' => 'android',
            'os_version' => '14',
            'app_version' => '1.4.0',
            'locale' => 'en',
        ], $over);
    }

    public function test_it_records_the_device_the_push_came_from(): void
    {
        $this->push(['device' => $this->device()])->assertOk();

        $row = Device::sole();
        $this->assertSame($this->user->id, $row->user_id);
        $this->assertSame('android', $row->platform);
        $this->assertSame('14', $row->os_version);
        $this->assertSame('1.4.0', $row->app_version);
        $this->assertSame('en', $row->locale);
        $this->assertNotNull($row->first_seen_at);
        $this->assertNotNull($row->last_seen_at);
    }

    public function test_a_second_push_moves_last_seen_but_keeps_first_seen(): void
    {
        $this->travelTo(now()->subDays(10));
        $this->push(['device' => $this->device()])->assertOk();
        $firstSeen = Device::sole()->first_seen_at;

        $this->travelBack();
        $this->push(['device' => $this->device(['app_version' => '1.5.0'])])->assertOk();

        // One install is one row, however many times it syncs.
        $row = Device::sole();
        $this->assertSame($firstSeen->toDateTimeString(), $row->first_seen_at->toDateTimeString());
        $this->assertTrue($row->last_seen_at->isToday());
        // The build is whatever it is running NOW.
        $this->assertSame('1.5.0', $row->app_version);
    }

    public function test_two_installs_of_the_same_account_are_two_rows(): void
    {
        $this->push(['device' => $this->device()])->assertOk();
        $this->push(['device' => $this->device(['install_id' => 'second-install-0000'])])->assertOk();

        $this->assertSame(2, Device::where('user_id', $this->user->id)->count());
    }

    public function test_a_junk_install_id_is_ignored_without_failing_the_push(): void
    {
        // Instrumentation must never be able to break the sync it rides on:
        // the training in the same request still has to land.
        $response = $this->push([
            'device' => $this->device(['install_id' => 'not a valid id!!']),
            'workout_sessions' => [[
                'client_id' => 'device-session-1',
                'exercise_slug' => 'trembling',
                'duration_seconds' => 90,
                'completed_at_iso' => now()->toIso8601String(),
            ]],
        ]);

        $response->assertOk();
        $this->assertSame(0, Device::count());
        $this->assertSame(1, $this->user->workoutSessions()->count());
    }

    public function test_a_platform_we_do_not_ship_is_ignored(): void
    {
        $this->push(['device' => $this->device(['platform' => 'windows-phone'])])->assertOk();

        $this->assertSame(0, Device::count());
    }

    public function test_every_push_moves_last_seen_on_the_account(): void
    {
        // The cheapest possible answer to "is this account still alive", and
        // it works on builds that send no events at all.
        $this->assertNull($this->user->last_seen_at);

        $this->push([])->assertOk();

        $this->assertNotNull($this->user->fresh()->last_seen_at);
        $this->assertTrue($this->user->fresh()->last_seen_at->isToday());
    }

    public function test_deleting_an_account_takes_its_devices_with_it(): void
    {
        $this->push(['device' => $this->device()])->assertOk();

        $this->user->deleteWithData();

        $this->assertSame(0, Device::count());
    }
}
