<?php

namespace Tests\Feature;

use App\Livewire\Admin\Users as UsersPage;
use App\Models\Device;
use App\Models\User;
use App\Models\UserEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * The one page in the admin that changes accounts, so the things that go wrong
 * on it go wrong to somebody real.
 *
 * Three of these pin bugs rather than features: the difficulty picker sends ""
 * for "no level" and an int type hint made Livewire refuse the call outright;
 * the modals used to close in the browser before the server answered, which
 * hid every validation error; and "Delete user" deleted the row but left the
 * training, measurements and outstanding email codes behind.
 */
class AdminUsersPageTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $member;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->member = User::factory()->create(['is_admin' => false, 'last_seen_at' => now()->subHours(2)]);

        $this->actingAs($this->admin);
    }

    public function test_the_page_renders_with_the_last_seen_column(): void
    {
        $this->get(route('admin.users'))->assertOk()->assertSee('Last seen');
    }

    public function test_the_timeline_shows_what_an_event_means_and_what_they_run(): void
    {
        UserEvent::record($this->member->id, UserEvent::LOCK_TAPPED, 'exercise', 'locked');

        Device::create([
            'user_id' => $this->member->id,
            'install_id' => 'install-1',
            'platform' => 'android',
            'os_version' => '14',
            'app_version' => '1.4.0',
            'locale' => 'en',
            'first_seen_at' => now()->subDay(),
            'last_seen_at' => now(),
        ]);

        Livewire::test(UsersPage::class)
            ->call('toggleTimeline', $this->member->id)
            ->assertSee('Tapped a locked feature')
            ->assertSee('locked')
            ->assertSee('Android 14');
    }

    public function test_the_timeline_can_be_narrowed_to_one_kind_of_event(): void
    {
        UserEvent::record($this->member->id, UserEvent::LOCK_TAPPED, 'exercise');
        UserEvent::record($this->member->id, UserEvent::PAYWALL_VIEWED, 'difficulty');

        $timeline = Livewire::test(UsersPage::class)
            ->call('toggleTimeline', $this->member->id)
            ->set('timelineFilter', UserEvent::PAYWALL_VIEWED)
            ->assertSee('Opened the paywall')
            ->viewData('timeline');

        // The padlock row is gone. Asserting on the rendered page instead
        // would be wrong: the filter's own dropdown still offers it by name.
        $this->assertSame([UserEvent::PAYWALL_VIEWED], $timeline->pluck('name')->all());
    }

    public function test_clearing_somebody_s_difficulty_works(): void
    {
        // The select sends "" for the "--" option. An int type hint here made
        // Livewire refuse the call, so clearing a level silently did nothing.
        $this->member->update(['level_id' => 1]);

        Livewire::test(UsersPage::class)->call('setLevel', $this->member->id, '');

        $this->assertNull($this->member->fresh()->level_id);
    }

    public function test_a_rejected_edit_keeps_the_modal_open_so_the_error_can_be_read(): void
    {
        Livewire::test(UsersPage::class)
            ->call('openEditProfile', $this->member->id)
            ->set('editEmail', 'not-an-email')
            ->call('updateProfile')
            ->assertHasErrors('editEmail')
            ->assertSet('editingProfileId', $this->member->id);
    }

    public function test_a_successful_edit_closes_the_modal(): void
    {
        Livewire::test(UsersPage::class)
            ->call('openEditProfile', $this->member->id)
            ->set('editEmail', 'moved@example.com')
            ->call('updateProfile')
            ->assertSet('editingProfileId', null);

        $this->assertSame('moved@example.com', $this->member->fresh()->email);
    }

    public function test_deleting_a_user_takes_their_data_with_them(): void
    {
        UserEvent::record($this->member->id, UserEvent::LOCK_TAPPED, 'exercise');
        \App\Models\EmailCode::issue($this->member->email, 'verify');

        Livewire::test(UsersPage::class)->call('deleteUser', $this->member->id);

        $this->assertSame(0, User::where('id', $this->member->id)->count());
        $this->assertSame(0, UserEvent::count());
        $this->assertSame(0, \App\Models\EmailCode::where('email', $this->member->email)->count());
    }

    public function test_an_admin_cannot_delete_or_demote_themselves(): void
    {
        Livewire::test(UsersPage::class)
            ->call('toggleAdmin', $this->admin->id)
            ->assertSet('statusMessage', 'You cannot change your own role.')
            ->call('deleteUser', $this->admin->id)
            ->assertSet('statusMessage', 'You cannot delete the account you are signed in with.');

        $this->assertTrue($this->admin->fresh()->is_admin);
    }

    public function test_making_somebody_an_admin_says_so(): void
    {
        Livewire::test(UsersPage::class)
            ->call('toggleAdmin', $this->member->id)
            ->assertSet('statusMessage', "{$this->member->email} can now reach the admin panel.");

        $this->assertTrue($this->member->fresh()->is_admin);
    }

    public function test_a_search_that_matches_nothing_says_so(): void
    {
        Livewire::test(UsersPage::class)
            ->set('search', 'nobody-by-that-name')
            ->assertSee('No accounts match');
    }
    public function test_the_activity_drawer_names_the_two_clocks_it_prints(): void
    {
        // Every row in the drawer carries two stacked timestamps. Unlabelled,
        // they read as one date jumping about for no reason: where a user's
        // evening is already the reader's next day, the two lines legitimately
        // show different dates, and there was nothing on the screen saying so.
        config(['app.admin_timezone' => 'Asia/Karachi']);
        $this->member->update(['timezone' => 'Europe/Paris']);

        \App\Models\UserEvent::record($this->member->id, \App\Models\UserEvent::APP_OPENED, 'cold', null, null, 'tz-1');

        Livewire::test(UsersPage::class)
            ->call('toggleTimeline', $this->member->id)
            ->assertSee('Europe/Paris')
            ->assertSee('Asia/Karachi')
            ->assertSee('(theirs)')
            ->assertSee('(yours)');
    }

    public function test_the_drawer_says_nothing_about_zones_when_there_is_only_one(): void
    {
        // Naming the same zone twice is noise, and the second line is dropped
        // in that case anyway, so there is nothing to explain.
        config(['app.admin_timezone' => 'Asia/Karachi']);
        $this->member->update(['timezone' => 'Asia/Karachi']);

        \App\Models\UserEvent::record($this->member->id, \App\Models\UserEvent::APP_OPENED, 'cold', null, null, 'tz-2');

        Livewire::test(UsersPage::class)
            ->call('toggleTimeline', $this->member->id)
            ->assertSee('Times in Asia/Karachi.')
            ->assertDontSee('(theirs)');
    }
}
