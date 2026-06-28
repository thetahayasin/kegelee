<?php

namespace App\Livewire\Auth;

use App\Models\EmailCode;
use App\Models\User;
use App\Services\CodeSender;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Verify extends Component
{
    public string $email = '';
    public string $code = '';
    public bool $resent = false;

    public function mount()
    {
        $this->email = (string) session('verify_email', '');
        if (! $this->email) {
            return $this->redirectRoute('register', navigate: true);
        }
    }

    public function verify()
    {
        $this->validate(['code' => 'required|digits:6']);

        if (\App\Services\Sync\BackendClient::isClient()) {
            $remoteVerified = $this->verifyRemotely();
            if (is_array($remoteVerified) && isset($remoteVerified['error'])) {
                $this->addError('code', $remoteVerified['error']);
                return;
            }

            if (! $remoteVerified) {
                $this->addError('code', 'Could not reach the server. Check your internet connection and try again.');
                return;
            }

            $user = User::updateOrCreate(
                ['email' => strtolower($remoteVerified['email'])],
                [
                    'id' => $remoteVerified['id'],
                    'name' => $remoteVerified['name'],
                    'email_verified_at' => $remoteVerified['email_verified_at'] ? now()->parse($remoteVerified['email_verified_at']) : null,
                    'password' => $remoteVerified['password_hash'],
                    'is_admin' => (bool)$remoteVerified['is_admin'],
                    'level_id' => $remoteVerified['level_id'],
                    'level_started_days' => (int)$remoteVerified['level_started_days'],
                    'onboarded_at' => $remoteVerified['onboarded_at'] ? now()->parse($remoteVerified['onboarded_at']) : null,
                    'timezone' => $remoteVerified['timezone'],
                ]
            );
        } else {
            if (! EmailCode::verify($this->email, $this->code, 'verify')) {
                $this->addError('code', 'That code is invalid or has expired.');
                return;
            }

            $user = User::where('email', $this->email)->first();
            if (! $user) {
                return $this->redirectRoute('register', navigate: true);
            }

            $user->update(['email_verified_at' => now()]);
        }

        Auth::login($user, true);
        session()->regenerate();
        session()->forget('verify_email');

        // Sync immediately so the home page has fresh data from the start.
        if (\App\Services\Sync\BackendClient::isClient()) {
            try {
                app(\App\Services\Sync\ContentSyncService::class)->pull();
                $userSync = app(\App\Services\Sync\UserSyncService::class);
                $userSync->push($user);
                $userSync->pull($user);
            } catch (\Throwable $e) {
                // Best-effort.
            }
        }

        return $this->redirectRoute('home', navigate: true);
    }

    public function resend(): void
    {
        $key = 'resend:'.$this->email;
        if (RateLimiter::tooManyAttempts($key, 3)) {
            $this->addError('code', 'Too many requests. Try again later.');
            return;
        }
        RateLimiter::hit($key, 300);

        if (\App\Services\Sync\BackendClient::isClient()) {
            $result = $this->resendRemotely();
            if ($result === true) {
                $this->resent = true;
            } else {
                $this->addError('code', is_string($result) ? $result : 'Could not reach the server. Check your internet connection and try again.');
            }
        } else {
            CodeSender::send($this->email, 'verify');
            $this->resent = true;
        }
    }

    private function verifyRemotely(): ?array
    {
        if (! \App\Services\Sync\BackendClient::isClient()) {
            return null;
        }

        try {
            $response = \App\Services\Sync\BackendClient::request()
                ->post(\App\Services\Sync\BackendClient::base().'/v1/auth/verify', [
                    'email' => $this->email,
                    'code' => $this->code,
                ]);

            if ($response->successful()) {
                return $response->json('user');
            } elseif ($response->status() === 422) {
                return ['error' => $response->json('error') ?: 'That code is invalid or has expired.'];
            } elseif ($response->status() === 404) {
                return ['error' => 'User not found.'];
            } elseif ($response->status() === 401 && $response->json('error') === 'Invalid API key.') {
                return ['error' => 'API configuration error. Please check sync settings.'];
            }
            return ['error' => 'Could not verify on remote server. Status code: ' . $response->status()];
        } catch (\Exception $e) {
            return ['error' => 'Could not reach the server. Check your internet connection and try again.'];
        }
    }

    /**
     * @return bool|string
     */
    private function resendRemotely(): bool|string
    {
        if (! \App\Services\Sync\BackendClient::isClient()) {
            return false;
        }

        try {
            $response = \App\Services\Sync\BackendClient::request()
                ->post(\App\Services\Sync\BackendClient::base().'/v1/auth/resend', [
                    'email' => $this->email,
                ]);

            if ($response->successful()) {
                return true;
            } elseif ($response->status() === 429) {
                return 'Too many requests. Try again later.';
            } elseif ($response->status() === 401 && $response->json('error') === 'Invalid API key.') {
                return 'API configuration error. Please check sync settings.';
            }
            return 'Could not resend verification code. Status code: ' . $response->status();
        } catch (\Exception $e) {
            return 'Could not reach the server. Check your internet connection and try again.';
        }
    }

    public function render()
    {
        return view('livewire.auth.verify');
    }
}
