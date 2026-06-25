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

        $remoteVerified = $this->verifyRemotely();
        if (is_array($remoteVerified) && isset($remoteVerified['error'])) {
            $this->addError('code', $remoteVerified['error']);
            return;
        }

        if ($remoteVerified) {
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

        return $this->redirectRoute('home', navigate: true);
    }

    public function resend(): void
    {
        $key = 'resend:'.$this->email;
        if (RateLimiter::tooManyAttempts($key, 3)) {
            return;
        }
        RateLimiter::hit($key, 300);

        if ($this->resendRemotely()) {
            $this->resent = true;
        } else {
            CodeSender::send($this->email, 'verify');
            $this->resent = true;
        }
    }

    private function verifyRemotely(): ?array
    {
        $syncUrl = config('app.content_sync_url');
        if (! $syncUrl) {
            return null;
        }

        // Clean/resolve the API base URL
        if (str_ends_with($syncUrl, '/v1/content')) {
            $syncUrl = substr($syncUrl, 0, -11);
        }
        $syncUrl = rtrim($syncUrl, '/');
        if (! str_ends_with($syncUrl, '/api')) {
            $syncUrl .= '/api';
        }

        $apiUrl = $syncUrl . '/v1/auth/verify';
        $apiKey = config('app.sync_api_key');

        try {
            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
                'Accept' => 'application/json',
            ])->timeout(5)->post($apiUrl, [
                'email' => $this->email,
                'code' => $this->code,
            ]);

            if ($response->successful()) {
                return $response->json('user');
            } elseif ($response->status() === 422) {
                return ['error' => $response->json('error') ?: 'Invalid code.'];
            }
        } catch (\Exception $e) {
            // Fallback to local verification
        }

        return null;
    }

    private function resendRemotely(): bool
    {
        $syncUrl = config('app.content_sync_url');
        if (! $syncUrl) {
            return false;
        }

        // Clean/resolve the API base URL
        if (str_ends_with($syncUrl, '/v1/content')) {
            $syncUrl = substr($syncUrl, 0, -11);
        }
        $syncUrl = rtrim($syncUrl, '/');
        if (! str_ends_with($syncUrl, '/api')) {
            $syncUrl .= '/api';
        }

        $apiUrl = $syncUrl . '/v1/auth/resend';
        $apiKey = config('app.sync_api_key');

        try {
            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
                'Accept' => 'application/json',
            ])->timeout(5)->post($apiUrl, [
                'email' => $this->email,
            ]);

            return $response->successful();
        } catch (\Exception $e) {
            return false;
        }
    }

    public function render()
    {
        return view('livewire.auth.verify');
    }
}
