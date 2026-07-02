<?php

namespace App\Http\Controllers;

use App\Models\Level;
use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    public function redirect()
    {
        $this->configure();

        return Socialite::driver('google')->redirect();
    }

    public function callback()
    {
        $this->configure();

        try {
            $g = Socialite::driver('google')->user();
        } catch (\Throwable $e) {
            report($e);
            return redirect()->route('login')->withErrors(['email' => 'Google sign-in failed. Please try again.']);
        }

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

        Auth::login($user, true);
        session()->regenerate();

        // New or unsubscribed Google users go straight to the subscription
        // screen; subscribers (and admins) land in the app.
        if (! $user->is_admin && ! $user->isSubscribed()) {
            return redirect()->route('paywall');
        }

        return redirect()->route('home');
    }

    /** Apply the admin-configured Google credentials to Socialite at runtime. */
    private function configure(): void
    {
        $s = app(SettingsService::class);

        config(['services.google' => [
            'client_id' => $s->get('google_client_id'),
            'client_secret' => $s->get('google_client_secret'),
            'redirect' => route('auth.google.callback'),
        ]]);
    }
}
