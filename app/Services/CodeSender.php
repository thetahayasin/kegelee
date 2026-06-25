<?php

namespace App\Services;

use App\Mail\CodeMail;
use App\Models\EmailCode;
use Illuminate\Support\Facades\Mail;

class CodeSender
{
    /** Issue a fresh code and email it (best-effort). Returns the code row. */
    public static function send(string $email, string $purpose = 'verify'): EmailCode
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
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        return $code;
    }
}
