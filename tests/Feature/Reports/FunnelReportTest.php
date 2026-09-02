<?php

namespace Tests\Feature\Reports;

use App\Livewire\Admin\Reports\Funnel;
use App\Models\User;
use App\Models\UserEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * Ten people join, all ten read the basics, three train. The funnel has to say
 * exactly that - and say it in words as well as bars.
 */
class FunnelReportTest extends TestCase
{
    use RefreshDatabase, SeedsReportData;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedReportData();
        $this->actingAs($this->admin);
    }

    /** @return array<string, array<string, mixed>> */
    private function rows(int $days = 30): array
    {
        return collect(Livewire::test(Funnel::class)->set('days', $days)->viewData('rows'))
            ->keyBy('label')
            ->all();
    }

    public function test_every_step_counts_the_same_group(): void
    {
        $rows = $this->rows();

        $this->assertSame(10, $rows['Opened the app']['value']);
        $this->assertSame(10, $rows['Finished the first-run questions']['value']);
        $this->assertSame(10, $rows['Read the basics']['value']);
        $this->assertSame(3, $rows['Trained once']['value']);
        $this->assertSame(2, $rows['Saw the paywall']['value']);
        $this->assertSame(1, $rows['Started a trial']['value']);
        $this->assertSame(0, $rows['Paid']['value']);
    }

    public function test_the_drop_between_two_steps_is_written_as_a_sentence(): void
    {
        $this->assertSame(
            '3 in 10 of the people who read the basics trained at least once.',
            $this->rows()['Trained once']['sentence'],
        );

        $this->get(route('admin.reports.funnel', ['days' => 30]))
            ->assertOk()
            ->assertSee('3 in 10 of the people who read the basics trained at least once.');
    }

    public function test_an_account_from_before_events_existed_still_counts(): void
    {
        // The state columns are the fallback. Without them every account older
        // than the event log would look as though it had stopped at step one.
        User::factory()->create([
            'is_admin' => false,
            'created_at' => Carbon::today()->subDays(4),
            'onboarding_completed_at' => Carbon::today()->subDays(4),
        ]);

        $rows = $this->rows();

        $this->assertSame(11, $rows['Opened the app']['value']);
        $this->assertSame(11, $rows['Finished the first-run questions']['value']);
        // No lessons for that one, so the next step does not move.
        $this->assertSame(10, $rows['Read the basics']['value']);
    }

    public function test_somebody_who_joined_outside_the_window_is_not_in_the_group(): void
    {
        $old = User::factory()->create([
            'is_admin' => false,
            'created_at' => Carbon::today()->subDays(200),
        ]);
        $this->event($old, UserEvent::WORKOUT_COMPLETED, 'daily', 'free', Carbon::today()->subDay());

        $rows = $this->rows(30);

        $this->assertSame(10, $rows['Opened the app']['value']);
        $this->assertSame(3, $rows['Trained once']['value']);
    }

    public function test_it_says_plainly_that_guests_are_not_counted(): void
    {
        $this->get(route('admin.reports.funnel'))
            ->assertOk()
            ->assertSee('Only people who created an account are counted');
    }

    public function test_an_empty_window_says_so_rather_than_showing_zeroes(): void
    {
        User::where('is_admin', false)->update(['created_at' => Carbon::today()->subDays(200)]);

        $this->get(route('admin.reports.funnel', ['days' => 7]))
            ->assertOk()
            ->assertSee('Nobody joined in this window');
    }
}
