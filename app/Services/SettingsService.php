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
            'haptics_enabled' => true,
            'sound_enabled' => true,

            // Progression rules
            'sessions_per_day' => 2,
            'allow_extra_sessions' => true,
            'plan_length_days' => 30,

            // Onboarding
            'onboarding_enabled' => true,

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
            'bool' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            'int' => (int) $value,
            'json' => json_decode((string) $value, true),
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
