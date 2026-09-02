<?php

namespace App\Services;

/**
 * Applies the admin-configured SMTP credentials to the mail config at runtime,
 * so email sending is controlled entirely from the backend. When no SMTP host
 * is set, the app's default mailer (e.g. the log driver in local) is used.
 */
class MailConfigurator
{
    public static function apply(): void
    {
        $s = app(SettingsService::class);
        $host = $s->get('mail_host');

        $fromAddress = $s->get('mail_from_address')
            ?: ('no-reply@'.(parse_url(config('app.url'), PHP_URL_HOST) ?: 'localhost'));
        $fromName = $s->get('mail_from_name') ?: $s->get('app_name', 'App');

        config([
            'mail.from.address' => $fromAddress,
            'mail.from.name' => $fromName,
        ]);

        if (! $host) {
            // Keep the configured default mailer (log/smtp from .env), but
            // still drop any mailer already built from the old From address.
            self::forgetBuiltMailers();

            return;
        }

        $encryption = $s->get('mail_encryption');

        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => $host,
            'mail.mailers.smtp.port' => (int) $s->get('mail_port', 587),
            'mail.mailers.smtp.username' => $s->get('mail_username') ?: null,
            'mail.mailers.smtp.password' => $s->get('mail_password') ?: null,
            'mail.mailers.smtp.encryption' => $encryption === 'none' ? null : ($encryption ?: 'tls'),
        ]);

        self::forgetBuiltMailers();
    }

    /**
     * The mail manager caches a mailer per name the first time it is asked for
     * one. Anything built before this ran still holds the OLD host, password
     * and From address, so changing the settings in the admin panel changed
     * nothing until the process restarted.
     */
    private static function forgetBuiltMailers(): void
    {
        if (app()->resolved('mail.manager')) {
            app('mail.manager')->forgetMailers();
        }
    }
}
