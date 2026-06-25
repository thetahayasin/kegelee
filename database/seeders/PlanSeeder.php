<?php

namespace Database\Seeders;

use App\Models\Discount;
use App\Models\Plan;
use Illuminate\Database\Seeder;

class PlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            [
                'name' => 'Monthly', 'slug' => 'premium-monthly', 'price' => 9.99, 'interval' => 'month',
                'description' => 'Full access, billed monthly.',
                // 'trial_days' => 7, 'is_featured' => false, 'store_product_id' => 'premium_monthly', 'sort_order' => 1,
            ],
            [
                'name' => '3 Months', 'slug' => 'premium-quarterly', 'price' => 19.99, 'interval' => 'month', 'interval_count' => 3,
                'description' => 'Save 33% - billed every 3 months.',
                // 'trial_days' => 7, 'is_featured' => true, 'store_product_id' => 'premium_quarterly', 'sort_order' => 2,
            ],
            [
                'name' => 'Yearly', 'slug' => 'premium-yearly', 'price' => 49.99, 'interval' => 'year',
                'description' => 'Best value - billed once a year.',
                // 'trial_days' => 7, 'is_featured' => false, 'store_product_id' => 'premium_yearly', 'sort_order' => 3,
            ],
            [
                'name' => 'Lifetime', 'slug' => 'lifetime', 'price' => 129.99, 'interval' => 'lifetime',
                'description' => 'Pay once, train forever.',
                'is_featured' => false, 'store_product_id' => 'lifetime', 'sort_order' => 4,
            ],
        ];

        foreach ($plans as $plan) {
            Plan::updateOrCreate(['slug' => $plan['slug']], $plan + ['currency' => 'USD', 'is_active' => true]);
        }

        Discount::updateOrCreate(
            ['code' => 'WELCOME50'],
            [
                'description' => 'Welcome offer - 50% off the first payment.',
                'type' => 'percent',
                'value' => 50,
                'max_redemptions' => null,
                'is_active' => true,
            ],
        );
    }
}
