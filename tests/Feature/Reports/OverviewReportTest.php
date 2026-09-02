<?php

namespace Tests\Feature\Reports;

use App\Livewire\Admin\Reports\Overview;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * The six headline numbers, against a fixture that can be worked out on paper.
 */
class OverviewReportTest extends TestCase
{
    use RefreshDatabase, SeedsReportData;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedReportData();
        $this->actingAs($this->admin);
    }

    /** @return array<string, array<string, mixed>> */
    private function cards(int $days = 30): array
    {
        $cards = Livewire::test(Overview::class)->set('days', $days)->viewData('cards');

        return collect($cards)->keyBy('label')->all();
    }

    public function test_it_counts_the_people_who_opened_the_app(): void
    {
        // Four of the ten were seen again after joining.
        $this->assertSame('4', $this->cards()['People who opened the app']['value']);
        $this->assertSame('out of 10 people with an account', $this->cards()['People who opened the app']['detail']);
    }

    public function test_it_counts_new_accounts_in_the_window(): void
    {
        $this->assertSame('10', $this->cards()['New accounts']['value']);
    }

    public function test_it_counts_workouts_on_the_day_they_were_finished(): void
    {
        // Three people did two each.
        $this->assertSame('6', $this->cards()['Workouts finished']['value']);
    }

    public function test_it_works_out_how_many_workouts_ran_to_the_end(): void
    {
        // Six finished against two quit part way.
        $this->assertSame('75%', $this->cards()['Workouts run to the end']['value']);
    }

    public function test_it_counts_live_subscriptions_as_a_snapshot(): void
    {
        $card = $this->cards()['Subscribers right now'];

        $this->assertSame('1', $card['value']);
        $this->assertSame('1 of them on a free trial', $card['detail']);
        // A snapshot has nothing honest to compare itself with.
        $this->assertNull($card['delta']);
    }

    public function test_a_trial_with_no_renewal_yet_has_not_become_paid(): void
    {
        $this->assertSame('0%', $this->cards()['Trials that became paid']['value']);
    }

    public function test_the_page_says_what_the_numbers_mean_in_words(): void
    {
        $this->get(route('admin.reports.overview', ['days' => 30]))
            ->assertOk()
            ->assertSee('4 in 10 accounts opened the app in the last 30 days.')
            ->assertSee('Is the app growing, and is anyone paying?');
    }

    public function test_a_shorter_window_still_holds_the_same_group(): void
    {
        // The fixture is five days old, so a seven-day window sees all of it.
        $this->assertSame('10', $this->cards(7)['New accounts']['value']);
    }

    public function test_refresh_counts_again(): void
    {
        Livewire::test(Overview::class)
            ->call('refreshData')
            ->assertSet('statusMessage', 'Counted again just now.');
    }
}
