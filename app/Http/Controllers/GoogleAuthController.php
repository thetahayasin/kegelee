<?php

namespace App\Http\Controllers;

use App\Models\Level;
use App\Models\User;
use App\Services\RemoteAuth;
use App\Services\SettingsService;
use App\Services\Sync\BackendClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    // --- Web flow (browser session) ------------------------------------------

    public function redirect()
    {
        $this->configure('auth.google.callback');

        return Socialite::driver('google')->redirect();
    }

    public function callback()
    {
        $this->configure('auth.google.callback');

        try {
            $g = Socialite::driver('google')->user();
        } catch (\Throwable $e) {
            report($e);
            return redirect()->route('login')->withErrors(['email' => 'Google sign-in failed. Please try again.']);
        }

        $user = $this->findOrCreate($g);

        Auth::login($user, true);
        session()->regenerate();

        return $this->postAuthRedirect($user);
    }

    // --- Native flow (device) ------------------------------------------------
    //
    // Google blocks OAuth inside embedded WebViews, so the device opens this in
    // a Custom Tab via Browser::auth(). The auth happens in the system browser
    // (backend session), which then hands the result back to the app through the
    // kegelee:// deeplink carrying a short-lived one-time token the app redeems.

    /** Runs on the BACKEND: 302 to Google with the native redirect_uri. */
    public function nativeRedirect()
    {
        $this->configure('auth.google.native.callback');

        return Socialite::driver('google')->stateless()->redirect();
    }

    /** Runs on the BACKEND (in the Custom Tab): resolve the user, mint a token,
     *  and bounce to the app's deeplink. */
    public function nativeCallback()
    {
        $this->configure('auth.google.native.callback');

        try {
            $g = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable $e) {
            report($e);
            return $this->deeplink('error=google');
        }

        $user = $this->findOrCreate($g);

        $token = Str::random(48);
        Cache::put('goauth:'.$token, $user->id, 300); // one-time, 5 min TTL

        return $this->deeplink('token='.$token);
    }

    /** Runs on the DEVICE (opened by the deeplink): show a loading screen while
     *  the token is redeemed in the background. */
    public function finish(Request $request)
    {
        $token = (string) $request->query('token');

        if ($token === '' || ! BackendClient::isClient()) {
            return redirect('/welcome?auth_prompt=1&auth_mode=login');
        }

        // Clear any stale session so the new Google account takes over cleanly.
        // The deeplink can arrive while a previous login's session is still alive;
        // without this the old auth state leaks into the new sign-in.
        if (Auth::check()) {
            Auth::logout();
            session()->invalidate();
            session()->regenerateToken();
        }

        // Render a branded loading page. Its JS navigates to finishRedeem()
        // which does the actual network call + login + redirect.
        return response()->view('auth-loading', ['token' => $token]);
    }

    /** Runs on the DEVICE (called by the loading page form POST): redeem the
     *  token against the backend, mirror the account locally, and sign in.
     *  Failures are NEVER silent - each lands on the login prompt with a
     *  specific message (a silent bounce reads as "nothing happened"). */
    public function finishRedeem(Request $request)
    {
        // Redeemed via GET: the token rides in the query string (see the note on
        // the route). Accept the POST body too so an old bundled loading page
        // still works after an update.
        $token = (string) ($request->query('token') ?: $request->input('token'));

        if ($token === '' || ! BackendClient::isClient()) {
            return redirect('/welcome?auth_prompt=1&auth_mode=login');
        }

        // Clear any stale session left over from a previous login so the new
        // Google account doesn't collide with old auth state.
        if (Auth::check()) {
            Auth::logout();
            session()->invalidate();
            session()->regenerateToken();
        }

        // One retry: returning from the external browser can catch the radio
        // mid-wake, so a single transient failure shouldn't kill the sign-in.
        $response = null;
        foreach ([0, 800] as $delayMs) {
            if ($delayMs) {
                usleep($delayMs * 1000);
            }
            try {
                $response = BackendClient::request()
                    ->post(BackendClient::base().'/v1/auth/google/redeem', ['token' => $token]);
                break;
            } catch (\Throwable $e) {
                $response = null;
            }
        }

        if (! $response) {
            return $this->finishFailed('network');
        }
        if ($response->status() === 422) {
            return $this->finishFailed('expired');
        }
        if (! $response->successful() || ! $response->json('user')) {
            return $this->finishFailed('server');
        }

        $user = RemoteAuth::mirror($response->json('user'));

        Auth::login($user, true);
        session()->regenerate();
        RemoteAuth::syncAfterLogin($user);

        return $this->postAuthRedirect($user);
    }

    /** Land on the login prompt with a specific Google sign-in error. */
    private function finishFailed(string $why)
    {
        return redirect('/welcome?auth_prompt=1&auth_mode=login&gerr='.$why);
    }

    // --- Shared helpers ------------------------------------------------------

    /** Find the account by google_id or email, creating it on first sign-in. */
    private function findOrCreate(\Laravel\Socialite\Contracts\User $g): User
    {
        $user = User::where('google_id', $g->getId())
            ->orWhere('email', strtolower((string) $g->getEmail()))
            ->first();

        if (! $user) {
            $user = User::create([
                'name' => $g->getName() ?: 'Member',
                'email' => strtolower((string) $g->getEmail()),
                'google_id' => $g->getId(),
                'email_verified_at' => now(), // Google accounts are pre-verified
                'password' => Hash::make(Str::random(40)),
                'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
                'onboarded_at' => now(),
            ]);
        } elseif (! $user->google_id || ! $user->onboarded_at) {
            // Linking Google to an existing account (or a pre-existing one that
            // never finished onboarding): a Google sign-in IS a completed
            // sign-up, so mark them onboarded to skip the intro slides.
            $user->update([
                'google_id' => $g->getId(),
                'email_verified_at' => $user->email_verified_at ?? now(),
                'onboarded_at' => $user->onboarded_at ?? now(),
            ]);
        }

        return $user;
    }

    /** New/unsubscribed users land on the subscription screen; subscribers and
     *  admins go straight into the app. Uses url() not route() so the redirect
     *  works reliably from the standalone auth-loading page (no Livewire shell). */
    private function postAuthRedirect(User $user)
    {
        if (! $user->is_admin && ! $user->isSubscribed()) {
            return redirect('/upgrade');
        }

        return redirect('/app');
    }

    /** Redirect to the app via its deeplink scheme (returns from the Custom Tab). */
    private function deeplink(string $query)
    {
        $scheme = config('nativephp.deeplink_scheme', 'kegelee');

        return redirect()->away($scheme.'://auth/google/finish?'.$query);
    }

    /** Apply the admin-configured Google credentials to Socialite at runtime. */
    private function configure(string $redirectRoute): void
    {
        $s = app(SettingsService::class);

        config(['services.google' => [
            'client_id' => $s->get('google_client_id'),
            'client_secret' => $s->get('google_client_secret'),
            'redirect' => route($redirectRoute),
        ]]);
    }
}
