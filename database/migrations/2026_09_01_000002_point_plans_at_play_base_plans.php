<?php

use App\Models\Plan;
use Illuminate\Database\Migrations\Migration;

/**
 * Point the seeded plans at the Play base plan ids they are actually sold as.
 *
 * The three plans are now base plans of the single `premium_monthly`
 * subscription, so Play reports a purchase as `premium_monthly:p1y` rather
 * than `premium_yearly`. resolvePlan matches the product id exactly, so until
 * these rows are updated every purchase on a deployed server resolves to
 * nothing and no subscription is recorded at all.
 *
 * PlanSeeder already carries the new values, but it only runs from
 * 2026_07_02_000002_seed_hardcoded_catalogues, which has long since run on any
 * existing deployment and will not run again. So the rows have to be moved
 * here.
 *
 * Keyed by slug, which is stable and is what the seeder keys on too.
 */
return new class extends Migration
{
    private const PRODUCT_IDS = [
        'premium-monthly'   => 'premium_monthly:monthly',
        'premium-quarterly' => 'premium_monthly:p3m',
        'premium-yearly'    => 'premium_monthly:p1y',
    ];

    public function up(): void
    {
        foreach (self::PRODUCT_IDS as $slug => $productId) {
            Plan::where('slug', $slug)->update(['store_product_id' => $productId]);
        }
    }

    public function down(): void
    {
        // The ids these plans were sold under before the base plan migration.
        $previous = [
            'premium-monthly'   => 'premium_monthly',
            'premium-quarterly' => 'premium_quarterly',
            'premium-yearly'    => 'premium_yearly',
        ];

        foreach ($previous as $slug => $productId) {
            Plan::where('slug', $slug)->update(['store_product_id' => $productId]);
        }
    }
};
