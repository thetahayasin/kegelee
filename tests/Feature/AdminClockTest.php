<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AdminClock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Which clock the admin console prints a stored instant on.
 *
 * Two of them, and the whole point is that they are allowed to disagree: an
 * account in Karachi and a reader in Karachi look the same, an account in Los
 * Angeles and the same reader do not, and a screen that shows one figure
 * without saying whose it is has been the source of every "but they said they
 * trained on Wednesday" conversation.
 *
 * Storage is not in scope here and must not move. app.timezone stays UTC; this
 * is presentation only.
 */
class AdminClockTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_configured_console_zone_beats_the_admins_own_row(): void
    {
        // The console is read from one desk. users.timezone is written from
        // whatever device last synced, so a test handset left on another zone
        // must not silently move every timestamp in the admin.
        config(['app.admin_timezone' => 'Asia/Karachi']);
        $admin = User::factory()->create(['is_admin' => true, 'timezone' => 'America/New_York']);

        $this->assertSame('Asia/Karachi', AdminClock::adminZone($admin));
    }

    public function test_it_falls_back_to_the_admins_own_zone_when_nothing_is_configured(): void
    {
        config(['app.admin_timezone' => null]);
        $admin = User::factory()->create(['is_admin' => true, 'timezone' => 'Europe/Berlin']);

        $this->assertSame('Europe/Berlin', AdminClock::adminZone($admin));
    }

    public function test_it_falls_back_to_the_app_timezone_when_there_is_nothing_at_all(): void
    {
        config(['app.admin_timezone' => null]);
        $admin = User::factory()->create(['is_admin' => true, 'timezone' => null]);

        $this->assertSame(config('app.timezone'), AdminClock::adminZone($admin));
    }

    public function test_a_zone_that_is_not_a_real_zone_is_ignored_rather_than_thrown(): void
    {
        // The sync endpoint checks against the IANA list before storing, but a
        // row predating that check would otherwise reach setTimezone() and
        // take down a support screen over a string somebody's phone sent
        // months ago.
        config(['app.admin_timezone' => 'Mars/Olympus_Mons']);
        $admin = User::factory()->create(['is_admin' => true, 'timezone' => 'not a timezone']);

        $this->assertSame(config('app.timezone'), AdminClock::adminZone($admin));
        $this->assertSame(config('app.timezone'), AdminClock::zoneFor($admin));
    }

    public function test_an_accounts_own_zone_is_used_when_it_has_one(): void
    {
        $user = User::factory()->create(['timezone' => 'America/Los_Angeles']);

        $this->assertSame('America/Los_Angeles', AdminClock::zoneFor($user));
    }

    public function test_an_account_that_never_synced_reads_on_the_app_timezone(): void
    {
        // Not a guess at where they are. An account created on the web and
        // never opened in the app has no locality, and UTC says so.
        $user = User::factory()->create(['timezone' => null]);

        $this->assertSame(config('app.timezone'), AdminClock::zoneFor($user));
    }

    public function test_storage_stays_utc(): void
    {
        // The day-rollover rule is a UTC instant plus the account's own zone.
        // Moving app.timezone to make the admin read nicely would move every
        // stored boundary with it, which is why admin_timezone exists at all.
        $this->assertSame('UTC', config('app.timezone'));
    }
}
