<?php

namespace App\Http\Controllers;

use App\Models\Level;
use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

/**
 * "Continue with Google" for the mobile app.
 *
 * Google blocks OAuth inside embedded WebViews, so the app opens this flow in
 * the system browser. Nothing here creates a web session: the callback
 * resolves the account, mints a one-time token and hands it back to the app,
 * which exchanges it at POST /api/v1/auth/google/redeem.
 */
class GoogleAuthController extends Controller
{
    /** How long a started sign-in stays redeemable. */
    private const STATE_TTL = 300;

    /**
     * GET /auth/google/native — 302 to Google.
     *
     * The app passes its own `state` nonce, generated before it opened the
     * browser. We keep it against an unguessable key of our own and give that
     * key to Google as the OAuth `state`, so the callback can prove it is
     * finishing a sign-in this backend started and tell the app which of ITS
     * sign-ins this is.
     */
    public function nativeRedirect(Request $request)
    {
        $this->configure('auth.google.native.callback');

        $state = Str::random(40);

        Cache::put('goauth:state:'.$state, [
            // The app refuses a redirect that does not carry its nonce back,
            // which is what stops any page on the internet from navigating to
            // the deeplink with a token and signing somebody in.
            'nonce' => (string) $request->query('state', ''),
        ], self::STATE_TTL);

        // stateless() drops the session-backed state check (the Custom Tab has
        // no session of ours), so the parameter is set explicitly and verified
        // against the cache in the callback instead.
        return Socialite::driver('google')->stateless()
            ->with(['state' => $state])
            ->redirect();
    }

    /**
     * GET /auth/google/native/callback — Google returns here.
     *
     * Verifies the state, resolves the account, mints a one-time token and
     * bounces to the App Link the app listens on.
     */
    public function nativeCallback(Request $request)
    {
        $this->configure('auth.google.native.callback');

        $state = (string) $request->query('state', '');
        $pending = $state !== '' ? Cache::pull('goauth:state:'.$state) : null;

        // No state, an unknown one, or one already used: this response is not
        // finishing a sign-in we started. Single use, five minutes.
        if (! is_array($pending)) {
            return $this->handoff(['error' => 'state']);
        }

        try {
            $g = Socialite::driver('google')->stateless()->user();
        } catch (\Throwable $e) {
            report($e);

            return $this->handoff(['error' => 'google', 'state' => $pending['nonce'] ?? '']);
        }

        $user = $this->findOrCreate($g);

        if (! $user) {
            return $this->handoff(['error' => 'unverified', 'state' => $pending['nonce'] ?? '']);
        }

        $token = Str::random(48);
        Cache::put('goauth:'.$token, $user->id, self::STATE_TTL); // one-time

        return $this->handoff([
            'token' => $token,
            // Echoed so the app can check this answers the sign-in it started.
            'state' => $pending['nonce'] ?? '',
        ]);
    }

    /**
     * GET /auth/google/finish — the App Link target.
     *
     * Android hands this URL straight to the app once assetlinks.json is
     * verified, so normally nothing here runs. It renders when the link is not
     * verified yet, when the app is not installed, or when the flow was
     * finished on a desktop browser: then it bounces to the kegelee://
     * deeplink, which is the same handoff by another route.
     */
    public function finish(Request $request)
    {
        return $this->deeplink(array_filter([
            'token' => (string) $request->query('token', ''),
            'state' => (string) $request->query('state', ''),
            'error' => (string) $request->query('error', ''),
        ], fn ($v) => $v !== ''));
    }

    // --- Shared helpers ------------------------------------------------------

    /**
     * Find the account by google_id or email, creating it on first sign-in.
     *
     * Returns null when Google will not vouch for the address on an account we
     * already hold: matching on an unverified email would let anyone who can
     * create a Google account with somebody else's address take over that
     * account here.
     */
    private function findOrCreate(\Laravel\Socialite\Contracts\User $g): ?User
    {
        $googleId = (string) $g->getId();
        $email = strtolower((string) $g->getEmail());

        // Google's own flag for the address, from the id token's claims.
        $raw = $g->user ?? [];
        $emailVerified = ($raw['email_verified'] ?? null) === true
            || ($raw['email_verified'] ?? null) === 'true';

        // The google_id is the identity Google actually asserts, so a returning
        // user matches on it regardless of the email flag.
        $user = User::where('google_id', $googleId)->first();

        if (! $user) {
            $user = $email !== '' ? User::where('email', $email)->first() : null;

            // Reached an existing account BY EMAIL: only link the two when
            // Google says the address is verified.
            if ($user && ! $emailVerified) {
                Log::warning('Google sign-in matched an account by an unverified email; refused', [
                    'user_id' => $user->id,
                ]);

                return null;
            }
        }

        if (! $user) {
            // Creating a new account also needs a verified address: it is what
            // makes "a Google sign-in IS a completed, verified sign-up" true,
            // and it is the address every reset code will go to.
            if ($email === '' || ! $emailVerified) {
                return null;
            }

            return User::create([
                'name' => $g->getName() ?: 'Member',
                'email' => $email,
                'google_id' => $googleId,
                'email_verified_at' => now(), // Google accounts are pre-verified
                'password' => Hash::make(Str::random(40)),
                'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
                'onboarded_at' => now(),
            ]);
        }

        if (! $user->google_id || ! $user->onboarded_at) {
            // Linking Google to an existing account (or a pre-existing one that
            // never finished onboarding): a Google sign-in IS a completed
            // sign-up, so mark them onboarded to skip the intro slides.
            $user->update([
                'google_id' => $user->google_id ?: $googleId,
                'email_verified_at' => $user->email_verified_at ?? now(),
                'onboarded_at' => $user->onboarded_at ?? now(),
            ]);
        }

        return $user;
    }

    /**
     * Send the result to the app over the https App Link. Android opens it in
     * the app when the domain is verified; otherwise finish() renders and
     * falls back to the custom scheme.
     *
     * @param  array<string, string>  $query
     */
    private function handoff(array $query)
    {
        return redirect()->to(route('auth.google.finish').'?'.http_build_query(array_filter($query, fn ($v) => $v !== '')));
    }

    /**
     * The custom-scheme fallback page: bounce to kegelee://auth/google/finish,
     * with a button for the case where the automatic navigation is blocked.
     *
     * @param  array<string, string>  $query
     */
    private function deeplink(array $query)
    {
        $scheme = (string) config('app.deeplink_scheme', 'kegelee');
        $url = $scheme.'://auth/google/finish?'.http_build_query($query);

        return response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Opening Kegelee...</title>'
            .'<meta name="viewport" content="width=device-width, initial-scale=1">'
            .'<meta name="robots" content="noindex, nofollow">'
            .'<style>body{background:#060810;color:#f3f4f6;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;text-align:center;}'
            .'h2{margin:0 0 8px;font-size:22px;color:#fff;}'
            .'p{color:#9ca3af;font-size:14px;margin:0 0 24px;}'
            .'.btn{display:inline-block;padding:14px 32px;background:#c1ff72;color:#060810;font-weight:700;font-size:15px;text-decoration:none;border-radius:14px;box-shadow:0 4px 14px rgba(193,255,114,0.3);}'
            .'</style></head><body>'
            .'<h2>Returning to Kegelee...</h2>'
            .'<p>If the app does not open automatically, tap the button below:</p>'
            .'<a class="btn" href="'.e($url).'">Open App</a>'
            .'<script>'
            .'setTimeout(function(){ window.location.href = '.json_encode($url).'; }, 100);'
            .'</script>'
            .'</body></html>'
        )->header('Content-Type', 'text/html');
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
