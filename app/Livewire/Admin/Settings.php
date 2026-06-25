<?php

namespace App\Livewire\Admin;

use App\Services\SettingsService;
use Illuminate\Support\Facades\Hash;
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

    public string $currentPassword = '';

    public string $adminNewPassword = '';

    public string $adminNewPassword_confirmation = '';

    public ?string $passwordMessage = null;

    /** Field type map: drives both rendering and persistence. */
    public const TYPES = [
        'circle_size' => 'int', 'circle_track_width' => 'int',
        'circle_animation_speed' => 'float', 'circle_glow_speed' => 'float', 'circle_time_scale' => 'float',
        'sessions_per_day' => 'int', 'plan_length_days' => 'int',
        'circle_glow_enabled' => 'bool', 'haptics_enabled' => 'bool',
        'sound_enabled' => 'bool', 'allow_extra_sessions' => 'bool', 'onboarding_enabled' => 'bool', 'app_enabled' => 'bool',
        'inject_head' => 'html', 'inject_body_start' => 'html', 'inject_body_end' => 'html', 'custom_css' => 'html',
        'color_accent' => 'color', 'color_accent_soft' => 'color', 'color_success' => 'color',
        'color_bg' => 'color', 'color_surface' => 'color', 'color_surface_2' => 'color',
        'color_text' => 'color', 'color_text_muted' => 'color', 'circle_glow_color' => 'color',
        'mail_port' => 'int', 'google_login_enabled' => 'bool',
        'google_play_enabled' => 'bool',
        'google_play_service_account_json' => 'html',
        'subscription_trial_days' => 'int',
        'homepage_enabled' => 'bool',
        'home_stats' => 'json',
        'home_features' => 'json',
        'home_steps' => 'json',
        'sync_enabled' => 'bool',
        'sync_interval_minutes' => 'int',
        'sync_session_lifetime_days' => 'int',
    ];

    public function mount(SettingsService $settings): void
    {
        foreach (SettingsService::defaults() as $key => $default) {
            $value = $settings->get($key, $default);
            // JSON fields decoded to arrays by SettingsService — re-encode as
            // formatted strings so textareas display them correctly.
            if ((self::TYPES[$key] ?? '') === 'json' && is_array($value)) {
                $value = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            }
            $this->values[$key] = $value;
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
            'google_play_enabled' => 'google_play',
            'google_play_package_name' => 'google_play',
            'subscription_trial_days' => 'google_play',
            'google_play_service_account_json' => 'google_play',
            'homepage_enabled' => 'homepage',
            'home_badge_text' => 'homepage',
            'home_headline' => 'homepage',
            'home_subheadline' => 'homepage',
            'home_cta_primary' => 'homepage',
            'home_cta_secondary' => 'homepage',
            'home_stats' => 'homepage',
            'home_features' => 'homepage',
            'home_steps' => 'homepage',
            'home_footer_tagline' => 'homepage',
            'sync_enabled' => 'sync',
            'sync_interval_minutes' => 'sync',
            'sync_session_lifetime_days' => 'sync',
        ];

        foreach ($this->values as $key => $value) {
            $type = self::TYPES[$key] ?? 'string';
            if ($type === 'bool') {
                $value = (bool) $value;
            } elseif ($type === 'json' && is_string($value)) {
                // Textarea gives us a JSON string; decode to array so castIn
                // can re-encode it cleanly for storage.
                $value = json_decode($value, true) ?? [];
            }
            $settings->set($key, $value, $type, $groups[$key] ?? 'general');
        }

        $this->reset(['logoUpload', 'faviconUpload', 'ogUpload', 'homeImageUpload']);
        $this->savedMessage = 'Settings saved.';
    }

    /**
     * Remove a saved branding/SEO image: delete the stored file and clear the
     * setting immediately (so it persists without needing a full Save).
     */
    public function removeImage(string $key, SettingsService $settings): void
    {
        $groups = [
            'logo_path'       => 'branding',
            'favicon_path'    => 'branding',
            'home_hero_image' => 'branding',
            'seo_og_image'    => 'seo',
        ];

        if (! isset($groups[$key])) {
            return;
        }

        $path = $this->values[$key] ?? null;
        if ($path && \Illuminate\Support\Facades\Storage::disk('public')->exists($path)) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($path);
        }

        $this->values[$key] = null;
        $settings->set($key, null, 'string', $groups[$key]);
        $this->savedMessage = 'Image removed.';
    }

    public function changeAdminPassword(): void
    {
        $this->validate([
            'currentPassword' => 'required',
            'adminNewPassword' => 'required|string|min:6|confirmed',
        ]);

        $user = auth()->user();

        if (! Hash::check($this->currentPassword, $user->password)) {
            $this->addError('currentPassword', 'Current password is incorrect.');
            return;
        }

        $user->update(['password' => Hash::make($this->adminNewPassword)]);

        $this->reset(['currentPassword', 'adminNewPassword', 'adminNewPassword_confirmation']);
        $this->passwordMessage = 'Password updated.';
    }

    public function render(SettingsService $settings)
    {
        $url = fn ($key) => ! empty($this->values[$key])
            ? \Illuminate\Support\Facades\Storage::url($this->values[$key])
            : null;

        return view('livewire.admin.settings', [
            'logoUrl'      => $url('logo_path'),
            'faviconUrl'   => $url('favicon_path'),
            'homeImageUrl' => $url('home_hero_image'),
            'ogImageUrl'   => $url('seo_og_image'),
        ]);
    }
}
