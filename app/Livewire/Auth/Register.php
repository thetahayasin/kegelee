<?php

namespace App\Livewire\Auth;

use App\Models\Level;
use App\Models\User;
use App\Services\CodeSender;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Attributes\Layout;
use Livewire\Component;

#[Layout('components.layouts.app')]
class Register extends Component
{
    public string $name = '';
    public string $email = '';
    public string $password = '';
    public string $password_confirmation = '';

    public function mount()
    {
        if (auth()->check()) {
            return $this->redirectRoute('home', navigate: true);
        }
        return $this->redirect('/welcome?auth_prompt=1&auth_mode=register', navigate: true);
    }

    public function register()
    {
        $key = 'register:'.request()->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = RateLimiter::availableIn($key);
            $this->addError('email', "Too many attempts. Try again in {$seconds} seconds.");
            return;
        }

        $this->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:190',
            'password' => 'required|string|min:6|confirmed',
        ], [
            'name.required'      => 'Name is required.',
            'email.required'     => 'Email is required.',
            'email.email'        => 'Enter a valid email address.',
            'password.required'  => 'Password is required.',
            'password.min'       => 'Password must be at least 6 characters.',
            'password.confirmed' => "Passwords don't match.",
        ]);

        // Attempt remote registration first if we have a remote server
        $remoteUser = $this->registerRemotely();
        if (is_array($remoteUser) && isset($remoteUser['error'])) {
            $this->addError('email', $remoteUser['error']);
            return;
        }

        RateLimiter::hit($key, 900);

        if ($remoteUser) {
            $user = User::updateOrCreate(
                ['email' => strtolower($remoteUser['email'])],
                [
                    'id' => $remoteUser['id'],
                    'name' => $remoteUser['name'],
                    'email_verified_at' => $remoteUser['email_verified_at'] ? now()->parse($remoteUser['email_verified_at']) : null,
                    'password' => $remoteUser['password_hash'],
                    'is_admin' => (bool)$remoteUser['is_admin'],
                    'level_id' => $remoteUser['level_id'],
                    'level_started_days' => (int)$remoteUser['level_started_days'],
                    'onboarded_at' => $remoteUser['onboarded_at'] ? now()->parse($remoteUser['onboarded_at']) : null,
                    'timezone' => $remoteUser['timezone'],
                ]
            );
        } else {
            // Check local unique constraint
            $this->validate([
                'email' => 'unique:users,email',
            ], [
                'email.unique' => 'This email is already registered.',
            ]);

            $user = User::create([
                'name' => trim($this->name),
                'email' => strtolower($this->email),
                'password' => Hash::make($this->password),
                'level_id' => Level::where('is_active', true)->orderBy('number')->value('id'),
            ]);

            CodeSender::send($user->email, 'verify');
        }

        session(['verify_email' => $user->email]);

        return $this->redirectRoute('verify', navigate: true);
    }

    private function registerRemotely(): ?array
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

        $apiUrl = $syncUrl . '/v1/auth/register';
        $apiKey = config('app.sync_api_key');

        try {
            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
                'Accept' => 'application/json',
            ])->timeout(5)->post($apiUrl, [
                'name' => trim($this->name),
                'email' => strtolower($this->email),
                'password' => $this->password,
                'password_confirmation' => $this->password_confirmation,
            ]);

            if ($response->successful()) {
                return $response->json('user');
            } elseif ($response->status() === 422) {
                // Return validation error message
                $errors = $response->json('errors.email');
                $message = $errors ? $errors[0] : $response->json('message');
                return ['error' => $message ?: 'Validation failed.'];
            }
        } catch (\Exception $e) {
            // Network failure or timeout - fallback to local registration
        }

        return null;
    }

    public function render(SettingsService $settings)
    {
        return view('livewire.auth.register', [
            'googleEnabled' => (bool) $settings->get('google_login_enabled') && $settings->get('google_client_id'),
        ]);
    }
}
