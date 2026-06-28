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

        $user = null;

        if (\App\Services\Sync\BackendClient::isClient()) {
            $result = $this->authenticateRemotely(strtolower($this->email), $this->password);

            if (! empty($result['user'])) {
                $remoteUser = $result['user'];
                $attributes = [
                    'name' => $remoteUser['name'],
                    'email_verified_at' => $remoteUser['email_verified_at'] ? now()->parse($remoteUser['email_verified_at']) : null,
                    'password' => $remoteUser['password_hash'],
                    'is_admin' => (bool)$remoteUser['is_admin'],
                    'level_id' => $remoteUser['level_id'],
                    'level_started_days' => (int)$remoteUser['level_started_days'],
                    'onboarded_at' => $remoteUser['onboarded_at'] ? now()->parse($remoteUser['onboarded_at']) : null,
                    'timezone' => $remoteUser['timezone'],
                ];
                if (! User::where('email', strtolower($remoteUser['email']))->exists()) {
                    $attributes['id'] = $remoteUser['id'];
                }
                $user = User::updateOrCreate(['email' => strtolower($remoteUser['email'])], $attributes);
            } else {
                RateLimiter::hit($key, 300);
                if (($result['reason'] ?? '') === 'invalid') {
                    $this->addError('email', 'Email or password is incorrect.');
                } else {
                    $this->addError('email', 'Could not reach the server. Check your internet connection and try again.');
                }
                return;
            }
        } else {
            $user = User::where('email', strtolower($this->email))->first();
            if (! $user || ! $user->password || ! Hash::check($this->password, $user->password)) {
                RateLimiter::hit($key, 300);
                $this->addError('email', 'Email or password is incorrect.');
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

        // On a device, sync immediately so the home page renders with
        // up-to-date data instead of stale data that updates moments later.
        if (\App\Services\Sync\BackendClient::isClient()) {
            try {
                app(\App\Services\Sync\ContentSyncService::class)->pull();
                $userSync = app(\App\Services\Sync\UserSyncService::class);
                $userSync->push($user);
                $userSync->pull($user);
            } catch (\Throwable $e) {
                // Best-effort — don't block login if sync fails.
            }
        }

        return $this->redirectRoute('home', navigate: true);
    }

    /**
     * @return array{user?: array<string,mixed>, reason?: string}
     *   ['user'=>...] on success; otherwise ['reason'=>'invalid'|'unreachable'|'offline'].
     */
    private function authenticateRemotely(string $email, string $password): array
    {
        if (! \App\Services\Sync\BackendClient::isClient()) {
            return ['reason' => 'offline'];
        }

        try {
            $response = \App\Services\Sync\BackendClient::request()
                ->post(\App\Services\Sync\BackendClient::base().'/v1/auth/login', [
                    'email' => $email,
                    'password' => $password,
                ]);

            if ($response->successful()) {
                return ['user' => $response->json('user')];
            }

            // 401/422 = the backend rejected the credentials.
            if (in_array($response->status(), [401, 422], true)) {
                if ($response->json('error') === 'Invalid API key.') {
                    return ['reason' => 'unreachable'];
                }
                return ['reason' => 'invalid'];
            }

            return ['reason' => 'unreachable'];
        } catch (\Throwable $e) {
            return ['reason' => 'unreachable'];
        }
    }

    public function render(SettingsService $settings)
    {
        return view('livewire.auth.login', [
            'googleEnabled' => (bool) $settings->get('google_login_enabled') && $settings->get('google_client_id'),
        ]);
    }
}
