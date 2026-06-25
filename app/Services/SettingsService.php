<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;

/**
 * Central, cached key/value store powering everything an operator can change
 * from the admin panel without touching code: branding, colours, the circle
 * UI, code injections, SEO, sessions-per-day and any future toggles.
 */
class SettingsService
{
    private const CACHE_KEY = 'app_settings_all';

    /** @var array<string, mixed>|null */
    private ?array $cache = null;

    /**
     * Sensible defaults so the app boots fully configured before an admin
     * touches anything. Every key here is overridable from the backend.
     *
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            // Branding
            'app_name' => 'Kegel Trainer',
            'app_tagline' => 'Train your pelvic floor',
            'logo_path' => null,
            'favicon_path' => null,
            'home_hero_image' => null,

            // Theme / colours
            'color_accent' => '#E8202A',
            'color_accent_soft' => '#FF4D57',
            'color_success' => '#22C55E',
            'color_bg' => '#0C0D11',
            'color_surface' => '#16181F',
            'color_surface_2' => '#1E2128',
            'color_text' => '#FFFFFF',
            'color_text_muted' => '#8A8F98',

            // Workout circle UI
            'circle_size' => 220,
            'circle_track_width' => 9,
            'circle_glow_enabled' => true,
            'circle_glow_color' => '#E8202A',
            'circle_animation_speed' => 0.12,
            'circle_glow_speed' => 0.45,
            // Playback tempo: 1 = real time, lower = slower (the count, beats and
            // glow all stretch together). 0.7 ≈ runs about 40% slower.
            'circle_time_scale' => 0.7,
            'circle_start_phase' => 'contract',
            'haptics_enabled' => true,
            'sound_enabled' => true,

            // Progression rules
            'sessions_per_day' => 2,
            'allow_extra_sessions' => true,
            'plan_length_days' => 30,

            // Onboarding
            'onboarding_enabled' => true,

            // Email (SMTP) - sender for verification / reset codes
            'mail_host' => '',
            'mail_port' => 587,
            'mail_username' => '',
            'mail_password' => '',
            'mail_encryption' => 'tls',
            'mail_from_address' => '',
            'mail_from_name' => '',

            // Google sign-in (Socialite)
            'google_login_enabled' => false,
            'google_client_id' => '',
            'google_client_secret' => '',

            // Google Play Billing
            'google_play_enabled' => false,
            'google_play_package_name' => 'com.kegeltrainer.app',
            'google_play_service_account_json' => '',

            // Public homepage
            'homepage_enabled' => true,
            'play_store_url' => '',
            'home_badge_text' => '#1 Pelvic Floor Training App',
            'home_headline' => 'A Stronger Pelvic Floor Starts Here',
            'home_subheadline' => 'Science-backed Kegel training with guided exercises, real-time coaching, and daily progress tracking — all in one beautiful app.',
            'home_cta_primary' => 'Start Free Today',
            'home_cta_secondary' => 'See how it works',
            'home_stats' => [
                ['value' => '50 K+', 'label' => 'Active users'],
                ['value' => '1 M+', 'label' => 'Sessions completed'],
                ['value' => '4.9', 'label' => 'App Store rating'],
                ['value' => '30 days', 'label' => 'Average to feel results'],
            ],
            'home_features' => [
                ['icon' => 'target', 'title' => 'Personalised programmes', 'desc' => 'Six difficulty levels that adapt as you improve. Every session is built for where you are today.'],
                ['icon' => 'activity', 'title' => 'Real-time coaching', 'desc' => 'The animated circle guides every contraction and relax phase so you never have to guess.'],
                ['icon' => 'trending-up', 'title' => 'Progress tracking', 'desc' => 'Charts, endurance measurements and streaks keep you motivated over the full 30-day plan.'],
                ['icon' => 'bell', 'title' => 'Smart reminders', 'desc' => 'Custom reminder schedules with calendar sync make it easy to build a lasting daily habit.'],
                ['icon' => 'book-open', 'title' => 'Knowledge library', 'desc' => 'Understand the science behind pelvic health with curated lessons from leading physios.'],
                ['icon' => 'shield', 'title' => 'Private by design', 'desc' => 'Your data stays on your device. No account required to start. No ads. Ever.'],
            ],
            'home_steps' => [
                ['number' => '01', 'title' => 'Choose your level', 'desc' => 'Answer a few quick questions and we match you to the right starting intensity.'],
                ['number' => '02', 'title' => 'Follow the circle', 'desc' => 'The animated ring tells you exactly when to squeeze and when to relax — no guessing.'],
                ['number' => '03', 'title' => 'Track your gains', 'desc' => 'Daily streaks, endurance tests and progress charts show you how far you\'ve come.'],
            ],
            'home_footer_tagline' => 'Built for people who take pelvic health seriously.',

            // SEO
            'seo_title' => 'Kegel Trainer - Pelvic Floor Exercises',
            'seo_description' => 'Strengthen your pelvic floor muscles with guided Kegel exercises, daily training plans and progress tracking.',
            'seo_keywords' => 'kegel, pelvic floor, exercises, training',
            'seo_og_image' => null,

            // Arbitrary code injection
            'inject_head' => '',
            'inject_body_start' => '',
            'inject_body_end' => '',
            'custom_css' => '',
        ];
    }

    /** @return array<string, mixed> */
    public function all(): array
    {
        if ($this->cache !== null) {
            return $this->cache;
        }

        $stored = Cache::rememberForever(self::CACHE_KEY, function () {
            return Setting::query()
                ->get(['key', 'value', 'type'])
                ->mapWithKeys(fn (Setting $s) => [$s->key => $this->castOut($s->value, $s->type)])
                ->all();
        });

        return $this->cache = array_merge(self::defaults(), $stored);
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->all()[$key] ?? $default;
    }

    public function set(string $key, mixed $value, string $type = 'string', string $group = 'general'): void
    {
        Setting::updateOrCreate(
            ['key' => $key],
            ['value' => $this->castIn($value, $type), 'type' => $type, 'group' => $group],
        );

        $this->flush();
    }

    public function flush(): void
    {
        $this->cache = null;
        Cache::forget(self::CACHE_KEY);
    }

    private function castOut(?string $value, string $type): mixed
    {
        return match ($type) {
            'bool'  => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            'int'   => (int) $value,
            'float' => (float) $value,
            'json'  => json_decode((string) $value, true),
            default => $value,
        };
    }

    private function castIn(mixed $value, string $type): ?string
    {
        return match ($type) {
            'bool' => $value ? '1' : '0',
            'json' => json_encode($value),
            default => $value === null ? null : (string) $value,
        };
    }
}
