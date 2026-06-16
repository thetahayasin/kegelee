<?php

namespace App\Livewire\Admin;

use App\Services\SettingsService;
use Livewire\Attributes\Layout;
use Livewire\Component;
use Livewire\WithFileUploads;

#[Layout('components.layouts.admin')]
class Settings extends Component
{
    use WithFileUploads;

    /** @var array<string, mixed> */
    public array $values = [];

    public $logoUpload = null;
    public $faviconUpload = null;
    public $ogUpload = null;
    public $homeImageUpload = null;

    public ?string $savedMessage = null;

    /** Field type map: drives both rendering and persistence. */
    public const TYPES = [
        'circle_size' => 'int', 'circle_track_width' => 'int',
        'circle_animation_speed' => 'float', 'circle_glow_speed' => 'float', 'circle_time_scale' => 'float',
        'sessions_per_day' => 'int', 'plan_length_days' => 'int',
        'circle_glow_enabled' => 'bool', 'haptics_enabled' => 'bool',
        'sound_enabled' => 'bool', 'allow_extra_sessions' => 'bool', 'onboarding_enabled' => 'bool',
        'inject_head' => 'html', 'inject_body_start' => 'html', 'inject_body_end' => 'html', 'custom_css' => 'html',
        'color_accent' => 'color', 'color_accent_soft' => 'color', 'color_success' => 'color',
        'color_bg' => 'color', 'color_surface' => 'color', 'color_surface_2' => 'color',
        'color_text' => 'color', 'color_text_muted' => 'color', 'circle_glow_color' => 'color',
    ];

    public function mount(SettingsService $settings): void
    {
        foreach (SettingsService::defaults() as $key => $default) {
            $this->values[$key] = $settings->get($key, $default);
        }
    }

    public function save(SettingsService $settings)
    {
        $this->validate([
            'logoUpload' => 'nullable|image|max:4096',
            'faviconUpload' => 'nullable|image|max:1024',
            'ogUpload' => 'nullable|image|max:4096',
            'homeImageUpload' => 'nullable|image|max:4096',
        ]);

        if ($this->logoUpload) {
            $this->values['logo_path'] = $this->logoUpload->store('branding', 'public');
        }
        if ($this->faviconUpload) {
            $this->values['favicon_path'] = $this->faviconUpload->store('branding', 'public');
        }
        if ($this->ogUpload) {
            $this->values['seo_og_image'] = $this->ogUpload->store('branding', 'public');
        }
        if ($this->homeImageUpload) {
            $this->values['home_hero_image'] = $this->homeImageUpload->store('branding', 'public');
        }

        $groups = [
            'app_name' => 'branding', 'app_tagline' => 'branding', 'logo_path' => 'branding',
            'favicon_path' => 'branding', 'home_hero_image' => 'branding',
            'seo_og_image' => 'seo',
        ];

        foreach ($this->values as $key => $value) {
            $type = self::TYPES[$key] ?? 'string';
            if ($type === 'bool') {
                $value = (bool) $value;
            }
            $settings->set($key, $value, $type, $groups[$key] ?? 'general');
        }

        $this->reset(['logoUpload', 'faviconUpload', 'ogUpload', 'homeImageUpload']);
        $this->savedMessage = 'Settings saved.';
    }

    public function render(SettingsService $settings)
    {
        return view('livewire.admin.settings', [
            'logoUrl' => $this->values['logo_path'] ? \Illuminate\Support\Facades\Storage::url($this->values['logo_path']) : null,
            'homeImageUrl' => $this->values['home_hero_image'] ? \Illuminate\Support\Facades\Storage::url($this->values['home_hero_image']) : null,
        ]);
    }
}
