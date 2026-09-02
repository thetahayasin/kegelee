<?php

namespace Tests\Feature\Reports;

use App\Livewire\Admin\Reports\Engagement;
use App\Models\AccountDeletion;
use App\Models\Device;
use App\Models\UserEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * The old Insights page, plus the things nothing recorded before: whether
 * reminders were allowed as well as set, which build people are on, and how
 * many accounts get deleted.
 */
class EngagementReportTest extends TestCase
{
    use RefreshDatabase, SeedsReportData;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedReportData();
        $this->actingAs($this->admin);
    }

    private function page(int $days = 30)
    {
        return Livewire::test(Engagement::class)->set('days', $days);
    }

    private function cards(): array
    {
        return collect($this->page()->viewData('cards'))->keyBy('label')->all();
    }

    public function test_it_counts_the_quiz_as_a_ratio_not_a_total(): void
    {
        // Ten finished it and nobody skipped.
        $this->assertSame('100%', $this->cards()['Quiz finished']['value']);
        $this->assertSame('10 of 10 who saw it', $this->cards()['Quiz finished']['detail']);
    }

    public function test_it_counts_the_people_who_set_reminders(): void
    {
        $this->assertSame('1', $this->cards()['People who set reminders']['value']);
    }

    public function test_it_shows_whether_android_was_allowed_to_send_them(): void
    {
        // Setting a reminder and being allowed to show one are two different
        // things, and only one of them is a bug.
        $this->event($this->people[3], UserEvent::NOTIFICATION_PERMISSION, 'granted', occurredAt: Carbon::today()->subDay());
        $this->event($this->people[4], UserEvent::NOTIFICATION_PERMISSION, 'denied', occurredAt: Carbon::today()->subDay());

        $this->assertSame('1 of 2 also allowed notifications', $this->cards()['People who set reminders']['detail']);
    }

    public function test_it_lists_which_padlock_people_tap(): void
    {
        $locks = collect($this->page()->viewData('locks'))->keyBy('label');

        $this->assertSame(1, $locks['exercise']['people']);
    }

    public function test_it_reads_the_language_and_build_from_the_devices(): void
    {
        Device::create([
            'user_id' => $this->people[0]->id,
            'install_id' => 'install-a',
            'platform' => 'android',
            'app_version' => '1.4.0',
            'locale' => 'de',
            'first_seen_at' => Carbon::today()->subDays(3),
            'last_seen_at' => Carbon::today()->subDay(),
        ]);

        $versions = $this->page()->viewData('versions');
        $languages = collect($this->page()->viewData('languages'))->keyBy('label');

        $this->assertSame('1.4.0', $versions['newest']);
        $this->assertSame(100, $versions['onNewestPct']);
        $this->assertSame(1, $languages['de']['people']);
    }

    public function test_it_counts_deleted_accounts_without_naming_anybody(): void
    {
        AccountDeletion::create([
            'deleted_at' => Carbon::today()->subDay(),
            'days_since_signup' => 20,
            'had_subscription' => true,
            'sessions_done' => 4,
        ]);

        $deletions = $this->page()->viewData('deletions');

        $this->assertSame(1, $deletions['count']);
        $this->assertSame(20.0, (float) $deletions['averageDays']);
        $this->assertSame(1, $deletions['werePaying']);
    }

    public function test_it_says_a_timezone_is_not_a_country(): void
    {
        $this->get(route('admin.reports.engagement'))
            ->assertOk()
            ->assertSee('we do not record where anyone is');
    }

    public function test_it_says_reminders_being_shown_cannot_be_counted(): void
    {
        $this->get(route('admin.reports.engagement'))
            ->assertOk()
            ->assertSee('whether a reminder was ever shown');
    }

    public function test_the_old_insights_address_still_works(): void
    {
        // It is in bookmarks and in this repository's history, and a 404
        // teaches nobody where it went.
        $this->get('/mystic/insights')->assertRedirect(route('admin.reports.engagement'));
    }
}
