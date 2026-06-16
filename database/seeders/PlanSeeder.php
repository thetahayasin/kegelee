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
                'name' => 'Free', 'slug' => 'free', 'price' => 0, 'interval' => 'lifetime',
                'description' => 'Core daily training and progress tracking.',
                'features' => ['Daily guided sessions', 'Progress tracker', 'First levels'],
                'is_featured' => false, 'sort_order' => 0,
            ],
            [
                'name' => 'Premium Monthly', 'slug' => 'premium-monthly', 'price' => 9.99, 'interval' => 'month',
                'description' => 'Unlock every exercise, all levels and premium content.',
                'features' => ['All exercises unlocked', 'All difficulty levels', 'Premium exercises', 'Detailed analytics'],
                'trial_days' => 7, 'is_featured' => true, 'store_product_id' => 'premium_monthly', 'sort_order' => 1,
            ],
            [
                'name' => 'Premium Yearly', 'slug' => 'premium-yearly', 'price' => 59.99, 'interval' => 'year',
                'description' => 'Best value - everything in Premium, billed yearly.',
                'features' => ['All exercises unlocked', 'All difficulty levels', 'Premium exercises', 'Detailed analytics', 'Save 50%'],
                'trial_days' => 7, 'is_featured' => false, 'store_product_id' => 'premium_yearly', 'sort_order' => 2,
            ],
            [
                'name' => 'Lifetime', 'slug' => 'lifetime', 'price' => 129.99, 'interval' => 'lifetime',
                'description' => 'Pay once, train forever.',
                'features' => ['Everything in Premium', 'One-time payment', 'Lifetime updates'],
                'is_featured' => false, 'store_product_id' => 'lifetime', 'sort_order' => 3,
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
