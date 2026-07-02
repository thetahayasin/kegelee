<?php

namespace Database\Seeders;

use App\Models\Plan;
use Illuminate\Database\Seeder;

/**
 * The three fixed subscription tiers. Google Play owns billing, renewals,
 * cancellations and proration - these rows only map Play product IDs to
 * plans and drive the paywall display. Create matching subscription
 * products with these IDs in the Play Console.
 */
class PlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            [
                'name' => '1 Month',
                'slug' => 'premium-monthly',
                'price' => 5.99,
                'interval' => 'month',
                'interval_count' => 1,
                'description' => 'Full access, billed monthly.',
                'store_product_id' => 'premium_monthly',
                'is_featured' => false,
                'sort_order' => 1,
            ],
            [
                'name' => '3 Months',
                'slug' => 'premium-quarterly',
                'price' => 15.99,
                'interval' => 'month',
                'interval_count' => 3,
                'description' => 'Save 11%, billed every 3 months.',
                'store_product_id' => 'premium_quarterly',
                'is_featured' => true,
                'sort_order' => 2,
            ],
            [
                'name' => '1 Year',
                'slug' => 'premium-yearly',
                'price' => 65.99,
                'interval' => 'year',
                'interval_count' => 1,
                'description' => 'One payment for the whole year.',
                'store_product_id' => 'premium_yearly',
                'is_featured' => false,
                'sort_order' => 3,
            ],
        ];

        foreach ($plans as $plan) {
            Plan::updateOrCreate(['slug' => $plan['slug']], $plan + ['currency' => 'USD', 'is_active' => true]);
        }

        // Retire anything not in the fixed set (old lifetime/free plans).
        Plan::whereNotIn('slug', array_column($plans, 'slug'))->update(['is_active' => false]);
    }
}
