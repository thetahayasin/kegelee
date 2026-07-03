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
                'title' => 'Get stronger, naturally',
                'body' => 'You train your pelvic floor like any other muscle. No pills, no side effects. You put in a few minutes, you keep the strength.',
                'cta_label' => 'Next',
            ],
            [
                'id' => 2,
                'title' => 'You only need a minute',
                'body' => 'Your first sessions take one minute. Do them on the couch, at your desk, anywhere.',
                'cta_label' => 'Next',
            ],
            [
                'id' => 3,
                'title' => 'Watch yourself get stronger',
                'body' => 'You finish your sessions, your streak grows, and new exercises unlock as you improve. You will feel the difference week after week.',
                'cta_label' => 'Next',
            ],
            [
                'id' => 4,
                'title' => 'Make it your habit',
                'body' => 'Set reminders that fit your day. A few minutes daily, and you get results that last.',
                'cta_label' => 'Get Started',
            ],
        ];
    }
}
