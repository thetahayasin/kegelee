<?php

namespace Database\Seeders;

use App\Services\SettingsService;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public function run(SettingsService $settings): void
    {
        // Persist the default set so every key is visible/editable in admin.
        $typeMap = [
            'circle_size' => 'int', 'circle_track_width' => 'int',
            'sessions_per_day' => 'int', 'plan_length_days' => 'int',
            'circle_glow_enabled' => 'bool', 'haptics_enabled' => 'bool',
            'sound_enabled' => 'bool', 'allow_extra_sessions' => 'bool',
            'onboarding_enabled' => 'bool',
            'inject_head' => 'html', 'inject_body_start' => 'html',
            'inject_body_end' => 'html', 'custom_css' => 'html',
            'home_stats' => 'json', 'home_features' => 'json', 'home_steps' => 'json',
        ];
        $groupMap = [
            'app_name' => 'branding', 'app_tagline' => 'branding', 'logo_path' => 'branding', 'favicon_path' => 'branding',
            'color_accent' => 'theme', 'color_accent_soft' => 'theme', 'color_success' => 'theme',
            'color_bg' => 'theme', 'color_surface' => 'theme', 'color_surface_2' => 'theme',
            'color_text' => 'theme', 'color_text_muted' => 'theme',
            'circle_size' => 'circle', 'circle_track_width' => 'circle', 'circle_glow_enabled' => 'circle',
            'circle_glow_color' => 'circle', 'haptics_enabled' => 'circle', 'sound_enabled' => 'circle',
            'sessions_per_day' => 'progression', 'allow_extra_sessions' => 'progression', 'plan_length_days' => 'progression',
            'onboarding_enabled' => 'onboarding',
            'seo_title' => 'seo', 'seo_description' => 'seo', 'seo_keywords' => 'seo', 'seo_og_image' => 'seo',
            'inject_head' => 'code', 'inject_body_start' => 'code', 'inject_body_end' => 'code', 'custom_css' => 'code',
        ];

        foreach (SettingsService::defaults() as $key => $value) {
            $settings->set($key, $value, $typeMap[$key] ?? 'string', $groupMap[$key] ?? 'general');
        }
    }
}
