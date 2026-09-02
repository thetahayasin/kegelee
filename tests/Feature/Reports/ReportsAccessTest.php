<?php

namespace Tests\Feature\Reports;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Every report is behind the admin gate, without exception.
 *
 * These pages show email addresses, purchase histories and how often each
 * person trains. A page that is only unlinked is not protected, so this walks
 * the whole list rather than trusting that a new one was added inside the
 * right group.
 */
class ReportsAccessTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<int, string> */
    private function routes(): array
    {
        return [
            route('admin.reports.overview'),
            route('admin.reports.funnel'),
            route('admin.reports.retention'),
            route('admin.reports.training'),
            route('admin.reports.money'),
            route('admin.reports.engagement'),
            route('admin.reports.export', ['report' => 'events']),
        ];
    }

    public function test_a_signed_out_visitor_is_sent_to_the_admin_login(): void
    {
        foreach ($this->routes() as $url) {
            $this->get($url)->assertRedirect(route('admin.login'));
        }
    }

    public function test_an_ordinary_member_cannot_reach_any_of_them(): void
    {
        $this->actingAs(User::factory()->create(['is_admin' => false]));

        foreach ($this->routes() as $url) {
            $response = $this->get($url);

            $this->assertContains(
                $response->getStatusCode(),
                [302, 403],
                "Expected {$url} to be closed to a member, got {$response->getStatusCode()}.",
            );
        }
    }

    public function test_an_admin_can_reach_all_of_them(): void
    {
        $this->actingAs(User::factory()->create(['is_admin' => true]));

        foreach ($this->routes() as $url) {
            $this->get($url)->assertOk();
        }
    }

    public function test_the_window_only_accepts_the_three_lengths_offered(): void
    {
        // It comes off the query string, and an unbounded value here is a full
        // table scan on request.
        $this->actingAs(User::factory()->create(['is_admin' => true]));

        $this->get(route('admin.reports.overview', ['days' => 9999]))
            ->assertOk()
            // Fell back to the default rather than counting three years.
            ->assertSee('the last 30 days');
    }
}
