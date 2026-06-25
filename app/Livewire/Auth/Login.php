<?php

namespace App\Livewire\Auth;

use App\Models\User;
use App\Services\CodeSender;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Login extends Component
{
    public string $email = '';
    public string $password = '';
    public bool $remember = true;

    public function mount()
    {
        if (auth()->check()) {
            return $this->redirectRoute('home', navigate: true);
        }
        return $this->redirect('/welcome?auth_prompt=1&auth_mode=login', navigate: true);
    }

    public function login()
    {
        $key = 'login:'.strtolower($this->email).':'.request()->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = RateLimiter::availableIn($key);
            $this->addError('email', "Too many attempts. Try again in {$seconds} seconds.");
            return;
        }

        $this->validate([
            'email' => 'required|email|max:190',
            'password' => 'required|string|max:255',
        ]);

        $user = User::where('email', strtolower($this->email))->first();

        // If local authentication fails, try remote sync server!
        if (! $user || ! $user->password || ! Hash::check($this->password, $user->password)) {
            $remoteUser = $this->authenticateRemotely(strtolower($this->email), $this->password);
            if ($remoteUser) {
                // Replicate / sync user details locally
                $user = User::updateOrCreate(
                    ['email' => strtolower($remoteUser['email'])],
                    [
                        'id' => $remoteUser['id'],
                        'name' => $remoteUser['name'],
                        'email_verified_at' => $remoteUser['email_verified_at'] ? now()->parse($remoteUser['email_verified_at']) : null,
                        'password' => $remoteUser['password_hash'], // Store the hash directly so offline works next time!
                        'is_admin' => (bool)$remoteUser['is_admin'],
                        'level_id' => $remoteUser['level_id'],
                        'level_started_days' => (int)$remoteUser['level_started_days'],
                        'onboarded_at' => $remoteUser['onboarded_at'] ? now()->parse($remoteUser['onboarded_at']) : null,
                        'timezone' => $remoteUser['timezone'],
                    ]
                );
            } else {
                RateLimiter::hit($key, 300);
                $this->addError('email', 'These credentials do not match our records.');
                return;
            }
        }

        RateLimiter::clear($key);

        // Unverified accounts must confirm the emailed code first.
        if (! $user->email_verified_at) {
            CodeSender::send($user->email, 'verify');
            session(['verify_email' => $user->email]);
            return $this->redirectRoute('verify', navigate: true);
        }

        Auth::login($user, $this->remember);
        session()->regenerate();

        return $this->redirectRoute('home', navigate: true);
    }

    private function authenticateRemotely(string $email, string $password): ?array
    {
        if (! \App\Services\Sync\BackendClient::isClient()) {
            return null;
        }

        try {
            $response = \App\Services\Sync\BackendClient::request()
                ->post(\App\Services\Sync\BackendClient::base().'/v1/auth/login', [
                    'email' => $email,
                    'password' => $password,
                ]);

            if ($response->successful()) {
                return $response->json('user');
            }
        } catch (\Exception $e) {
            // Network failure or timeout
        }

        return null;
    }

    public function render(SettingsService $settings)
    {
        return view('livewire.auth.login', [
            'googleEnabled' => (bool) $settings->get('google_login_enabled') && $settings->get('google_client_id'),
        ]);
    }
}
