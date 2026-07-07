<?php

namespace App\Livewire\Admin;

use App\Services\SettingsService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
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

    public ?string $savedMessage = null;

    public string $adminEmail = '';

    public string $emailCurrentPassword = '';

    public ?string $emailMessage = null;

    public string $currentPassword = '';

    public string $adminNewPassword = '';

    public string $adminNewPassword_confirmation = '';

    public ?string $passwordMessage = null;

    public ?string $smtpMessage = null;

    public bool $smtpOk = false;

    /** Field type map: drives both rendering and persistence. */
    public const TYPES = [
        'circle_size' => 'int', 'circle_track_width' => 'int',
        'circle_animation_speed' => 'float', 'circle_glow_speed' => 'float', 'circle_time_scale' => 'float',
        'circle_glow_enabled' => 'bool', 'haptics_enabled' => 'bool',
        'onboarding_enabled' => 'bool', 'app_enabled' => 'bool',
        'inject_head' => 'html', 'inject_body_start' => 'html', 'inject_body_end' => 'html', 'custom_css' => 'html',
        'color_accent' => 'color',
        'mail_port' => 'int', 'google_login_enabled' => 'bool',
        'google_play_enabled' => 'bool',
        'google_play_service_account_json' => 'html',
        'subscription_trial_days' => 'int',
        'homepage_enabled' => 'bool',
        'home_stats' => 'json',
        'home_features' => 'json',
        'home_steps' => 'json',
    ];

    public function mount(SettingsService $settings): void
    {
        $this->adminEmail = (string) auth()->user()->email;

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

        $groups = [
            'app_name' => 'branding', 'logo_path' => 'branding',
            'favicon_path' => 'branding', 'color_accent' => 'branding',
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

        $this->reset(['logoUpload', 'faviconUpload', 'ogUpload']);
        $this->savedMessage = 'Settings saved.';
    }

    /**
     * Remove a saved branding/SEO image: delete the stored file and clear the
     * setting immediately (so it persists without needing a full Save).
     */
    public function removeImage(string $key, SettingsService $settings): void
    {
        $groups = [
            'logo_path'    => 'branding',
            'favicon_path' => 'branding',
            'seo_og_image' => 'seo',
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

    /**
     * Send a test email to the signed-in admin using the SMTP values currently
     * in the form (no need to save first), so credentials can be verified
     * before going live. With a blank host the server default mailer is used
     * (the log driver in local dev).
     */
    public function testSmtp(): void
    {
        $v = $this->values;
        $host = trim((string) ($v['mail_host'] ?? ''));

        config([
            'mail.from.address' => ($v['mail_from_address'] ?? '') ?: ('no-reply@'.(parse_url(config('app.url'), PHP_URL_HOST) ?: 'localhost')),
            'mail.from.name' => ($v['mail_from_name'] ?? '') ?: ($v['app_name'] ?? 'App'),
        ]);

        if ($host !== '') {
            $encryption = $v['mail_encryption'] ?? 'tls';
            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp.host' => $host,
                'mail.mailers.smtp.port' => (int) ($v['mail_port'] ?? 587),
                'mail.mailers.smtp.username' => ($v['mail_username'] ?? '') ?: null,
                'mail.mailers.smtp.password' => ($v['mail_password'] ?? '') ?: null,
                'mail.mailers.smtp.encryption' => $encryption === 'none' ? null : $encryption,
                // Fail fast instead of hanging the request on a bad host/port.
                'mail.mailers.smtp.timeout' => 10,
            ]);
        }

        $to = auth()->user()->email;

        try {
            \Illuminate\Support\Facades\Mail::raw(
                "This is a test email from your Kegelee admin panel.\n\nIf you are reading it, the SMTP settings work.",
                fn ($message) => $message->to($to)->subject('Kegelee SMTP test'),
            );

            $this->smtpOk = true;
            $this->smtpMessage = $host !== ''
                ? "Test email sent to {$to} via {$host}. Check the inbox (and spam)."
                : "Test email dispatched to {$to} using the server default mailer (log driver in local dev - check storage/logs).";
        } catch (\Throwable $e) {
            report($e);
            $this->smtpOk = false;
            $this->smtpMessage = 'Sending failed: '.$e->getMessage();
        }
    }

    public function changeAdminEmail(): void
    {
        $user = auth()->user();

        $this->validate([
            'adminEmail' => ['required', 'email', 'max:190', Rule::unique('users', 'email')->ignore($user->id)],
            'emailCurrentPassword' => 'required',
        ]);

        if (! Hash::check($this->emailCurrentPassword, $user->password)) {
            $this->addError('emailCurrentPassword', 'Current password is incorrect.');
            return;
        }

        $user->update(['email' => strtolower($this->adminEmail)]);

        $this->reset('emailCurrentPassword');
        $this->emailMessage = 'Email updated.';
    }

    public function changeAdminPassword(): void
    {
        $this->validate([
            'currentPassword' => 'required',
            'adminNewPassword' => 'required|string|min:6|regex:/[0-9]/|confirmed',
        ], [
            'adminNewPassword.min' => 'Password must be at least 6 characters and include a number.',
            'adminNewPassword.regex' => 'Password must be at least 6 characters and include a number.',
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
            'logoUrl'    => $url('logo_path'),
            'faviconUrl' => $url('favicon_path'),
            'ogImageUrl' => $url('seo_og_image'),
        ]);
    }
}
