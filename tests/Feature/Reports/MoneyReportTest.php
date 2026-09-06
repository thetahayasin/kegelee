<?php

namespace Tests\Feature\Reports;

use App\Livewire\Admin\Reports\Money;
use App\Models\UserEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Livewire\Livewire;
use Tests\TestCase;

class MoneyReportTest extends TestCase
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
        return Livewire::test(Money::class)->set('days', $days);
    }

    private function cards(): array
    {
        return collect($this->page()->viewData('cards'))->keyBy('label')->all();
    }

    public function test_it_counts_purchases_and_paywall_views(): void
    {
        $cards = $this->cards();

        $this->assertSame('1', $cards['Purchases']['value']);
        $this->assertSame('2', $cards['People who saw the paywall']['value']);
        $this->assertSame('50% of them bought something', $cards['People who saw the paywall']['detail']);
    }

    public function test_it_says_which_screen_sent_people_to_the_paywall(): void
    {
        $source = collect($this->page()->viewData('bySource'))->firstWhere('label', 'difficulty');

        $this->assertSame(2, $source['people']);
        $this->assertSame(1, $source['bought']);
        $this->assertSame(50, $source['pct']);
    }

    public function test_the_reason_a_purchase_did_not_finish_is_said_in_plain_words(): void
    {
        $this->event($this->people[4], UserEvent::PURCHASE_FAILED, 'premium-monthly', 'cancelled', Carbon::today()->subDay());
        $this->event($this->people[5], UserEvent::PURCHASE_FAILED, 'premium-monthly', 'store_error', Carbon::today()->subDay());

        $failures = collect($this->page()->viewData('failures'))->keyBy('label');

        // Changing your mind is by far the biggest bucket, and reading it as
        // failure is how a working checkout gets rebuilt for nothing.
        $this->assertSame(1, $failures['Changed their mind - not a problem']['value']);
        $this->assertSame(1, $failures['The store refused it']['value']);

        $this->get(route('admin.reports.money'))
            ->assertOk()
            ->assertSee('Changed their mind - not a problem');
    }

    public function test_a_store_code_we_have_no_words_for_is_still_shown(): void
    {
        $this->event($this->people[6], UserEvent::PURCHASE_FAILED, 'premium-monthly', 'weird_code', Carbon::today()->subDay());

        $failures = collect($this->page()->viewData('failures'))->pluck('label');

        $this->assertTrue($failures->contains('Store code: weird_code'));
    }

    public function test_it_lists_the_plans_that_are_live_now(): void
    {
        $plans = collect($this->page()->viewData('plans'))->keyBy('label');

        $this->assertSame(1, $plans->first()['live']);
        $this->assertSame(1, $plans->first()['bought']);
    }

    public function test_it_lists_recent_subscriptions_with_a_link_to_the_person(): void
    {
        $recent = $this->page()->viewData('recent');

        $this->assertCount(1, $recent);
        $this->assertSame('person1@example.com', $recent[0]['email']);
        $this->assertTrue($recent[0]['trial']);
    }

    public function test_the_page_says_money_is_before_googles_cut(): void
    {
        $this->get(route('admin.reports.money'))
            ->assertOk()
            ->assertSee("before Google's cut", false);
    }

    public function test_the_recent_table_reports_the_status_that_is_actually_true(): void
    {
        // The table exists so a figure above it can be checked against a name,
        // which makes it the worst place in the admin to print a status the
        // dates contradict. It used to select the raw column, so a row whose
        // expiry never arrived read "Active" underneath cards that had
        // correctly left it out.
        \App\Models\Subscription::create([
            'user_id' => \App\Models\User::factory()->create()->id,
            'plan_id' => \App\Models\Plan::first()?->id,
            'status' => 'active',
            'store' => 'revenuecat',
            'purchase_token' => 'lapsed-but-says-active',
            'started_at' => now()->subMonths(2),
            'ends_at' => now()->subDay(),
            'auto_renewing' => true,
        ]);

        $row = collect($this->page()->viewData('recent'))
            ->firstWhere('started', now()->subMonths(2)->format('j M Y'));

        $this->assertNotNull($row);
        $this->assertSame('expired', $row['status']);
    }
}
