<?php

namespace App\Services;

use App\Mail\CodeMail;
use App\Models\EmailCode;
use Illuminate\Support\Facades\Mail;

class CodeSender
{
    /**
     * Issue a fresh code and email it. Returns whether the mail actually went
     * out, so a caller can say "we could not send it" instead of showing a
     * code-entry field for a code that never left the building - the failure
     * used to be swallowed here and every caller reported success.
     */
    public static function send(string $email, string $purpose = 'verify'): bool
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

            return false;
        }

        /**
         * Recorded only when the address belongs to an account.
         *
         * Codes go to addresses with no account too - "resend" and "forgot
         * password" answer the same way whether or not the account exists, on
         * purpose, so the endpoint cannot be used to ask whether an email is
         * registered. There is nobody to file those against, and inventing a
         * user for them would put that same answer in the database instead.
         *
         * Wrapped, like every server-side event: a report that cannot be
         * written must never stop a verification email being reported as sent.
         */
        rescue(function () use ($email, $purpose) {
            $userId = \App\Models\User::where('email', $email)->value('id');

            if ($userId) {
                \App\Models\UserEvent::record($userId, \App\Models\UserEvent::EMAIL_CODE_SENT, $purpose);
            }
        }, report: false);

        return true;
    }
}
