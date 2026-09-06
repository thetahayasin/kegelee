<?php

namespace Tests\Feature;

use App\Livewire\Admin\Dashboard;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

/**
 * One definition of "entitled", enforced.
 *
 * The rule exists twice by necessity: isEntitled() answers for a loaded row,
 * scopeEntitled() answers in SQL for the count() queries that cannot load
 * rows. Two copies of one sentence is exactly the shape that drifts, and it
 * already had: the dashboard counted `status IN (active, trialing)` with no
 * date bound and so reported three subscribers when two of them had run out,
 * while the reports bounded the dates but dropped cancelled subscribers who
 * were still inside a period they had paid for.
 *
 * The first test here is the one that matters. It walks every status against
 * every shape of ends_at and asserts the scope and the predicate select the
 * same rows, so the two cannot disagree again without a red test - whichever
 * of them is edited.
 */
class SubscriptionEntitledScopeTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Every status the column can actually hold.
     *
     * This is the schema's enum, not the wider set isEntitled() matches on.
     * 'paused' and 'on_hold' appear in that match as deny branches but the
     * column has no such members - both stores map a pause onto 'canceled'
     * and keep the store's own word in `store_state` - so writing one here
     * fails the CHECK constraint rather than testing anything. The deny
     * branches stay where they are as a guard against that mapping changing.
     */
    private const STATUSES = [
        'active', 'trialing', 'canceled', 'past_due', 'expired',
    ];

    private function sub(string $status, ?string $endsAt, bool $autoRenewing = true): Subscription
    {
        return Subscription::create([
            'user_id' => User::factory()->create()->id,
            'plan_id' => Plan::where('slug', 'premium-monthly')->value('id'),
            'status' => $status,
            'store' => 'revenuecat',
            'purchase_token' => 'TOKEN-'.uniqid('', true),
            'started_at' => now()->subMonths(2),
            'ends_at' => $endsAt,
            'auto_renewing' => $autoRenewing,
        ]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\PlanSeeder::class);
    }

    public function test_the_scope_and_the_predicate_agree_on_every_combination(): void
    {
        $dates = [
            'null' => null,
            'past' => now()->subDay()->toDateTimeString(),
            'future' => now()->addDay()->toDateTimeString(),
        ];

        $expected = [];

        foreach (self::STATUSES as $status) {
            foreach ($dates as $shape => $endsAt) {
                $sub = $this->sub($status, $endsAt);

                if ($sub->isEntitled()) {
                    $expected[$sub->id] = "{$status}/{$shape}";
                }
            }
        }

        $selected = Subscription::entitled()->pluck('id')->all();

        sort($selected);
        $expectedIds = array_keys($expected);
        sort($expectedIds);

        $this->assertSame(
            $expectedIds,
            $selected,
            'scopeEntitled() and isEntitled() disagree. Entitled by the predicate: '
                .json_encode($expected),
        );
    }

    public function test_a_lapsed_row_whose_status_never_moved_is_not_a_subscriber(): void
    {
        // Precisely the reported bug: three subscriptions, two of which ran out
        // without their EXPIRATION arriving, so the status column still says
        // 'active' on all three.
        $this->sub('active', now()->subMonth()->toDateTimeString());
        $this->sub('active', now()->subDay()->toDateTimeString());
        $this->sub('active', now()->addWeek()->toDateTimeString());

        $this->assertSame(1, Subscription::entitled()->distinct('user_id')->count('user_id'));

        Livewire::actingAs(User::factory()->create(['is_admin' => true]))
            ->test(Dashboard::class)
            ->assertViewHas('stats', function (array $stats) {
                $card = collect($stats)->firstWhere('label', 'Subscribers');

                return $card !== null && $card['value'] === 1;
            });
    }

    public function test_a_cancelled_subscriber_still_inside_their_period_is_entitled_but_not_renewing(): void
    {
        // The distinction the money figures rest on: they still have access,
        // and their next payment is never arriving.
        $this->sub('canceled', now()->addWeek()->toDateTimeString(), autoRenewing: false);

        $this->assertSame(1, Subscription::entitled()->count());
        $this->assertSame(0, Subscription::renewing()->count());
    }

    public function test_a_lapsed_row_does_not_count_as_renewing_however_the_flag_reads(): void
    {
        // auto_renewing stays true forever on a row whose expiry was missed, so
        // the flag alone would forecast revenue from someone already gone.
        $sub = $this->sub('active', now()->subDay()->toDateTimeString(), autoRenewing: true);

        $this->assertSame(0, Subscription::renewing()->count());
        $this->assertFalse($sub->willRenew(), 'the row is expired; it cannot renew');
    }

    public function test_the_subscriptions_summary_cards_sum_to_the_entitled_total(): void
    {
        // The four status cards are entitled() split four ways, so they must
        // account for every entitled row and no others. They previously did
        // not describe one population at all.
        foreach (self::STATUSES as $status) {
            $this->sub($status, now()->addWeek()->toDateTimeString());
            $this->sub($status, now()->subWeek()->toDateTimeString());
        }

        $cards = collect(['active', 'trialing', 'canceled', 'past_due'])
            ->sum(fn (string $s) => Subscription::entitled()->where('status', $s)->count());

        $this->assertSame(Subscription::entitled()->count(), $cards);
    }

    public function test_the_scope_survives_a_join_against_plans(): void
    {
        // The money queries join plans and then filter on these columns. An
        // unqualified `status` would be ambiguous the day plans gains one.
        $this->sub('active', now()->addWeek()->toDateTimeString());

        $rows = Subscription::entitled()
            ->join('plans', 'plans.id', '=', 'subscriptions.plan_id')
            ->count();

        $this->assertSame(1, $rows);
    }
}
