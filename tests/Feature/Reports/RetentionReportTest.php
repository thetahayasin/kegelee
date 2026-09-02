<?php

namespace Tests\Feature\Reports;

use App\Livewire\Admin\Reports\Retention;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * Coming back, folded in PHP so SQLite and MySQL cannot disagree about it.
 */
class RetentionReportTest extends TestCase
{
    use RefreshDatabase, SeedsReportData;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedReportData();
        $this->actingAs($this->admin);
    }

    /** @return array<string, array<string, mixed>> */
    private function cards(): array
    {
        return collect(Livewire::test(Retention::class)->set('days', 30)->viewData('cards'))
            ->keyBy('label')
            ->all();
    }

    public function test_it_counts_who_came_back_the_next_day(): void
    {
        // Four of the ten were active the day after joining.
        $card = $this->cards()['Came back the next day'];

        $this->assertSame('40%', $card['value']);
        $this->assertSame('4 of 10 people who joined in the last 30 days', $card['detail']);
    }

    public function test_people_who_have_not_had_the_time_are_not_counted_as_failures(): void
    {
        // The fixture joined five days ago, so nobody can yet have failed to
        // come back a week later. Counting them would make every good week of
        // sign-ups look like a collapse.
        $card = $this->cards()['Came back about a week later'];

        $this->assertSame('-', $card['value']);
        $this->assertSame('nobody has been signed up long enough yet', $card['detail']);
    }

    public function test_the_weekly_table_has_twelve_rows(): void
    {
        $weeks = Livewire::test(Retention::class)->viewData('weeks');

        $this->assertCount(12, $weeks);
        // Everybody joined in the same week, and that week is at the top or
        // one below it depending on which day the test runs.
        $this->assertSame(10, collect($weeks)->sum('people'));
    }

    public function test_a_week_with_no_time_yet_shows_a_dash_not_a_zero(): void
    {
        $weeks = collect(Livewire::test(Retention::class)->viewData('weeks'));
        $thisWeek = $weeks->firstWhere('people', 10);

        $this->assertNull($thisWeek['checks']['day30']['pct']);
    }

    public function test_the_page_explains_what_a_week_later_means(): void
    {
        $this->get(route('admin.reports.retention'))
            ->assertOk()
            ->assertSee('any day from five to nine days after joining');
    }
}
