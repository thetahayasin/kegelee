<?php

namespace App\Livewire\Admin;

use App\Models\Plan;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
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

    /**
     * Secret fields, kept apart from $values.
     *
     * $values is public component state: everything in it is serialised into
     * the page and sent to the browser on every render. Loading the stored
     * SMTP password, the Google client secret, the RevenueCat keys or the
     * service-account JSON into it published them to anyone who could read the
     * HTML - including keys with no field in the form at all, which the old
     * mount() loaded anyway because it walked every default.
     *
     * These stay blank; a blank one on save means "leave what is stored".
     *
     * @var array<string, string>
     */
    public array $secrets = [];

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

    /**
     * The keys this form may write, and how each is stored.
     *
     * A whitelist rather than "whatever is in $values": the array is public
     * state, so a crafted update could previously set ANY settings key - and
     * every one of them is read back by the app.
     */
    public const EDITABLE = [
        // Branding
        'app_name' => ['string', 'branding'],
        'color_accent' => ['color', 'branding'],
        'logo_path' => ['string', 'branding'],
        'favicon_path' => ['string', 'branding'],

        // Email (SMTP)
        'mail_host' => ['string', 'general'],
        'mail_port' => ['int', 'general'],
        'mail_username' => ['string', 'general'],
        'mail_encryption' => ['string', 'general'],
        'mail_from_name' => ['string', 'general'],
        'mail_from_address' => ['string', 'general'],

        // Google sign-in
        'google_login_enabled' => ['bool', 'general'],
        'google_client_id' => ['string', 'general'],

        // RevenueCat
        'revenuecat_enabled' => ['bool', 'general'],
        'revenuecat_android_public_sdk_key' => ['string', 'general'],
        'revenuecat_ios_public_sdk_key' => ['string', 'general'],
        'revenuecat_entitlement_id' => ['string', 'general'],

        // Homepage
        'homepage_enabled' => ['bool', 'homepage'],
        'play_store_url' => ['string', 'homepage'],
        'home_badge_text' => ['string', 'homepage'],
        'home_headline' => ['string', 'homepage'],
        'home_subheadline' => ['string', 'homepage'],
        'home_cta_primary' => ['string', 'homepage'],
        'home_cta_secondary' => ['string', 'homepage'],
        'home_footer_tagline' => ['string', 'homepage'],
        'home_stats' => ['json', 'homepage'],
        'home_features' => ['json', 'homepage'],
        'home_steps' => ['json', 'homepage'],

        // SEO
        'seo_title' => ['string', 'seo'],
        'seo_description' => ['string', 'seo'],
        'seo_keywords' => ['string', 'seo'],
        'seo_og_image' => ['string', 'seo'],

        // Code injection
        'inject_head' => ['html', 'general'],
        'inject_body_start' => ['html', 'general'],
        'inject_body_end' => ['html', 'general'],
        'custom_css' => ['html', 'general'],
    ];

    /** Write-only fields: shown blank, saved only when something is typed. */
    public const SECRET_KEYS = [
        'mail_password' => 'general',
        'google_client_secret' => 'general',
        'revenuecat_api_key' => 'general',
        'revenuecat_webhook_secret' => 'general',
    ];

    /** Uploads, and the setting each one writes. */
    public const IMAGE_KEYS = [
        'logo_path' => 'branding',
        'favicon_path' => 'branding',
        'seo_og_image' => 'seo',
    ];

    /** The three textareas that must contain JSON. */
    public const JSON_KEYS = ['home_stats', 'home_features', 'home_steps'];

    public function mount(SettingsService $settings): void
    {
        $this->adminEmail = (string) auth()->user()->email;

        foreach (self::EDITABLE as $key => [$type, $group]) {
            $value = $settings->get($key);

            // JSON fields come back as arrays; the textareas need text.
            if ($type === 'json') {
                $value = json_encode(is_array($value) ? $value : [], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }

            $this->values[$key] = $value;
        }

        foreach (array_keys(self::SECRET_KEYS) as $key) {
            $this->secrets[$key] = '';
        }
    }

    public function save(SettingsService $settings): void
    {
        $this->resetMessages();

        $this->validate([
            'logoUpload' => 'nullable|image|max:4096',
            'faviconUpload' => 'nullable|image|max:1024',
            'ogUpload' => 'nullable|image|max:4096',
            // Invalid JSON used to be swallowed by `json_decode(...) ?? []`,
            // which silently wiped the homepage section it belonged to.
            'values.home_stats' => 'nullable|json',
            'values.home_features' => 'nullable|json',
            'values.home_steps' => 'nullable|json',
            'values.mail_port' => 'nullable|integer|min:1|max:65535',
            'values.mail_from_address' => 'nullable|email',
            'values.play_store_url' => 'nullable|url',
        ], [
            'values.home_stats.json' => 'Stats must be valid JSON.',
            'values.home_features.json' => 'Features must be valid JSON.',
            'values.home_steps.json' => 'How it works steps must be valid JSON.',
            'values.mail_port.*' => 'Port must be a number between 1 and 65535.',
            'values.mail_from_address.email' => 'From address must be a valid email address.',
            'values.play_store_url.url' => 'The store URL must be a full URL.',
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

        $write = [];

        foreach (self::EDITABLE as $key => [$type, $group]) {
            // Only keys this form owns, and only ones it actually holds: a
            // missing key means "not submitted", not "set it to null".
            if (! array_key_exists($key, $this->values)) {
                continue;
            }

            $value = $this->values[$key];

            if ($type === 'bool') {
                $value = (bool) $value;
            } elseif ($type === 'json') {
                // Validated above, so this decodes or the save never got here.
                $value = json_decode((string) $value, true) ?: [];
            }

            $write[$key] = [$value, $type, $group];
        }

        // A blank secret means "keep the stored one" - the fields render empty
        // on purpose, so saving the form must not erase them.
        foreach (self::SECRET_KEYS as $key => $group) {
            $typed = trim((string) ($this->secrets[$key] ?? ''));
            if ($typed !== '') {
                $write[$key] = [$typed, 'string', $group];
            }
        }

        // One write, one cache flush. set() in a loop flushed the whole
        // settings cache thirty times per save.
        $settings->setMany($write);

        $this->reset(['logoUpload', 'faviconUpload', 'ogUpload']);
        foreach (array_keys(self::SECRET_KEYS) as $key) {
            $this->secrets[$key] = '';
        }

        $this->savedMessage = 'Settings saved.';
    }

    /**
     * Remove a saved branding/SEO image: delete the stored file and clear the
     * setting immediately (so it persists without needing a full Save).
     */
    public function removeImage(string $key, SettingsService $settings): void
    {
        $this->resetMessages();

        // Only the three image settings. Any other key would let this delete
        // an arbitrary file from the public disk and null an arbitrary setting.
        if (! isset(self::IMAGE_KEYS[$key])) {
            return;
        }

        $path = $this->values[$key] ?? null;
        if ($path && Storage::disk('public')->exists($path)) {
            Storage::disk('public')->delete($path);
        }

        $this->values[$key] = null;
        $settings->set($key, null, 'string', self::IMAGE_KEYS[$key]);
        $this->savedMessage = 'Image removed.';
    }

    /**
     * Send a test email to the signed-in admin using the SMTP values currently
     * in the form (no need to save first), so credentials can be verified
     * before going live. With a blank host the server default mailer is used
     * (the log driver in local dev).
     */
    public function testSmtp(SettingsService $settings): void
    {
        $this->resetMessages();

        $v = $this->values;
        $host = trim((string) ($v['mail_host'] ?? ''));

        config([
            'mail.from.address' => ($v['mail_from_address'] ?? '') ?: ('no-reply@'.(parse_url(config('app.url'), PHP_URL_HOST) ?: 'localhost')),
            'mail.from.name' => ($v['mail_from_name'] ?? '') ?: ($v['app_name'] ?? 'App'),
        ]);

        if ($host !== '') {
            $encryption = $v['mail_encryption'] ?? 'tls';

            // The password field is blank unless the admin just typed one, so
            // fall back to what is stored rather than testing with no password.
            $password = trim((string) ($this->secrets['mail_password'] ?? ''))
                ?: (string) $settings->get('mail_password');

            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp.host' => $host,
                'mail.mailers.smtp.port' => (int) ($v['mail_port'] ?? 587),
                'mail.mailers.smtp.username' => ($v['mail_username'] ?? '') ?: null,
                'mail.mailers.smtp.password' => $password ?: null,
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
        $this->resetMessages();

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
        $this->resetMessages();

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

        $user->update([
            'password' => Hash::make($this->adminNewPassword),
            // Changing the password revokes every API token issued before it.
            'api_token' => null,
        ]);

        $this->reset(['currentPassword', 'adminNewPassword', 'adminNewPassword_confirmation']);
        $this->passwordMessage = 'Password updated.';
    }

    /**
     * Clear every "it worked" banner before an action runs.
     *
     * They are component state, so the "Settings saved." from ten minutes ago
     * sat there while a later action failed, reading as if that one had worked.
     */
    private function resetMessages(): void
    {
        $this->savedMessage = null;
        $this->emailMessage = null;
        $this->passwordMessage = null;
        $this->smtpMessage = null;
        $this->smtpOk = false;
    }

    public function render(SettingsService $settings)
    {
        $url = fn ($key) => ! empty($this->values[$key])
            ? Storage::url($this->values[$key])
            : null;

        // Whether each secret already has a stored value, so the blank field
        // can say so without ever sending the value itself to the browser.
        $secretsSet = [];
        foreach (array_keys(self::SECRET_KEYS) as $key) {
            $secretsSet[$key] = trim((string) $settings->get($key)) !== '';
        }

        return view('livewire.admin.settings', [
            'logoUrl'    => $url('logo_path'),
            'faviconUrl' => $url('favicon_path'),
            'ogImageUrl' => $url('seo_og_image'),
            'secretsSet' => $secretsSet,
            // Queried here rather than in the blade: a template that runs
            // database queries cannot be read, cached or tested as a template.
            'plans'      => Plan::where('is_active', true)->orderBy('sort_order')->get(),
        ]);
    }
}
