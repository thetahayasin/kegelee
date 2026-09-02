<?php

namespace App\Services;

use App\Mail\CodeMail;
use App\Models\EmailCode;
use App\Support\Locales;
use Illuminate\Support\Facades\Mail;

class CodeSender
{
    /**
     * Issue a fresh code and email it (best-effort). Returns the code row.
     *
     * `$locale` is normally left null and taken from the request, because that
     * is the only thing we know about somebody asking for a password reset -
     * they are not signed in, there is no locale stored against the account,
     * and the request is coming from the device whose language they set.
     */
    public static function send(string $email, string $purpose = 'verify', ?string $locale = null): EmailCode
    {
        $code = EmailCode::issue($email, $purpose);

        MailConfigurator::apply();
        $settings = app(SettingsService::class);

        try {
            // Send synchronously rather than queueing: there is no guaranteed
            // queue worker running on the backend (QUEUE_CONNECTION=database),
            // and a verification code that sits unsent in the jobs table is
            // useless. Sending inline guarantees delivery during the request.
            Mail::to($email)->send(new CodeMail(
                code: $code->code,
                purpose: $purpose,
                appName: $settings->get('app_name', 'App'),
                langTag: $locale ?? self::localeFromRequest(),
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return $code;
    }

    /**
     * The best supported language for whoever is asking.
     *
     * Accept-Language, because the app now sends its own UI language in that
     * header on every call and browsers send it for the web pages. Falls back
     * to the app locale, then to English via Locales::resolve returning null.
     */
    private static function localeFromRequest(): ?string
    {
        $request = request();

        // Header first: it is what the device actually asked for. getPreferredLanguage
        // is given the supported list so a q-weighted header picks the best match
        // rather than whatever happens to be first.
        $header = $request?->server('HTTP_ACCEPT_LANGUAGE');
        if (is_string($header) && trim($header) !== '') {
            foreach (explode(',', $header) as $part) {
                $tag = trim(explode(';', $part)[0]);
                $resolved = Locales::resolve($tag);
                if ($resolved !== null) {
                    return $resolved;
                }
            }
        }

        return Locales::resolve(app()->getLocale());
    }
}
