<?php

namespace Tests\Feature\Reports;

use App\Livewire\Admin\Reports\Training;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

class TrainingReportTest extends TestCase
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
        return Livewire::test(Training::class)->set('days', $days);
    }

    private function cards(int $days = 30): array
    {
        return collect($this->page($days)->viewData('cards'))->keyBy('label')->all();
    }

    public function test_it_counts_workouts_and_the_people_who_did_them(): void
    {
        $cards = $this->cards();

        $this->assertSame('6', $cards['Workouts finished']['value']);
        $this->assertSame('by 3 people', $cards['Workouts finished']['detail']);
        $this->assertSame('3', $cards['People who trained']['value']);
        $this->assertSame('2 workouts each on average', $cards['People who trained']['detail']);
    }

    public function test_it_reads_the_average_length_in_words(): void
    {
        $this->assertSame('2m 0s', $this->cards()['Average workout length']['value']);
    }

    public function test_it_shows_where_in_a_workout_people_stop(): void
    {
        $quit = collect($this->page()->viewData('quitPoints'))->keyBy('label');

        $this->assertSame(2, $quit['Before the first quarter']['value']);
        $this->assertSame(100, $quit['Before the first quarter']['pct']);
        $this->assertSame(0, $quit['In the last quarter']['value']);
    }

    public function test_it_bands_how_far_through_the_plan_people_are(): void
    {
        $buckets = collect($this->page()->viewData('dayBuckets'))->keyBy('label');

        // Three people have one completed day each; the other seven have none.
        $this->assertSame(3, $buckets['1 to 3 days']['value']);
        $this->assertSame(7, $buckets['None yet']['value']);
    }

    public function test_it_bands_the_longest_run_of_days(): void
    {
        $streaks = collect($this->page()->viewData('streaks'))->keyBy('label');

        $this->assertSame(3, $streaks['1 day']['value']);
        $this->assertSame(0, $streaks['A week or more']['value']);
    }

    public function test_it_is_honest_about_the_exercise_column(): void
    {
        $this->get(route('admin.reports.training'))
            ->assertOk()
            ->assertSee('which exercises people do most');
    }

    public function test_the_chart_has_one_bar_per_day_of_the_window(): void
    {
        $this->assertCount(7, $this->page(7)->viewData('chart'));
        $this->assertCount(30, $this->page(30)->viewData('chart'));
    }
}
