<?php

namespace App\Support;

/**
 * The hardcoded onboarding slides shown on first launch. Content lives in
 * code, not the backend, so onboarding works instantly and fully offline.
 * The slide visuals are the <x-onboarding-visual> components, keyed by index.
 */
final class OnboardingSlides
{
    /** @return array<int, array{id: int, title: string, body: string, cta_label: string}> */
    public static function all(): array
    {
        return [
            [
                'id' => 1,
                'title' => 'Improve health and perform better',
                'body' => 'Strengthen your pelvic floor muscles to build control, boost physical performance, and feel confident every day.',
                'cta_label' => 'Next',
            ],
            [
                'id' => 2,
                'title' => 'It takes only minutes',
                'body' => 'Each session fits your day. In just a few minutes you can complete your daily exercises anytime, anywhere.',
                'cta_label' => 'Next',
            ],
            [
                'id' => 3,
                'title' => 'Track your progress',
                'body' => 'Watch your daily streak grow, measure your improvement, and unlock new exercises as you get stronger.',
                'cta_label' => 'Next',
            ],
            [
                'id' => 4,
                'title' => 'Schedule your training',
                'body' => 'Set gentle reminders at times that suit you. Stay consistent, build the habit, and see real results.',
                'cta_label' => 'Get Started',
            ],
        ];
    }
}
