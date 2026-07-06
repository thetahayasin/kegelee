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
        Cache::put('goauth:'.$token, $user->id, 120); // one-time, 2 min TTL

        return $this->deeplink('token='.$token);
    }

    /** Runs on the DEVICE (opened by the deeplink): redeem the token against the
     *  backend, mirror the account locally, and sign in. */
    public function finish(Request $request)
    {
        $token = (string) $request->query('token');

        if ($token === '' || ! BackendClient::isClient()) {
            return redirect('/welcome?auth_prompt=1&auth_mode=login');
        }

        try {
            $response = BackendClient::request()
                ->post(BackendClient::base().'/v1/auth/google/redeem', ['token' => $token]);
        } catch (\Throwable $e) {
            return redirect('/welcome?auth_prompt=1&auth_mode=login');
        }

        if (! $response->successful() || ! $response->json('user')) {
            return redirect('/welcome?auth_prompt=1&auth_mode=login');
        }

        $user = RemoteAuth::mirror($response->json('user'));

        Auth::login($user, true);
        session()->regenerate();
        RemoteAuth::syncAfterLogin($user);

        return $this->postAuthRedirect($user);
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
        } elseif (! $user->google_id) {
            $user->update([
                'google_id' => $g->getId(),
                'email_verified_at' => $user->email_verified_at ?? now(),
            ]);
        }

        return $user;
    }

    /** New/unsubscribed users land on the subscription screen; subscribers and
     *  admins go straight into the app. */
    private function postAuthRedirect(User $user)
    {
        if (! $user->is_admin && ! $user->isSubscribed()) {
            return redirect()->route('paywall');
        }

        return redirect()->route('home');
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
