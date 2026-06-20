<?php

namespace Database\Seeders;

use App\Models\OnboardingSlide;
use Illuminate\Database\Seeder;

class OnboardingSeeder extends Seeder
{
    public function run(): void
    {
        $slides = [
            [
                'title' => 'Improve health & perform better',
                'icon' => 'heart',
                'body' => 'Strengthen your pelvic floor muscles to enhance control, boost physical performance, and build core confidence that lasts.',
                'cta_label' => 'Next',
            ],
            [
                'title' => 'It takes only minutes',
                'icon' => 'clock',
                'body' => 'Each session is designed to fit your busy life. In just 3 to 5 minutes a day, you can complete your daily exercises anytime, anywhere.',
                'cta_label' => 'Next',
            ],
            [
                'title' => 'Track your progress',
                'icon' => 'chart',
                'body' => 'Watch your daily streak grow, measure your endurance improvements, and unlock new challenges as your pelvic floor gets stronger.',
                'cta_label' => 'Next',
            ],
            [
                'title' => 'Schedule your training',
                'icon' => 'calendar',
                'body' => 'Set smart, quiet reminders at times that suit you. Stay consistent, build a habit, and see real results over time.',
                'cta_label' => 'Get Started',
            ],
        ];

        // Clean out any old active slides to ensure we have exactly 4.
        OnboardingSlide::truncate();

        foreach ($slides as $i => $slide) {
            OnboardingSlide::create(
                $slide + ['sort_order' => $i, 'media_type' => 'image', 'is_active' => true],
            );
        }
    }
}
