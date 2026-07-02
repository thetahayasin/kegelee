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
                'title' => 'Stronger, the natural way',
                'body' => 'Kegel exercises train your pelvic floor like any workout trains a muscle. No pills, no side effects. Just real strength that lasts.',
                'cta_label' => 'Next',
            ],
            [
                'id' => 2,
                'title' => 'Only minutes a day',
                'body' => 'Sessions start at just one minute. Do them anywhere, anytime. Nobody will even notice.',
                'cta_label' => 'Next',
            ],
            [
                'id' => 3,
                'title' => 'Watch yourself improve',
                'body' => 'Finish your daily sessions, grow your streak, and unlock new exercises as you get stronger week after week.',
                'cta_label' => 'Next',
            ],
            [
                'id' => 4,
                'title' => 'Build the habit',
                'body' => 'Set reminders that fit your day. A little effort every day brings lasting change.',
                'cta_label' => 'Get Started',
            ],
        ];
    }
}
