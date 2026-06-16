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
                'title' => 'Meet your pelvic floor',
                'body' => "Deep inside your body, a hammock of muscles called the pelvic floor supports your bladder, bowel and core. Most people never train them - until now.",
                'cta_label' => 'Next',
            ],
            [
                'title' => 'Why it matters',
                'body' => "Strong pelvic floor muscles improve bladder control, core stability, recovery and confidence. Like any muscle, they get stronger with regular, guided exercise.",
                'cta_label' => 'Next',
            ],
            [
                'title' => 'How Kegels work',
                'body' => "A Kegel is simply squeezing and releasing these muscles. Imagine stopping the flow of urine midstream - that gentle lift is the contraction you will train.",
                'cta_label' => 'Next',
            ],
            [
                'title' => 'Train a little every day',
                'body' => "Each day you complete a couple of short guided sessions. Follow the glowing circle: contract when it pulses red, relax when it fades. That is all it takes.",
                'cta_label' => 'Next',
            ],
            [
                'title' => 'Grow stronger over time',
                'body' => "As you keep your streak, harder exercises unlock and your level rises. Track your endurance in the Progress Tracker and watch your record climb.",
                'cta_label' => "Let's start",
            ],
        ];

        foreach ($slides as $i => $slide) {
            OnboardingSlide::updateOrCreate(
                ['sort_order' => $i],
                $slide + ['media_type' => 'image', 'is_active' => true],
            );
        }
    }
}
