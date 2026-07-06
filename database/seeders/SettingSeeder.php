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
            'circle_glow_enabled' => 'bool', 'haptics_enabled' => 'bool',
            'onboarding_enabled' => 'bool',
            'inject_head' => 'html', 'inject_body_start' => 'html',
            'inject_body_end' => 'html', 'custom_css' => 'html',
            'home_stats' => 'json', 'home_features' => 'json', 'home_steps' => 'json',
        ];
        $groupMap = [
            'app_name' => 'branding', 'logo_path' => 'branding', 'favicon_path' => 'branding',
            'color_accent' => 'branding',
            'circle_size' => 'circle', 'circle_track_width' => 'circle', 'circle_glow_enabled' => 'circle',
            'haptics_enabled' => 'circle',
            'onboarding_enabled' => 'onboarding',
            'seo_title' => 'seo', 'seo_description' => 'seo', 'seo_keywords' => 'seo', 'seo_og_image' => 'seo',
            'inject_head' => 'code', 'inject_body_start' => 'code', 'inject_body_end' => 'code', 'custom_css' => 'code',
        ];

        foreach (SettingsService::defaults() as $key => $value) {
            $settings->set($key, $value, $typeMap[$key] ?? 'string', $groupMap[$key] ?? 'general');
        }
    }
}
