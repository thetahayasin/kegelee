<?php

namespace App\Http\Controllers;

use App\Models\AccountDeletion;
use App\Models\EmailCode;
use App\Models\User;
use App\Models\UserEvent;
use App\Services\CodeSender;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * Deleting an account from the open web, with no app installed.
 *
 * Google Play requires the deletion route to be reachable at a plain URL by
 * somebody who has already uninstalled the app, so the in-app screen (POST
 * /api/v1/user/delete) cannot satisfy it on its own - that one needs a
 * signed-in device. This is the same flow, the same emailed code and the same
 * deleteWithData(), driven by a form instead.
 *
 * Possession of the mailbox is the proof of ownership here, not a password:
 * accounts created through Google sign-in have no password to be asked for.
 */
class AccountDeletionController extends Controller
{
    /** Where the address a code was sent to waits between the two steps. */
    private const EMAIL_KEY = 'account_deletion.email';

    public function show(Request $request): View
    {
        return view('account.delete', [
            'email' => $request->session()->get(self::EMAIL_KEY),
        ]);
    }

    /**
     * Step one: email a six-digit code to the address given.
     */
    public function sendCode(Request $request): RedirectResponse
    {
        $data = $request->validate(['email' => 'required|email']);
        $email = strtolower(trim($data['email']));

        $exists = User::where('email', $email)->exists();

        /**
         * Only a real account gets an email, but the page says the same thing
         * either way.
         *
         * Answering "no account with that address" would turn a public,
         * unauthenticated form into a way of asking whether a given person
         * uses this particular app, which is not a question anybody should be
         * able to put to it. The wrong-code answer in the next step is
         * identical for the same reason.
         */
        if ($exists && ! CodeSender::send($email, 'delete')) {
            return back()->withInput()->withErrors([
                'email' => 'We could not send the email right now. Please try again in a minute.',
            ]);
        }

        $request->session()->put(self::EMAIL_KEY, $email);

        return redirect()->route('account.delete');
    }

    /**
     * Step two: verify the code and delete everything. Irreversible.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $email = $request->session()->get(self::EMAIL_KEY);

        // No address in the session means the code step was never done (or the
        // session expired underneath it). Start again rather than validate a
        // code against nothing.
        if (! $email) {
            return redirect()->route('account.delete');
        }

        $data = $request->validate(['code' => 'required|digits:6']);

        if (! EmailCode::verify($email, $data['code'], 'delete')) {
            $this->recordCodeFailure($email, 'delete');

            return back()->withErrors(['code' => 'That code is invalid or has expired.']);
        }

        $user = User::where('email', $email)->first();

        // A verified code for an address with no account: nothing to delete,
        // and the same confirmation page, because a different one here would
        // give away exactly what step one refused to.
        if (! $user) {
            $request->session()->forget(self::EMAIL_KEY);

            return redirect()->route('account.deleted');
        }

        rescue(
            fn () => UserEvent::record($user->id, UserEvent::EMAIL_CODE_VERIFIED, 'delete'),
            report: false,
        );

        /**
         * A tally mark, written before the account goes - the same one the API
         * path writes. Deleting cascades every event this person ever had, so
         * "how many people leave, and how long did they stay first" is a
         * question the event log can never answer about itself afterwards. The
         * row carries no user id and no email.
         */
        rescue(function () use ($user) {
            AccountDeletion::create([
                'deleted_at' => now(),
                'days_since_signup' => $user->created_at
                    ? max(0, (int) $user->created_at->diffInDays(now()))
                    : null,
                'had_subscription' => $user->isSubscribed(),
                'sessions_done' => $user->workoutSessions()->count(),
            ]);
        }, report: false);

        $user->deleteWithData();

        $request->session()->forget(self::EMAIL_KEY);

        return redirect()->route('account.deleted');
    }

    /**
     * The same failure record the API path keeps, so a wrong code typed on the
     * web shows up in the event log next to one typed in the app.
     */
    private function recordCodeFailure(string $email, string $purpose): void
    {
        rescue(function () use ($email, $purpose) {
            $userId = User::where('email', $email)->value('id');

            if (! $userId) {
                return;
            }

            // verify() only ever reads a code that is still live, so a row left
            // sitting here past its expiry is exactly the case where somebody
            // typed a code that had run out.
            $expired = EmailCode::where('email', $email)
                ->where('purpose', $purpose)
                ->where('expires_at', '<=', now())
                ->exists();

            UserEvent::record(
                $userId,
                UserEvent::EMAIL_CODE_FAILED,
                $purpose,
                $expired ? 'expired' : 'invalid',
            );
        }, report: false);
    }
}
