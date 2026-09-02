<?php

namespace Tests\Feature\Reports;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The rows behind a report, as a spreadsheet.
 *
 * Every page here is a count, and a count is exactly the thing that can be
 * quietly wrong for a month. Being able to open the same rows elsewhere is
 * what makes a number checkable rather than merely believable.
 */
class ReportExportTest extends TestCase
{
    use RefreshDatabase, SeedsReportData;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedReportData();
    }

    private function csv(string $report, array $query = []): string
    {
        $response = $this->actingAs($this->admin)
            ->get(route('admin.reports.export', array_merge(['report' => $report], $query)));

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        return $response->streamedContent();
    }

    public function test_it_names_the_file_after_the_report_and_the_window(): void
    {
        $response = $this->actingAs($this->admin)
            ->get(route('admin.reports.export', ['report' => 'events', 'days' => 7]));

        $response->assertOk();
        $response->assertDownload('kegel-events-'.now()->format('Y-m-d').'-7d.csv');
    }

    public function test_the_events_export_has_headings_a_person_can_read(): void
    {
        $csv = $this->csv('events');

        $this->assertStringContainsString('when,person,email,"what happened",about,kind,extra', $csv);
        // The label, not the machine name.
        $this->assertStringContainsString('Finished the quiz', $csv);
        $this->assertStringNotContainsString('quiz_completed', $csv);
    }

    public function test_the_users_export_carries_the_counts_the_reports_use(): void
    {
        $csv = $this->csv('users');

        $this->assertStringContainsString('joined,name,email,verified,"last seen","days completed",workouts,"subscribed now"', $csv);
        $this->assertStringContainsString('person1@example.com', $csv);
        // The admin is not a customer and is not in the export.
        $this->assertStringNotContainsString('boss@example.com', $csv);
    }

    public function test_the_deletions_export_carries_nothing_that_names_anybody(): void
    {
        \App\Models\AccountDeletion::create([
            'deleted_at' => now()->subDay(),
            'days_since_signup' => 20,
            'had_subscription' => false,
            'sessions_done' => 2,
        ]);

        $csv = $this->csv('deletions');

        $this->assertStringContainsString('deleted,"days they stayed","was paying","workouts done"', $csv);
        $this->assertStringNotContainsString('@', $csv);
    }

    public function test_every_report_can_be_exported(): void
    {
        foreach (['events', 'users', 'sessions', 'subscriptions', 'devices', 'deletions'] as $report) {
            $this->assertNotSame('', $this->csv($report));
        }
    }

    public function test_an_unknown_report_is_a_404_rather_than_an_empty_file(): void
    {
        $this->actingAs($this->admin)
            ->get(route('admin.reports.export', ['report' => 'everything']))
            ->assertNotFound();
    }

    public function test_a_member_cannot_export_anything(): void
    {
        $this->actingAs(User::factory()->create(['is_admin' => false]));

        $response = $this->get(route('admin.reports.export', ['report' => 'users']));

        $this->assertContains($response->getStatusCode(), [302, 403]);
    }

    public function test_a_signed_out_visitor_cannot_export_anything(): void
    {
        $this->get(route('admin.reports.export', ['report' => 'users']))
            ->assertRedirect(route('admin.login'));
    }
}
